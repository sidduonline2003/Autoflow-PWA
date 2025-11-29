"""
Receipts router - Expense tracking and receipt management
"""

from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
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

class ReceiptCreate(BaseModel):
    vendor_name: str
    amount: float
    date: str
    category: str
    description: Optional[str] = None
    payment_method: str = "cash"
    event_id: Optional[str] = None
    project_id: Optional[str] = None
    tax_amount: Optional[float] = 0.0
    receipt_image_url: Optional[str] = None


class ReceiptUpdate(BaseModel):
    vendor_name: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    description: Optional[str] = None
    tax_amount: Optional[float] = None
    status: Optional[str] = None


class ReceiptCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    tax_deductible: bool = False
    parent_category: Optional[str] = None


# ============ RECEIPTS ============

@router.get("/")
@cache(ttl=120)
async def get_receipts(
    org_code: str,
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    event_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(100, le=500),
    current_user: dict = Depends(get_current_user)
):
    """Get receipts with filters"""
    db = get_db()
    
    query = db.collection(Collections.RECEIPTS).where("org_code", "==", org_code)
    
    if category:
        query = query.where("category", "==", category)
    
    if start_date:
        query = query.where("date", ">=", start_date)
    
    if event_id:
        query = query.where("event_id", "==", event_id)
    
    if status:
        query = query.where("status", "==", status)
    
    query = query.order_by("date", direction="DESCENDING").limit(limit)
    
    docs = query.stream()
    receipts = []
    
    for doc in docs:
        receipt = doc.to_dict()
        receipt["id"] = doc.id
        
        if end_date and receipt.get("date", "") > end_date:
            continue
        
        receipts.append(receipt)
    
    # Calculate totals
    total_amount = sum(float(r.get("amount", 0)) for r in receipts)
    total_tax = sum(float(r.get("tax_amount", 0)) for r in receipts)
    
    return {
        "receipts": receipts,
        "count": len(receipts),
        "totals": {
            "amount": total_amount,
            "tax": total_tax
        }
    }


@router.post("/")
async def create_receipt(
    receipt: ReceiptCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new receipt"""
    db = get_db()
    
    receipt_data = receipt.dict()
    receipt_data["org_code"] = org_code
    receipt_data["created_at"] = datetime.utcnow().isoformat()
    receipt_data["created_by"] = current_user["user_id"]
    receipt_data["status"] = "pending"
    receipt_data["verified"] = False
    
    doc_ref = db.collection(Collections.RECEIPTS).document()
    doc_ref.set(receipt_data)
    
    return {"id": doc_ref.id, "message": "Receipt created"}


@router.get("/{receipt_id}")
async def get_receipt(
    receipt_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific receipt"""
    db = get_db()
    doc = db.collection(Collections.RECEIPTS).document(receipt_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    receipt = doc.to_dict()
    receipt["id"] = doc.id
    
    return receipt


@router.patch("/{receipt_id}")
async def update_receipt(
    receipt_id: str,
    update: ReceiptUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a receipt"""
    db = get_db()
    doc_ref = db.collection(Collections.RECEIPTS).document(receipt_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user["user_id"]
    
    doc_ref.update(update_data)
    
    return {"message": "Receipt updated"}


@router.delete("/{receipt_id}")
async def delete_receipt(
    receipt_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a receipt"""
    db = get_db()
    doc_ref = db.collection(Collections.RECEIPTS).document(receipt_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    doc_ref.delete()
    
    return {"message": "Receipt deleted"}


# ============ VERIFICATION ============

@router.post("/{receipt_id}/verify")
async def verify_receipt(
    receipt_id: str,
    verified: bool = True,
    notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Verify a receipt"""
    db = get_db()
    doc_ref = db.collection(Collections.RECEIPTS).document(receipt_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    doc_ref.update({
        "verified": verified,
        "verified_at": datetime.utcnow().isoformat(),
        "verified_by": current_user["user_id"],
        "verification_notes": notes,
        "status": "verified" if verified else "rejected"
    })
    
    return {"message": "Receipt verification updated"}


@router.post("/{receipt_id}/create-ap")
async def create_ap_from_receipt(
    receipt_id: str,
    due_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Create an AP entry from a receipt"""
    db = get_db()
    doc = db.collection(Collections.RECEIPTS).document(receipt_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    receipt = doc.to_dict()
    
    # Create AP entry
    ap_data = {
        "org_code": receipt.get("org_code"),
        "vendor_name": receipt.get("vendor_name"),
        "amount": receipt.get("amount"),
        "description": receipt.get("description", f"Receipt from {receipt.get('vendor_name')}"),
        "due_date": due_date,
        "category": receipt.get("category"),
        "event_id": receipt.get("event_id"),
        "receipt_id": receipt_id,
        "created_at": datetime.utcnow().isoformat(),
        "created_by": current_user["user_id"],
        "status": "pending",
        "payments": [],
        "amount_paid": 0.0,
        "balance": receipt.get("amount")
    }
    
    ap_ref = db.collection(Collections.AP).document()
    ap_ref.set(ap_data)
    
    # Link receipt to AP
    db.collection(Collections.RECEIPTS).document(receipt_id).update({
        "ap_id": ap_ref.id,
        "status": "linked_to_ap"
    })
    
    return {"ap_id": ap_ref.id, "message": "AP entry created from receipt"}


# ============ CATEGORIES ============

@router.get("/categories")
@cache(ttl=600)
async def get_receipt_categories(
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Get receipt categories"""
    db = get_db()
    
    docs = db.collection(Collections.RECEIPT_CATEGORIES)\
        .where("org_code", "==", org_code).stream()
    
    categories = []
    for doc in docs:
        cat = doc.to_dict()
        cat["id"] = doc.id
        categories.append(cat)
    
    # Add default categories if none exist
    if not categories:
        defaults = [
            {"name": "Equipment", "tax_deductible": True},
            {"name": "Travel", "tax_deductible": True},
            {"name": "Meals", "tax_deductible": True},
            {"name": "Supplies", "tax_deductible": True},
            {"name": "Software", "tax_deductible": True},
            {"name": "Utilities", "tax_deductible": True},
            {"name": "Rent", "tax_deductible": True},
            {"name": "Marketing", "tax_deductible": True},
            {"name": "Other", "tax_deductible": False}
        ]
        
        for cat in defaults:
            categories.append({"name": cat["name"], "tax_deductible": cat["tax_deductible"]})
    
    return {"categories": categories}


@router.post("/categories")
async def create_receipt_category(
    category: ReceiptCategoryCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new receipt category"""
    db = get_db()
    
    category_data = category.dict()
    category_data["org_code"] = org_code
    category_data["created_at"] = datetime.utcnow().isoformat()
    
    doc_ref = db.collection(Collections.RECEIPT_CATEGORIES).document()
    doc_ref.set(category_data)
    
    return {"id": doc_ref.id, "message": "Category created"}


# ============ REPORTS ============

@router.get("/reports/by-category")
@cache(ttl=300)
async def get_receipts_by_category(
    org_code: str,
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get receipt summary by category"""
    db = get_db()
    
    docs = db.collection(Collections.RECEIPTS)\
        .where("org_code", "==", org_code)\
        .where("date", ">=", start_date)\
        .where("date", "<=", end_date).stream()
    
    categories = {}
    total = 0.0
    
    for doc in docs:
        data = doc.to_dict()
        category = data.get("category", "Uncategorized")
        amount = float(data.get("amount", 0))
        
        if category not in categories:
            categories[category] = {
                "count": 0,
                "total": 0.0,
                "tax_total": 0.0
            }
        
        categories[category]["count"] += 1
        categories[category]["total"] += amount
        categories[category]["tax_total"] += float(data.get("tax_amount", 0))
        total += amount
    
    return {
        "period": {"start": start_date, "end": end_date},
        "categories": categories,
        "grand_total": total
    }


@router.get("/reports/by-event")
@cache(ttl=300)
async def get_receipts_by_event(
    org_code: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get receipt summary by event"""
    db = get_db()
    
    query = db.collection(Collections.RECEIPTS).where("org_code", "==", org_code)
    
    if start_date:
        query = query.where("date", ">=", start_date)
    
    docs = query.stream()
    
    events = {}
    unassigned = {"count": 0, "total": 0.0}
    
    for doc in docs:
        data = doc.to_dict()
        
        if end_date and data.get("date", "") > end_date:
            continue
        
        event_id = data.get("event_id")
        amount = float(data.get("amount", 0))
        
        if event_id:
            if event_id not in events:
                events[event_id] = {"count": 0, "total": 0.0}
            events[event_id]["count"] += 1
            events[event_id]["total"] += amount
        else:
            unassigned["count"] += 1
            unassigned["total"] += amount
    
    return {
        "events": events,
        "unassigned": unassigned
    }
