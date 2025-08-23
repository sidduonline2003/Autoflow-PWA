from fastapi import APIRouter, Depends, HTTPException, Body, Query
from firebase_admin import firestore
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
from uuid import uuid4
import secrets
import string

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/salaries",
    tags=["Salary Management"],
)

# --- Pydantic Models ---
class SalaryProfileBase(BaseModel):
    baseSalary: float
    frequency: str = "monthly"  # monthly, bi-weekly, weekly
    allowances: List[Dict[str, Any]] = []
    deductions: List[Dict[str, Any]] = []
    taxRate: Optional[float] = None
    tdsEnabled: bool = False

class SalaryProfileCreate(SalaryProfileBase):
    userId: str
    name: str

class SalaryProfileUpdate(SalaryProfileBase):
    pass

class SalaryLineItem(BaseModel):
    key: str
    label: str
    amount: float
    type: str = "fixed"  # fixed, percentage

class PayslipBase(BaseModel):
    period: Dict[str, int]  # { month: int, year: int }
    base: Dict[str, Any]
    allowances: List[Dict[str, Any]] = []
    deductions: List[Dict[str, Any]] = []
    tax: Dict[str, Any]
    remarks: Optional[str] = None

class PayslipCreate(PayslipBase):
    userId: str
    runId: str

class SalaryRunCreate(BaseModel):
    month: int
    year: int
    remarks: Optional[str] = None

class SalaryRunUpdate(BaseModel):
    status: str  # DRAFT, PUBLISHED, PAID, CLOSED
    remarks: Optional[str] = None

class PaymentInfo(BaseModel):
    method: str
    reference: Optional[str] = None
    date: str
    remarks: Optional[str] = None
    idempotencyKey: str = Field(default_factory=lambda: uuid4().hex)

# --- Helper Functions ---
def calculate_tax(subtotal: float, tax_rate: float) -> float:
    """Calculate tax amount based on subtotal and tax rate"""
    return round(subtotal * (tax_rate / 100), 2)

def round_currency(amount: float) -> float:
    """Round to 2 decimal places for currency values"""
    return round(amount, 2)

def compute_payslip_totals(payslip_data: dict) -> dict:
    """
    Compute gross, deductions, tax, and net pay for a payslip.
    Returns updated payslip with calculated totals.
    """
    # Start with base salary
    gross = payslip_data["base"]["amount"]
    
    # Add allowances
    total_allowances = 0
    for allowance in payslip_data.get("allowances", []):
        amount = allowance.get("amount", 0)
        gross += amount
        total_allowances += amount
    
    # Calculate total deductions
    total_deductions = 0
    for deduction in payslip_data.get("deductions", []):
        total_deductions += deduction.get("amount", 0)
    
    # Calculate subtotal (gross - deductions)
    subtotal = gross - total_deductions
    
    # Get tax amount
    tax_amount = payslip_data.get("tax", {}).get("amount", 0)
    
    # Calculate net pay
    net_pay = subtotal - tax_amount
    
    # Update payslip with calculated totals
    return {
        **payslip_data,
        "grossAmount": round_currency(gross),
        "totalAllowances": round_currency(total_allowances),
        "totalDeductions": round_currency(total_deductions),
        "totalTax": round_currency(tax_amount),
        "netPay": round_currency(net_pay)
    }

def generate_payslip_number(db, org_id: str) -> str:
    """Generate a unique payslip number in the format PAY-YYYY-####"""
    now = datetime.now(timezone.utc)
    year = now.year
    
    # Get and update the org's payslip number sequence
    org_ref = db.collection('organizations').document(org_id)
    
    # Run this in a transaction to ensure number uniqueness
    @firestore.transactional
    def update_sequence(transaction, org_ref):
        try:
            org_doc = transaction.get(org_ref)
            # Handle potential generator object by converting to list if needed
            if hasattr(org_doc, 'to_dict'):
                org_data = org_doc.to_dict()
            else:
                # If it's an iterable like a generator, get the first item
                org_data = next(iter(org_doc)).to_dict()
            
            # Initialize number_sequences if it doesn't exist
            if "numberSequences" not in org_data:
                org_data["numberSequences"] = {}
            
            # Initialize payslip sequence for the current year if it doesn't exist
            payslip_seq_key = f"payslip_{year}"
            if payslip_seq_key not in org_data["numberSequences"]:
                org_data["numberSequences"][payslip_seq_key] = 0
            
            # Increment the sequence
            current_seq = org_data["numberSequences"][payslip_seq_key] + 1
            org_data["numberSequences"][payslip_seq_key] = current_seq
            
            # Update the document
            transaction.update(org_ref, {"numberSequences": org_data["numberSequences"]})
            
            return current_seq
        except Exception as e:
            print(f"Error in update_sequence: {str(e)}")
            # If there's an error, return a random sequence number as fallback
            return int(datetime.now(timezone.utc).timestamp() % 10000)
    
    transaction = db.transaction()
    current_seq = update_sequence(transaction, org_ref)
    
    # Format the sequence number with leading zeros
    seq_formatted = str(current_seq).zfill(4)
    return f"PAY-{year}-{seq_formatted}"

def is_authorized_for_salary_actions(current_user: dict) -> bool:
    """Check if the user is authorized for salary operations (admin or accountant)"""
    role = current_user.get("role", "").lower()
    return role in ["admin", "accountant"]

# --- Salary Profile Endpoints ---
@router.post("/profiles")
async def create_salary_profile(
    req: SalaryProfileCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a salary profile for a team member"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Verify the user exists in the organization
    team_member_ref = db.collection('organizations', org_id, 'team').document(req.userId)
    team_member = team_member_ref.get()
    if not team_member.exists:
        raise HTTPException(status_code=404, detail="Team member not found")
    
    # Create salary profile
    profile_data = {
        **req.dict(exclude={"userId"}),
        "createdAt": datetime.now(timezone.utc),
        "createdBy": current_user.get("uid"),
        "updatedAt": datetime.now(timezone.utc)
    }
    
    profile_ref = db.collection('organizations', org_id, 'team', req.userId, 'salaryProfile').document('current')
    profile_ref.set(profile_data)
    
    return {"status": "success", "profileId": "current"}

@router.get("/profiles/{user_id}")
async def get_salary_profile(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get the salary profile of a team member"""
    org_id = current_user.get("orgId")
    
    # Team members can view their own profile, admins/accountants can view any profile
    if not (is_authorized_for_salary_actions(current_user) or 
            (current_user.get("uid") == user_id and current_user.get("role") in ["crew", "editor", "data-manager"])):
        raise HTTPException(status_code=403, detail="Not authorized to view this salary profile")
    
    db = firestore.client()
    profile_ref = db.collection('organizations', org_id, 'team', user_id, 'salaryProfile').document('current')
    profile = profile_ref.get()
    
    if not profile.exists:
        raise HTTPException(status_code=404, detail="Salary profile not found")
    
    return profile.to_dict()

@router.put("/profiles/{user_id}")
async def update_salary_profile(
    user_id: str,
    req: SalaryProfileUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a team member's salary profile"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    profile_ref = db.collection('organizations', org_id, 'team', user_id, 'salaryProfile').document('current')
    profile = profile_ref.get()
    
    if not profile.exists:
        raise HTTPException(status_code=404, detail="Salary profile not found")
    
    # Update profile
    profile_data = {
        **req.dict(),
        "updatedAt": datetime.now(timezone.utc),
        "updatedBy": current_user.get("uid")
    }
    
    profile_ref.update(profile_data)
    
    return {"status": "success"}

# --- Salary Run Endpoints ---
@router.post("/runs")
async def create_salary_run(
    req: SalaryRunCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new salary run for a specific period"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Check if a run already exists for this period
    run_query = db.collection('organizations', org_id, 'salaryRuns').where(
        "period", "==", {"month": req.month, "year": req.year}
    ).where("status", "in", ["PUBLISHED", "PAID"]).limit(1).get()
    
    if len(run_query) > 0:
        raise HTTPException(
            status_code=400, 
            detail="A salary run already exists for this period in PUBLISHED or PAID state"
        )
    
    # Create a new salary run
    run_id = f"run_{req.year}_{req.month}"
    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
    
    run_data = {
        "period": {"month": req.month, "year": req.year},
        "status": "DRAFT",
        "remarks": req.remarks,
        "createdAt": datetime.now(timezone.utc),
        "createdBy": current_user.get("uid"),
        "updatedAt": datetime.now(timezone.utc),
        "audit": [{
            "action": "CREATED",
            "by": current_user.get("uid"),
            "at": datetime.now(timezone.utc)
        }]
    }
    
    run_ref.set(run_data)
    
    # Get all active team members
    team_query = db.collection('organizations', org_id, 'team').where("availability", "==", True).get()
    
    # Generate draft payslips for each team member
    payslips_created = 0
    for team_doc in team_query:
        team_member = team_doc.to_dict()
        user_id = team_doc.id
        
        # Skip if there's an exit date and it's before this run's period
        exit_date = team_member.get("exitDate")
        if exit_date:
            # Convert exit_date string to datetime for comparison
            # Assuming exit_date is in format YYYY-MM-DD
            exit_year = int(exit_date.split("-")[0])
            exit_month = int(exit_date.split("-")[1])
            
            if exit_year < req.year or (exit_year == req.year and exit_month < req.month):
                continue
        
        # Get member's salary profile
        profile_ref = db.collection('organizations', org_id, 'team', user_id, 'salaryProfile').document('current')
        profile = profile_ref.get()
        
        if not profile.exists:
            continue  # Skip members without salary profiles
        
        profile_data = profile.to_dict()
        
        # Create basic payslip data from profile
        payslip_data = {
            "orgId": org_id,
            "runId": run_id,
            "userId": user_id,
            "userName": team_member.get("name", ""),
            "period": {"month": req.month, "year": req.year},
            "status": "DRAFT",
            "currency": "INR",  # Using default currency (could be org setting)
            "base": {"label": "Base Salary", "amount": profile_data.get("baseSalary", 0)},
            "allowances": profile_data.get("allowances", []),
            "deductions": profile_data.get("deductions", []),
            "tax": {"label": "TDS", "amount": 0},  # Will be calculated
            "remarks": "",
            "createdAt": datetime.now(timezone.utc),
            "createdBy": current_user.get("uid"),
            "updatedAt": datetime.now(timezone.utc),
            "audit": [{
                "action": "CREATED",
                "by": current_user.get("uid"),
                "at": datetime.now(timezone.utc)
            }]
        }
        
        # Calculate tax if TDS enabled
        if profile_data.get("tdsEnabled", False):
            # Calculate gross
            gross = payslip_data["base"]["amount"]
            for allowance in payslip_data["allowances"]:
                gross += allowance.get("amount", 0)
            
            # Calculate deductions
            total_deductions = 0
            for deduction in payslip_data["deductions"]:
                total_deductions += deduction.get("amount", 0)
            
            # Calculate subtotal
            subtotal = gross - total_deductions
            
            # Calculate tax
            tax_rate = profile_data.get("taxRate", 0)
            tax_amount = calculate_tax(subtotal, tax_rate)
            payslip_data["tax"]["amount"] = tax_amount
        
        # Calculate totals and update payslip
        payslip_data = compute_payslip_totals(payslip_data)
        
        # Create payslip
        payslip_ref = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').document(user_id)
        payslip_ref.set(payslip_data)
        payslips_created += 1
    
    # Update run with summary information
    run_ref.update({
        "payslipsCount": payslips_created,
        "generatedAt": datetime.now(timezone.utc)
    })
    
    return {"status": "success", "runId": run_id, "payslipsCreated": payslips_created}

@router.get("/runs")
async def list_salary_runs(
    current_user: dict = Depends(get_current_user)
):
    """List all salary runs for the organization"""
    try:
        # Log user info for debugging
        print(f"User accessing /runs endpoint: {current_user}")
        
        org_id = current_user.get("orgId")
        if not org_id:
            print("No orgId found in user claims")
            raise HTTPException(status_code=400, detail="No organization ID found in user claims")
            
        print(f"Organization ID: {org_id}")
        
        if not is_authorized_for_salary_actions(current_user):
            print(f"User role: {current_user.get('role')} - Not authorized")
            raise HTTPException(status_code=403, detail="Not authorized for salary operations")
        
        print("User is authorized, fetching salary runs")
        
        db = firestore.client()
        try:
            runs_query = db.collection('organizations', org_id, 'salaryRuns').order_by("period.year", direction=firestore.Query.DESCENDING).order_by("period.month", direction=firestore.Query.DESCENDING).get()
            
            runs = []
            for run_doc in runs_query:
                run_data = run_doc.to_dict()
                run_data["id"] = run_doc.id
                runs.append(run_data)
            
            print(f"Found {len(runs)} salary runs")
            return runs
        except Exception as db_error:
            print(f"Firestore error: {str(db_error)}")
            
            # Check specifically for missing index error
            error_str = str(db_error)
            if "The query requires an index" in error_str:
                print("Index error detected, falling back to simpler query")
                
                try:
                    # Fallback to a simpler query that doesn't require composite index
                    simple_runs_query = db.collection('organizations', org_id, 'salaryRuns').get()
                    
                    # Process and sort the results in memory
                    simple_runs = []
                    for run_doc in simple_runs_query:
                        run_data = run_doc.to_dict()
                        run_data["id"] = run_doc.id
                        simple_runs.append(run_data)
                    
                    # Sort manually in memory
                    simple_runs.sort(key=lambda x: (
                        -1 * (x.get("period", {}).get("year", 0) or 0), 
                        -1 * (x.get("period", {}).get("month", 0) or 0)
                    ))
                    
                    print(f"Found {len(simple_runs)} salary runs with fallback query")
                    return simple_runs
                except Exception as fallback_error:
                    print(f"Fallback query error: {str(fallback_error)}")
                
                # Extract the index creation URL if available
                index_url = error_str.split("https://console.firebase.google.com")[1].split(" ")[0] if "https://console.firebase.google.com" in error_str else ""
                index_url = "https://console.firebase.google.com" + index_url if index_url else ""
                
                raise HTTPException(
                    status_code=500, 
                    detail=f"This query requires a Firestore index that hasn't been created yet. Please create the index at: {index_url}"
                )
            # Provide a more specific error for other Firestore issues
            raise HTTPException(
                status_code=500, 
                detail=f"Database error: {str(db_error)}"
            )
    except HTTPException:
        # Re-raise HTTP exceptions as is
        raise
    except Exception as e:
        print(f"Unexpected error in list_salary_runs: {str(e)}")
        # For other exceptions, provide a controlled error response
        raise HTTPException(
            status_code=500, 
            detail=f"An unexpected error occurred: {str(e)}"
        )

@router.get("/runs/{run_id}")
async def get_salary_run(
    run_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get details of a specific salary run"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
    run = run_ref.get()
    
    if not run.exists:
        raise HTTPException(status_code=404, detail="Salary run not found")
    
    run_data = run.to_dict()
    run_data["id"] = run_id
    
    # Get summary stats
    payslips_query = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').get()
    total_gross = 0
    total_deductions = 0
    total_tax = 0
    total_net = 0
    count_paid = 0
    count_unpaid = 0
    
    for payslip_doc in payslips_query:
        payslip_data = payslip_doc.to_dict()
        total_gross += payslip_data.get("grossAmount", 0)
        total_deductions += payslip_data.get("totalDeductions", 0)
        total_tax += payslip_data.get("totalTax", 0)
        total_net += payslip_data.get("netPay", 0)
        
        if payslip_data.get("status") == "PAID":
            count_paid += 1
        else:
            count_unpaid += 1
    
    run_data["summary"] = {
        "totalGross": round_currency(total_gross),
        "totalDeductions": round_currency(total_deductions),
        "totalTax": round_currency(total_tax),
        "totalNet": round_currency(total_net),
        "countPaid": count_paid,
        "countUnpaid": count_unpaid,
        "countTotal": count_paid + count_unpaid
    }
    
    return run_data

@router.put("/runs/{run_id}")
async def update_salary_run(
    run_id: str,
    req: SalaryRunUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a salary run's status (publish, close, etc.)"""
    try:
        org_id = current_user.get("orgId")
        if not is_authorized_for_salary_actions(current_user):
            raise HTTPException(status_code=403, detail="Not authorized for salary operations")
        
        db = firestore.client()
        run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
        run = run_ref.get()
        
        if not run.exists:
            raise HTTPException(status_code=404, detail="Salary run not found")
        
        run_data = run.to_dict()
        current_status = run_data.get("status")
        new_status = req.status
        
        # Validate status transition
        valid_transitions = {
            "DRAFT": ["PUBLISHED"],
            "PUBLISHED": ["PAID", "CLOSED"],
            "PAID": ["CLOSED"]
        }
        
        if current_status not in valid_transitions or new_status not in valid_transitions.get(current_status, []):
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid status transition from {current_status} to {new_status}"
            )
        
        # Special handling for PUBLISHED status
        if new_status == "PUBLISHED":
            try:
                # Validate at least one payslip exists
                payslips_query = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').limit(1).get()
                if len(payslips_query) == 0:
                    raise HTTPException(
                        status_code=400, 
                        detail="Cannot publish an empty run with no payslips"
                    )
                
                # Assign payslip numbers and update status for all payslips
                all_payslips = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').get()
                
                # Convert the query snapshot to a list of document snapshots first
                payslip_docs = list(all_payslips)
                
                for payslip_doc in payslip_docs:
                    payslip_ref = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').document(payslip_doc.id)
                    
                    # Generate payslip number
                    payslip_number = generate_payslip_number(db, org_id)
                    
                    # Update payslip
                    payslip_ref.update({
                        "status": "PUBLISHED",
                        "number": payslip_number,
                        "publishedAt": datetime.now(timezone.utc),
                        "publishedBy": current_user.get("uid"),
                        "updatedAt": datetime.now(timezone.utc),
                        "audit": firestore.ArrayUnion([{
                            "action": "PUBLISHED",
                            "by": current_user.get("uid"),
                            "at": datetime.now(timezone.utc)
                        }])
                    })
            except Exception as e:
                print(f"Error updating payslips: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Error updating payslips: {str(e)}"
                )
        
        # Update run
        update_data = {
            "status": new_status,
            "updatedAt": datetime.now(timezone.utc),
            "updatedBy": current_user.get("uid"),
            "audit": firestore.ArrayUnion([{
                "action": new_status,
                "by": current_user.get("uid"),
                "at": datetime.now(timezone.utc)
            }])
        }
        
        if req.remarks:
            update_data["remarks"] = req.remarks
        
        # Set special timestamps based on status
        if new_status == "PUBLISHED":
            update_data["publishedAt"] = datetime.now(timezone.utc)
            update_data["publishedBy"] = current_user.get("uid")
        elif new_status == "PAID":
            update_data["paidAt"] = datetime.now(timezone.utc)
            update_data["paidBy"] = current_user.get("uid")
        elif new_status == "CLOSED":
            update_data["closedAt"] = datetime.now(timezone.utc)
            update_data["closedBy"] = current_user.get("uid")
        
        run_ref.update(update_data)
        
        return {"status": "success", "runId": run_id, "newStatus": new_status}
    except Exception as e:
        print(f"Error in update_salary_run: {str(e)}")
        # Re-raise HTTPExceptions
        if isinstance(e, HTTPException):
            raise e
        # For other exceptions, provide a controlled error response
        raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")

# --- Payslip Endpoints ---
@router.get("/runs/{run_id}/payslips")
async def list_payslips(
    run_id: str,
    current_user: dict = Depends(get_current_user)
):
    """List all payslips in a salary run"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Verify run exists
    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
    run = run_ref.get()
    if not run.exists:
        raise HTTPException(status_code=404, detail="Salary run not found")
    
    # Get all payslips for this run
    payslips_query = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').get()
    
    payslips = []
    for payslip_doc in payslips_query:
        payslip_data = payslip_doc.to_dict()
        payslip_data["id"] = payslip_doc.id
        payslips.append(payslip_data)
    
    return payslips

@router.get("/runs/{run_id}/payslips/{user_id}")
async def get_payslip(
    run_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific payslip"""
    org_id = current_user.get("orgId")
    
    # Admins can view any payslip, team members can only view their own
    if not (is_authorized_for_salary_actions(current_user) or 
            (current_user.get("uid") == user_id and current_user.get("role") in ["crew", "editor", "data-manager"])):
        raise HTTPException(status_code=403, detail="Not authorized to view this payslip")
    
    db = firestore.client()
    
    # Verify run exists
    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
    run = run_ref.get()
    if not run.exists:
        raise HTTPException(status_code=404, detail="Salary run not found")
    
    # Get payslip
    payslip_ref = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').document(user_id)
    payslip = payslip_ref.get()
    
    if not payslip.exists:
        raise HTTPException(status_code=404, detail="Payslip not found")
    
    # For team members, verify the payslip is published
    if not is_authorized_for_salary_actions(current_user):
        payslip_data = payslip.to_dict()
        if payslip_data.get("status") not in ["PUBLISHED", "PAID"]:
            raise HTTPException(status_code=403, detail="Payslip is not yet published")
    
    return payslip.to_dict()

@router.put("/runs/{run_id}/payslips/{user_id}")
async def update_payslip(
    run_id: str,
    user_id: str,
    payslip_data: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """Update a payslip (only available in DRAFT state)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Verify run exists
    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
    run = run_ref.get()
    if not run.exists:
        raise HTTPException(status_code=404, detail="Salary run not found")
    
    run_data = run.to_dict()
    if run_data.get("status") != "DRAFT":
        raise HTTPException(status_code=400, detail="Cannot update payslips in a published or paid run")
    
    # Get current payslip
    payslip_ref = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').document(user_id)
    payslip = payslip_ref.get()
    
    if not payslip.exists:
        raise HTTPException(status_code=404, detail="Payslip not found")
    
    current_payslip = payslip.to_dict()
    
    # Update allowed fields
    allowed_fields = ["base", "allowances", "deductions", "tax", "remarks"]
    update_data = {}
    
    for field in allowed_fields:
        if field in payslip_data:
            update_data[field] = payslip_data[field]
    
    # Compute totals based on updated data
    merged_payslip = {**current_payslip, **update_data}
    updated_payslip = compute_payslip_totals(merged_payslip)
    
    # Update only the necessary fields
    for field in list(update_data.keys()) + ["grossAmount", "totalAllowances", "totalDeductions", "totalTax", "netPay"]:
        update_data[field] = updated_payslip[field]
    
    # Add audit and timestamps
    update_data.update({
        "updatedAt": datetime.now(timezone.utc),
        "updatedBy": current_user.get("uid"),
        "audit": firestore.ArrayUnion([{
            "action": "UPDATED",
            "by": current_user.get("uid"),
            "at": datetime.now(timezone.utc)
        }])
    })
    
    # Update payslip
    payslip_ref.update(update_data)
    
    return {"status": "success", "payslipId": user_id}

@router.post("/runs/{run_id}/payslips/{user_id}/mark-paid")
async def mark_payslip_paid(
    run_id: str,
    user_id: str,
    payment_info: PaymentInfo,
    current_user: dict = Depends(get_current_user)
):
    """Mark a payslip as paid"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Verify run exists
    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
    run = run_ref.get()
    if not run.exists:
        raise HTTPException(status_code=404, detail="Salary run not found")
    
    run_data = run.to_dict()
    if run_data.get("status") not in ["PUBLISHED", "PAID"]:
        raise HTTPException(status_code=400, detail="Can only mark payslips as paid in PUBLISHED or PAID runs")
    
    # Get payslip
    payslip_ref = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').document(user_id)
    payslip = payslip_ref.get()
    
    if not payslip.exists:
        raise HTTPException(status_code=404, detail="Payslip not found")
    
    payslip_data = payslip.to_dict()
    if payslip_data.get("status") == "PAID":
        # Check idempotency key to avoid duplicate payments
        existing_payment = payslip_data.get("payment", {})
        if existing_payment.get("idempotencyKey") == payment_info.idempotencyKey:
            return {"status": "success", "message": "Payment already processed", "payslipId": user_id}
        else:
            raise HTTPException(status_code=400, detail="Payslip is already marked as paid")
    
    # Record payment
    payment_data = payment_info.dict()
    payment_data["processedAt"] = datetime.now(timezone.utc)
    payment_data["processedBy"] = current_user.get("uid")
    payment_data["amount"] = payslip_data.get("netPay", 0)
    
    # Update payslip
    payslip_ref.update({
        "status": "PAID",
        "payment": payment_data,
        "paidAt": datetime.now(timezone.utc),
        "paidBy": current_user.get("uid"),
        "updatedAt": datetime.now(timezone.utc),
        "audit": firestore.ArrayUnion([{
            "action": "PAID",
            "by": current_user.get("uid"),
            "at": datetime.now(timezone.utc)
        }])
    })
    
    # Check if all payslips are paid and update run status if needed
    if run_data.get("status") != "PAID":
        all_payslips = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').get()
        all_paid = True
        
        for p_doc in all_payslips:
            p_data = p_doc.to_dict()
            if p_data.get("status") != "PAID":
                all_paid = False
                break
        
        if all_paid:
            run_ref.update({
                "status": "PAID",
                "paidAt": datetime.now(timezone.utc),
                "paidBy": current_user.get("uid"),
                "updatedAt": datetime.now(timezone.utc),
                "audit": firestore.ArrayUnion([{
                    "action": "PAID",
                    "by": current_user.get("uid"),
                    "at": datetime.now(timezone.utc)
                }])
            })
    
    return {"status": "success", "payslipId": user_id}

@router.post("/runs/{run_id}/mark-all-paid")
async def mark_all_payslips_paid(
    run_id: str,
    payment_info: PaymentInfo,
    current_user: dict = Depends(get_current_user)
):
    """Mark all payslips in a run as paid"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Verify run exists
    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
    run = run_ref.get()
    if not run.exists:
        raise HTTPException(status_code=404, detail="Salary run not found")
    
    run_data = run.to_dict()
    if run_data.get("status") not in ["PUBLISHED", "PAID"]:
        raise HTTPException(status_code=400, detail="Can only mark payslips as paid in PUBLISHED or PAID runs")
    
    # Get all unpaid payslips
    payslips_query = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').where("status", "==", "PUBLISHED").get()
    
    payslips_marked = 0
    for payslip_doc in payslips_query:
        payslip_ref = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').document(payslip_doc.id)
        payslip_data = payslip_doc.to_dict()
        
        # Record payment
        payment_data = payment_info.dict()
        payment_data["processedAt"] = datetime.now(timezone.utc)
        payment_data["processedBy"] = current_user.get("uid")
        payment_data["amount"] = payslip_data.get("netPay", 0)
        
        # Update payslip
        payslip_ref.update({
            "status": "PAID",
            "payment": payment_data,
            "paidAt": datetime.now(timezone.utc),
            "paidBy": current_user.get("uid"),
            "updatedAt": datetime.now(timezone.utc),
            "audit": firestore.ArrayUnion([{
                "action": "PAID",
                "by": current_user.get("uid"),
                "at": datetime.now(timezone.utc)
            }])
        })
        
        payslips_marked += 1
    
    # If any payslips were marked, update run status
    if payslips_marked > 0:
        # Check if all payslips are now paid
        all_payslips = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').get()
        all_paid = True
        
        for p_doc in all_payslips:
            p_data = p_doc.to_dict()
            if p_data.get("status") != "PAID":
                all_paid = False
                break
        
        if all_paid:
            run_ref.update({
                "status": "PAID",
                "paidAt": datetime.now(timezone.utc),
                "paidBy": current_user.get("uid"),
                "updatedAt": datetime.now(timezone.utc),
                "audit": firestore.ArrayUnion([{
                    "action": "PAID",
                    "by": current_user.get("uid"),
                    "at": datetime.now(timezone.utc)
                }])
            })
    
    return {"status": "success", "payslipsMarked": payslips_marked}

@router.post("/runs/{run_id}/payslips/{user_id}/void")
async def void_payslip(
    run_id: str,
    user_id: str,
    reason: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user)
):
    """Void a payslip (admin only)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Verify run exists
    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
    run = run_ref.get()
    if not run.exists:
        raise HTTPException(status_code=404, detail="Salary run not found")
    
    # Get payslip
    payslip_ref = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').document(user_id)
    payslip = payslip_ref.get()
    
    if not payslip.exists:
        raise HTTPException(status_code=404, detail="Payslip not found")
    
    payslip_data = payslip.to_dict()
    if payslip_data.get("status") == "VOID":
        raise HTTPException(status_code=400, detail="Payslip is already voided")
    
    # Update payslip
    payslip_ref.update({
        "status": "VOID",
        "voidReason": reason,
        "voidedAt": datetime.now(timezone.utc),
        "voidedBy": current_user.get("uid"),
        "updatedAt": datetime.now(timezone.utc),
        "audit": firestore.ArrayUnion([{
            "action": "VOID",
            "by": current_user.get("uid"),
            "at": datetime.now(timezone.utc),
            "reason": reason
        }])
    })
    
    return {"status": "success", "payslipId": user_id}

@router.get("/my-payslips")
async def get_my_payslips(
    current_user: dict = Depends(get_current_user)
):
    """Get all payslips for the current team member"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = firestore.client()
    
    try:
        # Get all salary runs with multiple order_by (requires composite index)
        runs_query = db.collection('organizations', org_id, 'salaryRuns').order_by("period.year", direction=firestore.Query.DESCENDING).order_by("period.month", direction=firestore.Query.DESCENDING).get()
        
        my_payslips = []
        for run_doc in runs_query:
            run_id = run_doc.id
            run_data = run_doc.to_dict()
            
            # Skip draft runs
            if run_data.get("status") == "DRAFT":
                continue
            
            # Get my payslip for this run
            payslip_ref = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').document(user_id)
            payslip = payslip_ref.get()
            
            if payslip.exists:
                payslip_data = payslip.to_dict()
                
                # Only include published or paid payslips
                if payslip_data.get("status") in ["PUBLISHED", "PAID"]:
                    # Include minimal data needed for listing
                    my_payslips.append({
                        "id": payslip.id,
                        "runId": run_id,
                        "number": payslip_data.get("number"),
                        "period": payslip_data.get("period"),
                        "status": payslip_data.get("status"),
                        "netPay": payslip_data.get("netPay"),
                        "currency": payslip_data.get("currency"),
                        "paidAt": payslip_data.get("paidAt"),
                    })
    except Exception as db_error:
        print(f"Firestore error in get_my_payslips: {str(db_error)}")
        
        # Check specifically for missing index error
        error_str = str(db_error)
        if "The query requires an index" in error_str:
            print("Index error detected in get_my_payslips, falling back to simpler query")
            
            # Fallback to a simpler query that doesn't require composite index
            simple_runs_query = db.collection('organizations', org_id, 'salaryRuns').get()
            
            # Process and sort the results in memory
            my_payslips = []
            for run_doc in simple_runs_query:
                run_id = run_doc.id
                run_data = run_doc.to_dict()
                
                # Skip draft runs
                if run_data.get("status") == "DRAFT":
                    continue
                
                # Get my payslip for this run
                payslip_ref = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').document(user_id)
                payslip = payslip_ref.get()
                
                if payslip.exists:
                    payslip_data = payslip.to_dict()
                    
                    # Only include published or paid payslips
                    if payslip_data.get("status") in ["PUBLISHED", "PAID"]:
                        # Include minimal data needed for listing
                        my_payslips.append({
                            "id": payslip.id,
                            "runId": run_id,
                            "number": payslip_data.get("number"),
                            "period": payslip_data.get("period"),
                            "status": payslip_data.get("status"),
                            "netPay": payslip_data.get("netPay"),
                            "currency": payslip_data.get("currency"),
                            "paidAt": payslip_data.get("paidAt"),
                        })
            
            # Sort manually in memory
            my_payslips.sort(key=lambda x: (
                -1 * (x.get("period", {}).get("year", 0) or 0), 
                -1 * (x.get("period", {}).get("month", 0) or 0)
            ))
            
            # Extract the index creation URL if available for logging purposes
            index_url = error_str.split("https://console.firebase.google.com")[1].split(" ")[0] if "https://console.firebase.google.com" in error_str else ""
            index_url = "https://console.firebase.google.com" + index_url if index_url else ""
            
            print(f"Index creation URL: {index_url}")
        else:
            # For other Firestore errors, return an empty list
            print(f"Unhandled Firestore error: {str(db_error)}")
            my_payslips = []
    
    return my_payslips

# --- Export and Report Endpoints ---
@router.get("/runs/{run_id}/export")
async def export_payslips(
    run_id: str,
    format: str = Query("csv", enum=["csv"]),  # For now, only CSV is supported
    current_user: dict = Depends(get_current_user)
):
    """Export all payslips in a run as CSV"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Verify run exists
    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
    run = run_ref.get()
    if not run.exists:
        raise HTTPException(status_code=404, detail="Salary run not found")
    
    run_data = run.to_dict()
    
    # Get all payslips for this run
    payslips_query = db.collection('organizations', org_id, 'salaryRuns', run_id, 'payslips').get()
    
    # Prepare CSV data
    csv_rows = []
    
    # Add header row
    header = [
        "Employee ID",
        "Employee Name",
        "Payslip Number",
        "Status",
        "Gross Amount",
        "Total Allowances",
        "Total Deductions",
        "Tax Amount",
        "Net Pay",
        "Currency",
        "Payment Method",
        "Payment Date",
        "Payment Reference"
    ]
    csv_rows.append(",".join(header))
    
    # Add data rows
    for payslip_doc in payslips_query:
        payslip_data = payslip_doc.to_dict()
        
        # Skip voided payslips
        if payslip_data.get("status") == "VOID":
            continue
        
        payment = payslip_data.get("payment", {})
        row = [
            payslip_doc.id,
            payslip_data.get("userName", ""),
            payslip_data.get("number", ""),
            payslip_data.get("status", ""),
            str(payslip_data.get("grossAmount", 0)),
            str(payslip_data.get("totalAllowances", 0)),
            str(payslip_data.get("totalDeductions", 0)),
            str(payslip_data.get("totalTax", 0)),
            str(payslip_data.get("netPay", 0)),
            payslip_data.get("currency", ""),
            payment.get("method", ""),
            payment.get("date", ""),
            payment.get("reference", "")
        ]
        csv_rows.append(",".join(row))
    
    # Join rows with newlines
    csv_content = "\n".join(csv_rows)
    
    # Normally, we would return a file here, but for this API we'll return the content
    return {"content": csv_content, "filename": f"payslips_{run_id}.csv"}
