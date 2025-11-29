"""
Accounts Payable router - Money owed by the business
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, date, timedelta
from pydantic import BaseModel

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user
from shared.redis_client import cache


router = APIRouter()


# ============ SCHEMAS ============

class APCreate(BaseModel):
    vendor_id: Optional[str] = None
    vendor_name: str
    amount: float
    description: str
    due_date: str
    category: str  # equipment, rent, utilities, contractor, supplies, etc.
    event_id: Optional[str] = None
    receipt_id: Optional[str] = None
    payment_terms: str = "net_30"


class APUpdate(BaseModel):
    amount: Optional[float] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PaymentCreate(BaseModel):
    amount: float
    payment_method: str
    payment_date: str
    reference_number: Optional[str] = None
    bank_account: Optional[str] = None
    notes: Optional[str] = None


# ============ AP ENTRIES ============

@router.get("/")
@cache(ttl=120)
async def get_ap_entries(
    org_code: str,
    status: Optional[str] = None,
    vendor_name: Optional[str] = None,
    category: Optional[str] = None,
    overdue_only: bool = False,
    limit: int = Query(100, le=500),
    current_user: dict = Depends(get_current_user)
):
    """Get accounts payable entries"""
    db = get_db()
    
    query = db.collection(Collections.AP).where("org_code", "==", org_code)
    
    if status:
        query = query.where("status", "==", status)
    
    if category:
        query = query.where("category", "==", category)
    
    query = query.order_by("due_date").limit(limit)
    
    docs = query.stream()
    entries = []
    today = date.today().isoformat()
    
    for doc in docs:
        entry = doc.to_dict()
        entry["id"] = doc.id
        
        # Filter by vendor if specified
        if vendor_name and vendor_name.lower() not in entry.get("vendor_name", "").lower():
            continue
        
        # Filter overdue if requested
        if overdue_only:
            if entry.get("status") == "paid" or entry.get("due_date", "") >= today:
                continue
        
        # Calculate days until due or overdue
        if entry.get("due_date"):
            due = datetime.strptime(entry["due_date"], "%Y-%m-%d").date()
            days_diff = (due - date.today()).days
            entry["days_until_due"] = days_diff
            entry["is_overdue"] = days_diff < 0
        
        entries.append(entry)
    
    return {"entries": entries, "count": len(entries)}


@router.post("/")
async def create_ap_entry(
    ap: APCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new AP entry"""
    db = get_db()
    
    ap_data = ap.dict()
    ap_data["org_code"] = org_code
    ap_data["created_at"] = datetime.utcnow().isoformat()
    ap_data["created_by"] = current_user["user_id"]
    ap_data["status"] = "pending"
    ap_data["payments"] = []
    ap_data["amount_paid"] = 0.0
    ap_data["balance"] = ap.amount
    
    doc_ref = db.collection(Collections.AP).document()
    doc_ref.set(ap_data)
    
    return {"id": doc_ref.id, "message": "AP entry created"}


@router.get("/{ap_id}")
async def get_ap_entry(
    ap_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific AP entry"""
    db = get_db()
    doc = db.collection(Collections.AP).document(ap_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="AP entry not found")
    
    entry = doc.to_dict()
    entry["id"] = doc.id
    
    return entry


@router.patch("/{ap_id}")
async def update_ap_entry(
    ap_id: str,
    update: APUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an AP entry"""
    db = get_db()
    doc_ref = db.collection(Collections.AP).document(ap_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="AP entry not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user["user_id"]
    
    doc_ref.update(update_data)
    
    return {"message": "AP entry updated"}


@router.delete("/{ap_id}")
async def delete_ap_entry(
    ap_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an AP entry"""
    db = get_db()
    doc_ref = db.collection(Collections.AP).document(ap_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="AP entry not found")
    
    entry = doc.to_dict()
    if entry.get("payments"):
        raise HTTPException(status_code=400, detail="Cannot delete AP with payments")
    
    doc_ref.delete()
    
    return {"message": "AP entry deleted"}


# ============ PAYMENTS ============

@router.post("/{ap_id}/pay")
async def make_payment(
    ap_id: str,
    payment: PaymentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Make a payment on an AP entry"""
    db = get_db()
    doc_ref = db.collection(Collections.AP).document(ap_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="AP entry not found")
    
    entry = doc.to_dict()
    balance = float(entry.get("balance", entry.get("amount", 0)))
    
    if payment.amount > balance:
        raise HTTPException(status_code=400, detail="Payment amount exceeds balance")
    
    payments = entry.get("payments", [])
    
    payment_entry = payment.dict()
    payment_entry["recorded_at"] = datetime.utcnow().isoformat()
    payment_entry["recorded_by"] = current_user["user_id"]
    
    payments.append(payment_entry)
    
    new_balance = balance - payment.amount
    amount_paid = float(entry.get("amount_paid", 0)) + payment.amount
    
    status = "partial" if new_balance > 0 else "paid"
    
    update_data = {
        "payments": payments,
        "amount_paid": amount_paid,
        "balance": new_balance,
        "status": status,
        "updated_at": datetime.utcnow().isoformat()
    }
    
    if status == "paid":
        update_data["paid_date"] = payment.payment_date
    
    doc_ref.update(update_data)
    
    return {
        "message": "Payment recorded",
        "new_balance": new_balance,
        "status": status
    }


# ============ APPROVAL WORKFLOW ============

@router.post("/{ap_id}/submit-for-approval")
async def submit_for_approval(
    ap_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Submit AP for approval"""
    db = get_db()
    doc_ref = db.collection(Collections.AP).document(ap_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="AP entry not found")
    
    doc_ref.update({
        "status": "pending_approval",
        "submitted_at": datetime.utcnow().isoformat(),
        "submitted_by": current_user["user_id"]
    })
    
    return {"message": "Submitted for approval"}


@router.post("/{ap_id}/approve")
async def approve_ap(
    ap_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Approve an AP entry for payment"""
    db = get_db()
    doc_ref = db.collection(Collections.AP).document(ap_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="AP entry not found")
    
    entry = doc.to_dict()
    if entry.get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail="AP must be pending approval")
    
    doc_ref.update({
        "status": "approved",
        "approved_at": datetime.utcnow().isoformat(),
        "approved_by": current_user["user_id"]
    })
    
    return {"message": "AP approved for payment"}


@router.post("/{ap_id}/reject")
async def reject_ap(
    ap_id: str,
    reason: str,
    current_user: dict = Depends(get_current_user)
):
    """Reject an AP entry"""
    db = get_db()
    doc_ref = db.collection(Collections.AP).document(ap_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="AP entry not found")
    
    doc_ref.update({
        "status": "rejected",
        "rejected_at": datetime.utcnow().isoformat(),
        "rejected_by": current_user["user_id"],
        "rejection_reason": reason
    })
    
    return {"message": "AP rejected"}


# ============ SCHEDULING ============

@router.get("/schedule")
@cache(ttl=120)
async def get_payment_schedule(
    org_code: str,
    days_ahead: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """Get payment schedule for upcoming AP"""
    db = get_db()
    
    today = date.today()
    end_date = (today + timedelta(days=days_ahead)).isoformat()
    
    docs = db.collection(Collections.AP)\
        .where("org_code", "==", org_code)\
        .where("status", "in", ["pending", "approved", "partial"])\
        .where("due_date", "<=", end_date)\
        .order_by("due_date").stream()
    
    schedule = {}
    total_due = 0.0
    
    for doc in docs:
        entry = doc.to_dict()
        entry["id"] = doc.id
        
        due_date = entry.get("due_date")
        balance = float(entry.get("balance", 0))
        
        if due_date not in schedule:
            schedule[due_date] = {"entries": [], "total": 0.0}
        
        schedule[due_date]["entries"].append(entry)
        schedule[due_date]["total"] += balance
        total_due += balance
    
    return {
        "schedule": schedule,
        "summary": {
            "total_due": total_due,
            "period_days": days_ahead
        }
    }


# ============ CATEGORIES ============

@router.get("/categories/summary")
@cache(ttl=300)
async def get_category_summary(
    org_code: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get AP summary by category"""
    db = get_db()
    
    query = db.collection(Collections.AP).where("org_code", "==", org_code)
    
    if start_date:
        query = query.where("created_at", ">=", start_date)
    
    docs = query.stream()
    
    categories = {}
    
    for doc in docs:
        entry = doc.to_dict()
        
        if end_date and entry.get("created_at", "") > end_date:
            continue
        
        category = entry.get("category", "Uncategorized")
        amount = float(entry.get("amount", 0))
        paid = float(entry.get("amount_paid", 0))
        
        if category not in categories:
            categories[category] = {
                "count": 0,
                "total_amount": 0.0,
                "total_paid": 0.0,
                "outstanding": 0.0
            }
        
        categories[category]["count"] += 1
        categories[category]["total_amount"] += amount
        categories[category]["total_paid"] += paid
        categories[category]["outstanding"] += amount - paid
    
    return {"categories": categories}
