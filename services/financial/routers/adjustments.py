"""
Adjustments router - Financial adjustments and corrections
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user, require_role
from shared.redis_client import cache


router = APIRouter()


# ============ SCHEMAS ============

class AdjustmentCreate(BaseModel):
    adjustment_type: str  # write_off, credit_note, debit_note, correction, discount
    reference_type: str  # ar, ap, invoice, receipt
    reference_id: str
    amount: float
    reason: str
    effective_date: str


class ApprovalAction(BaseModel):
    action: str  # approve, reject
    notes: Optional[str] = None


# ============ ADJUSTMENTS ============

@router.get("/")
@cache(ttl=120)
async def get_adjustments(
    org_code: str,
    adjustment_type: Optional[str] = None,
    reference_type: Optional[str] = None,
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(100, le=500),
    current_user: dict = Depends(get_current_user)
):
    """Get financial adjustments"""
    db = get_db()
    
    query = db.collection(Collections.ADJUSTMENTS).where("org_code", "==", org_code)
    
    if adjustment_type:
        query = query.where("adjustment_type", "==", adjustment_type)
    
    if reference_type:
        query = query.where("reference_type", "==", reference_type)
    
    if status:
        query = query.where("status", "==", status)
    
    if start_date:
        query = query.where("effective_date", ">=", start_date)
    
    query = query.order_by("created_at", direction="DESCENDING").limit(limit)
    
    docs = query.stream()
    adjustments = []
    
    for doc in docs:
        adj = doc.to_dict()
        adj["id"] = doc.id
        
        if end_date and adj.get("effective_date", "") > end_date:
            continue
        
        adjustments.append(adj)
    
    return {"adjustments": adjustments, "count": len(adjustments)}


@router.post("/")
async def create_adjustment(
    adjustment: AdjustmentCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new financial adjustment"""
    db = get_db()
    
    # Verify reference exists
    ref_collection = {
        "ar": Collections.AR,
        "ap": Collections.AP,
        "invoice": Collections.INVOICES,
        "receipt": Collections.RECEIPTS
    }.get(adjustment.reference_type)
    
    if not ref_collection:
        raise HTTPException(status_code=400, detail="Invalid reference type")
    
    ref_doc = db.collection(ref_collection).document(adjustment.reference_id).get()
    if not ref_doc.exists:
        raise HTTPException(status_code=404, detail="Referenced document not found")
    
    ref_data = ref_doc.to_dict()
    
    adjustment_data = adjustment.dict()
    adjustment_data["org_code"] = org_code
    adjustment_data["reference_details"] = {
        "original_amount": ref_data.get("amount") or ref_data.get("total"),
        "description": ref_data.get("description", "")
    }
    adjustment_data["created_at"] = datetime.utcnow().isoformat()
    adjustment_data["created_by"] = current_user["user_id"]
    adjustment_data["status"] = "pending_approval"
    
    doc_ref = db.collection(Collections.ADJUSTMENTS).document()
    doc_ref.set(adjustment_data)
    
    return {"id": doc_ref.id, "message": "Adjustment created, pending approval"}


@router.get("/{adjustment_id}")
async def get_adjustment(
    adjustment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific adjustment"""
    db = get_db()
    doc = db.collection(Collections.ADJUSTMENTS).document(adjustment_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    
    adjustment = doc.to_dict()
    adjustment["id"] = doc.id
    
    return adjustment


@router.post("/{adjustment_id}/approve")
async def approve_adjustment(
    adjustment_id: str,
    approval: ApprovalAction,
    current_user: dict = Depends(require_role(["admin", "accountant", "manager"]))
):
    """Approve or reject an adjustment"""
    db = get_db()
    doc_ref = db.collection(Collections.ADJUSTMENTS).document(adjustment_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    
    adjustment = doc.to_dict()
    
    if adjustment.get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail="Adjustment already processed")
    
    if approval.action == "approve":
        # Apply the adjustment
        ref_collection = {
            "ar": Collections.AR,
            "ap": Collections.AP,
            "invoice": Collections.INVOICES,
            "receipt": Collections.RECEIPTS
        }.get(adjustment.get("reference_type"))
        
        ref_id = adjustment.get("reference_id")
        ref_doc = db.collection(ref_collection).document(ref_id).get()
        
        if ref_doc.exists:
            ref_data = ref_doc.to_dict()
            adj_type = adjustment.get("adjustment_type")
            adj_amount = adjustment.get("amount", 0)
            
            update_data = {"adjusted_at": datetime.utcnow().isoformat()}
            
            if adj_type == "write_off":
                update_data["status"] = "written_off"
                update_data["write_off_amount"] = adj_amount
                update_data["balance"] = 0
            elif adj_type == "credit_note":
                current_balance = ref_data.get("balance", ref_data.get("amount", 0))
                update_data["balance"] = max(0, current_balance - adj_amount)
                update_data["credit_applied"] = adj_amount
            elif adj_type == "debit_note":
                current_balance = ref_data.get("balance", ref_data.get("amount", 0))
                update_data["balance"] = current_balance + adj_amount
            elif adj_type == "discount":
                current_balance = ref_data.get("balance", ref_data.get("amount", 0))
                update_data["balance"] = max(0, current_balance - adj_amount)
                update_data["discount_applied"] = adj_amount
            elif adj_type == "correction":
                update_data["amount"] = ref_data.get("amount", 0) + adj_amount
                update_data["balance"] = ref_data.get("balance", 0) + adj_amount
            
            db.collection(ref_collection).document(ref_id).update(update_data)
        
        doc_ref.update({
            "status": "approved",
            "approved_at": datetime.utcnow().isoformat(),
            "approved_by": current_user["user_id"],
            "approval_notes": approval.notes
        })
        
        return {"message": "Adjustment approved and applied"}
    
    else:  # reject
        doc_ref.update({
            "status": "rejected",
            "rejected_at": datetime.utcnow().isoformat(),
            "rejected_by": current_user["user_id"],
            "rejection_reason": approval.notes
        })
        
        return {"message": "Adjustment rejected"}


@router.delete("/{adjustment_id}")
async def delete_adjustment(
    adjustment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a pending adjustment"""
    db = get_db()
    doc_ref = db.collection(Collections.ADJUSTMENTS).document(adjustment_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    
    adjustment = doc.to_dict()
    
    if adjustment.get("status") != "pending_approval":
        raise HTTPException(status_code=400, detail="Cannot delete processed adjustment")
    
    doc_ref.delete()
    
    return {"message": "Adjustment deleted"}


# ============ WRITE-OFFS ============

@router.get("/write-offs/summary")
@cache(ttl=300)
async def get_writeoff_summary(
    org_code: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get write-off summary"""
    db = get_db()
    
    query = db.collection(Collections.ADJUSTMENTS)\
        .where("org_code", "==", org_code)\
        .where("adjustment_type", "==", "write_off")\
        .where("status", "==", "approved")
    
    if start_date:
        query = query.where("effective_date", ">=", start_date)
    
    docs = query.stream()
    
    by_reference_type = {"ar": 0.0, "ap": 0.0, "invoice": 0.0, "receipt": 0.0}
    total = 0.0
    count = 0
    
    for doc in docs:
        adj = doc.to_dict()
        
        if end_date and adj.get("effective_date", "") > end_date:
            continue
        
        ref_type = adj.get("reference_type")
        amount = float(adj.get("amount", 0))
        
        if ref_type in by_reference_type:
            by_reference_type[ref_type] += amount
        
        total += amount
        count += 1
    
    return {
        "period": {
            "start": start_date or "All time",
            "end": end_date or datetime.now().strftime("%Y-%m-%d")
        },
        "by_type": by_reference_type,
        "total": total,
        "count": count
    }


# ============ CREDIT NOTES ============

@router.post("/credit-note")
async def create_credit_note(
    reference_type: str,  # ar or invoice
    reference_id: str,
    amount: float,
    reason: str,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Quick create a credit note"""
    adjustment = AdjustmentCreate(
        adjustment_type="credit_note",
        reference_type=reference_type,
        reference_id=reference_id,
        amount=amount,
        reason=reason,
        effective_date=datetime.now().strftime("%Y-%m-%d")
    )
    
    return await create_adjustment(adjustment, org_code, current_user)


# ============ DISCOUNTS ============

@router.post("/discount")
async def apply_discount(
    reference_type: str,
    reference_id: str,
    discount_percent: Optional[float] = None,
    discount_amount: Optional[float] = None,
    reason: str = "Early payment discount",
    org_code: str = None,
    current_user: dict = Depends(get_current_user)
):
    """Apply a discount to an AR/Invoice"""
    db = get_db()
    
    if not discount_percent and not discount_amount:
        raise HTTPException(status_code=400, detail="Provide discount_percent or discount_amount")
    
    # Get reference document
    ref_collection = Collections.AR if reference_type == "ar" else Collections.INVOICES
    ref_doc = db.collection(ref_collection).document(reference_id).get()
    
    if not ref_doc.exists:
        raise HTTPException(status_code=404, detail="Reference not found")
    
    ref_data = ref_doc.to_dict()
    balance = ref_data.get("balance", ref_data.get("total", ref_data.get("amount", 0)))
    
    if discount_percent:
        amount = balance * (discount_percent / 100)
    else:
        amount = discount_amount
    
    adjustment = AdjustmentCreate(
        adjustment_type="discount",
        reference_type=reference_type,
        reference_id=reference_id,
        amount=amount,
        reason=reason,
        effective_date=datetime.now().strftime("%Y-%m-%d")
    )
    
    return await create_adjustment(adjustment, org_code, current_user)
