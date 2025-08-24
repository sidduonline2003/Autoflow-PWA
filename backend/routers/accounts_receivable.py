from fastapi import APIRouter, Depends, HTTPException, Query, Response
from firebase_admin import firestore
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import pytz
import io
from decimal import Decimal, ROUND_HALF_UP

from ..dependencies import get_current_user
from ..utils.pdf_generator import PDFGenerator
from ..utils.email_service import email_service

router = APIRouter(
    prefix="/financial",
    tags=["Client Revenue"],
)

# --- Pydantic Models ---
class LineItem(BaseModel):
    desc: str
    qty: float = 1.0
    unitPrice: float
    taxRatePct: float = 0.0
    category: str = "Services"

class Discount(BaseModel):
    mode: str = "AMOUNT"  # PERCENT or AMOUNT
    value: float = 0.0

class Totals(BaseModel):
    subTotal: float
    discountTotal: float
    taxTotal: float
    grandTotal: float
    amountPaid: float = 0.0
    amountDue: float

class QuoteBase(BaseModel):
    clientId: str
    eventId: Optional[str] = None
    validUntil: str  # ISO date
    currency: str = "INR"
    items: List[LineItem]
    discount: Discount = Discount()
    taxMode: str = "EXCLUSIVE"  # EXCLUSIVE or INCLUSIVE
    shipping: float = 0.0
    notes: Optional[str] = None

class QuoteCreate(QuoteBase):
    pass

class QuoteUpdate(BaseModel):
    validUntil: Optional[str] = None
    items: Optional[List[LineItem]] = None
    discount: Optional[Discount] = None
    taxMode: Optional[str] = None
    shipping: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class InvoiceBase(BaseModel):
    clientId: str
    eventId: Optional[str] = None
    dueDate: Optional[str] = None  # ISO date, defaults to issueDate + 7 days
    currency: str = "INR"
    items: List[LineItem]
    discount: Discount = Discount()
    taxMode: str = "EXCLUSIVE"
    shipping: float = 0.0
    notes: Optional[str] = None
    internalNotes: Optional[str] = None

class InvoiceCreate(InvoiceBase):
    pass

class InvoiceUpdate(BaseModel):
    dueDate: Optional[str] = None
    items: Optional[List[LineItem]] = None
    discount: Optional[Discount] = None
    taxMode: Optional[str] = None
    shipping: Optional[float] = None
    notes: Optional[str] = None
    internalNotes: Optional[str] = None
    status: Optional[str] = None
    cancelReason: Optional[str] = None

class PaymentCreate(BaseModel):
    invoiceId: str
    amount: float
    paidAt: str  # ISO datetime
    method: str  # BANK, UPI, CASH, CARD, OTHER
    reference: Optional[str] = None
    idempotencyKey: str = Field(default_factory=lambda: uuid4().hex)

# --- Helper Functions ---
def get_ist_now():
    """Get current time in IST"""
    ist = pytz.timezone('Asia/Kolkata')
    return datetime.now(ist)

def get_utc_now():
    """Get current time in UTC"""
    return datetime.now(timezone.utc)

def calculate_totals(items: List[LineItem], discount: Discount, tax_mode: str, shipping: float = 0.0) -> Totals:
    """Calculate invoice/quote totals"""
    sub_total = sum(item.qty * item.unitPrice for item in items)
    
    # Apply discount
    if discount.mode == "PERCENT":
        discount_total = sub_total * (discount.value / 100)
    else:
        discount_total = min(discount.value, sub_total)
    
    discounted_subtotal = sub_total - discount_total
    
    # Calculate tax
    if tax_mode == "INCLUSIVE":
        # Tax is included in the prices
        tax_total = sum(
            (item.qty * item.unitPrice * item.taxRatePct / (100 + item.taxRatePct))
            for item in items
        )
        grand_total = discounted_subtotal + shipping
    else:
        # Tax is exclusive
        tax_total = sum(
            ((item.qty * item.unitPrice) * (item.taxRatePct / 100))
            for item in items
        )
        # Apply discount to tax calculation
        tax_total = tax_total * (discounted_subtotal / sub_total) if sub_total > 0 else 0
        grand_total = discounted_subtotal + tax_total + shipping
    
    return Totals(
        subTotal=round(sub_total, 2),
        discountTotal=round(discount_total, 2),
        taxTotal=round(tax_total, 2),
        grandTotal=round(grand_total, 2),
        amountDue=round(grand_total, 2)
    )

def generate_number(db, org_id: str, doc_type: str) -> str:
    """Generate sequential document numbers"""
    current_year = get_ist_now().year
    prefix = f"{doc_type}-{current_year}-"
    
    @firestore.transactional
    def update_sequence(transaction, seq_ref):
        seq_doc = transaction.get(seq_ref)
        if seq_doc.exists:
            current_num = seq_doc.to_dict().get('next', 1)
        else:
            current_num = 1
        
        new_num = current_num + 1
        transaction.set(seq_ref, {
            'orgId': org_id,
            'type': doc_type,
            'year': current_year,
            'prefix': prefix,
            'next': new_num
        })
        
        return f"{prefix}{str(current_num).zfill(4)}"
    
    seq_ref = db.collection('organizations', org_id, 'numberSequences').document(f"{doc_type}_{current_year}")
    transaction = db.transaction()
    return update_sequence(transaction, seq_ref)

def is_authorized_for_ar(current_user: dict) -> bool:
    """Check if user has AR access"""
    role = current_user.get("role", "").lower()
    return role in ["admin", "accountant"]

def update_invoice_status(db, org_id: str, invoice_id: str):
    """Update invoice status based on payments"""
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        return
    
    invoice_data = invoice_doc.to_dict()
    grand_total = invoice_data.get('totals', {}).get('grandTotal', 0)
    amount_paid = invoice_data.get('totals', {}).get('amountPaid', 0)
    current_status = invoice_data.get('status', 'DRAFT')
    due_date = invoice_data.get('dueDate')
    
    # Calculate new status
    new_status = current_status
    if amount_paid >= grand_total:
        new_status = "PAID"
    elif amount_paid > 0:
        new_status = "PARTIAL"
    elif current_status == "SENT" and due_date:
        due_dt = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
        if datetime.now(timezone.utc) > due_dt:
            new_status = "OVERDUE"
    
    if new_status != current_status:
        invoice_ref.update({
            'status': new_status,
            'updatedAt': get_utc_now()
        })

# --- Quote Endpoints ---
@router.post("/quotes")
async def create_quote(
    req: QuoteCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new quote"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    
    # Verify client exists
    client_ref = db.collection('organizations', org_id, 'clients').document(req.clientId)
    if not client_ref.get().exists:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Calculate totals
    totals = calculate_totals(req.items, req.discount, req.taxMode, req.shipping)
    
    # Create quote
    quote_data = {
        **req.dict(),
        "orgId": org_id,
        "number": "",  # Will be assigned when sent
        "issueDate": get_utc_now().isoformat(),
        "totals": totals.dict(),
        "status": "DRAFT",
        "createdAt": get_utc_now(),
        "createdBy": current_user.get("uid"),
        "updatedAt": get_utc_now()
    }
    
    quote_ref = db.collection('organizations', org_id, 'quotes').document()
    quote_ref.set(quote_data)
    
    return {"status": "success", "quoteId": quote_ref.id}

@router.put("/quotes/{quote_id}")
async def update_quote(
    quote_id: str,
    req: QuoteUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a quote"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    quote_ref = db.collection('organizations', org_id, 'quotes').document(quote_id)
    quote_doc = quote_ref.get()
    
    if not quote_doc.exists:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    quote_data = quote_doc.to_dict()
    
    # Prevent editing if quote is accepted
    if quote_data.get("status") == "ACCEPTED":
        raise HTTPException(status_code=400, detail="Cannot edit accepted quote")
    
    update_data = {"updatedAt": get_utc_now()}
    
    # Update fields if provided
    for field, value in req.dict(exclude_unset=True).items():
        if field == "status" and value == "SENT" and not quote_data.get("number"):
            # Assign number when sending
            update_data["number"] = generate_number(db, org_id, "QUO")
            update_data["sentAt"] = get_utc_now()
        update_data[field] = value
    
    # Recalculate totals if items changed
    if "items" in update_data:
        items = update_data["items"]
        discount = update_data.get("discount", quote_data.get("discount", {}))
        tax_mode = update_data.get("taxMode", quote_data.get("taxMode", "EXCLUSIVE"))
        shipping = update_data.get("shipping", quote_data.get("shipping", 0))
        
        totals = calculate_totals(items, Discount(**discount), tax_mode, shipping)
        update_data["totals"] = totals.dict()
    
    quote_ref.update(update_data)
    
    return {"status": "success"}

@router.get("/quotes")
async def list_quotes(
    client_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List quotes"""
    org_id = current_user.get("orgId")
    
    db = firestore.client()
    query = db.collection('organizations', org_id, 'quotes')
    
    if client_id:
        query = query.where('clientId', '==', client_id)
    if status:
        query = query.where('status', '==', status)
    
    # Client can only see their own quotes
    user_role = current_user.get("role", "").lower()
    if user_role == "client":
        client_id = current_user.get("uid")  # Assuming client uid matches clientId
        query = query.where('clientId', '==', client_id)
    elif not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    quotes = []
    for doc in query.order_by('createdAt', direction=firestore.Query.DESCENDING).get():
        quote_data = doc.to_dict()
        quote_data['id'] = doc.id
        quotes.append(quote_data)
    
    return quotes

@router.get("/quotes/{quote_id}")
async def get_quote(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get quote details"""
    org_id = current_user.get("orgId")
    
    db = firestore.client()
    quote_ref = db.collection('organizations', org_id, 'quotes').document(quote_id)
    quote_doc = quote_ref.get()
    
    if not quote_doc.exists:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    quote_data = quote_doc.to_dict()
    
    # Check permissions
    user_role = current_user.get("role", "").lower()
    if user_role == "client":
        client_id = current_user.get("uid")
        if quote_data.get("clientId") != client_id:
            raise HTTPException(status_code=403, detail="Not authorized")
    elif not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    quote_data['id'] = quote_id
    return quote_data

@router.post("/quotes/{quote_id}/convert-to-invoice")
async def convert_quote_to_invoice(
    quote_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Convert accepted quote to invoice"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    quote_ref = db.collection('organizations', org_id, 'quotes').document(quote_id)
    quote_doc = quote_ref.get()
    
    if not quote_doc.exists:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    quote_data = quote_doc.to_dict()
    
    if quote_data.get("status") != "ACCEPTED":
        raise HTTPException(status_code=400, detail="Quote must be accepted to convert to invoice")
    
    # Create invoice from quote
    invoice_data = {
        "orgId": org_id,
        "clientId": quote_data["clientId"],
        "eventId": quote_data.get("eventId"),
        "number": "",  # Will be assigned when sent
        "issueDate": get_utc_now().isoformat(),
        "dueDate": (get_utc_now() + timedelta(days=7)).isoformat(),  # Default 7 days
        "currency": quote_data["currency"],
        "items": quote_data["items"],
        "discount": quote_data["discount"],
        "taxMode": quote_data["taxMode"],
        "shipping": quote_data["shipping"],
        "totals": quote_data["totals"],
        "status": "DRAFT",
        "notes": quote_data.get("notes"),
        "createdAt": get_utc_now(),
        "createdBy": current_user.get("uid"),
        "updatedAt": get_utc_now(),
        "quoteId": quote_id
    }
    
    invoice_ref = db.collection('organizations', org_id, 'invoices').document()
    invoice_ref.set(invoice_data)
    
    return {"status": "success", "invoiceId": invoice_ref.id}

# --- Invoice Endpoints ---
@router.post("/invoices")
async def create_invoice(
    req: InvoiceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new invoice"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    
    # Verify client exists
    client_ref = db.collection('organizations', org_id, 'clients').document(req.clientId)
    if not client_ref.get().exists:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Calculate totals
    totals = calculate_totals(req.items, req.discount, req.taxMode, req.shipping)
    
    # Set due date if not provided
    issue_date = get_utc_now()
    due_date = req.dueDate
    if not due_date:
        due_date = (issue_date + timedelta(days=7)).isoformat()
    
    # Create invoice
    invoice_data = {
        **req.dict(),
        "orgId": org_id,
        "number": "",  # Will be assigned when sent
        "issueDate": issue_date.isoformat(),
        "dueDate": due_date,
        "totals": totals.dict(),
        "status": "DRAFT",
        "createdAt": issue_date,
        "createdBy": current_user.get("uid"),
        "updatedAt": issue_date
    }
    
    invoice_ref = db.collection('organizations', org_id, 'invoices').document()
    invoice_ref.set(invoice_data)
    
    return {"status": "success", "invoiceId": invoice_ref.id}

@router.put("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    req: InvoiceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an invoice"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Check if invoice has payments
    payments_query = db.collection('organizations', org_id, 'clientPayments').where('invoiceId', '==', invoice_id).get()
    has_payments = len(payments_query) > 0
    
    # Prevent editing money fields if payments exist
    if has_payments and any(field in req.dict(exclude_unset=True) for field in ['items', 'discount', 'taxMode', 'shipping']):
        raise HTTPException(status_code=400, detail="Cannot edit invoice amounts after payments exist")
    
    update_data = {"updatedAt": get_utc_now()}
    
    # Handle status changes
    for field, value in req.dict(exclude_unset=True).items():
        if field == "status":
            if value == "SENT" and not invoice_data.get("number"):
                # Assign number when sending
                update_data["number"] = generate_number(db, org_id, "INV")
                update_data["sentAt"] = get_utc_now()
            elif value == "CANCELLED":
                if has_payments:
                    raise HTTPException(status_code=400, detail="Cannot cancel invoice with payments")
                if not req.cancelReason:
                    raise HTTPException(status_code=400, detail="Cancel reason required")
                update_data["cancelledAt"] = get_utc_now()
        
        update_data[field] = value
    
    # Recalculate totals if items changed
    if "items" in update_data and not has_payments:
        items = update_data["items"]
        discount = update_data.get("discount", invoice_data.get("discount", {}))
        tax_mode = update_data.get("taxMode", invoice_data.get("taxMode", "EXCLUSIVE"))
        shipping = update_data.get("shipping", invoice_data.get("shipping", 0))
        
        totals = calculate_totals(items, Discount(**discount), tax_mode, shipping)
        update_data["totals"] = totals.dict()
    
    invoice_ref.update(update_data)
    
    return {"status": "success"}

@router.get("/invoices")
async def list_invoices(
    client_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List invoices"""
    org_id = current_user.get("orgId")
    
    db = firestore.client()
    query = db.collection('organizations', org_id, 'invoices')
    
    if client_id:
        query = query.where('clientId', '==', client_id)
    if status:
        query = query.where('status', '==', status)
    
    # Client can only see their own invoices
    user_role = current_user.get("role", "").lower()
    if user_role == "client":
        client_id = current_user.get("uid")
        query = query.where('clientId', '==', client_id)
    elif not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    invoices = []
    for doc in query.order_by('createdAt', direction=firestore.Query.DESCENDING).get():
        invoice_data = doc.to_dict()
        invoice_data['id'] = doc.id
        invoices.append(invoice_data)
    
    return invoices

@router.get("/invoices/{invoice_id}")
async def get_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get invoice details"""
    org_id = current_user.get("orgId")
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Check permissions
    user_role = current_user.get("role", "").lower()
    if user_role == "client":
        client_id = current_user.get("uid")
        if invoice_data.get("clientId") != client_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        # Hide draft invoices from clients
        if invoice_data.get("status") == "DRAFT":
            raise HTTPException(status_code=404, detail="Invoice not found")
    elif not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    invoice_data['id'] = invoice_id
    return invoice_data

# --- Payment Endpoints ---
@router.post("/payments")
async def create_payment(
    req: PaymentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Record a payment from client"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    
    # Check for existing payment with same idempotency key
    existing_payment = db.collection('organizations', org_id, 'clientPayments').where(
        'idempotencyKey', '==', req.idempotencyKey
    ).limit(1).get()
    
    if len(existing_payment) > 0:
        # Return existing payment
        payment_data = existing_payment[0].to_dict()
        payment_data['id'] = existing_payment[0].id
        return {"status": "success", "paymentId": payment_data['id'], "message": "Payment already exists"}
    
    # Get invoice
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(req.invoiceId)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    amount_due = invoice_data.get('totals', {}).get('amountDue', 0)
    
    # Validate payment amount
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")
    
    if req.amount > amount_due:
        raise HTTPException(status_code=400, detail="Payment amount exceeds amount due")
    
    # Create payment
    payment_data = {
        **req.dict(),
        "orgId": org_id,
        "clientId": invoice_data["clientId"],
        "appliedAmount": req.amount,
        "currency": invoice_data["currency"],
        "createdAt": get_utc_now(),
        "createdBy": current_user.get("uid")
    }
    
    payment_ref = db.collection('organizations', org_id, 'clientPayments').document()
    payment_ref.set(payment_data)
    
    # Update invoice totals
    new_amount_paid = invoice_data.get('totals', {}).get('amountPaid', 0) + req.amount
    new_amount_due = amount_due - req.amount
    
    invoice_ref.update({
        'totals.amountPaid': new_amount_paid,
        'totals.amountDue': new_amount_due,
        'updatedAt': get_utc_now()
    })
    
    # Update invoice status
    update_invoice_status(db, org_id, req.invoiceId)
    
    return {"status": "success", "paymentId": payment_ref.id}

@router.get("/payments")
async def list_payments(
    client_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List payments"""
    org_id = current_user.get("orgId")
    
    db = firestore.client()
    query = db.collection('organizations', org_id, 'clientPayments')
    
    if client_id:
        query = query.where('clientId', '==', client_id)
    if invoice_id:
        query = query.where('invoiceId', '==', invoice_id)
    
    # Client can only see their own payments
    user_role = current_user.get("role", "").lower()
    if user_role == "client":
        client_id = current_user.get("uid")
        query = query.where('clientId', '==', client_id)
    elif not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    payments = []
    for doc in query.order_by('createdAt', direction=firestore.Query.DESCENDING).get():
        payment_data = doc.to_dict()
        payment_data['id'] = doc.id
        payments.append(payment_data)
    
    return payments

# --- Dashboard & Reports ---
@router.get("/dashboard")
async def get_ar_dashboard(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get AR dashboard data"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    
    # Default to current month if no dates provided
    if not start_date or not end_date:
        now = get_ist_now()
        start_date = now.replace(day=1).isoformat()
        end_date = now.isoformat()
    
    # Get invoices for the period
    invoices_query = db.collection('organizations', org_id, 'invoices').where(
        'issueDate', '>=', start_date
    ).where('issueDate', '<=', end_date).get()
    
    total_invoiced = 0
    total_collected = 0
    amount_due = 0
    overdue_amount = 0
    
    aging_buckets = {
        "0-15": 0,
        "16-30": 0,
        "31-60": 0,
        "61-90": 0,
        "90+": 0
    }
    
    now = get_utc_now()
    
    for invoice_doc in invoices_query:
        invoice_data = invoice_doc.to_dict()
        totals = invoice_data.get('totals', {})
        
        total_invoiced += totals.get('grandTotal', 0)
        total_collected += totals.get('amountPaid', 0)
        
        invoice_amount_due = totals.get('amountDue', 0)
        amount_due += invoice_amount_due
        
        # Calculate aging
        if invoice_data.get('status') in ['SENT', 'PARTIAL', 'OVERDUE'] and invoice_amount_due > 0:
            due_date = invoice_data.get('dueDate')
            if due_date:
                due_dt = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
                days_overdue = (now - due_dt).days
                
                if days_overdue > 0:
                    overdue_amount += invoice_amount_due
                    
                    if days_overdue <= 15:
                        aging_buckets["0-15"] += invoice_amount_due
                    elif days_overdue <= 30:
                        aging_buckets["16-30"] += invoice_amount_due
                    elif days_overdue <= 60:
                        aging_buckets["31-60"] += invoice_amount_due
                    elif days_overdue <= 90:
                        aging_buckets["61-90"] += invoice_amount_due
                    else:
                        aging_buckets["90+"] += invoice_amount_due
    
    return {
        "period": {"startDate": start_date, "endDate": end_date},
        "kpis": {
            "totalInvoiced": round(total_invoiced, 2),
            "totalCollected": round(total_collected, 2),
            "amountDue": round(amount_due, 2),
            "overdueAmount": round(overdue_amount, 2)
        },
        "agingBuckets": {k: round(v, 2) for k, v in aging_buckets.items()}
    }

@router.get("/reports/aging")
async def get_aging_report(
    current_user: dict = Depends(get_current_user)
):
    """Get detailed aging report"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    
    # Get all unpaid/partially paid invoices
    invoices_query = db.collection('organizations', org_id, 'invoices').where(
        'status', 'in', ['SENT', 'PARTIAL', 'OVERDUE']
    ).get()
    
    aging_details = []
    now = get_utc_now()
    
    for invoice_doc in invoices_query:
        invoice_data = invoice_doc.to_dict()
        totals = invoice_data.get('totals', {})
        amount_due = totals.get('amountDue', 0)
        
        if amount_due > 0:
            due_date = invoice_data.get('dueDate')
            days_overdue = 0
            
            if due_date:
                due_dt = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
                days_overdue = max(0, (now - due_dt).days)
            
            aging_details.append({
                "invoiceId": invoice_doc.id,
                "invoiceNumber": invoice_data.get('number', ''),
                "clientId": invoice_data.get('clientId'),
                "issueDate": invoice_data.get('issueDate'),
                "dueDate": invoice_data.get('dueDate'),
                "grandTotal": totals.get('grandTotal', 0),
                "amountPaid": totals.get('amountPaid', 0),
                "amountDue": amount_due,
                "daysOverdue": days_overdue,
                "status": invoice_data.get('status')
            })
    
    # Sort by days overdue (highest first)
    aging_details.sort(key=lambda x: x['daysOverdue'], reverse=True)
    
    return aging_details

# --- Utility Endpoints ---
@router.post("/invoices/{invoice_id}/mark-overdue")
async def mark_invoices_overdue(
    current_user: dict = Depends(get_current_user)
):
    """Mark overdue invoices (usually called by a scheduled job)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ar(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    now = get_utc_now()
    
    # Get invoices that should be marked overdue
    invoices_query = db.collection('organizations', org_id, 'invoices').where(
        'status', 'in', ['SENT', 'PARTIAL']
    ).where('dueDate', '<', now.isoformat()).get()
    
    marked_count = 0
    
    for invoice_doc in invoices_query:
        invoice_data = invoice_doc.to_dict()
        amount_due = invoice_data.get('totals', {}).get('amountDue', 0)
        
        if amount_due > 0:
            invoice_doc.reference.update({
                'status': 'OVERDUE',
                'updatedAt': now
            })
            marked_count += 1
    
    return {"status": "success", "markedOverdue": marked_count}


# --- PDF Generation Endpoints ---

@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: str,
    user_data: dict = Depends(get_current_user)
):
    """Generate and download invoice PDF"""
    org_id = user_data.get('org_id')
    user_role = user_data.get('role', 'user')
    
    # Check permissions
    if user_role not in ['admin', 'accountant', 'manager']:
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    
    try:
        # Get invoice
        invoice_doc = db.collection('organizations', org_id, 'invoices').document(invoice_id).get()
        if not invoice_doc.exists:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        invoice_data = invoice_doc.to_dict()
        
        # Get client data
        client_id = invoice_data.get('clientId')
        client_doc = db.collection('organizations', org_id, 'clients').document(client_id).get()
        client_data = client_doc.to_dict() if client_doc.exists else {}
        
        # Get organization data
        org_doc = db.collection('organizations').document(org_id).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}
        
        # Generate PDF
        pdf_generator = PDFGenerator()
        pdf_buffer = pdf_generator.generate_invoice_pdf(invoice_data, client_data, org_data)
        
        # Return PDF response
        pdf_buffer.seek(0)
        filename = f"Invoice-{invoice_data.get('number', invoice_id)}.pdf"
        
        return Response(
            content=pdf_buffer.read(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")


@router.get("/quotes/{quote_id}/pdf")
async def get_quote_pdf(
    quote_id: str,
    user_data: dict = Depends(get_current_user)
):
    """Generate and download quote PDF"""
    org_id = user_data.get('org_id')
    user_role = user_data.get('role', 'user')
    
    # Check permissions
    if user_role not in ['admin', 'accountant', 'manager']:
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    
    try:
        # Get quote
        quote_doc = db.collection('organizations', org_id, 'quotes').document(quote_id).get()
        if not quote_doc.exists:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        quote_data = quote_doc.to_dict()
        
        # Get client data
        client_id = quote_data.get('clientId')
        client_doc = db.collection('organizations', org_id, 'clients').document(client_id).get()
        client_data = client_doc.to_dict() if client_doc.exists else {}
        
        # Get organization data
        org_doc = db.collection('organizations').document(org_id).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}
        
        # Generate PDF
        pdf_generator = PDFGenerator()
        pdf_buffer = pdf_generator.generate_quote_pdf(quote_data, client_data, org_data)
        
        # Return PDF response
        pdf_buffer.seek(0)
        filename = f"Quote-{quote_data.get('number', quote_id)}.pdf"
        
        return Response(
            content=pdf_buffer.read(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")


# --- Email Endpoints ---

@router.post("/invoices/{invoice_id}/send")
async def send_invoice_email(
    invoice_id: str,
    user_data: dict = Depends(get_current_user)
):
    """Send invoice via email"""
    org_id = user_data.get('org_id')
    user_role = user_data.get('role', 'user')
    
    # Check permissions
    if user_role not in ['admin', 'accountant', 'manager']:
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    
    try:
        # Get invoice
        invoice_doc = db.collection('organizations', org_id, 'invoices').document(invoice_id).get()
        if not invoice_doc.exists:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        invoice_data = invoice_doc.to_dict()
        
        # Get client data
        client_id = invoice_data.get('clientId')
        client_doc = db.collection('organizations', org_id, 'clients').document(client_id).get()
        if not client_doc.exists:
            raise HTTPException(status_code=404, detail="Client not found")
        
        client_data = client_doc.to_dict()
        
        # Get organization data
        org_doc = db.collection('organizations').document(org_id).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}
        
        # Generate PDF
        pdf_generator = PDFGenerator()
        pdf_buffer = pdf_generator.generate_invoice_pdf(invoice_data, client_data, org_data)
        
        # Send email
        email_sent = email_service.send_invoice_email(invoice_data, client_data, pdf_buffer, org_data)
        
        if email_sent:
            # Update invoice status to SENT if it was DRAFT
            now = get_utc_now()
            if invoice_data.get('status') == 'DRAFT':
                invoice_doc.reference.update({
                    'status': 'SENT',
                    'sentAt': now,
                    'updatedAt': now
                })
            
            # Log email activity
            activity_data = {
                'id': str(uuid4()),
                'type': 'email_sent',
                'description': f"Invoice {invoice_data.get('number')} sent to {client_data.get('profile', {}).get('email')}",
                'timestamp': now,
                'userId': user_data.get('uid'),
                'userName': user_data.get('displayName', 'Unknown')
            }
            
            db.collection('organizations', org_id, 'invoices', invoice_id, 'activities').add(activity_data)
            
            return {"status": "success", "message": "Invoice sent successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send email")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending invoice: {str(e)}")


@router.post("/quotes/{quote_id}/send")
async def send_quote_email(
    quote_id: str,
    user_data: dict = Depends(get_current_user)
):
    """Send quote via email"""
    org_id = user_data.get('org_id')
    user_role = user_data.get('role', 'user')
    
    # Check permissions
    if user_role not in ['admin', 'accountant', 'manager']:
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    
    try:
        # Get quote
        quote_doc = db.collection('organizations', org_id, 'quotes').document(quote_id).get()
        if not quote_doc.exists:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        quote_data = quote_doc.to_dict()
        
        # Get client data
        client_id = quote_data.get('clientId')
        client_doc = db.collection('organizations', org_id, 'clients').document(client_id).get()
        if not client_doc.exists:
            raise HTTPException(status_code=404, detail="Client not found")
        
        client_data = client_doc.to_dict()
        
        # Get organization data
        org_doc = db.collection('organizations').document(org_id).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}
        
        # Generate PDF
        pdf_generator = PDFGenerator()
        pdf_buffer = pdf_generator.generate_quote_pdf(quote_data, client_data, org_data)
        
        # Send email
        email_sent = email_service.send_quote_email(quote_data, client_data, pdf_buffer, org_data)
        
        if email_sent:
            # Update quote status to SENT if it was DRAFT
            now = get_utc_now()
            if quote_data.get('status') == 'DRAFT':
                quote_doc.reference.update({
                    'status': 'SENT',
                    'sentAt': now,
                    'updatedAt': now
                })
            
            # Log email activity
            activity_data = {
                'id': str(uuid4()),
                'type': 'email_sent',
                'description': f"Quote {quote_data.get('number')} sent to {client_data.get('profile', {}).get('email')}",
                'timestamp': now,
                'userId': user_data.get('uid'),
                'userName': user_data.get('displayName', 'Unknown')
            }
            
            db.collection('organizations', org_id, 'quotes', quote_id, 'activities').add(activity_data)
            
            return {"status": "success", "message": "Quote sent successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send email")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending quote: {str(e)}")


@router.post("/invoices/{invoice_id}/reminder")
async def send_payment_reminder(
    invoice_id: str,
    reminder_type: str = Query("due_soon", pattern="^(due_soon|overdue_1|overdue_7)$"),
    user_data: dict = Depends(get_current_user)
):
    """Send payment reminder email"""
    org_id = user_data.get('org_id')
    user_role = user_data.get('role', 'user')
    
    # Check permissions
    if user_role not in ['admin', 'accountant', 'manager']:
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    
    try:
        # Get invoice
        invoice_doc = db.collection('organizations', org_id, 'invoices').document(invoice_id).get()
        if not invoice_doc.exists:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        invoice_data = invoice_doc.to_dict()
        
        # Check if invoice has amount due
        amount_due = invoice_data.get('totals', {}).get('amountDue', 0)
        if amount_due <= 0:
            raise HTTPException(status_code=400, detail="Invoice is fully paid")
        
        # Get client data
        client_id = invoice_data.get('clientId')
        client_doc = db.collection('organizations', org_id, 'clients').document(client_id).get()
        if not client_doc.exists:
            raise HTTPException(status_code=404, detail="Client not found")
        
        client_data = client_doc.to_dict()
        
        # Get organization data
        org_doc = db.collection('organizations').document(org_id).get()
        org_data = org_doc.to_dict() if org_doc.exists else {}
        
        # Send reminder email
        email_sent = email_service.send_payment_reminder(invoice_data, client_data, reminder_type, org_data)
        
        if email_sent:
            # Log reminder activity
            now = get_utc_now()
            activity_data = {
                'id': str(uuid4()),
                'type': 'reminder_sent',
                'description': f"Payment reminder ({reminder_type}) sent for invoice {invoice_data.get('number')}",
                'timestamp': now,
                'userId': user_data.get('uid'),
                'userName': user_data.get('displayName', 'Unknown')
            }
            
            db.collection('organizations', org_id, 'invoices', invoice_id, 'activities').add(activity_data)
            
            return {"status": "success", "message": "Reminder sent successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to send reminder")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending reminder: {str(e)}")


# --- Bulk Operations ---

@router.post("/bulk/send-reminders")
async def send_bulk_reminders(
    user_data: dict = Depends(get_current_user)
):
    """Send automated payment reminders based on due dates"""
    org_id = user_data.get('org_id')
    user_role = user_data.get('role', 'user')
    
    # Check permissions
    if user_role not in ['admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Not authorized for bulk operations")
    
    db = firestore.client()
    now = get_utc_now()
    
    # Calculate dates for different reminder types
    due_soon_date = now + timedelta(days=3)  # Due in 3 days
    overdue_1_date = now - timedelta(days=1)  # 1 day overdue
    overdue_7_date = now - timedelta(days=7)  # 7 days overdue
    
    reminder_counts = {
        'due_soon': 0,
        'overdue_1': 0,
        'overdue_7': 0,
        'errors': []
    }
    
    try:
        # Get invoices for each reminder type
        reminder_queries = [
            ('due_soon', db.collection('organizations', org_id, 'invoices')
             .where('status', 'in', ['SENT', 'PARTIAL'])
             .where('dueDate', '<=', due_soon_date.isoformat())
             .where('dueDate', '>', now.isoformat())),
            ('overdue_1', db.collection('organizations', org_id, 'invoices')
             .where('status', 'in', ['SENT', 'PARTIAL', 'OVERDUE'])
             .where('dueDate', '<=', overdue_1_date.isoformat())
             .where('dueDate', '>', overdue_7_date.isoformat())),
            ('overdue_7', db.collection('organizations', org_id, 'invoices')
             .where('status', 'in', ['SENT', 'PARTIAL', 'OVERDUE'])
             .where('dueDate', '<=', overdue_7_date.isoformat()))
        ]
        
        for reminder_type, query in reminder_queries:
            invoices = query.get()
            
            for invoice_doc in invoices:
                try:
                    invoice_data = invoice_doc.to_dict()
                    amount_due = invoice_data.get('totals', {}).get('amountDue', 0)
                    
                    if amount_due <= 0:
                        continue
                    
                    # Get client data
                    client_id = invoice_data.get('clientId')
                    client_doc = db.collection('organizations', org_id, 'clients').document(client_id).get()
                    
                    if not client_doc.exists:
                        continue
                    
                    client_data = client_doc.to_dict()
                    
                    # Check if reminder already sent today
                    activities = db.collection('organizations', org_id, 'invoices', invoice_doc.id, 'activities')\
                        .where('type', '==', 'reminder_sent')\
                        .where('timestamp', '>=', now.replace(hour=0, minute=0, second=0, microsecond=0))\
                        .get()
                    
                    if len(activities) > 0:
                        continue  # Already sent reminder today
                    
                    # Get organization data
                    org_doc = db.collection('organizations').document(org_id).get()
                    org_data = org_doc.to_dict() if org_doc.exists else {}
                    
                    # Send reminder
                    email_sent = email_service.send_payment_reminder(invoice_data, client_data, reminder_type, org_data)
                    
                    if email_sent:
                        # Log activity
                        activity_data = {
                            'id': str(uuid4()),
                            'type': 'reminder_sent',
                            'description': f"Automated payment reminder ({reminder_type}) sent",
                            'timestamp': now,
                            'userId': user_data.get('uid'),
                            'userName': 'System (Automated)'
                        }
                        
                        db.collection('organizations', org_id, 'invoices', invoice_doc.id, 'activities').add(activity_data)
                        reminder_counts[reminder_type] += 1
                    
                except Exception as e:
                    reminder_counts['errors'].append(f"Invoice {invoice_doc.id}: {str(e)}")
        
        return {"status": "success", "reminderCounts": reminder_counts}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending bulk reminders: {str(e)}")

@router.post("/quotes/{quote_id}/convert")
async def convert_quote_to_invoice(
    quote_id: str,
    user_data: dict = Depends(get_current_user)
):
    """Convert quote to invoice"""
    org_id = user_data.get('org_id')
    user_role = user_data.get('role', 'user')
    
    # Check permissions
    if user_role not in ['admin', 'accountant', 'manager']:
        raise HTTPException(status_code=403, detail="Not authorized for AR operations")
    
    db = firestore.client()
    
    try:
        # Get quote
        quote_doc = db.collection('organizations', org_id, 'quotes').document(quote_id).get()
        if not quote_doc.exists:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        quote_data = quote_doc.to_dict()
        
        # Check if quote is already converted
        if quote_data.get('status') == 'CONVERTED':
            raise HTTPException(status_code=400, detail="Quote already converted to invoice")
        
        # Check if quote is valid
        valid_until = datetime.fromisoformat(quote_data.get('validUntil').replace('Z', '+00:00'))
        if valid_until < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Quote has expired")
        
        now = get_utc_now()
        
        # Generate invoice number
        invoice_counter_doc = db.collection('organizations', org_id, 'counters').document('invoice').get()
        if invoice_counter_doc.exists:
            counter_data = invoice_counter_doc.to_dict()
            next_number = counter_data.get('lastNumber', 0) + 1
        else:
            next_number = 1
        
        invoice_number = f"INV-{next_number:04d}"
        
        # Create invoice from quote
        invoice_data = {
            'id': str(uuid4()),
            'number': invoice_number,
            'clientId': quote_data.get('clientId'),
            'eventId': quote_data.get('eventId'),
            'issueDate': now,
            'dueDate': (now + timedelta(days=7)).isoformat(),  # 7 days from now
            'currency': quote_data.get('currency', 'INR'),
            'items': quote_data.get('items', []),
            'discount': quote_data.get('discount', {'mode': 'AMOUNT', 'value': 0}),
            'taxMode': quote_data.get('taxMode', 'EXCLUSIVE'),
            'shipping': quote_data.get('shipping', 0),
            'notes': quote_data.get('notes', ''),
            'internalNotes': f"Converted from Quote {quote_data.get('number', quote_id)}",
            'totals': quote_data.get('totals', {}),
            'status': 'DRAFT',
            'createdAt': now,
            'updatedAt': now,
            'convertedFromQuote': quote_id,
            'createdBy': user_data.get('uid'),
            'orgId': org_id
        }
        
        # Save invoice
        invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_data['id'])
        invoice_ref.set(invoice_data)
        
        # Update counter
        invoice_counter_doc.reference.set({'lastNumber': next_number})
        
        # Update quote status
        quote_doc.reference.update({
            'status': 'CONVERTED',
            'convertedAt': now,
            'convertedToInvoice': invoice_data['id'],
            'updatedAt': now
        })
        
        # Log conversion activity on quote
        activity_data = {
            'id': str(uuid4()),
            'type': 'converted',
            'description': f"Quote converted to Invoice {invoice_number}",
            'timestamp': now,
            'userId': user_data.get('uid'),
            'userName': user_data.get('displayName', 'Unknown')
        }
        
        db.collection('organizations', org_id, 'quotes', quote_id, 'activities').add(activity_data)
        
        # Log creation activity on invoice
        invoice_activity_data = {
            'id': str(uuid4()),
            'type': 'created',
            'description': f"Invoice created from Quote {quote_data.get('number', quote_id)}",
            'timestamp': now,
            'userId': user_data.get('uid'),
            'userName': user_data.get('displayName', 'Unknown')
        }
        
        db.collection('organizations', org_id, 'invoices', invoice_data['id'], 'activities').add(invoice_activity_data)
        
        return {
            "status": "success", 
            "message": "Quote converted to invoice successfully",
            "invoiceId": invoice_data['id'],
            "invoiceNumber": invoice_number
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error converting quote: {str(e)}")
