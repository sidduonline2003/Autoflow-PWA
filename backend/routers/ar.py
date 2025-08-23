"""
Client-specific Accounts Receivable endpoints
This router provides client-facing AR functionality with proper access controls
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from firebase_admin import firestore
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import io

from ..dependencies import get_current_user
from ..utils.pdf_generator import PDFGenerator
from ..utils.email_service import email_service

router = APIRouter(
    prefix="/ar",
    tags=["Client AR Portal"],
)

# --- Helper Functions ---
def is_client_user(current_user: dict) -> bool:
    """Check if user is a client"""
    return current_user.get("role", "").lower() == "client"

def is_authorized_for_ar(current_user: dict) -> bool:
    """Check if user has AR access (admin/accountant)"""
    return current_user.get("role", "").lower() in ["admin", "accountant"]

def get_utc_now():
    """Get current UTC time"""
    return datetime.now(timezone.utc)

def get_ist_now():
    """Get current IST time"""
    from zoneinfo import ZoneInfo
    return datetime.now(ZoneInfo('Asia/Kolkata'))

# --- Pydantic Models ---
class InvoiceCreate(BaseModel):
    type: str = "FINAL"  # BUDGET or FINAL
    clientId: str
    eventId: Optional[str] = None
    issueDate: Optional[str] = None
    dueDate: Optional[str] = None
    currency: str = "INR"
    items: List[dict]
    discount: dict = {}
    taxMode: str = "EXCLUSIVE"
    shippingAmount: float = 0.0
    notes: Optional[str] = None
    internalNotes: Optional[str] = None

class InvoiceUpdate(BaseModel):
    status: Optional[str] = None
    items: Optional[List[dict]] = None
    notes: Optional[str] = None

class QuoteCreate(BaseModel):
    clientId: str
    eventId: Optional[str] = None
    issueDate: Optional[str] = None
    validUntil: Optional[str] = None
    currency: str = "INR"
    items: List[dict]
    discount: dict = {}
    taxMode: str = "EXCLUSIVE"
    shippingAmount: float = 0.0
    notes: Optional[str] = None

class QuoteUpdate(BaseModel):
    status: Optional[str] = None

class MessageCreate(BaseModel):
    message: str
    type: str = "CLIENT_REPLY"  # CLIENT_REPLY for clients, GENERAL for admin/accountant 
    sendEmail: bool = True

# --- Client Invoice Endpoints ---
@router.get("/invoices")
async def list_client_invoices(
    current_user: dict = Depends(get_current_user)
):
    """List invoices for the authenticated client"""
    print(f"[AR] list_client_invoices called by user: {current_user}")
    
    if not is_client_user(current_user):
        print(f"[AR] Access denied - user role: {current_user.get('role')}")
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId") or current_user.get("uid")  # Support both clientId and uid
    
    print(f"[AR] Searching for invoices with orgId: {org_id}, clientId: {client_id}")
    
    db = firestore.client()
    
    # Get invoices for this client (exclude drafts)
    query = db.collection('organizations', org_id, 'invoices').where('clientId', '==', client_id)
    
    invoices = []
    # Temporarily removed order_by due to missing Firestore composite index
    docs = query.get()
    print(f"[AR] Found {len(docs)} invoice documents")
    
    for doc in docs:
        invoice_data = doc.to_dict()
        print(f"[AR] Processing invoice {doc.id}, status: {invoice_data.get('status')}, clientId: {invoice_data.get('clientId')}")
        
        # Hide draft invoices from clients
        if invoice_data.get("status") == "DRAFT":
            print(f"[AR] Skipping draft invoice {doc.id}")
            continue
            
        invoice_data['id'] = doc.id
        invoices.append(invoice_data)
    
    print(f"[AR] Returning {len(invoices)} invoices to client")
    return invoices

@router.get("/invoices/{invoice_id}")
async def get_client_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get invoice details for client"""
    if not is_client_user(current_user):
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId")  # Use clientId from claims, not uid
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Verify client owns this invoice
    if invoice_data.get("clientId") != client_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Hide draft invoices from clients
    if invoice_data.get("status") == "DRAFT":
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data['id'] = invoice_id
    return invoice_data

@router.get("/invoices/{invoice_id}/pdf")
async def get_client_invoice_pdf(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download invoice PDF for client"""
    if not is_client_user(current_user):
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId")  # Use clientId from claims, not uid
    
    db = firestore.client()
    
    # Get invoice
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Verify client owns this invoice
    if invoice_data.get("clientId") != client_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Hide draft invoices from clients
    if invoice_data.get("status") == "DRAFT":
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get client data
    client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
    client_doc = client_ref.get()
    client_data = client_doc.to_dict() if client_doc.exists else {}
    
    # Get org data
    org_ref = db.collection('organizations').document(org_id)
    org_doc = org_ref.get()
    org_data = org_doc.to_dict() if org_doc.exists else {}
    
    try:
        # Generate PDF
        pdf_generator = PDFGenerator()
        pdf_buffer = pdf_generator.generate_invoice_pdf(invoice_data, client_data, org_data)
        
        # Return PDF
        return Response(
            content=pdf_buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=Invoice-{invoice_data.get('number', invoice_id)}.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")

# --- Client Quote Endpoints ---
@router.get("/quotes")
async def list_client_quotes(
    current_user: dict = Depends(get_current_user)
):
    """List quotes for the authenticated client"""
    print(f"[AR] list_client_quotes called by user: {current_user}")
    
    if not is_client_user(current_user):
        print(f"[AR] Access denied - user role: {current_user.get('role')}")
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId") or current_user.get("uid")  # Support both clientId and uid
    
    print(f"[AR] Searching for quotes with orgId: {org_id}, clientId: {client_id}")
    
    db = firestore.client()
    
    # Get quotes for this client (only BUDGET type invoices that are sent)
    query = db.collection('organizations', org_id, 'invoices').where('clientId', '==', client_id).where('type', '==', 'BUDGET')
    
    quotes = []
    # Temporarily removed order_by due to missing Firestore composite index
    docs = query.get()
    print(f"[AR] Found {len(docs)} quote documents")
    
    for doc in docs:
        quote_data = doc.to_dict()
        print(f"[AR] Processing quote {doc.id}, status: {quote_data.get('status')}, type: {quote_data.get('type')}")
        
        # Hide draft quotes from clients
        if quote_data.get("status") == "DRAFT":
            print(f"[AR] Skipping draft quote {doc.id}")
            continue
            
        quote_data['id'] = doc.id
        quotes.append(quote_data)
    
    print(f"[AR] Returning {len(quotes)} quotes to client")
    return quotes

@router.get("/quotes/{quote_id}")
async def get_client_quote(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get quote details for client"""
    if not is_client_user(current_user):
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId")  # Use clientId from claims, not uid
    
    db = firestore.client()
    quote_ref = db.collection('organizations', org_id, 'invoices').document(quote_id)
    quote_doc = quote_ref.get()
    
    if not quote_doc.exists:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    quote_data = quote_doc.to_dict()
    
    # Verify this is a quote (BUDGET) and client owns it
    if quote_data.get("type") != "BUDGET":
        raise HTTPException(status_code=404, detail="Quote not found")
    
    if quote_data.get("clientId") != client_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Hide draft quotes from clients
    if quote_data.get("status") == "DRAFT":
        raise HTTPException(status_code=404, detail="Quote not found")
    
    quote_data['id'] = quote_id
    return quote_data

@router.put("/quotes/{quote_id}")
async def update_client_quote(
    quote_id: str,
    req: QuoteUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update quote status (accept/reject) for client"""
    if not is_client_user(current_user):
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId")  # Use clientId from claims, not uid
    
    db = firestore.client()
    quote_ref = db.collection('organizations', org_id, 'invoices').document(quote_id)
    quote_doc = quote_ref.get()
    
    if not quote_doc.exists:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    quote_data = quote_doc.to_dict()
    
    # Verify this is a quote and client owns it
    if quote_data.get("type") != "BUDGET":
        raise HTTPException(status_code=404, detail="Quote not found")
    
    if quote_data.get("clientId") != client_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Only allow status updates to ACCEPTED or REJECTED and only if currently SENT
    if req.status not in ["ACCEPTED", "REJECTED"]:
        raise HTTPException(status_code=400, detail="Invalid status. Only ACCEPTED or REJECTED allowed")
    
    if quote_data.get("status") != "SENT":
        raise HTTPException(status_code=400, detail="Can only accept/reject sent quotes")
    
    # Update quote
    update_data = {
        "status": req.status,
        "updatedAt": get_utc_now().isoformat(),
        "respondedAt": get_utc_now().isoformat(),
        "respondedBy": client_id
    }
    
    quote_ref.update(update_data)
    
    return {"status": "success", "message": f"Quote {req.status.lower()}"}

@router.get("/quotes/{quote_id}/pdf")
async def get_client_quote_pdf(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Download quote PDF for client"""
    if not is_client_user(current_user):
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId")  # Use clientId from claims, not uid
    
    db = firestore.client()
    
    # Get quote
    quote_ref = db.collection('organizations', org_id, 'invoices').document(quote_id)
    quote_doc = quote_ref.get()
    
    if not quote_doc.exists:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    quote_data = quote_doc.to_dict()
    
    # Verify this is a quote and client owns it
    if quote_data.get("type") != "BUDGET":
        raise HTTPException(status_code=404, detail="Quote not found")
    
    if quote_data.get("clientId") != client_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Hide draft quotes from clients
    if quote_data.get("status") == "DRAFT":
        raise HTTPException(status_code=404, detail="Quote not found")
    
    # Get client data
    client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
    client_doc = client_ref.get()
    client_data = client_doc.to_dict() if client_doc.exists else {}
    
    # Get org data
    org_ref = db.collection('organizations').document(org_id)
    org_doc = org_ref.get()
    org_data = org_doc.to_dict() if org_doc.exists else {}
    
    try:
        # Generate PDF
        pdf_generator = PDFGenerator()
        pdf_buffer = pdf_generator.generate_quote_pdf(quote_data, client_data, org_data)
        
        # Return PDF
        return Response(
            content=pdf_buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=Quote-{quote_data.get('number', quote_id)}.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")

# --- Client Payment Endpoints ---
@router.get("/payments")
async def list_client_payments(
    current_user: dict = Depends(get_current_user)
):
    """List payments for the authenticated client"""
    if not is_client_user(current_user):
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId")  # Use clientId from claims, not uid
    
    db = firestore.client()
    
    # Get payments for this client
    query = db.collection('organizations', org_id, 'payments').where('clientId', '==', client_id)
    
    payments = []
    # Temporarily removed order_by due to missing Firestore composite index
    for doc in query.get():
        payment_data = doc.to_dict()
        payment_data['id'] = doc.id
        payments.append(payment_data)
    
    return payments

# --- Client Summary/Dashboard ---
@router.get("/summary")
async def get_client_ar_summary(
    current_user: dict = Depends(get_current_user)
):
    """Get AR summary for the authenticated client"""
    print(f"[AR] get_client_ar_summary called by user: {current_user}")
    
    if not is_client_user(current_user):
        print(f"[AR] Access denied - user role: {current_user.get('role')}")
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId") or current_user.get("uid")  # Support both clientId and uid
    
    print(f"[AR] Calculating summary for orgId: {org_id}, clientId: {client_id}")
    
    db = firestore.client()
    
    # Get all invoices for this client
    invoices_query = db.collection('organizations', org_id, 'invoices').where('clientId', '==', client_id)
    
    total_outstanding = 0
    total_overdue = 0
    total_paid = 0
    pending_quotes = 0
    
    now_utc = get_utc_now()
    
    for doc in invoices_query.get():
        invoice_data = doc.to_dict()
        
        # Skip drafts and cancelled
        if invoice_data.get('status') in ['DRAFT', 'CANCELLED']:
            continue
        
        invoice_type = invoice_data.get('type')
        status = invoice_data.get('status')
        totals = invoice_data.get('totals', {})
        
        if invoice_type == 'BUDGET':
            # Count pending quotes
            if status == 'SENT':
                pending_quotes += 1
        elif invoice_type == 'FINAL':
            # Calculate totals for final invoices
            amount_due = totals.get('amountDue', 0)
            amount_paid = totals.get('amountPaid', 0)
            
            total_paid += amount_paid
            
            if amount_due > 0:
                total_outstanding += amount_due
                
                # Check if overdue
                due_date = invoice_data.get('dueDate')
                if due_date and status in ['SENT', 'PARTIAL']:
                    due_dt = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
                    if now_utc > due_dt:
                        total_overdue += amount_due
    
    return {
        "totalOutstanding": total_outstanding,
        "totalOverdue": total_overdue,
        "totalPaid": total_paid,
        "pendingQuotes": pending_quotes
    }

# --- Admin/Accountant Invoice Management Endpoints ---
# These endpoints are for admin/accountant users to manage invoices

@router.post("/invoices")
async def create_invoice(
    req: InvoiceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new invoice (admin/accountant only)"""
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Forward to financial hub endpoint
    from .financial_client_revenue import create_invoice as fh_create_invoice
    return await fh_create_invoice(req, current_user)

@router.put("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    req: InvoiceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an invoice (admin/accountant only)"""
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Forward to financial hub endpoint
    from .financial_client_revenue import update_invoice as fh_update_invoice
    return await fh_update_invoice(invoice_id, req, current_user)

@router.post("/invoices/{invoice_id}/send")
async def send_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Send an invoice (admin/accountant only)"""
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Forward to financial hub endpoint
    from .financial_client_revenue import send_invoice as fh_send_invoice
    return await fh_send_invoice(invoice_id, current_user)

@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf_admin(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get invoice PDF (admin/accountant version)"""
    if is_client_user(current_user):
        # Use client-specific version
        return await get_client_invoice_pdf(invoice_id, current_user)
    elif is_authorized_for_ar(current_user):
        # Forward to financial hub endpoint
        org_id = current_user.get("orgId")
        db = firestore.client()
        
        # Get invoice
        invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
        invoice_doc = invoice_ref.get()
        
        if not invoice_doc.exists:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        invoice_data = invoice_doc.to_dict()
        
        # Get client data
        client_ref = db.collection('organizations', org_id, 'clients').document(invoice_data.get('clientId'))
        client_doc = client_ref.get()
        client_data = client_doc.to_dict() if client_doc.exists else {}
        
        # Get org data
        org_ref = db.collection('organizations').document(org_id)
        org_doc = org_ref.get()
        org_data = org_doc.to_dict() if org_doc.exists else {}
        
        try:
            # Generate PDF
            pdf_generator = PDFGenerator()
            pdf_buffer = pdf_generator.generate_invoice_pdf(invoice_data, client_data, org_data)
            
            # Return PDF
            return Response(
                content=pdf_buffer.getvalue(),
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=Invoice-{invoice_data.get('number', invoice_id)}.pdf"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")
    else:
        raise HTTPException(status_code=403, detail="Not authorized")

# --- Admin/Accountant Quote Management Endpoints ---

@router.post("/quotes")
async def create_quote(
    req: QuoteCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new quote (admin/accountant only)"""
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Convert quote to BUDGET invoice
    invoice_req = InvoiceCreate(
        type="BUDGET",
        clientId=req.clientId,
        eventId=req.eventId,
        issueDate=req.issueDate,
        dueDate=req.validUntil,  # Use validUntil as dueDate for budget
        currency=req.currency,
        items=req.items,
        discount=req.discount,
        taxMode=req.taxMode,
        shippingAmount=req.shippingAmount,
        notes=req.notes
    )
    
    # Forward to financial hub endpoint
    from .financial_client_revenue import create_invoice as fh_create_invoice
    result = await fh_create_invoice(invoice_req, current_user)
    
    # Return with quote ID naming
    return {"status": "success", "quoteId": result.get("invoiceId")}

@router.put("/quotes/{quote_id}")
async def update_quote_admin(
    quote_id: str,
    req: QuoteUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a quote (admin/accountant or client)"""
    if is_client_user(current_user):
        # Use client-specific version
        return await update_client_quote(quote_id, req, current_user)
    elif is_authorized_for_ar(current_user):
        # Admin can update any quote field
        from .financial_client_revenue import update_invoice as fh_update_invoice
        invoice_req = InvoiceUpdate(status=req.status)
        return await fh_update_invoice(quote_id, invoice_req, current_user)
    else:
        raise HTTPException(status_code=403, detail="Not authorized")

@router.post("/quotes/{quote_id}/send")
async def send_quote(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Send a quote (admin/accountant only)"""
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Forward to financial hub endpoint
    from .financial_client_revenue import send_invoice as fh_send_invoice
    return await fh_send_invoice(quote_id, current_user)

@router.get("/quotes/{quote_id}/pdf")
async def get_quote_pdf_admin(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get quote PDF (admin/accountant version)"""
    if is_client_user(current_user):
        # Use client-specific version
        return await get_client_quote_pdf(quote_id, current_user)
    elif is_authorized_for_ar(current_user):
        # Admin version
        org_id = current_user.get("orgId")
        db = firestore.client()
        
        # Get quote
        quote_ref = db.collection('organizations', org_id, 'invoices').document(quote_id)
        quote_doc = quote_ref.get()
        
        if not quote_doc.exists:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        quote_data = quote_doc.to_dict()
        
        # Verify this is a quote
        if quote_data.get("type") != "BUDGET":
            raise HTTPException(status_code=404, detail="Quote not found")
        
        # Get client data
        client_ref = db.collection('organizations', org_id, 'clients').document(quote_data.get('clientId'))
        client_doc = client_ref.get()
        client_data = client_doc.to_dict() if client_doc.exists else {}
        
        # Get org data
        org_ref = db.collection('organizations').document(org_id)
        org_doc = org_ref.get()
        org_data = org_doc.to_dict() if org_doc.exists else {}
        
        try:
            # Generate PDF
            pdf_generator = PDFGenerator()
            pdf_buffer = pdf_generator.generate_quote_pdf(quote_data, client_data, org_data)
            
            # Return PDF
            return Response(
                content=pdf_buffer.getvalue(),
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename=Quote-{quote_data.get('number', quote_id)}.pdf"}
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")
    else:
        raise HTTPException(status_code=403, detail="Not authorized")

@router.post("/quotes/{quote_id}/convert")
async def convert_quote_to_invoice(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Convert quote to final invoice (admin/accountant only)"""
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Forward to financial hub endpoint
    from .financial_client_revenue import convert_budget_to_final as fh_convert
    result = await fh_convert(quote_id, current_user)
    
    # Return with invoice ID naming
    return {"status": "success", "invoiceId": result.get("finalInvoiceId")}

# --- Invoice Communication/Messaging Endpoints ---
@router.get("/invoices/{invoice_id}/messages")
async def get_invoice_messages(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get communication thread for an invoice (client access)"""
    if not is_client_user(current_user):
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId")  # Use clientId from claims, not uid
    
    db = firestore.client()
    
    # Check invoice exists and client owns it
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Verify client owns this invoice
    if invoice_data.get("clientId") != client_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Hide draft invoices from clients
    if invoice_data.get("status") == "DRAFT":
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get messages for this invoice
    messages_query = db.collection('organizations', org_id, 'invoiceMessages').where('invoiceId', '==', invoice_id)
    
    messages = []
    for doc in messages_query.order_by('sentAt', direction=firestore.Query.ASCENDING).get():
        message_data = doc.to_dict()
        message_data['id'] = doc.id
        messages.append(message_data)
    
    return messages

@router.post("/invoices/{invoice_id}/messages")
async def send_invoice_message(
    invoice_id: str,
    req: MessageCreate,
    current_user: dict = Depends(get_current_user)
):
    """Send a message about an invoice (client communication)"""
    if not is_client_user(current_user):
        raise HTTPException(status_code=403, detail="Only clients can access this endpoint")
    
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId")  # Use clientId from claims, not uid
    
    db = firestore.client()
    
    # Check invoice exists and client owns it
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Verify client owns this invoice
    if invoice_data.get("clientId") != client_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Hide draft invoices from clients
    if invoice_data.get("status") == "DRAFT":
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Create message
    message_data = {
        "invoiceId": invoice_id,
        "message": req.message,
        "type": "CLIENT_REPLY",  # Clients can only send CLIENT_REPLY messages
        "sentBy": client_id,
        "sentByRole": "client",
        "sentAt": get_utc_now().isoformat(),
        "orgId": org_id
    }
    
    # Add to messages collection
    message_ref = db.collection('organizations', org_id, 'invoiceMessages').document()
    message_ref.set(message_data)
    
    # Send email notification if requested
    if req.sendEmail:
        try:
            # Get client data for email
            client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
            client_doc = client_ref.get()
            client_data = client_doc.to_dict() if client_doc.exists else {}
            
            # Get org data
            org_ref = db.collection('organizations').document(org_id)
            org_doc = org_ref.get()
            org_data = org_doc.to_dict() if org_doc.exists else {}
            
            # Notify admin/accountant of client reply
            admin_users = db.collection('users').where('orgId', '==', org_id).where('role', 'in', ['admin', 'accountant']).get()
            for admin_doc in admin_users:
                admin_data = admin_doc.to_dict()
                admin_email = admin_data.get('email')
                if admin_email:
                    email_service.send_client_reply_notification(
                        invoice_data, client_data, req.message, admin_email, org_data
                    )
        except Exception as e:
            print(f"Failed to send email notification: {str(e)}")
            # Don't fail the API call if email fails
    
    return {"status": "success", "messageId": message_ref.id}
