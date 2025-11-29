"""
Invoices router - Client invoicing
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

class InvoiceLineItem(BaseModel):
    description: str
    quantity: float = 1.0
    unit_price: float
    tax_rate: float = 0.0
    discount: float = 0.0


class InvoiceCreate(BaseModel):
    client_id: str
    client_name: str
    event_id: Optional[str] = None
    date: str
    due_date: str
    line_items: List[InvoiceLineItem]
    notes: Optional[str] = None
    terms: Optional[str] = None
    category: str = "services"


class InvoiceUpdate(BaseModel):
    line_items: Optional[List[InvoiceLineItem]] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None


# ============ INVOICES ============

@router.get("/")
@cache(ttl=120)
async def get_invoices(
    org_code: str,
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: int = Query(100, le=500),
    current_user: dict = Depends(get_current_user)
):
    """Get invoices"""
    db = get_db()
    
    query = db.collection(Collections.INVOICES).where("org_code", "==", org_code)
    
    if status:
        query = query.where("status", "==", status)
    
    if client_id:
        query = query.where("client_id", "==", client_id)
    
    if start_date:
        query = query.where("date", ">=", start_date)
    
    query = query.order_by("date", direction="DESCENDING").limit(limit)
    
    docs = query.stream()
    invoices = []
    
    for doc in docs:
        invoice = doc.to_dict()
        invoice["id"] = doc.id
        
        if end_date and invoice.get("date", "") > end_date:
            continue
        
        invoices.append(invoice)
    
    return {"invoices": invoices, "count": len(invoices)}


@router.post("/")
async def create_invoice(
    invoice: InvoiceCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new invoice"""
    db = get_db()
    
    # Generate invoice number
    year = datetime.now().year
    count_docs = db.collection(Collections.INVOICES)\
        .where("org_code", "==", org_code)\
        .where("invoice_number", ">=", f"INV-{year}-")\
        .stream()
    count = len(list(count_docs)) + 1
    invoice_number = f"INV-{year}-{count:04d}"
    
    # Calculate totals
    line_items_data = []
    subtotal = 0.0
    total_tax = 0.0
    total_discount = 0.0
    
    for item in invoice.line_items:
        item_subtotal = item.quantity * item.unit_price
        item_discount = item_subtotal * (item.discount / 100)
        item_taxable = item_subtotal - item_discount
        item_tax = item_taxable * (item.tax_rate / 100)
        item_total = item_taxable + item_tax
        
        line_items_data.append({
            **item.dict(),
            "subtotal": item_subtotal,
            "tax_amount": item_tax,
            "discount_amount": item_discount,
            "total": item_total
        })
        
        subtotal += item_subtotal
        total_tax += item_tax
        total_discount += item_discount
    
    invoice_data = invoice.dict()
    invoice_data["org_code"] = org_code
    invoice_data["invoice_number"] = invoice_number
    invoice_data["line_items"] = line_items_data
    invoice_data["subtotal"] = subtotal
    invoice_data["total_tax"] = total_tax
    invoice_data["total_discount"] = total_discount
    invoice_data["total"] = subtotal - total_discount + total_tax
    invoice_data["created_at"] = datetime.utcnow().isoformat()
    invoice_data["created_by"] = current_user["user_id"]
    invoice_data["status"] = "draft"
    
    doc_ref = db.collection(Collections.INVOICES).document()
    doc_ref.set(invoice_data)
    
    return {
        "id": doc_ref.id,
        "invoice_number": invoice_number,
        "total": invoice_data["total"],
        "message": "Invoice created"
    }


@router.get("/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific invoice"""
    db = get_db()
    doc = db.collection(Collections.INVOICES).document(invoice_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice = doc.to_dict()
    invoice["id"] = doc.id
    
    return invoice


@router.patch("/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    update: InvoiceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an invoice"""
    db = get_db()
    doc_ref = db.collection(Collections.INVOICES).document(invoice_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice = doc.to_dict()
    if invoice.get("status") not in ["draft", "pending"]:
        raise HTTPException(status_code=400, detail="Cannot modify finalized invoice")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    
    # Recalculate if line items changed
    if update.line_items:
        line_items_data = []
        subtotal = 0.0
        total_tax = 0.0
        total_discount = 0.0
        
        for item in update.line_items:
            item_subtotal = item.quantity * item.unit_price
            item_discount = item_subtotal * (item.discount / 100)
            item_taxable = item_subtotal - item_discount
            item_tax = item_taxable * (item.tax_rate / 100)
            item_total = item_taxable + item_tax
            
            line_items_data.append({
                **item.dict(),
                "subtotal": item_subtotal,
                "tax_amount": item_tax,
                "discount_amount": item_discount,
                "total": item_total
            })
            
            subtotal += item_subtotal
            total_tax += item_tax
            total_discount += item_discount
        
        update_data["line_items"] = line_items_data
        update_data["subtotal"] = subtotal
        update_data["total_tax"] = total_tax
        update_data["total_discount"] = total_discount
        update_data["total"] = subtotal - total_discount + total_tax
    
    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user["user_id"]
    
    doc_ref.update(update_data)
    
    return {"message": "Invoice updated"}


@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an invoice"""
    db = get_db()
    doc_ref = db.collection(Collections.INVOICES).document(invoice_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice = doc.to_dict()
    if invoice.get("status") not in ["draft"]:
        raise HTTPException(status_code=400, detail="Cannot delete sent/paid invoice")
    
    doc_ref.delete()
    
    return {"message": "Invoice deleted"}


# ============ WORKFLOW ============

@router.post("/{invoice_id}/send")
async def send_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark invoice as sent"""
    db = get_db()
    doc_ref = db.collection(Collections.INVOICES).document(invoice_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice = doc.to_dict()
    
    # Create AR entry
    ar_data = {
        "org_code": invoice.get("org_code"),
        "client_id": invoice.get("client_id"),
        "client_name": invoice.get("client_name"),
        "invoice_id": invoice_id,
        "amount": invoice.get("total"),
        "description": f"Invoice {invoice.get('invoice_number')}",
        "due_date": invoice.get("due_date"),
        "event_id": invoice.get("event_id"),
        "created_at": datetime.utcnow().isoformat(),
        "created_by": current_user["user_id"],
        "status": "pending",
        "payments": [],
        "amount_paid": 0.0,
        "balance": invoice.get("total")
    }
    
    ar_ref = db.collection(Collections.AR).document()
    ar_ref.set(ar_data)
    
    # Update invoice status
    doc_ref.update({
        "status": "sent",
        "sent_at": datetime.utcnow().isoformat(),
        "sent_by": current_user["user_id"],
        "ar_id": ar_ref.id
    })
    
    return {"message": "Invoice sent", "ar_id": ar_ref.id}


@router.post("/{invoice_id}/void")
async def void_invoice(
    invoice_id: str,
    reason: str,
    current_user: dict = Depends(get_current_user)
):
    """Void an invoice"""
    db = get_db()
    doc_ref = db.collection(Collections.INVOICES).document(invoice_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice = doc.to_dict()
    
    # Void the AR if exists
    ar_id = invoice.get("ar_id")
    if ar_id:
        ar_doc = db.collection(Collections.AR).document(ar_id).get()
        if ar_doc.exists:
            ar_data = ar_doc.to_dict()
            if ar_data.get("amount_paid", 0) > 0:
                raise HTTPException(status_code=400, detail="Cannot void invoice with payments")
            
            db.collection(Collections.AR).document(ar_id).update({
                "status": "voided",
                "voided_at": datetime.utcnow().isoformat()
            })
    
    doc_ref.update({
        "status": "voided",
        "voided_at": datetime.utcnow().isoformat(),
        "voided_by": current_user["user_id"],
        "void_reason": reason
    })
    
    return {"message": "Invoice voided"}


# ============ DUPLICATES & TEMPLATES ============

@router.post("/{invoice_id}/duplicate")
async def duplicate_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a copy of an invoice"""
    db = get_db()
    doc = db.collection(Collections.INVOICES).document(invoice_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    original = doc.to_dict()
    
    # Generate new invoice number
    org_code = original.get("org_code")
    year = datetime.now().year
    count_docs = db.collection(Collections.INVOICES)\
        .where("org_code", "==", org_code)\
        .where("invoice_number", ">=", f"INV-{year}-")\
        .stream()
    count = len(list(count_docs)) + 1
    invoice_number = f"INV-{year}-{count:04d}"
    
    # Create new invoice
    new_invoice = original.copy()
    new_invoice["invoice_number"] = invoice_number
    new_invoice["date"] = date.today().isoformat()
    new_invoice["due_date"] = (date.today() + timedelta(days=30)).isoformat()
    new_invoice["status"] = "draft"
    new_invoice["created_at"] = datetime.utcnow().isoformat()
    new_invoice["created_by"] = current_user["user_id"]
    new_invoice.pop("sent_at", None)
    new_invoice.pop("ar_id", None)
    new_invoice.pop("id", None)
    
    doc_ref = db.collection(Collections.INVOICES).document()
    doc_ref.set(new_invoice)
    
    return {
        "id": doc_ref.id,
        "invoice_number": invoice_number,
        "message": "Invoice duplicated"
    }
