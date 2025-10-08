from fastapi import APIRouter, Depends, HTTPException, Body, Query
from firebase_admin import firestore
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
from uuid import uuid4
import secrets
import string
import logging

from ..dependencies import get_current_user

# Set up logging
logger = logging.getLogger(__name__)

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

class PayslipLineItem(BaseModel):
    key: str
    label: str
    amount: float

class PayslipBase(BaseModel):
    period: Dict[str, int]  # {"month": 8, "year": 2025}
    lines: Dict[str, Any]  # {"base": {...}, "allowances": [...], "deductions": [...], "tax": {...}}
    grossAmount: float
    totalAllowances: float
    totalDeductions: float
    totalTax: float
    netPay: float
    currency: str = "INR"
    remarks: Optional[str] = None

class PayslipCreate(PayslipBase):
    userId: str
    runId: str

class SalaryRunCreate(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2000, le=2100)
    notes: Optional[str] = None

class SalaryRunUpdate(BaseModel):
    status: str  # DRAFT|PUBLISHED|PAID|CLOSED
    notes: Optional[str] = None

class PaymentCreate(BaseModel):
    payslipIds: List[str]  # Support bulk payments
    method: str = "BANK"  # BANK|CASH|UPI|OTHER
    reference: Optional[str] = None
    paidAt: str  # ISO-8601 datetime
    remarks: Optional[str] = None
    idempotencyKey: str = Field(default_factory=lambda: uuid4().hex)

class BulkPaymentCreate(BaseModel):
    method: str = "BANK"  # BANK|CASH|UPI|OTHER
    reference: Optional[str] = None
    paidAt: str  # ISO-8601 datetime
    remarks: Optional[str] = None
    idempotencyKey: str = Field(default_factory=lambda: uuid4().hex)

class PayslipEdit(BaseModel):
    base: Optional[Dict[str, Any]] = None
    allowances: Optional[List[Dict[str, Any]]] = None
    deductions: Optional[List[Dict[str, Any]]] = None
    tax: Optional[Dict[str, Any]] = None
    remarks: Optional[str] = None

class MessageCreate(BaseModel):
    message: str
    type: str = "ADMIN_NOTE"  # ADMIN_NOTE|SYSTEM_NOTE
    sendEmail: bool = False

class PaymentInfo(BaseModel):
    method: str = "BANK"  # BANK|CASH|UPI|OTHER
    reference: Optional[str] = None
    paidAt: str  # ISO-8601 datetime
    remarks: Optional[str] = None
    idempotencyKey: str = Field(default_factory=lambda: uuid4().hex)

class StatusUpdateRequest(BaseModel):
    status: str  # DRAFT|PUBLISHED|PAID|CLOSED
    notes: Optional[str] = None

# --- Helper Functions ---
def calculate_tax(subtotal: float, tax_rate: float) -> float:
    """Calculate tax amount based on subtotal and tax rate"""
    return round(subtotal * (tax_rate / 100), 2)

def round_currency(amount: float) -> float:
    """Round to 2 decimal places for currency values"""
    return round(amount, 2)

def compute_payslip_totals(lines: dict, currency: str = "INR") -> dict:
    """
    Compute gross, deductions, tax, and net pay for payslip lines.
    Returns calculated totals.
    """
    # Start with base salary
    base_amount = lines.get("base", {}).get("amount", 0)
    
    # Add allowances
    total_allowances = 0
    for allowance in lines.get("allowances", []):
        total_allowances += allowance.get("amount", 0)
    
    # Calculate gross
    gross_amount = base_amount + total_allowances
    
    # Calculate total deductions
    total_deductions = 0
    for deduction in lines.get("deductions", []):
        total_deductions += deduction.get("amount", 0)
    
    # Get tax amount
    tax_amount = lines.get("tax", {}).get("amount", 0)
    
    # Calculate net pay
    net_pay = gross_amount - total_deductions - tax_amount
    
    return {
        "grossAmount": round_currency(gross_amount),
        "totalAllowances": round_currency(total_allowances),
        "totalDeductions": round_currency(total_deductions),
        "totalTax": round_currency(tax_amount),
        "netPay": round_currency(net_pay)
    }

def generate_payslip_number(db, org_id: str, year: int) -> str:
    """Generate a unique payslip number in the format PAY-YYYY-####"""
    # Get and update the org's payslip number sequence
    org_ref = db.collection('organizations').document(org_id)
    
    # Run this in a transaction to ensure number uniqueness
    @firestore.transactional
    def update_sequence(transaction, org_ref):
        try:
            org_doc = transaction.get(org_ref)
            if org_doc.exists:
                org_data = org_doc.to_dict()
            else:
                org_data = {}
            
            # Initialize numberSequences if it doesn't exist
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
            logger.error(f"Error in update_sequence: {str(e)}")
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


def record_salary_payment(
    db,
    org_id: str,
    payslip_id: str,
    payslip_data: dict,
    payment_info: PaymentInfo | BulkPaymentCreate,
    processed_by: str,
):
    """Create or update a salary payment record for dashboard aggregation."""
    salary_payment_ref = db.collection('organizations', org_id, 'salaryPayments').document(payslip_id)
    existing_doc = salary_payment_ref.get()
    timestamp = datetime.now(timezone.utc).isoformat()

    payment_record = {
        "orgId": org_id,
        "runId": payslip_data.get("runId"),
        "payslipId": payslip_id,
        "employeeId": payslip_data.get("userId"),
        "employeeName": payslip_data.get("userName"),
        "grossAmount": payslip_data.get("grossAmount", 0),
        "netAmount": payslip_data.get("netPay", 0),
        "taxAmount": payslip_data.get("totalTax", 0),
        "deductionsAmount": payslip_data.get("totalDeductions", 0),
        "currency": payslip_data.get("currency", "INR"),
        "method": payment_info.method,
        "reference": payment_info.reference,
        "remarks": payment_info.remarks,
        "paidAt": payment_info.paidAt,
        "idempotencyKey": payment_info.idempotencyKey,
        "processedBy": processed_by,
        "updatedAt": timestamp,
    }

    if existing_doc.exists:
        existing_data = existing_doc.to_dict() or {}
        payment_record["createdAt"] = existing_data.get("createdAt", timestamp)
    else:
        payment_record["createdAt"] = timestamp

    salary_payment_ref.set(payment_record)


def recalculate_run_metrics(db, org_id: str, run_id: str):
    """Recompute salary run aggregates after status changes."""
    payslips_query = db.collection('organizations', org_id, 'payslips').where('runId', '==', run_id).get()

    counts = {"drafted": 0, "published": 0, "paid": 0}
    total_gross = 0.0
    total_deductions = 0.0
    total_tax = 0.0
    total_net = 0.0
    count_paid = 0
    count_unpaid = 0

    for payslip_doc in payslips_query:
        data = payslip_doc.to_dict() or {}
        status = (data.get("status") or "").upper()

        if status == "PAID":
            counts["paid"] += 1
            count_paid += 1
        elif status == "PUBLISHED":
            counts["published"] += 1
            count_unpaid += 1
        elif status == "DRAFT":
            counts["drafted"] += 1
            count_unpaid += 1
        else:
            count_unpaid += 1

        total_gross += data.get("grossAmount", 0) or 0
        total_deductions += data.get("totalDeductions", 0) or 0
        total_tax += data.get("totalTax", 0) or 0
        total_net += data.get("netPay", 0) or 0

    counts["total"] = counts["drafted"] + counts["published"] + counts["paid"]

    summary = {
        "totalGross": round_currency(total_gross),
        "totalDeductions": round_currency(total_deductions),
        "totalTax": round_currency(total_tax),
        "totalNet": round_currency(total_net),
        "countPaid": count_paid,
        "countUnpaid": count_unpaid,
        "countTotal": count_paid + count_unpaid,
    }

    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
    run_ref.update({
        "counts": counts,
        "totals": {
            "gross": round_currency(total_gross),
            "deductions": round_currency(total_deductions),
            "tax": round_currency(total_tax),
            "net": round_currency(total_net),
        },
        "summary": summary,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    })
    
    return {"counts": counts, "summary": summary}

# --- Salary Profile Endpoints ---
@router.get("/profiles")
async def list_salary_profiles(
    current_user: dict = Depends(get_current_user)
):
    """List all salary profiles for the organization"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Get all team members
    team_query = db.collection('organizations', org_id, 'team').get()
    
    profiles = []
    for team_doc in team_query:
        team_member = team_doc.to_dict()
        user_id = team_doc.id
        
        # Get salary profile if exists
        profile_ref = db.collection('organizations', org_id, 'salaryProfiles').document(user_id)
        profile_doc = profile_ref.get()
        
        if profile_doc.exists:
            profile_data = profile_doc.to_dict()
            profile_data["id"] = user_id
            profile_data["teamMember"] = {
                "userId": user_id,
                "name": team_member.get("name", ""),
                "email": team_member.get("email", ""),
                "status": "ACTIVE" if team_member.get("availability", False) else "INACTIVE"
            }
            profiles.append(profile_data)
        else:
            # Create placeholder for team members without profiles
            profiles.append({
                "id": user_id,
                "teamMember": {
                    "userId": user_id,
                    "name": team_member.get("name", ""),
                    "email": team_member.get("email", ""),
                    "status": "ACTIVE" if team_member.get("availability", False) else "INACTIVE"
                },
                "hasProfile": False
            })
    
    return profiles

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
    
    # Check if profile already exists
    profile_ref = db.collection('organizations', org_id, 'salaryProfiles').document(req.userId)
    if profile_ref.get().exists:
        raise HTTPException(status_code=400, detail="Salary profile already exists for this user")
    
    # Create salary profile
    profile_data = {
        "orgId": org_id,
        "userId": req.userId,
        "name": req.name,
        "baseSalary": req.baseSalary,
        "frequency": req.frequency,
        "allowances": req.allowances,
        "deductions": req.deductions,
        "taxRate": req.taxRate,
        "tdsEnabled": req.tdsEnabled,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "createdBy": current_user.get("uid"),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    
    profile_ref.set(profile_data)
    
    return {"status": "success", "profileId": req.userId}

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
    profile_ref = db.collection('organizations', org_id, 'salaryProfiles').document(user_id)
    profile = profile_ref.get()
    
    if not profile.exists:
        raise HTTPException(status_code=404, detail="Salary profile not found")
    
    profile_data = profile.to_dict()
    profile_data["id"] = user_id
    
    # Add team member info
    team_member_ref = db.collection('organizations', org_id, 'team').document(user_id)
    team_member = team_member_ref.get()
    if team_member.exists:
        team_data = team_member.to_dict()
        profile_data["teamMember"] = {
            "userId": user_id,
            "name": team_data.get("name", ""),
            "email": team_data.get("email", ""),
            "status": "ACTIVE" if team_data.get("availability", False) else "INACTIVE"
        }
    
    return profile_data

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
    profile_ref = db.collection('organizations', org_id, 'salaryProfiles').document(user_id)
    profile = profile_ref.get()
    
    if not profile.exists:
        raise HTTPException(status_code=404, detail="Salary profile not found")
    
    # Update profile
    profile_data = {
        "baseSalary": req.baseSalary,
        "frequency": req.frequency,
        "allowances": req.allowances,
        "deductions": req.deductions,
        "taxRate": req.taxRate,
        "tdsEnabled": req.tdsEnabled,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedBy": current_user.get("uid")
    }
    
    profile_ref.update(profile_data)
    
    return {"status": "success"}

@router.delete("/profiles/{user_id}")
async def delete_salary_profile(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a salary profile"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    profile_ref = db.collection('organizations', org_id, 'salaryProfiles').document(user_id)
    profile = profile_ref.get()
    
    if not profile.exists:
        raise HTTPException(status_code=404, detail="Salary profile not found")
    
    # Check if user has any payslips
    runs_query = db.collection('organizations', org_id, 'salaryRuns').get()
    for run_doc in runs_query:
        payslip_ref = db.collection('organizations', org_id, 'salaryRuns', run_doc.id, 'payslips').document(user_id)
        if payslip_ref.get().exists:
            raise HTTPException(
                status_code=400, 
                detail="Cannot delete profile - user has existing payslips. Please void payslips first."
            )
    
    profile_ref.delete()
    
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
        "period.month", "==", req.month
    ).where(
        "period.year", "==", req.year
    ).where("status", "in", ["PUBLISHED", "PAID"]).limit(1).get()
    
    if len(run_query) > 0:
        raise HTTPException(
            status_code=400, 
            detail="A salary run already exists for this period in PUBLISHED or PAID state"
        )
    
    # Create a new salary run
    run_id = f"run_{req.year}_{str(req.month).zfill(2)}"
    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(run_id)
    
    period_sort_key = (req.year or 0) * 100 + (req.month or 0)

    run_data = {
        "orgId": org_id,
        "period": {"month": req.month, "year": req.year, "label": f"{['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][req.month]} {req.year}"},
        "periodSortKey": period_sort_key,
        "status": "DRAFT",
        "notes": req.notes,
        "counts": {"drafted": 0, "published": 0, "paid": 0},
        "totals": {"gross": 0, "deductions": 0, "tax": 0, "net": 0},
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "createdBy": current_user.get("uid"),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    
    run_ref.set(run_data)
    
    # Get all active team members
    team_query = db.collection('organizations', org_id, 'team').where("availability", "==", True).get()
    
    # Generate draft payslips for each team member
    payslips_created = 0
    total_gross = 0
    total_deductions = 0
    total_tax = 0
    total_net = 0
    
    for team_doc in team_query:
        team_member = team_doc.to_dict()
        user_id = team_doc.id
        
        # Skip if there's an exit date and it's before this run's period
        exit_date = team_member.get("exitDate")
        if exit_date:
            try:
                exit_dt = datetime.fromisoformat(exit_date.replace('Z', ''))
                run_dt = datetime(req.year, req.month, 1)
                if exit_dt < run_dt:
                    continue
            except:
                pass  # Skip date parsing errors
        
        # Get member's salary profile
        profile_ref = db.collection('organizations', org_id, 'salaryProfiles').document(user_id)
        profile = profile_ref.get()
        
        if not profile.exists:
            continue  # Skip members without salary profiles
        
        profile_data = profile.to_dict()
        
        # Create payslip lines
        base_line = {"label": "Base Salary", "amount": profile_data.get("baseSalary", 0)}
        allowances_lines = profile_data.get("allowances", [])
        deductions_lines = profile_data.get("deductions", [])
        
        # Calculate totals
        gross_amount = base_line["amount"] + sum(a.get("amount", 0) for a in allowances_lines)
        total_allowances = sum(a.get("amount", 0) for a in allowances_lines)
        total_deductions_amount = sum(d.get("amount", 0) for d in deductions_lines)
        
        # Calculate tax
        tax_amount = 0
        tax_config = profile_data.get("tax", {})
        if tax_config.get("mode") == "PERCENT":
            subtotal = gross_amount - total_deductions_amount
            tax_amount = round(subtotal * (tax_config.get("value", 0) / 100), 2)
        elif tax_config.get("mode") == "FIXED":
            tax_amount = tax_config.get("value", 0)
        
        tax_line = {"label": "TDS", "amount": tax_amount}
        net_pay = gross_amount - total_deductions_amount - tax_amount
        
        # Create payslip data
        payslip_data = {
            "orgId": org_id,
            "runId": run_id,
            "userId": user_id,
            "userName": team_member.get("name", ""),
            "period": {"month": req.month, "year": req.year},
            "status": "DRAFT",
            "currency": profile_data.get("currency", "INR"),
            "lines": {
                "base": base_line,
                "allowances": [{"key": a.get("key", ""), "label": a.get("label", ""), "amount": a.get("amount", 0)} for a in allowances_lines],
                "deductions": [{"key": d.get("key", ""), "label": d.get("label", ""), "amount": d.get("amount", 0)} for d in deductions_lines],
                "tax": tax_line
            },
            "grossAmount": round_currency(gross_amount),
            "totalAllowances": round_currency(total_allowances),
            "totalDeductions": round_currency(total_deductions_amount),
            "totalTax": round_currency(tax_amount),
            "netPay": round_currency(net_pay),
            "remarks": "",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "createdBy": current_user.get("uid"),
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "audit": [{
                "by": current_user.get("uid"),
                "action": "CREATED",
                "at": datetime.now(timezone.utc).isoformat()
            }]
        }
        
        # Create payslip document
        payslip_ref = db.collection('organizations', org_id, 'payslips').document()
        payslip_data["id"] = payslip_ref.id
        payslip_ref.set(payslip_data)
        
        # Update totals
        total_gross += gross_amount
        total_deductions += total_deductions_amount
        total_tax += tax_amount
        total_net += net_pay
        payslips_created += 1
    
    # Update run with summary information
    run_ref.update({
        "counts": {"drafted": payslips_created, "published": 0, "paid": 0},
        "totals": {
            "gross": round_currency(total_gross),
            "deductions": round_currency(total_deductions),
            "tax": round_currency(total_tax),
            "net": round_currency(total_net)
        },
        "generatedAt": datetime.now(timezone.utc).isoformat()
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
            runs_query = db.collection('organizations', org_id, 'salaryRuns').get()

            runs = []
            for run_doc in runs_query:
                run_data = run_doc.to_dict()
                run_data["id"] = run_doc.id

                # Calculate totals for each run
                payslips_query = db.collection('organizations', org_id, 'payslips').where('runId', '==', run_doc.id).get()
                total_gross = 0
                total_deductions = 0
                total_tax = 0
                total_net = 0
                payslips_count = 0

                for payslip_doc in payslips_query:
                    payslip_data = payslip_doc.to_dict()
                    if payslip_data.get("status") != "VOID":  # Exclude voided payslips
                        total_gross += payslip_data.get("grossAmount", 0)
                        total_deductions += payslip_data.get("totalDeductions", 0)
                        total_tax += payslip_data.get("totalTax", 0)
                        total_net += payslip_data.get("netPay", 0)
                        payslips_count += 1

                # Add totals to run data
                run_data["totals"] = {
                    "gross": round_currency(total_gross),
                    "deductions": round_currency(total_deductions),
                    "tax": round_currency(total_tax),
                    "net": round_currency(total_net)
                }
                run_data["payslipsCount"] = payslips_count

                runs.append(run_data)

            # Sort manually to avoid composite index requirement
            runs.sort(key=lambda x: (
                -1 * (x.get("periodSortKey") or 0),
                -1 * (x.get("period", {}).get("year", 0) or 0),
                -1 * (x.get("period", {}).get("month", 0) or 0)
            ))

            print(f"Found {len(runs)} salary runs")
            return runs
        except Exception as db_error:
            print(f"Firestore error: {str(db_error)}")
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
    payslips_query = db.collection('organizations', org_id, 'payslips').where('runId', '==', run_id).get()
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
                payslips_query = db.collection('organizations', org_id, 'payslips').where('runId', '==', run_id).limit(1).get()
                if len(payslips_query) == 0:
                    raise HTTPException(
                        status_code=400, 
                        detail="Cannot publish an empty run with no payslips"
                    )
                
                # Assign payslip numbers and update status for all payslips
                all_payslips = db.collection('organizations', org_id, 'payslips').where('runId', '==', run_id).get()
                
                for payslip_doc in all_payslips:
                    payslip_data = payslip_doc.to_dict()
                    year = payslip_data.get("period", {}).get("year", datetime.now().year)
                    
                    # Generate payslip number
                    payslip_number = generate_payslip_number(db, org_id, year)
                    
                    # Update payslip
                    payslip_ref = db.collection('organizations', org_id, 'payslips').document(payslip_doc.id)
                    payslip_ref.update({
                        "status": "PUBLISHED",
                        "number": payslip_number,
                        "publishedAt": datetime.now(timezone.utc).isoformat(),
                        "publishedBy": current_user.get("uid"),
                        "updatedAt": datetime.now(timezone.utc).isoformat()
                    })
            except Exception as e:
                logger.error(f"Error updating payslips: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Error updating payslips: {str(e)}"
                )
        
        # Update run with summary information
        run_ref.update({
            "status": new_status,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "updatedBy": current_user.get("uid")
        })
        
        if req.notes:
            run_ref.update({"notes": req.notes})
        
        # Set special timestamps based on status
        if new_status == "PUBLISHED":
            run_ref.update({
                "publishedAt": datetime.now(timezone.utc).isoformat(),
                "publishedBy": current_user.get("uid")
            })
        elif new_status == "PAID":
            run_ref.update({
                "paidAt": datetime.now(timezone.utc).isoformat(),
                "paidBy": current_user.get("uid")
            })
        elif new_status == "CLOSED":
            run_ref.update({
                "closedAt": datetime.now(timezone.utc).isoformat(),
                "closedBy": current_user.get("uid")
            })
        
        return {"status": "success", "runId": run_id, "newStatus": new_status}
    except Exception as e:
        logger.error(f"Error in update_salary_run: {str(e)}")
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
    payslips_query = db.collection('organizations', org_id, 'payslips').where('runId', '==', run_id).get()
    
    payslips = []
    for payslip_doc in payslips_query:
        payslip_data = payslip_doc.to_dict()
        payslip_data["id"] = payslip_doc.id
        payslips.append(payslip_data)
    
    return payslips

@router.get("/payslips/{payslip_id}")
async def get_payslip(
    payslip_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific payslip"""
    org_id = current_user.get("orgId")
    
    db = firestore.client()
    
    # Get payslip
    payslip_ref = db.collection('organizations', org_id, 'payslips').document(payslip_id)
    payslip = payslip_ref.get()
    
    if not payslip.exists:
        raise HTTPException(status_code=404, detail="Payslip not found")
    
    payslip_data = payslip.to_dict()
    user_id = payslip_data.get("userId")
    
    # Authorization check: admins can view any payslip, team members can only view their own
    if not (is_authorized_for_salary_actions(current_user) or 
            (current_user.get("uid") == user_id and current_user.get("role") in ["crew", "editor", "data-manager"])):
        raise HTTPException(status_code=403, detail="Not authorized to view this payslip")
    
    # For team members, verify the payslip is published
    if not is_authorized_for_salary_actions(current_user):
        if payslip_data.get("status") not in ["PUBLISHED", "PAID"]:
            raise HTTPException(status_code=403, detail="Payslip is not yet published")
    
    payslip_data["id"] = payslip_id
    return payslip_data

@router.put("/payslips/{payslip_id}")
async def update_payslip(
    payslip_id: str,
    edit_data: PayslipEdit,
    current_user: dict = Depends(get_current_user)
):
    """Update a payslip (only available in DRAFT state)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Get current payslip
    payslip_ref = db.collection('organizations', org_id, 'payslips').document(payslip_id)
    payslip = payslip_ref.get()
    
    if not payslip.exists:
        raise HTTPException(status_code=404, detail="Payslip not found")
    
    payslip_data = payslip.to_dict()
    
    if payslip_data.get("status") != "DRAFT":
        raise HTTPException(status_code=400, detail="Cannot update payslips that are not in DRAFT status")
    
    # Verify run is in DRAFT state
    run_ref = db.collection('organizations', org_id, 'salaryRuns').document(payslip_data.get("runId"))
    run = run_ref.get()
    if not run.exists or run.to_dict().get("status") != "DRAFT":
        raise HTTPException(status_code=400, detail="Cannot update payslips in a published or paid run")
    
    # Update allowed fields
    update_data = {}
    current_lines = payslip_data.get("lines", {})
    
    if edit_data.base is not None:
        current_lines["base"] = edit_data.base
    if edit_data.allowances is not None:
        current_lines["allowances"] = edit_data.allowances
    if edit_data.deductions is not None:
        current_lines["deductions"] = edit_data.deductions
    if edit_data.tax is not None:
        current_lines["tax"] = edit_data.tax
    if edit_data.remarks is not None:
        update_data["remarks"] = edit_data.remarks
    
    # Recalculate totals
    base_amount = current_lines.get("base", {}).get("amount", 0)
    allowances_total = sum(a.get("amount", 0) for a in current_lines.get("allowances", []))
    deductions_total = sum(d.get("amount", 0) for d in current_lines.get("deductions", []))
    tax_amount = current_lines.get("tax", {}).get("amount", 0)
    
    gross_amount = base_amount + allowances_total
    net_pay = gross_amount - deductions_total - tax_amount
    
    update_data.update({
        "lines": current_lines,
        "grossAmount": round_currency(gross_amount),
        "totalAllowances": round_currency(allowances_total),
        "totalDeductions": round_currency(deductions_total),
        "totalTax": round_currency(tax_amount),
        "netPay": round_currency(net_pay),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedBy": current_user.get("uid")
    })
    
    # Update payslip
    payslip_ref.update(update_data)
    
    return {"status": "success", "payslipId": payslip_id}

@router.post("/payments")
async def create_bulk_payment(
    payment_data: PaymentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Mark multiple payslips as paid (bulk payment)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    if not payment_data.payslipIds:
        raise HTTPException(status_code=400, detail="No payslip IDs provided")
    
    processed_payslips = []
    skipped_payslips = []
    
    for payslip_id in payment_data.payslipIds:
        try:
            # Get payslip
            payslip_ref = db.collection('organizations', org_id, 'payslips').document(payslip_id)
            payslip = payslip_ref.get()
            
            if not payslip.exists:
                skipped_payslips.append({"id": payslip_id, "reason": "Payslip not found"})
                continue
            
            payslip_data = payslip.to_dict()
            
            if payslip_data.get("status") == "PAID":
                # Check idempotency
                existing_payment = payslip_data.get("payment", {})
                if existing_payment.get("idempotencyKey") == payment_data.idempotencyKey:
                    skipped_payslips.append({"id": payslip_id, "reason": "Already processed with this idempotency key"})
                    continue
                else:
                    skipped_payslips.append({"id": payslip_id, "reason": "Already paid"})
                    continue
            
            if payslip_data.get("status") != "PUBLISHED":
                skipped_payslips.append({"id": payslip_id, "reason": "Not in PUBLISHED status"})
                continue
            
            # Record payment
            payment_record = {
                "method": payment_data.method,
                "reference": payment_data.reference,
                "paidAt": payment_data.paidAt,
                "remarks": payment_data.remarks,
                "idempotencyKey": payment_data.idempotencyKey,
                "processedAt": datetime.now(timezone.utc).isoformat(),
                "processedBy": current_user.get("uid"),
                "amount": payslip_data.get("netPay", 0)
            }
            
            # Update payslip
            payslip_ref.update({
                "status": "PAID",
                "payment": payment_record,
                "paidAt": payment_data.paidAt,
                "paidBy": current_user.get("uid"),
                "updatedAt": datetime.now(timezone.utc).isoformat()
            })
            
            processed_payslips.append(payslip_id)
            
        except Exception as e:
            logger.error(f"Error processing payslip {payslip_id}: {str(e)}")
            skipped_payslips.append({"id": payslip_id, "reason": f"Error: {str(e)}"})
    
    return {
        "status": "success",
        "processed": len(processed_payslips),
        "skipped": len(skipped_payslips),
        "processedPayslips": processed_payslips,
        "skippedPayslips": skipped_payslips
    }

@router.post("/payslips/{payslip_id}/void")
async def void_payslip(
    payslip_id: str,
    reason: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user)
):
    """Void a payslip (admin only)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    if not reason or len(reason.strip()) < 5:
        raise HTTPException(status_code=400, detail="Void reason must be at least 5 characters")
    
    db = firestore.client()
    
    # Get payslip
    payslip_ref = db.collection('organizations', org_id, 'payslips').document(payslip_id)
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
        "voidedAt": datetime.now(timezone.utc).isoformat(),
        "voidedBy": current_user.get("uid"),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    })
    
    return {"status": "success", "payslipId": payslip_id}

@router.post("/payslips/{payslip_id}/payment")
async def mark_payslip_paid(
    payslip_id: str,
    payment_info: PaymentInfo,
    current_user: dict = Depends(get_current_user)
):
    """Mark a payslip as paid"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Get payslip
    payslip_ref = db.collection('organizations', org_id, 'payslips').document(payslip_id)
    payslip = payslip_ref.get()
    
    if not payslip.exists:
        raise HTTPException(status_code=404, detail="Payslip not found")
    
    payslip_data = payslip.to_dict()
    if payslip_data.get("status") == "PAID":
        # Check idempotency key to avoid duplicate payments
        existing_payment = payslip_data.get("payment", {})
        if existing_payment.get("idempotencyKey") == payment_info.idempotencyKey:
            return {"status": "success", "message": "Payment already processed", "payslipId": payslip_id}
        else:
            raise HTTPException(status_code=400, detail="Payslip is already marked as paid")
    
    if payslip_data.get("status") != "PUBLISHED":
        raise HTTPException(status_code=400, detail="Can only mark published payslips as paid")
    
    # Record payment
    payment_data = {
        "method": payment_info.method,
        "reference": payment_info.reference,
        "paidAt": payment_info.paidAt,
        "remarks": payment_info.remarks,
        "idempotencyKey": payment_info.idempotencyKey,
        "processedAt": datetime.now(timezone.utc).isoformat(),
        "processedBy": current_user.get("uid"),
        "amount": payslip_data.get("netPay", 0)
    }
    
    # Update payslip
    update_timestamp = datetime.now(timezone.utc).isoformat()
    payslip_ref.update({
        "status": "PAID",
        "payment": payment_data,
        "paidAt": payment_info.paidAt,
        "paidBy": current_user.get("uid"),
        "updatedAt": update_timestamp
    })

    # Refresh local data for downstream helpers
    payslip_data.update({
        "status": "PAID",
        "payment": payment_data,
        "paidAt": payment_info.paidAt,
        "paidBy": current_user.get("uid"),
        "updatedAt": update_timestamp
    })

    # Record salary payment entry for dashboards
    record_salary_payment(
        db=db,
        org_id=org_id,
        payslip_id=payslip_id,
        payslip_data=payslip_data,
        payment_info=payment_info,
        processed_by=current_user.get("uid"),
    )

    # Update run aggregates
    run_id = payslip_data.get("runId")
    if run_id:
        recalculate_run_metrics(db, org_id, run_id)
    
    return {"status": "success", "payslipId": payslip_id}

@router.post("/runs/{run_id}/mark-all-paid")
async def mark_all_payslips_paid(
    run_id: str,
    payment_info: BulkPaymentCreate,
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
    
    # Get all payslips for the run and process eligible ones
    payslips_query = db.collection('organizations', org_id, 'payslips').where('runId', '==', run_id).get()
    processed_at = datetime.now(timezone.utc).isoformat()

    payslips_marked = 0
    for payslip_doc in payslips_query:
        payslip_ref = db.collection('organizations', org_id, 'payslips').document(payslip_doc.id)
        payslip_data = payslip_doc.to_dict() or {}
        status = (payslip_data.get("status") or "").upper()

        # Only convert published payslips; skip drafts or already paid
        if status != "PUBLISHED":
            continue

        payment_data = {
            "method": payment_info.method,
            "reference": payment_info.reference,
            "paidAt": payment_info.paidAt,
            "remarks": payment_info.remarks,
            "idempotencyKey": payment_info.idempotencyKey,
            "processedAt": processed_at,
            "processedBy": current_user.get("uid"),
            "amount": payslip_data.get("netPay", 0)
        }

        payslip_ref.update({
            "status": "PAID",
            "payment": payment_data,
            "paidAt": payment_info.paidAt,
            "paidBy": current_user.get("uid"),
            "updatedAt": processed_at
        })

        payslip_data.update({
            "status": "PAID",
            "payment": payment_data,
            "paidAt": payment_info.paidAt,
            "paidBy": current_user.get("uid"),
            "updatedAt": processed_at
        })

        record_salary_payment(
            db=db,
            org_id=org_id,
            payslip_id=payslip_doc.id,
            payslip_data=payslip_data,
            payment_info=payment_info,
            processed_by=current_user.get("uid"),
        )

        payslips_marked += 1

    if payslips_marked > 0:
        metrics = recalculate_run_metrics(db, org_id, run_id)

        counts = (metrics or {}).get("counts", {})
        total_count = counts.get("total", 0)
        paid_count = counts.get("paid", 0)

        if total_count and total_count == paid_count:
            run_ref.update({
                "status": "PAID",
                "paidAt": payment_info.paidAt,
                "paidBy": current_user.get("uid"),
                "updatedAt": processed_at
            })

    return {"status": "success", "payslipsMarked": payslips_marked}



@router.get("/my-payslips")
async def get_my_payslips(
    current_user: dict = Depends(get_current_user)
):
    """Get all payslips for the current team member"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = firestore.client()
    
    try:
        # Get all payslips for this user
        payslips_query = db.collection('organizations', org_id, 'payslips').where(
            "userId", "==", user_id
        ).where(
            "status", "in", ["PUBLISHED", "PAID"]
        ).get()
        
        my_payslips = []
        for payslip_doc in payslips_query:
            payslip_data = payslip_doc.to_dict()
            
            # Include minimal data needed for listing
            my_payslips.append({
                "id": payslip_doc.id,
                "runId": payslip_data.get("runId"),
                "number": payslip_data.get("number"),
                "period": payslip_data.get("period"),
                "status": payslip_data.get("status"),
                "netPay": payslip_data.get("netPay"),
                "currency": payslip_data.get("currency"),
                "paidAt": payslip_data.get("paidAt"),
            })
        
        # Sort by period (year desc, month desc)
        my_payslips.sort(key=lambda x: (
            -1 * (x.get("period", {}).get("year", 0) or 0), 
            -1 * (x.get("period", {}).get("month", 0) or 0)
        ))
        
        return my_payslips
        
    except Exception as db_error:
        logger.error(f"Error in get_my_payslips: {str(db_error)}")
        
        # Check specifically for missing index error
        error_str = str(db_error)
        if "The query requires an index" in error_str:
            logger.info("Index error detected in get_my_payslips, falling back to simpler query")
            
            # Fallback to a simpler query
            simple_payslips_query = db.collection('organizations', org_id, 'payslips').where("userId", "==", user_id).get()
            
            my_payslips = []
            for payslip_doc in simple_payslips_query:
                payslip_data = payslip_doc.to_dict()
                
                # Only include published or paid payslips
                if payslip_data.get("status") in ["PUBLISHED", "PAID"]:
                    my_payslips.append({
                        "id": payslip_doc.id,
                        "runId": payslip_data.get("runId"),
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
            
            return my_payslips
        else:
            # For other errors, return empty list and log
            logger.error(f"Unhandled error in get_my_payslips: {str(db_error)}")
            return []

# --- Reports and Analytics Endpoints ---
@router.get("/reports/period-summary")
async def get_period_summary(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    current_user: dict = Depends(get_current_user)
):
    """Get period summary report for salaries"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Get payslips for the specified period
    payslips_query = db.collection('organizations', org_id, 'payslips').where(
        "period.month", "==", month
    ).where(
        "period.year", "==", year
    ).get()
    
    total_gross = 0
    total_deductions = 0
    total_tax = 0
    total_net = 0
    count_total = 0
    count_paid = 0
    count_unpaid = 0
    
    for payslip_doc in payslips_query:
        payslip_data = payslip_doc.to_dict()
        
        if payslip_data.get("status") == "VOID":
            continue
        
        count_total += 1
        total_gross += payslip_data.get("grossAmount", 0)
        total_deductions += payslip_data.get("totalDeductions", 0)
        total_tax += payslip_data.get("totalTax", 0)
        total_net += payslip_data.get("netPay", 0)
        
        if payslip_data.get("status") == "PAID":
            count_paid += 1
        else:
            count_unpaid += 1
    
    return {
        "period": {"month": month, "year": year},
        "summary": {
            "totalGross": round_currency(total_gross),
            "totalDeductions": round_currency(total_deductions),
            "totalTax": round_currency(total_tax),
            "totalNet": round_currency(total_net),
            "countTotal": count_total,
            "countPaid": count_paid,
            "countUnpaid": count_unpaid
        }
    }

@router.get("/reports/annual-summary")
async def get_annual_summary(
    year: int = Query(..., ge=2000, le=2100),
    current_user: dict = Depends(get_current_user)
):
    """Get annual salary summary"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Get all payslips for the year
    payslips_query = db.collection('organizations', org_id, 'payslips').where(
        "period.year", "==", year
    ).get()
    
    monthly_data = {}
    annual_totals = {
        "totalGross": 0,
        "totalDeductions": 0,
        "totalTax": 0,
        "totalNet": 0,
        "countTotal": 0,
        "countPaid": 0
    }
    
    for payslip_doc in payslips_query:
        payslip_data = payslip_doc.to_dict()
        
        if payslip_data.get("status") == "VOID":
            continue
        
        month = payslip_data.get("period", {}).get("month", 0)
        if month not in monthly_data:
            monthly_data[month] = {
                "month": month,
                "totalGross": 0,
                "totalDeductions": 0,
                "totalTax": 0,
                "totalNet": 0,
                "countTotal": 0,
                "countPaid": 0
            }
        
        # Update monthly data
        monthly_data[month]["totalGross"] += payslip_data.get("grossAmount", 0)
        monthly_data[month]["totalDeductions"] += payslip_data.get("totalDeductions", 0)
        monthly_data[month]["totalTax"] += payslip_data.get("totalTax", 0)
        monthly_data[month]["totalNet"] += payslip_data.get("netPay", 0)
        monthly_data[month]["countTotal"] += 1
        
        if payslip_data.get("status") == "PAID":
            monthly_data[month]["countPaid"] += 1
        
        # Update annual totals
        annual_totals["totalGross"] += payslip_data.get("grossAmount", 0)
        annual_totals["totalDeductions"] += payslip_data.get("totalDeductions", 0)
        annual_totals["totalTax"] += payslip_data.get("totalTax", 0)
        annual_totals["totalNet"] += payslip_data.get("netPay", 0)
        annual_totals["countTotal"] += 1
        
        if payslip_data.get("status") == "PAID":
            annual_totals["countPaid"] += 1
    
    # Convert to list and sort by month
    monthly_summary = sorted(
        [data for data in monthly_data.values()],
        key=lambda x: x["month"]
    )
    
    # Round currency values
    for month_data in monthly_summary:
        for key in ["totalGross", "totalDeductions", "totalTax", "totalNet"]:
            month_data[key] = round_currency(month_data[key])
    
    for key in ["totalGross", "totalDeductions", "totalTax", "totalNet"]:
        annual_totals[key] = round_currency(annual_totals[key])
    
    return {
        "year": year,
        "monthlyBreakdown": monthly_summary,
        "annualTotals": annual_totals
    }

@router.get("/analytics/salary-trends")
async def get_salary_trends(
    months: int = Query(12, ge=1, le=24),
    current_user: dict = Depends(get_current_user)
):
    """Get salary trends over specified months"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Calculate date range
    from datetime import date
    import calendar
    
    current_date = date.today()
    trends = []
    
    for i in range(months):
        # Calculate month and year
        target_month = current_date.month - i
        target_year = current_date.year
        
        if target_month <= 0:
            target_month += 12
            target_year -= 1
        
        # Get payslips for this month
        payslips_query = db.collection('organizations', org_id, 'payslips').where(
            "period.month", "==", target_month
        ).where(
            "period.year", "==", target_year
        ).where(
            "status", "!=", "VOID"
        ).get()
        
        month_total = 0
        employee_count = 0
        
        for payslip_doc in payslips_query:
            payslip_data = payslip_doc.to_dict()
            month_total += payslip_data.get("netPay", 0)
            employee_count += 1
        
        trends.append({
            "month": target_month,
            "year": target_year,
            "label": f"{calendar.month_abbr[target_month]} {target_year}",
            "totalPayout": round_currency(month_total),
            "employeeCount": employee_count,
            "averageSalary": round_currency(month_total / employee_count if employee_count > 0 else 0)
        })
    
    # Reverse to get chronological order
    trends.reverse()
    
    return {
        "period": f"Last {months} months",
        "trends": trends
    }
# --- Export Endpoints ---
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
    period = run_data.get("period", {})
    
    # Get all payslips for this run
    payslips_query = db.collection('organizations', org_id, 'payslips').where('runId', '==', run_id).get()
    
    # Prepare CSV data
    csv_rows = []
    
    # Add header row
    header = [
        "Employee ID",
        "Employee Name",
        "Payslip Number",
        "Status",
        "Base Amount",
        "Total Allowances",
        "Total Deductions",
        "Tax Amount",
        "Gross Amount",
        "Net Pay",
        "Currency",
        "Payment Method",
        "Payment Date",
        "Payment Reference",
        "Remarks"
    ]
    csv_rows.append(",".join([f'"{h}"' for h in header]))
    
    # Add data rows
    for payslip_doc in payslips_query:
        payslip_data = payslip_doc.to_dict()
        
        # Skip voided payslips unless explicitly requested
        if payslip_data.get("status") == "VOID":
            continue
        
        payment = payslip_data.get("payment", {})
        row = [
            payslip_data.get("userId", ""),
            payslip_data.get("userName", ""),
            payslip_data.get("number", ""),
            payslip_data.get("status", ""),
            str(payslip_data.get("lines", {}).get("base", {}).get("amount", 0)),
            str(payslip_data.get("totalAllowances", 0)),
            str(payslip_data.get("totalDeductions", 0)),
            str(payslip_data.get("totalTax", 0)),
            str(payslip_data.get("grossAmount", 0)),
            str(payslip_data.get("netPay", 0)),
            payslip_data.get("currency", "INR"),
            payment.get("method", ""),
            payment.get("paidAt", ""),
            payment.get("reference", ""),
            payslip_data.get("remarks", "")
        ]
        csv_rows.append(",".join([f'"{str(cell)}"' for cell in row]))
    
    # Join rows with newlines
    csv_content = "\n".join(csv_rows)
    
    return {
        "content": csv_content, 
        "filename": f"payslips_{period.get('label', run_id)}.csv",
        "runId": run_id
    }

@router.get("/settings")
async def get_salary_settings(
    current_user: dict = Depends(get_current_user)
):
    """Get organization salary settings"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Get organization settings
    org_ref = db.collection('organizations').document(org_id)
    org_doc = org_ref.get()
    
    if not org_doc.exists:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    org_data = org_doc.to_dict()
    
    # Extract salary-related settings
    settings = {
        "currency": org_data.get("defaultCurrency", "INR"),
        "timezone": "Asia/Kolkata",  # Fixed for Indian organizations
        "defaultTaxMode": org_data.get("defaultTaxMode", "NONE"),
        "defaultTaxRate": org_data.get("defaultTaxRate", 0),
        "payslipNumberPrefix": "PAY",
        "features": {
            "salaries": org_data.get("features", {}).get("financialHub", {}).get("salaries", True)
        }
    }
    
    return settings

@router.put("/settings")
async def update_salary_settings(
    settings: Dict[str, Any] = Body(...),
    current_user: dict = Depends(get_current_user)
):
    """Update organization salary settings"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Get organization
    org_ref = db.collection('organizations').document(org_id)
    org_doc = org_ref.get()
    
    if not org_doc.exists:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    # Update allowed settings
    allowed_fields = ["defaultCurrency", "defaultTaxMode", "defaultTaxRate"]
    update_data = {}
    
    for field in allowed_fields:
        if field in settings:
            update_data[field] = settings[field]
    
    if update_data:
        update_data["updatedAt"] = datetime.now(timezone.utc).isoformat()
        update_data["updatedBy"] = current_user.get("uid")
        org_ref.update(update_data)
    
    return {"status": "success", "updated": list(update_data.keys())}

@router.get("/dashboard")
async def get_salary_dashboard(
    current_user: dict = Depends(get_current_user)
):
    """Get salary dashboard data for Financial Hub"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_salary_actions(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for salary operations")
    
    db = firestore.client()
    
    # Get current month data
    now = datetime.now()
    current_month = now.month
    current_year = now.year
    
    # Get current month's run
    current_run_query = db.collection('organizations', org_id, 'salaryRuns').where(
        "period.month", "==", current_month
    ).where(
        "period.year", "==", current_year
    ).limit(1).get()
    
    current_run = None
    if current_run_query:
        current_run_doc = current_run_query[0]
        current_run = current_run_doc.to_dict()
        current_run["id"] = current_run_doc.id
    
    # Get recent runs
    recent_runs_query = db.collection('organizations', org_id, 'salaryRuns').limit(5).get()
    recent_runs = []
    for run_doc in recent_runs_query:
        run_data = run_doc.to_dict()
        run_data["id"] = run_doc.id
        recent_runs.append(run_data)
    
    # Sort recent runs by period (latest first)
    recent_runs.sort(key=lambda x: (
        -x.get("period", {}).get("year", 0),
        -x.get("period", {}).get("month", 0)
    ))
    
    # Get summary statistics
    total_employees = 0
    employees_with_profiles = 0
    
    # Count team members
    team_query = db.collection('organizations', org_id, 'team').get()
    total_employees = len(team_query)
    
    # Count profiles
    profiles_query = db.collection('organizations', org_id, 'salaryProfiles').get()
    employees_with_profiles = len(profiles_query)
    
    return {
        "currentPeriod": {
            "month": current_month,
            "year": current_year,
            "run": current_run
        },
        "recentRuns": recent_runs[:5],
        "stats": {
            "totalEmployees": total_employees,
            "employeesWithProfiles": employees_with_profiles,
            "profilesNeeded": max(0, total_employees - employees_with_profiles)
        }
    }
