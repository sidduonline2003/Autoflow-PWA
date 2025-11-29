"""
Period Close router - Financial period closing and reconciliation
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, date, timedelta
from pydantic import BaseModel

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user, require_role
from shared.redis_client import cache


router = APIRouter()


# ============ SCHEMAS ============

class PeriodCloseCreate(BaseModel):
    period: str  # YYYY-MM
    notes: Optional[str] = None


class ReconciliationCreate(BaseModel):
    period: str
    account_type: str  # bank, ar, ap, cash
    account_name: str
    book_balance: float
    actual_balance: float
    notes: Optional[str] = None


# ============ PERIOD CLOSE ============

@router.get("/periods")
@cache(ttl=300)
async def get_closed_periods(
    org_code: str,
    year: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get list of closed periods"""
    db = get_db()
    
    query = db.collection(Collections.PERIOD_CLOSE).where("org_code", "==", org_code)
    
    if year:
        query = query.where("year", "==", year)
    
    docs = query.order_by("period", direction="DESCENDING").stream()
    
    periods = []
    for doc in docs:
        period = doc.to_dict()
        period["id"] = doc.id
        periods.append(period)
    
    return {"periods": periods, "count": len(periods)}


@router.post("/close")
async def close_period(
    close_data: PeriodCloseCreate,
    org_code: str,
    current_user: dict = Depends(require_role(["admin", "accountant"]))
):
    """Close a financial period"""
    db = get_db()
    
    period = close_data.period
    year, month = map(int, period.split("-"))
    
    # Check if already closed
    existing = list(db.collection(Collections.PERIOD_CLOSE)
                    .where("org_code", "==", org_code)
                    .where("period", "==", period).limit(1).stream())
    
    if existing:
        raise HTTPException(status_code=400, detail="Period already closed")
    
    # Check previous period is closed (unless it's the first period)
    if month > 1:
        prev_period = f"{year}-{month-1:02d}"
    else:
        prev_period = f"{year-1}-12"
    
    prev_closed = list(db.collection(Collections.PERIOD_CLOSE)
                       .where("org_code", "==", org_code)
                       .where("period", "==", prev_period).limit(1).stream())
    
    # Calculate period end date
    if month == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month + 1, 1) - timedelta(days=1)
    
    start_date = date(year, month, 1)
    
    # Get period summary
    # Revenue
    invoice_docs = db.collection(Collections.INVOICES)\
        .where("org_code", "==", org_code)\
        .where("date", ">=", start_date.isoformat())\
        .where("date", "<=", end_date.isoformat()).stream()
    
    total_revenue = sum(float(d.to_dict().get("total", 0)) for d in invoice_docs)
    
    # Expenses
    receipt_docs = db.collection(Collections.RECEIPTS)\
        .where("org_code", "==", org_code)\
        .where("date", ">=", start_date.isoformat())\
        .where("date", "<=", end_date.isoformat()).stream()
    
    total_expenses = sum(float(d.to_dict().get("amount", 0)) for d in receipt_docs)
    
    # AR at period end
    ar_docs = db.collection(Collections.AR)\
        .where("org_code", "==", org_code)\
        .where("status", "!=", "paid").stream()
    
    ar_balance = sum(float(d.to_dict().get("balance", 0)) for d in ar_docs)
    
    # AP at period end
    ap_docs = db.collection(Collections.AP)\
        .where("org_code", "==", org_code)\
        .where("status", "!=", "paid").stream()
    
    ap_balance = sum(float(d.to_dict().get("balance", 0)) for d in ap_docs)
    
    close_record = {
        "org_code": org_code,
        "period": period,
        "year": year,
        "month": month,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "summary": {
            "revenue": total_revenue,
            "expenses": total_expenses,
            "net_income": total_revenue - total_expenses,
            "ar_balance": ar_balance,
            "ap_balance": ap_balance
        },
        "notes": close_data.notes,
        "closed_at": datetime.utcnow().isoformat(),
        "closed_by": current_user["user_id"],
        "status": "closed"
    }
    
    doc_ref = db.collection(Collections.PERIOD_CLOSE).document()
    doc_ref.set(close_record)
    
    return {
        "id": doc_ref.id,
        "message": f"Period {period} closed successfully",
        "summary": close_record["summary"]
    }


@router.post("/reopen/{period}")
async def reopen_period(
    period: str,
    org_code: str,
    reason: str,
    current_user: dict = Depends(require_role(["admin"]))
):
    """Reopen a closed period (admin only)"""
    db = get_db()
    
    docs = list(db.collection(Collections.PERIOD_CLOSE)
                .where("org_code", "==", org_code)
                .where("period", "==", period).limit(1).stream())
    
    if not docs:
        raise HTTPException(status_code=404, detail="Period not found")
    
    doc = docs[0]
    doc_ref = db.collection(Collections.PERIOD_CLOSE).document(doc.id)
    
    doc_ref.update({
        "status": "reopened",
        "reopened_at": datetime.utcnow().isoformat(),
        "reopened_by": current_user["user_id"],
        "reopen_reason": reason
    })
    
    return {"message": f"Period {period} reopened"}


# ============ RECONCILIATION ============

@router.get("/reconciliations")
async def get_reconciliations(
    org_code: str,
    period: Optional[str] = None,
    account_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get reconciliation records"""
    db = get_db()
    
    query = db.collection(Collections.RECONCILIATIONS).where("org_code", "==", org_code)
    
    if period:
        query = query.where("period", "==", period)
    
    if account_type:
        query = query.where("account_type", "==", account_type)
    
    docs = query.stream()
    reconciliations = []
    
    for doc in docs:
        recon = doc.to_dict()
        recon["id"] = doc.id
        reconciliations.append(recon)
    
    return {"reconciliations": reconciliations, "count": len(reconciliations)}


@router.post("/reconciliations")
async def create_reconciliation(
    recon: ReconciliationCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a reconciliation record"""
    db = get_db()
    
    difference = recon.actual_balance - recon.book_balance
    
    recon_data = recon.dict()
    recon_data["org_code"] = org_code
    recon_data["difference"] = difference
    recon_data["reconciled"] = abs(difference) < 0.01  # Consider reconciled if difference < 1 cent
    recon_data["created_at"] = datetime.utcnow().isoformat()
    recon_data["created_by"] = current_user["user_id"]
    
    doc_ref = db.collection(Collections.RECONCILIATIONS).document()
    doc_ref.set(recon_data)
    
    return {
        "id": doc_ref.id,
        "difference": difference,
        "reconciled": recon_data["reconciled"],
        "message": "Reconciliation created"
    }


@router.post("/reconciliations/{recon_id}/resolve")
async def resolve_reconciliation(
    recon_id: str,
    resolution: str,
    adjustment_amount: Optional[float] = None,
    current_user: dict = Depends(get_current_user)
):
    """Resolve a reconciliation difference"""
    db = get_db()
    doc_ref = db.collection(Collections.RECONCILIATIONS).document(recon_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    
    doc_ref.update({
        "reconciled": True,
        "resolution": resolution,
        "adjustment_amount": adjustment_amount,
        "resolved_at": datetime.utcnow().isoformat(),
        "resolved_by": current_user["user_id"]
    })
    
    return {"message": "Reconciliation resolved"}


# ============ TRIAL BALANCE ============

@router.get("/trial-balance")
@cache(ttl=300)
async def get_trial_balance(
    org_code: str,
    as_of_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get trial balance as of a specific date"""
    db = get_db()
    
    # Assets (AR)
    ar_docs = db.collection(Collections.AR)\
        .where("org_code", "==", org_code)\
        .where("created_at", "<=", as_of_date).stream()
    
    ar_balance = 0.0
    for doc in ar_docs:
        data = doc.to_dict()
        if data.get("status") != "paid":
            ar_balance += float(data.get("balance", 0))
    
    # Liabilities (AP)
    ap_docs = db.collection(Collections.AP)\
        .where("org_code", "==", org_code)\
        .where("created_at", "<=", as_of_date).stream()
    
    ap_balance = 0.0
    for doc in ap_docs:
        data = doc.to_dict()
        if data.get("status") != "paid":
            ap_balance += float(data.get("balance", 0))
    
    # Revenue
    invoice_docs = db.collection(Collections.INVOICES)\
        .where("org_code", "==", org_code)\
        .where("date", "<=", as_of_date).stream()
    
    total_revenue = sum(float(d.to_dict().get("total", 0)) for d in invoice_docs)
    
    # Expenses
    receipt_docs = db.collection(Collections.RECEIPTS)\
        .where("org_code", "==", org_code)\
        .where("date", "<=", as_of_date).stream()
    
    total_expenses = sum(float(d.to_dict().get("amount", 0)) for d in receipt_docs)
    
    # Calculate retained earnings
    retained_earnings = total_revenue - total_expenses
    
    return {
        "as_of_date": as_of_date,
        "accounts": {
            "assets": {
                "accounts_receivable": ar_balance,
                "total": ar_balance
            },
            "liabilities": {
                "accounts_payable": ap_balance,
                "total": ap_balance
            },
            "equity": {
                "retained_earnings": retained_earnings,
                "total": retained_earnings
            },
            "revenue": {
                "total": total_revenue
            },
            "expenses": {
                "total": total_expenses
            }
        },
        "totals": {
            "debits": ar_balance + total_expenses,
            "credits": ap_balance + total_revenue + retained_earnings,
            "balanced": abs((ar_balance + total_expenses) - (ap_balance + total_revenue)) < 0.01
        }
    }
