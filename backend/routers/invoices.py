from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth, firestore
from pydantic import BaseModel
from typing import List
import datetime

from backend.dependencies import get_current_user

router = APIRouter(
    prefix="/invoices",
    tags=["Invoice Management"],
)

class InvoiceRequest(BaseModel):
    description: str
    amount: float
    dueDate: str
    items: List[dict] = []

class InvoiceUpdateRequest(BaseModel):
    status: str

@router.post("/for-client/{client_id}")
async def create_invoice(client_id: str, req: InvoiceRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    
    # Generate invoice number
    invoice_counter_ref = db.collection('organizations', org_id, 'counters').document('invoices')
    invoice_counter_doc = invoice_counter_ref.get()
    
    if invoice_counter_doc.exists:
        current_count = invoice_counter_doc.to_dict().get('count', 0)
    else:
        current_count = 0
    
    new_count = current_count + 1
    invoice_number = f"INV-{org_id[:8]}-{new_count:04d}"
    
    # Create invoice
    invoice_ref = db.collection('organizations', org_id, 'clients', client_id, 'invoices').document()
    invoice_ref.set({
        "invoiceNumber": invoice_number,
        "description": req.description,
        "amount": req.amount,
        "dueDate": req.dueDate,
        "items": req.items,
        "status": "pending",
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "createdBy": current_user.get("uid")
    })
    
    # Update counter
    invoice_counter_ref.set({"count": new_count})
    
    return {"status": "success", "invoiceId": invoice_ref.id, "invoiceNumber": invoice_number}

@router.put("/{invoice_id}/status")
async def update_invoice_status(invoice_id: str, client_id: str, req: InvoiceUpdateRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'clients', client_id, 'invoices').document(invoice_id)
    
    update_data = {
        "status": req.status,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    }
    
    if req.status == "paid":
        update_data["paidAt"] = datetime.datetime.now(datetime.timezone.utc)
    
    invoice_ref.update(update_data)
    
    return {"status": "success", "message": f"Invoice status updated to {req.status}"}

@router.get("/for-client/{client_id}")
async def get_client_invoices(client_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    invoices_ref = db.collection('organizations', org_id, 'clients', client_id, 'invoices')
    invoices = invoices_ref.stream()
    
    result = []
    for invoice in invoices:
        invoice_data = invoice.to_dict()
        invoice_data['id'] = invoice.id
        result.append(invoice_data)
    
    return {"invoices": result}

@router.delete("/{invoice_id}")
async def delete_invoice(invoice_id: str, client_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'clients', client_id, 'invoices').document(invoice_id)
    invoice_ref.delete()
    
    return {"status": "success", "message": "Invoice deleted"}
