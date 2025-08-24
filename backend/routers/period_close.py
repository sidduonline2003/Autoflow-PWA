from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging

from ..dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/financial-hub/periods",
    tags=["Period Close & Controls"],
)

# --- Pydantic Models ---
class PeriodCheck(BaseModel):
    key: str
    label: str
    passed: bool
    details: Optional[str] = None
    count: Optional[int] = None

class PeriodCloseRequest(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    checklistAck: bool = Field(default=False)
    notes: Optional[str] = None

class PeriodReopenRequest(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    reason: str = Field(..., min_length=10)

class JournalLine(BaseModel):
    bucket: str = Field(..., pattern="^(Revenue|DirectCost|Opex|TaxCollected|TaxPaid)$")
    description: str
    debit: float = 0.0
    credit: float = 0.0

class JournalAdjustmentCreate(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    lines: List[JournalLine] = Field(..., min_items=1)
    notes: Optional[str] = None

class JournalAdjustmentUpdate(BaseModel):
    lines: Optional[List[JournalLine]] = None
    notes: Optional[str] = None

class JournalAdjustmentVoid(BaseModel):
    reason: str = Field(..., min_length=10)

class SequenceAllocation(BaseModel):
    type: str = Field(..., pattern="^(INVOICE|CREDIT_NOTE|BILL|PAYSLIP)$")
    year: int = Field(..., ge=2000, le=2100)
    idempotencyKey: str = Field(default_factory=lambda: uuid4().hex)

# --- Helper Functions ---
def get_utc_now():
    """Get current time in UTC"""
    return datetime.now(timezone.utc)

def is_authorized_for_period_close(current_user: dict) -> bool:
    """Check if user can close periods (ADMIN or ACCOUNTANT only)"""
    role = current_user.get("role", "").lower()
    return role in ["admin", "accountant"]

def is_admin_only(current_user: dict) -> bool:
    """Check if user is admin (for period reopen)"""
    role = current_user.get("role", "").lower()
    return role == "admin"

def format_period_id(year: int, month: int) -> str:
    """Format period ID as YYYY-MM"""
    return f"{year}-{month:02d}"

def format_period_label(year: int, month: int) -> str:
    """Format period label as 'MMM YYYY'"""
    month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{month_names[month]} {year}"

def get_period_date_range(year: int, month: int):
    """Get start and end dates for a period in UTC"""
    start_dt = datetime(year, month, 1, tzinfo=timezone.utc)
    
    # Next month start
    if month == 12:
        end_dt = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_dt = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    
    return start_dt, end_dt

def is_date_in_closed_period(db, org_id: str, date_str: str) -> bool:
    """Check if a date falls in a closed period"""
    try:
        date_dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        year = date_dt.year
        month = date_dt.month
        
        period_id = format_period_id(year, month)
        period_ref = db.collection('organizations', org_id, 'periods').document(period_id)
        period_doc = period_ref.get()
        
        if period_doc.exists:
            period_data = period_doc.to_dict()
            return period_data.get('status') == 'CLOSED'
        
        return False
    except Exception:
        return False

def audit_log(db, org_id: str, entity: str, action: str, actor: str, payload_summary: str = ""):
    """Log audit events"""
    try:
        audit_ref = db.collection('organizations', org_id, 'auditLogs').document()
        audit_ref.set({
            "entity": entity,
            "action": action,
            "actor": actor,
            "timestamp": get_utc_now(),
            "payloadSummary": payload_summary
        })
    except Exception as e:
        logger.warning(f"Failed to write audit log: {e}")

# --- Pre-Close Checks ---
async def run_period_checks(db, org_id: str, year: int, month: int) -> List[PeriodCheck]:
    """Run pre-close checks for a period"""
    checks = []
    start_dt, end_dt = get_period_date_range(year, month)
    start_iso = start_dt.isoformat()
    end_iso = end_dt.isoformat()
    
    # Check 1: Draft invoices in period
    try:
        draft_invoices = db.collection('organizations', org_id, 'invoices').where(
            'status', '==', 'DRAFT'
        ).get()
        
        draft_in_period = 0
        for doc in draft_invoices:
            data = doc.to_dict()
            issue_date = data.get('issueDate', '')
            if start_iso <= issue_date < end_iso:
                draft_in_period += 1
        
        checks.append(PeriodCheck(
            key="draft_invoices",
            label="Draft invoices in period",
            passed=draft_in_period == 0,
            details=f"{draft_in_period} draft invoices found" if draft_in_period > 0 else "No draft invoices",
            count=draft_in_period
        ))
    except Exception as e:
        logger.warning(f"Error checking draft invoices: {e}")
        checks.append(PeriodCheck(
            key="draft_invoices",
            label="Draft invoices in period",
            passed=False,
            details="Error checking draft invoices"
        ))
    
    # Check 2: Draft bills in period
    try:
        draft_bills = db.collection('organizations', org_id, 'bills').where(
            'status', '==', 'DRAFT'
        ).get()
        
        draft_bills_in_period = 0
        for doc in draft_bills:
            data = doc.to_dict()
            issue_date = data.get('issueDate', '')
            if start_iso <= issue_date < end_iso:
                draft_bills_in_period += 1
        
        checks.append(PeriodCheck(
            key="draft_bills",
            label="Draft bills in period",
            passed=draft_bills_in_period == 0,
            details=f"{draft_bills_in_period} draft bills found" if draft_bills_in_period > 0 else "No draft bills",
            count=draft_bills_in_period
        ))
    except Exception as e:
        logger.warning(f"Error checking draft bills: {e}")
        checks.append(PeriodCheck(
            key="draft_bills",
            label="Draft bills in period",
            passed=False,
            details="Error checking draft bills"
        ))
    
    # Check 3: Unpaid payslips for the period month
    try:
        unpaid_payslips = db.collection('organizations', org_id, 'payslips').where(
            'period.year', '==', year
        ).where(
            'period.month', '==', month
        ).where(
            'status', 'in', ['DRAFT', 'PUBLISHED']
        ).get()
        
        unpaid_count = len(unpaid_payslips)
        
        checks.append(PeriodCheck(
            key="unpaid_payslips",
            label="Unpaid payslips for period",
            passed=unpaid_count == 0,
            details=f"{unpaid_count} unpaid payslips found" if unpaid_count > 0 else "All payslips paid",
            count=unpaid_count
        ))
    except Exception as e:
        logger.warning(f"Error checking unpaid payslips: {e}")
        checks.append(PeriodCheck(
            key="unpaid_payslips",
            label="Unpaid payslips for period",
            passed=False,
            details="Error checking unpaid payslips"
        ))
    
    # Check 4: Unapplied client receipts in period
    try:
        unapplied_payments = db.collection('organizations', org_id, 'payments').where(
            'status', '==', 'UNAPPLIED'
        ).get()
        
        unapplied_in_period = 0
        for doc in unapplied_payments:
            data = doc.to_dict()
            paid_at = data.get('paidAt', '')
            if start_iso <= paid_at < end_iso:
                unapplied_in_period += 1
        
        checks.append(PeriodCheck(
            key="unapplied_payments",
            label="Unapplied client receipts in period",
            passed=unapplied_in_period == 0,
            details=f"{unapplied_in_period} unapplied payments found" if unapplied_in_period > 0 else "No unapplied payments",
            count=unapplied_in_period
        ))
    except Exception as e:
        logger.warning(f"Error checking unapplied payments: {e}")
        checks.append(PeriodCheck(
            key="unapplied_payments",
            label="Unapplied client receipts in period",
            passed=False,
            details="Error checking unapplied payments"
        ))
    
    return checks

# --- API Endpoints ---
@router.get("/")
async def list_periods(
    year: Optional[int] = Query(None, description="Filter periods by year"),
    current_user: dict = Depends(get_current_user)
):
    """List all periods with their status"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_period_close(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for period management")
    
    db = firestore.client()
    
    # Get all periods, optionally filtered by year
    periods_query = db.collection('organizations', org_id, 'periods')
    if year:
        periods_query = periods_query.where('year', '==', year)
    
    periods_docs = periods_query.get()
    
    periods = []
    for doc in periods_docs:
        period_data = doc.to_dict()
        period_data['id'] = doc.id
        periods.append(period_data)
    
    # Sort by year, month desc
    periods.sort(key=lambda x: (x.get('year', 0), x.get('month', 0)), reverse=True)
    
    return {"periods": periods}

@router.get("/{year}-{month}")
async def get_period(
    year: int,
    month: int,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific period's details"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_period_close(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for period management")
    
    db = firestore.client()
    
    period_id = format_period_id(year, month)
    period_ref = db.collection('organizations', org_id, 'periods').document(period_id)
    period_doc = period_ref.get()
    
    if period_doc.exists:
        period_data = period_doc.to_dict()
        period_data['id'] = period_doc.id
        return period_data
    else:
        # Return default open period
        return {
            'id': period_id,
            'year': year,
            'month': month,
            'status': 'OPEN',
            'label': format_period_label(year, month)
        }

@router.get("/{year}-{month}/checks")
async def get_period_checks(
    year: int,
    month: int,
    current_user: dict = Depends(get_current_user)
):
    """Run pre-close checks for a period"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_period_close(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for period management")
    
    db = firestore.client()
    
    # Check if period is already closed
    period_id = format_period_id(year, month)
    period_ref = db.collection('organizations', org_id, 'periods').document(period_id)
    period_doc = period_ref.get()
    
    status = "OPEN"
    if period_doc.exists:
        status = period_doc.to_dict().get('status', 'OPEN')
    
    # Run checks
    checks = await run_period_checks(db, org_id, year, month)
    
    return {
        "year": year,
        "month": month,
        "label": format_period_label(year, month),
        "status": status,
        "checks": checks,
        "canClose": all(check.passed for check in checks) and status == "OPEN"
    }

@router.post("/close")
async def close_period(
    req: PeriodCloseRequest,
    current_user: dict = Depends(get_current_user)
):
    """Close a period"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_period_close(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for period management")
    
    db = firestore.client()
    
    period_id = format_period_id(req.year, req.month)
    period_ref = db.collection('organizations', org_id, 'periods').document(period_id)
    period_doc = period_ref.get()
    
    # Check if already closed
    if period_doc.exists:
        existing_data = period_doc.to_dict()
        if existing_data.get('status') == 'CLOSED':
            return {"status": "success", "message": "Period already closed", "periodId": period_id}
    
    # Run pre-close checks if not acknowledged
    if not req.checklistAck:
        checks = await run_period_checks(db, org_id, req.year, req.month)
        failed_checks = [check for check in checks if not check.passed]
        if failed_checks:
            raise HTTPException(
                status_code=400, 
                detail=f"Pre-close checks failed: {len(failed_checks)} issues found"
            )
    
    # Close the period
    now = get_utc_now()
    checks = await run_period_checks(db, org_id, req.year, req.month)
    
    period_data = {
        "orgId": org_id,
        "year": req.year,
        "month": req.month,
        "label": format_period_label(req.year, req.month),
        "status": "CLOSED",
        "closedBy": current_user.get("uid"),
        "closedAt": now,
        "checks": [check.dict() for check in checks],
        "notes": req.notes,
        "createdAt": now,
        "updatedAt": now
    }
    
    period_ref.set(period_data)
    
    # Audit log
    audit_log(
        db, org_id, "PERIOD", "PERIOD_CLOSED", 
        current_user.get("uid"), 
        f"Closed {format_period_label(req.year, req.month)}"
    )
    
    return {"status": "success", "periodId": period_id, "message": f"Period {format_period_label(req.year, req.month)} closed successfully"}

@router.post("/reopen")
async def reopen_period(
    req: PeriodReopenRequest,
    current_user: dict = Depends(get_current_user)
):
    """Reopen a closed period (ADMIN only)"""
    org_id = current_user.get("orgId")
    if not is_admin_only(current_user):
        raise HTTPException(status_code=403, detail="Only administrators can reopen periods")
    
    db = firestore.client()
    
    period_id = format_period_id(req.year, req.month)
    period_ref = db.collection('organizations', org_id, 'periods').document(period_id)
    period_doc = period_ref.get()
    
    if not period_doc.exists:
        raise HTTPException(status_code=404, detail="Period not found")
    
    period_data = period_doc.to_dict()
    if period_data.get('status') != 'CLOSED':
        raise HTTPException(status_code=400, detail="Period is not closed")
    
    # Reopen the period
    now = get_utc_now()
    period_data.update({
        "status": "OPEN",
        "reopenedBy": current_user.get("uid"),
        "reopenedAt": now,
        "reopenReason": req.reason,
        "updatedAt": now
    })
    
    period_ref.set(period_data)
    
    # Audit log
    audit_log(
        db, org_id, "PERIOD", "PERIOD_REOPENED", 
        current_user.get("uid"), 
        f"Reopened {format_period_label(req.year, req.month)}: {req.reason}"
    )
    
    return {"status": "success", "message": f"Period {format_period_label(req.year, req.month)} reopened successfully"}
