"""
Accounts Receivable router - Money owed to the business
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

class ARCreate(BaseModel):
    client_id: str
    client_name: str
    invoice_id: Optional[str] = None
    amount: float
    description: str
    due_date: str
    event_id: Optional[str] = None
    payment_terms: str = "net_30"


class ARUpdate(BaseModel):
    amount: Optional[float] = None
    due_date: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PaymentCreate(BaseModel):
    amount: float
    payment_method: str  # cash, check, bank_transfer, credit_card, upi
    payment_date: str
    reference_number: Optional[str] = None
    notes: Optional[str] = None


# ============ AR ENTRIES ============

@router.get("/")
@cache(ttl=120)
async def get_ar_entries(
    org_code: str,
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    overdue_only: bool = False,
    limit: int = Query(100, le=500),
    current_user: dict = Depends(get_current_user)
):
    """Get accounts receivable entries"""
    db = get_db()
    
    query = db.collection(Collections.AR).where("org_code", "==", org_code)
    
    if status:
        query = query.where("status", "==", status)
    
    if client_id:
        query = query.where("client_id", "==", client_id)
    
    query = query.order_by("due_date").limit(limit)
    
    docs = query.stream()
    entries = []
    today = date.today().isoformat()
    
    for doc in docs:
        entry = doc.to_dict()
        entry["id"] = doc.id
        
        # Filter overdue if requested
        if overdue_only:
            if entry.get("status") == "paid" or entry.get("due_date", "") >= today:
                continue
        
        # Calculate days overdue
        if entry.get("due_date"):
            due = datetime.strptime(entry["due_date"], "%Y-%m-%d").date()
            entry["days_overdue"] = max(0, (date.today() - due).days)
        
        entries.append(entry)
    
    return {"entries": entries, "count": len(entries)}


@router.post("/")
async def create_ar_entry(
    ar: ARCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new AR entry"""
    db = get_db()
    
    ar_data = ar.dict()
    ar_data["org_code"] = org_code
    ar_data["created_at"] = datetime.utcnow().isoformat()
    ar_data["created_by"] = current_user["user_id"]
    ar_data["status"] = "pending"
    ar_data["payments"] = []
    ar_data["amount_paid"] = 0.0
    ar_data["balance"] = ar.amount
    
    doc_ref = db.collection(Collections.AR).document()
    doc_ref.set(ar_data)
    
    return {"id": doc_ref.id, "message": "AR entry created"}


@router.get("/{ar_id}")
async def get_ar_entry(
    ar_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific AR entry"""
    db = get_db()
    doc = db.collection(Collections.AR).document(ar_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="AR entry not found")
    
    entry = doc.to_dict()
    entry["id"] = doc.id
    
    return entry


@router.patch("/{ar_id}")
async def update_ar_entry(
    ar_id: str,
    update: ARUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an AR entry"""
    db = get_db()
    doc_ref = db.collection(Collections.AR).document(ar_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="AR entry not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user["user_id"]
    
    doc_ref.update(update_data)
    
    return {"message": "AR entry updated"}


@router.delete("/{ar_id}")
async def delete_ar_entry(
    ar_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an AR entry"""
    db = get_db()
    doc_ref = db.collection(Collections.AR).document(ar_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="AR entry not found")
    
    entry = doc.to_dict()
    if entry.get("payments"):
        raise HTTPException(status_code=400, detail="Cannot delete AR with payments")
    
    doc_ref.delete()
    
    return {"message": "AR entry deleted"}


# ============ PAYMENTS ============

@router.post("/{ar_id}/payments")
async def record_payment(
    ar_id: str,
    payment: PaymentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Record a payment against an AR entry"""
    db = get_db()
    doc_ref = db.collection(Collections.AR).document(ar_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="AR entry not found")
    
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
    
    # Determine status
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


@router.get("/{ar_id}/payments")
async def get_payments(
    ar_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all payments for an AR entry"""
    db = get_db()
    doc = db.collection(Collections.AR).document(ar_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="AR entry not found")
    
    entry = doc.to_dict()
    
    return {
        "ar_id": ar_id,
        "total_amount": entry.get("amount", 0),
        "amount_paid": entry.get("amount_paid", 0),
        "balance": entry.get("balance", 0),
        "payments": entry.get("payments", [])
    }


# ============ BULK OPERATIONS ============

@router.post("/bulk/send-reminders")
async def send_payment_reminders(
    org_code: str,
    days_overdue: int = 7,
    current_user: dict = Depends(get_current_user)
):
    """Send payment reminders for overdue AR"""
    db = get_db()
    
    cutoff_date = (date.today() - timedelta(days=days_overdue)).isoformat()
    
    docs = db.collection(Collections.AR)\
        .where("org_code", "==", org_code)\
        .where("status", "in", ["pending", "partial"])\
        .where("due_date", "<", cutoff_date).stream()
    
    reminders_sent = []
    
    for doc in docs:
        entry = doc.to_dict()
        
        # Record reminder sent
        reminders = entry.get("reminders", [])
        reminders.append({
            "sent_at": datetime.utcnow().isoformat(),
            "sent_by": current_user["user_id"],
            "type": "overdue_reminder"
        })
        
        db.collection(Collections.AR).document(doc.id).update({
            "reminders": reminders,
            "last_reminder_at": datetime.utcnow().isoformat()
        })
        
        reminders_sent.append({
            "ar_id": doc.id,
            "client": entry.get("client_name"),
            "amount": entry.get("balance")
        })
    
    return {
        "message": f"Sent {len(reminders_sent)} payment reminders",
        "reminders": reminders_sent
    }


# ============ CLIENT STATEMENTS ============

@router.get("/statements/{client_id}")
@cache(ttl=300)
async def get_client_statement(
    client_id: str,
    org_code: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get statement of account for a client"""
    db = get_db()
    
    query = db.collection(Collections.AR)\
        .where("org_code", "==", org_code)\
        .where("client_id", "==", client_id)
    
    if start_date:
        query = query.where("created_at", ">=", start_date)
    
    docs = query.order_by("created_at").stream()
    
    entries = []
    total_invoiced = 0.0
    total_paid = 0.0
    
    for doc in docs:
        entry = doc.to_dict()
        entry["id"] = doc.id
        
        # Filter by end date if specified
        if end_date and entry.get("created_at", "") > end_date:
            continue
        
        total_invoiced += float(entry.get("amount", 0))
        total_paid += float(entry.get("amount_paid", 0))
        entries.append(entry)
    
    return {
        "client_id": client_id,
        "period": {
            "start": start_date or "All time",
            "end": end_date or date.today().isoformat()
        },
        "summary": {
            "total_invoiced": total_invoiced,
            "total_paid": total_paid,
            "balance_due": total_invoiced - total_paid
        },
        "transactions": entries
    }
