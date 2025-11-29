"""
Salaries router - Payroll and salary management
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, date
from pydantic import BaseModel

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user
from shared.redis_client import cache


router = APIRouter()


# ============ SCHEMAS ============

class SalaryProfileCreate(BaseModel):
    employee_id: str
    employee_name: str
    base_salary: float
    pay_frequency: str  # monthly, bi-weekly, weekly
    currency: str = "INR"
    bank_account: Optional[str] = None
    tax_id: Optional[str] = None
    deductions: List[dict] = []  # [{name, amount, percentage}]
    allowances: List[dict] = []  # [{name, amount}]


class PayrollCreate(BaseModel):
    period_start: str
    period_end: str
    pay_date: str
    notes: Optional[str] = None


class PayslipAdjustment(BaseModel):
    employee_id: str
    adjustment_type: str  # bonus, deduction, overtime, commission
    amount: float
    description: str


# ============ SALARY PROFILES ============

@router.get("/profiles")
@cache(ttl=300)
async def get_salary_profiles(
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all salary profiles"""
    db = get_db()
    
    docs = db.collection(Collections.SALARY_PROFILES)\
        .where("org_code", "==", org_code)\
        .where("status", "==", "active").stream()
    
    profiles = []
    for doc in docs:
        profile = doc.to_dict()
        profile["id"] = doc.id
        profiles.append(profile)
    
    return {"profiles": profiles, "count": len(profiles)}


@router.post("/profiles")
async def create_salary_profile(
    profile: SalaryProfileCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a salary profile for an employee"""
    db = get_db()
    
    # Check if profile already exists
    existing = list(db.collection(Collections.SALARY_PROFILES)
                    .where("org_code", "==", org_code)
                    .where("employee_id", "==", profile.employee_id)
                    .limit(1).stream())
    
    if existing:
        raise HTTPException(status_code=400, detail="Salary profile already exists for this employee")
    
    profile_data = profile.dict()
    profile_data["org_code"] = org_code
    profile_data["created_at"] = datetime.utcnow().isoformat()
    profile_data["created_by"] = current_user["user_id"]
    profile_data["status"] = "active"
    
    # Calculate net salary
    gross = profile.base_salary + sum(a.get("amount", 0) for a in profile.allowances)
    deductions_total = sum(
        d.get("amount", 0) if d.get("amount") else (gross * d.get("percentage", 0) / 100)
        for d in profile.deductions
    )
    profile_data["gross_salary"] = gross
    profile_data["total_deductions"] = deductions_total
    profile_data["net_salary"] = gross - deductions_total
    
    doc_ref = db.collection(Collections.SALARY_PROFILES).document()
    doc_ref.set(profile_data)
    
    return {"id": doc_ref.id, "message": "Salary profile created"}


@router.get("/profiles/{profile_id}")
async def get_salary_profile(
    profile_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific salary profile"""
    db = get_db()
    doc = db.collection(Collections.SALARY_PROFILES).document(profile_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Salary profile not found")
    
    profile = doc.to_dict()
    profile["id"] = doc.id
    
    return profile


@router.patch("/profiles/{profile_id}")
async def update_salary_profile(
    profile_id: str,
    base_salary: Optional[float] = None,
    deductions: Optional[List[dict]] = None,
    allowances: Optional[List[dict]] = None,
    current_user: dict = Depends(get_current_user)
):
    """Update a salary profile"""
    db = get_db()
    doc_ref = db.collection(Collections.SALARY_PROFILES).document(profile_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Salary profile not found")
    
    profile = doc.to_dict()
    update_data = {"updated_at": datetime.utcnow().isoformat()}
    
    if base_salary is not None:
        update_data["base_salary"] = base_salary
    
    if deductions is not None:
        update_data["deductions"] = deductions
    
    if allowances is not None:
        update_data["allowances"] = allowances
    
    # Recalculate
    base = update_data.get("base_salary", profile.get("base_salary", 0))
    allow = update_data.get("allowances", profile.get("allowances", []))
    deduct = update_data.get("deductions", profile.get("deductions", []))
    
    gross = base + sum(a.get("amount", 0) for a in allow)
    deductions_total = sum(
        d.get("amount", 0) if d.get("amount") else (gross * d.get("percentage", 0) / 100)
        for d in deduct
    )
    
    update_data["gross_salary"] = gross
    update_data["total_deductions"] = deductions_total
    update_data["net_salary"] = gross - deductions_total
    
    doc_ref.update(update_data)
    
    return {"message": "Salary profile updated"}


# ============ PAYROLL ============

@router.get("/payroll")
@cache(ttl=120)
async def get_payroll_runs(
    org_code: str,
    year: Optional[int] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get payroll runs"""
    db = get_db()
    
    query = db.collection(Collections.PAYROLL).where("org_code", "==", org_code)
    
    if year:
        query = query.where("year", "==", year)
    
    if status:
        query = query.where("status", "==", status)
    
    query = query.order_by("created_at", direction="DESCENDING")
    
    docs = query.stream()
    payrolls = []
    
    for doc in docs:
        payroll = doc.to_dict()
        payroll["id"] = doc.id
        payrolls.append(payroll)
    
    return {"payroll_runs": payrolls, "count": len(payrolls)}


@router.post("/payroll")
async def create_payroll_run(
    payroll: PayrollCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new payroll run"""
    db = get_db()
    
    # Get all active salary profiles
    profiles_docs = db.collection(Collections.SALARY_PROFILES)\
        .where("org_code", "==", org_code)\
        .where("status", "==", "active").stream()
    
    payslips = []
    total_gross = 0.0
    total_deductions = 0.0
    total_net = 0.0
    
    for doc in profiles_docs:
        profile = doc.to_dict()
        
        payslip = {
            "employee_id": profile.get("employee_id"),
            "employee_name": profile.get("employee_name"),
            "base_salary": profile.get("base_salary"),
            "allowances": profile.get("allowances", []),
            "deductions": profile.get("deductions", []),
            "gross_salary": profile.get("gross_salary"),
            "total_deductions": profile.get("total_deductions"),
            "net_salary": profile.get("net_salary"),
            "adjustments": [],
            "status": "pending"
        }
        
        payslips.append(payslip)
        total_gross += profile.get("gross_salary", 0)
        total_deductions += profile.get("total_deductions", 0)
        total_net += profile.get("net_salary", 0)
    
    payroll_data = payroll.dict()
    payroll_data["org_code"] = org_code
    payroll_data["year"] = int(payroll.period_start[:4])
    payroll_data["payslips"] = payslips
    payroll_data["total_gross"] = total_gross
    payroll_data["total_deductions"] = total_deductions
    payroll_data["total_net"] = total_net
    payroll_data["employee_count"] = len(payslips)
    payroll_data["created_at"] = datetime.utcnow().isoformat()
    payroll_data["created_by"] = current_user["user_id"]
    payroll_data["status"] = "draft"
    
    doc_ref = db.collection(Collections.PAYROLL).document()
    doc_ref.set(payroll_data)
    
    return {
        "id": doc_ref.id,
        "message": "Payroll run created",
        "employee_count": len(payslips),
        "total_net": total_net
    }


@router.get("/payroll/{payroll_id}")
async def get_payroll_run(
    payroll_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific payroll run"""
    db = get_db()
    doc = db.collection(Collections.PAYROLL).document(payroll_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    
    payroll = doc.to_dict()
    payroll["id"] = doc.id
    
    return payroll


@router.post("/payroll/{payroll_id}/adjustment")
async def add_payslip_adjustment(
    payroll_id: str,
    adjustment: PayslipAdjustment,
    current_user: dict = Depends(get_current_user)
):
    """Add an adjustment to a payslip"""
    db = get_db()
    doc_ref = db.collection(Collections.PAYROLL).document(payroll_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    
    payroll = doc.to_dict()
    
    if payroll.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Cannot modify processed payroll")
    
    payslips = payroll.get("payslips", [])
    employee_found = False
    
    for payslip in payslips:
        if payslip.get("employee_id") == adjustment.employee_id:
            employee_found = True
            adjustments = payslip.get("adjustments", [])
            
            adj_data = adjustment.dict()
            adj_data["added_at"] = datetime.utcnow().isoformat()
            adj_data["added_by"] = current_user["user_id"]
            
            adjustments.append(adj_data)
            payslip["adjustments"] = adjustments
            
            # Recalculate
            adj_amount = adjustment.amount if adjustment.adjustment_type != "deduction" else -adjustment.amount
            payslip["net_salary"] = payslip.get("net_salary", 0) + adj_amount
            break
    
    if not employee_found:
        raise HTTPException(status_code=404, detail="Employee not found in payroll")
    
    # Recalculate totals
    total_net = sum(p.get("net_salary", 0) for p in payslips)
    
    doc_ref.update({
        "payslips": payslips,
        "total_net": total_net,
        "updated_at": datetime.utcnow().isoformat()
    })
    
    return {"message": "Adjustment added"}


@router.post("/payroll/{payroll_id}/process")
async def process_payroll(
    payroll_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Process payroll - mark as ready for payment"""
    db = get_db()
    doc_ref = db.collection(Collections.PAYROLL).document(payroll_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    
    payroll = doc.to_dict()
    
    if payroll.get("status") != "draft":
        raise HTTPException(status_code=400, detail="Payroll already processed")
    
    # Create AP entries for each payslip
    batch = db.batch()
    
    for payslip in payroll.get("payslips", []):
        ap_data = {
            "org_code": payroll.get("org_code"),
            "vendor_name": payslip.get("employee_name"),
            "amount": payslip.get("net_salary"),
            "description": f"Salary - {payroll.get('period_start')} to {payroll.get('period_end')}",
            "due_date": payroll.get("pay_date"),
            "category": "salaries",
            "payroll_id": payroll_id,
            "created_at": datetime.utcnow().isoformat(),
            "status": "approved",
            "payments": [],
            "amount_paid": 0.0,
            "balance": payslip.get("net_salary")
        }
        
        ap_ref = db.collection(Collections.AP).document()
        batch.set(ap_ref, ap_data)
        payslip["ap_id"] = ap_ref.id
        payslip["status"] = "processed"
    
    batch.commit()
    
    doc_ref.update({
        "status": "processed",
        "processed_at": datetime.utcnow().isoformat(),
        "processed_by": current_user["user_id"],
        "payslips": payroll.get("payslips")
    })
    
    return {"message": "Payroll processed"}


# ============ REPORTS ============

@router.get("/reports/summary")
@cache(ttl=300)
async def get_payroll_summary(
    org_code: str,
    year: int,
    current_user: dict = Depends(get_current_user)
):
    """Get annual payroll summary"""
    db = get_db()
    
    docs = db.collection(Collections.PAYROLL)\
        .where("org_code", "==", org_code)\
        .where("year", "==", year)\
        .where("status", "==", "processed").stream()
    
    monthly_data = {}
    total_gross = 0.0
    total_deductions = 0.0
    total_net = 0.0
    
    for doc in docs:
        payroll = doc.to_dict()
        period_month = payroll.get("period_start", "")[:7]  # YYYY-MM
        
        if period_month not in monthly_data:
            monthly_data[period_month] = {
                "gross": 0.0,
                "deductions": 0.0,
                "net": 0.0,
                "employees": 0
            }
        
        monthly_data[period_month]["gross"] += payroll.get("total_gross", 0)
        monthly_data[period_month]["deductions"] += payroll.get("total_deductions", 0)
        monthly_data[period_month]["net"] += payroll.get("total_net", 0)
        monthly_data[period_month]["employees"] += payroll.get("employee_count", 0)
        
        total_gross += payroll.get("total_gross", 0)
        total_deductions += payroll.get("total_deductions", 0)
        total_net += payroll.get("total_net", 0)
    
    return {
        "year": year,
        "monthly_breakdown": monthly_data,
        "totals": {
            "gross": total_gross,
            "deductions": total_deductions,
            "net": total_net
        }
    }
