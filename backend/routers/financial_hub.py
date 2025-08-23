from fastapi import APIRouter, Depends, HTTPException, Query, Response
from firebase_admin import firestore
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import pytz
import math

from ..dependencies import get_current_user
from ..utils.pdf_generator import PDFGenerator
from ..utils.email_service import email_service

router = APIRouter(
    tags=["Financial Hub"],
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

class InvoiceBase(BaseModel):
    type: str  # BUDGET or FINAL
    clientId: str
    eventId: Optional[str] = None
    dueDate: Optional[str] = None  # ISO date, for FINAL only
    currency: str = "INR"
    items: List[LineItem]
    discount: Discount = Discount()
    taxMode: str = "EXCLUSIVE"  # EXCLUSIVE or INCLUSIVE
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

class InvoiceReplyCreate(BaseModel):
    message: str

# --- Helper Functions ---
def get_ist_now():
    """Get current time in IST"""
    ist = pytz.timezone('Asia/Kolkata')
    return datetime.now(ist)

def get_utc_now():
    """Get current time in UTC"""
    return datetime.now(timezone.utc)

def round_half_up(value: float, decimals: int = 2) -> float:
    """Round half up to specified decimal places"""
    multiplier = 10 ** decimals
    return math.floor(value * multiplier + 0.5) / multiplier

def calculate_totals(items: List[LineItem], discount: Discount, tax_mode: str, shipping: float = 0.0) -> Totals:
    """Calculate invoice totals with proper rounding"""
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
        subTotal=round_half_up(sub_total),
        discountTotal=round_half_up(discount_total),
        taxTotal=round_half_up(tax_total),
        grandTotal=round_half_up(grand_total),
        amountDue=round_half_up(grand_total)
    )

def generate_invoice_number(db, org_id: str, invoice_type: str) -> str:
    """Generate sequential invoice numbers"""
    current_year = get_ist_now().year
    prefix = f"INV-{current_year}-"
    
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
            'year': current_year,
            'prefix': prefix,
            'next': new_num
        })
        
        return f"{prefix}{str(current_num).zfill(4)}"
    
    seq_ref = db.collection('organizations', org_id, 'numberSequences').document(f"INV_{current_year}")
    transaction = db.transaction()
    return update_sequence(transaction, seq_ref)

def is_authorized_for_financial_hub(current_user: dict) -> bool:
    """Check if user has Financial Hub access"""
    role = current_user.get("role", "").lower()
    return role in ["admin", "accountant"]

def get_default_net_days(db, org_id: str) -> int:
    """Get organization's default net payment days"""
    try:
        org_doc = db.collection('organizations').document(org_id).get()
        if org_doc.exists:
            return org_doc.to_dict().get('defaultNetDays', 7)
    except:
        pass
    return 7  # Default to Net-7

def update_invoice_status(db, org_id: str, invoice_id: str):
    """Update invoice status based on payments and due date"""
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        return
    
    invoice_data = invoice_doc.to_dict()
    invoice_type = invoice_data.get('type', 'FINAL')
    
    # BUDGET invoices don't participate in payment status logic
    if invoice_type == 'BUDGET':
        return
    
    grand_total = invoice_data.get('totals', {}).get('grandTotal', 0)
    amount_paid = invoice_data.get('totals', {}).get('amountPaid', 0)
    current_status = invoice_data.get('status', 'DRAFT')
    due_date = invoice_data.get('dueDate')
    
    # Calculate new status for FINAL invoices
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

# --- Overview Dashboard ---
@router.get("/overview")
async def get_financial_overview(
    period: str = Query("month", regex="^(day|week|month|quarter|year|custom)$"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get Financial Hub overview with KPIs and charts"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    now = get_ist_now()
    
    # Calculate date range based on period
    if period == "custom" and start_date and end_date:
        start_dt = datetime.fromisoformat(start_date)
        end_dt = datetime.fromisoformat(end_date)
    elif period == "day":
        start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = now
    elif period == "week":
        start_dt = now - timedelta(days=now.weekday())
        end_dt = now
    elif period == "quarter":
        quarter = (now.month - 1) // 3 + 1
        start_dt = now.replace(month=(quarter - 1) * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_dt = now
    elif period == "year":
        start_dt = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_dt = now
    else:  # month
        start_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_dt = now
    
    # Get FINAL invoices for the period (BUDGET doesn't count in financial metrics)
    invoices_query = db.collection('organizations', org_id, 'invoices').where(
        'type', '==', 'FINAL'
    ).where(
        'issueDate', '>=', start_dt.isoformat()
    ).where(
        'issueDate', '<=', end_dt.isoformat()
    ).get()
    
    total_invoiced = 0
    total_collected = 0
    outstanding = 0
    overdue_amount = 0
    
    aging_buckets = {
        "0-15": 0,
        "16-30": 0,
        "31-60": 0,
        "61-90": 0,
        "90+": 0
    }
    
    upcoming_due = []
    utc_now = get_utc_now()
    
    for invoice_doc in invoices_query:
        invoice_data = invoice_doc.to_dict()
        totals = invoice_data.get('totals', {})
        status = invoice_data.get('status', 'DRAFT')
        
        # Only count SENT invoices in financial metrics
        if status in ['SENT', 'PARTIAL', 'PAID', 'OVERDUE']:
            total_invoiced += totals.get('grandTotal', 0)
            total_collected += totals.get('amountPaid', 0)
            
            invoice_amount_due = totals.get('amountDue', 0)
            outstanding += invoice_amount_due
            
            # Calculate aging for unpaid amounts
            if invoice_amount_due > 0 and invoice_data.get('dueDate'):
                due_date = datetime.fromisoformat(invoice_data.get('dueDate').replace('Z', '+00:00'))
                days_past_due = (utc_now - due_date).days
                
                if days_past_due > 0:
                    overdue_amount += invoice_amount_due
                    
                    if days_past_due <= 15:
                        aging_buckets["0-15"] += invoice_amount_due
                    elif days_past_due <= 30:
                        aging_buckets["16-30"] += invoice_amount_due
                    elif days_past_due <= 60:
                        aging_buckets["31-60"] += invoice_amount_due
                    elif days_past_due <= 90:
                        aging_buckets["61-90"] += invoice_amount_due
                    else:
                        aging_buckets["90+"] += invoice_amount_due
                
                # Upcoming due (next 7 days)
                elif days_past_due > -8 and days_past_due <= 0:
                    upcoming_due.append({
                        "invoiceId": invoice_doc.id,
                        "number": invoice_data.get('number', ''),
                        "clientId": invoice_data.get('clientId'),
                        "dueDate": invoice_data.get('dueDate'),
                        "amountDue": invoice_amount_due,
                        "daysTillDue": abs(days_past_due)
                    })
    
    # Get monthly trend (last 12 months)
    monthly_trend = []
    for i in range(11, -1, -1):
        month_start = (now.replace(day=1) - timedelta(days=32*i)).replace(day=1)
        month_end = (month_start.replace(month=month_start.month % 12 + 1) if month_start.month != 12 
                    else month_start.replace(year=month_start.year + 1, month=1)) - timedelta(days=1)
        
        month_invoices = db.collection('organizations', org_id, 'invoices').where(
            'type', '==', 'FINAL'
        ).where(
            'issueDate', '>=', month_start.isoformat()
        ).where(
            'issueDate', '<=', month_end.isoformat()
        ).get()
        
        month_invoiced = sum(
            doc.to_dict().get('totals', {}).get('grandTotal', 0) 
            for doc in month_invoices 
            if doc.to_dict().get('status') in ['SENT', 'PARTIAL', 'PAID', 'OVERDUE']
        )
        
        month_collected = sum(
            doc.to_dict().get('totals', {}).get('amountPaid', 0) 
            for doc in month_invoices
            if doc.to_dict().get('status') in ['SENT', 'PARTIAL', 'PAID', 'OVERDUE']
        )
        
        monthly_trend.append({
            "month": month_start.strftime("%Y-%m"),
            "invoiced": round_half_up(month_invoiced),
            "collected": round_half_up(month_collected)
        })
    
    return {
        "period": {
            "type": period,
            "startDate": start_dt.isoformat(),
            "endDate": end_dt.isoformat()
        },
        "kpis": {
            "totalInvoiced": round_half_up(total_invoiced),
            "totalCollected": round_half_up(total_collected),
            "outstanding": round_half_up(outstanding),
            "overdueAmount": round_half_up(overdue_amount)
        },
        "agingBuckets": {k: round_half_up(v) for k, v in aging_buckets.items()},
        "upcomingDue": sorted(upcoming_due, key=lambda x: x['daysTillDue']),
        "monthlyTrend": monthly_trend
    }

# --- Invoice Management ---
@router.post("/invoices")
async def create_invoice(
    req: InvoiceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new invoice (BUDGET or FINAL)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    # Validate invoice type
    if req.type not in ["BUDGET", "FINAL"]:
        raise HTTPException(status_code=400, detail="Invoice type must be BUDGET or FINAL")
    
    # Validate items
    if not req.items or len(req.items) == 0:
        raise HTTPException(status_code=400, detail="Invoice must have at least one item")
    
    db = firestore.client()
    
    # Verify client exists
    client_ref = db.collection('organizations', org_id, 'clients').document(req.clientId)
    if not client_ref.get().exists:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Calculate totals
    totals = calculate_totals(req.items, req.discount, req.taxMode, req.shipping)
    
    # Validate grand total
    if totals.grandTotal <= 0:
        raise HTTPException(status_code=400, detail="Invoice grand total must be positive")
    
    # Set due date for FINAL invoices if not provided
    issue_date = get_utc_now()
    due_date = req.dueDate
    if req.type == "FINAL" and not due_date:
        default_net_days = get_default_net_days(db, org_id)
        due_date = (issue_date + timedelta(days=default_net_days)).isoformat()
    
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

@router.get("/invoices")
async def list_invoices(
    type: Optional[str] = Query(None, regex="^(BUDGET|FINAL)$"),
    status: Optional[str] = Query(None, regex="^(DRAFT|SENT|PARTIAL|PAID|OVERDUE|CANCELLED)$"),
    client_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List invoices with filtering"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role", "").lower()
    
    db = firestore.client()
    query = db.collection('organizations', org_id, 'invoices')
    
    # Apply filters
    if type:
        query = query.where('type', '==', type)
    if status:
        query = query.where('status', '==', status)
    if client_id:
        query = query.where('clientId', '==', client_id)
    
    # Client can only see their own SENT invoices
    if user_role == "client":
        client_id = current_user.get("uid")
        query = query.where('clientId', '==', client_id).where('status', '!=', 'DRAFT')
    elif not is_authorized_for_financial_hub(current_user):
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
    user_role = current_user.get("role", "").lower()
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Check permissions
    if user_role == "client":
        client_id = current_user.get("uid")
        if invoice_data.get("clientId") != client_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        # Hide draft invoices from clients
        if invoice_data.get("status") == "DRAFT":
            raise HTTPException(status_code=404, detail="Invoice not found")
    elif not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    invoice_data['id'] = invoice_id
    return invoice_data

@router.put("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    req: InvoiceUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an invoice"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    invoice_type = invoice_data.get('type', 'FINAL')
    
    # Check if invoice has payments (FINAL only)
    has_payments = False
    if invoice_type == "FINAL":
        payments_query = db.collection('organizations', org_id, 'payments').where('invoiceId', '==', invoice_id).get()
        has_payments = len(payments_query) > 0
    
    # Prevent editing money fields if payments exist
    money_fields = ['items', 'discount', 'taxMode', 'shipping']
    if has_payments and any(field in req.dict(exclude_unset=True) for field in money_fields):
        raise HTTPException(status_code=400, detail="Cannot edit invoice amounts after payments exist")
    
    update_data = {"updatedAt": get_utc_now()}
    
    # Handle status changes
    for field, value in req.dict(exclude_unset=True).items():
        if field == "status":
            if value == "SENT" and not invoice_data.get("number"):
                # Assign number when sending
                update_data["number"] = generate_invoice_number(db, org_id, invoice_type)
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
        
        # Validate grand total
        if totals.grandTotal <= 0:
            raise HTTPException(status_code=400, detail="Invoice grand total must be positive")
        
        update_data["totals"] = totals.dict()
    
    invoice_ref.update(update_data)
    
    return {"status": "success"}

@router.post("/invoices/{budget_invoice_id}/convert-to-final")
async def convert_budget_to_final(
    budget_invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Convert BUDGET invoice to FINAL"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    budget_ref = db.collection('organizations', org_id, 'invoices').document(budget_invoice_id)
    budget_doc = budget_ref.get()
    
    if not budget_doc.exists:
        raise HTTPException(status_code=404, detail="Budget invoice not found")
    
    budget_data = budget_doc.to_dict()
    
    if budget_data.get("type") != "BUDGET":
        raise HTTPException(status_code=400, detail="Can only convert BUDGET invoices")
    
    if budget_data.get("status") != "SENT":
        raise HTTPException(status_code=400, detail="Budget invoice must be sent to convert")
    
    # Create FINAL invoice from BUDGET
    issue_date = get_utc_now()
    default_net_days = get_default_net_days(db, org_id)
    due_date = (issue_date + timedelta(days=default_net_days)).isoformat()
    
    final_invoice_data = {
        "type": "FINAL",
        "orgId": org_id,
        "clientId": budget_data["clientId"],
        "eventId": budget_data.get("eventId"),
        "number": "",  # Will be assigned when sent
        "issueDate": issue_date.isoformat(),
        "dueDate": due_date,
        "currency": budget_data["currency"],
        "items": budget_data["items"],
        "discount": budget_data["discount"],
        "taxMode": budget_data["taxMode"],
        "shipping": budget_data["shipping"],
        "totals": budget_data["totals"],
        "status": "DRAFT",
        "notes": budget_data.get("notes"),
        "internalNotes": f"Converted from BUDGET invoice {budget_data.get('number', budget_invoice_id)}",
        "createdAt": issue_date,
        "createdBy": current_user.get("uid"),
        "updatedAt": issue_date,
        "budgetInvoiceId": budget_invoice_id
    }
    
    final_ref = db.collection('organizations', org_id, 'invoices').document()
    final_ref.set(final_invoice_data)
    
    return {"status": "success", "finalInvoiceId": final_ref.id}

# --- Payment Management ---
@router.post("/payments")
async def record_payment(
    req: PaymentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Record a payment for a FINAL invoice"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    
    # Check for existing payment with same idempotency key
    existing_payment = db.collection('organizations', org_id, 'payments').where(
        'idempotencyKey', '==', req.idempotencyKey
    ).limit(1).get()
    
    if len(existing_payment) > 0:
        payment_data = existing_payment[0].to_dict()
        payment_data['id'] = existing_payment[0].id
        return {"status": "success", "paymentId": payment_data['id'], "message": "Payment already exists"}
    
    # Get invoice
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(req.invoiceId)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Validate this is a FINAL invoice
    if invoice_data.get('type') != 'FINAL':
        raise HTTPException(status_code=400, detail="Payments can only be recorded for FINAL invoices")
    
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
        "currency": invoice_data["currency"],
        "createdAt": get_utc_now(),
        "createdBy": current_user.get("uid")
    }
    
    payment_ref = db.collection('organizations', org_id, 'payments').document()
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

@router.post("/invoices/{invoice_id}/payments")
async def record_invoice_payment(
    invoice_id: str,
    req: PaymentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Record a payment for a specific invoice (alternative endpoint)"""
    # Override the invoiceId from the request with the path parameter
    req.invoiceId = invoice_id
    return await record_payment(req, current_user)

@router.get("/payments")
async def list_payments(
    client_id: Optional[str] = None,
    invoice_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List payments"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role", "").lower()
    
    db = firestore.client()
    query = db.collection('organizations', org_id, 'payments')
    
    if client_id:
        query = query.where('clientId', '==', client_id)
    if invoice_id:
        query = query.where('invoiceId', '==', invoice_id)
    
    # Client can only see their own payments
    if user_role == "client":
        client_id = current_user.get("uid")
        query = query.where('clientId', '==', client_id)
    elif not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    payments = []
    for doc in query.order_by('createdAt', direction=firestore.Query.DESCENDING).get():
        payment_data = doc.to_dict()
        payment_data['id'] = doc.id
        payments.append(payment_data)
    
    return payments

# --- Client Timeline ---
@router.get("/clients/{client_id}/timeline")
async def get_client_timeline(
    client_id: str,
    event_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get client's financial timeline (invoices and payments)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    
    # Verify client exists
    client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
    if not client_ref.get().exists:
        raise HTTPException(status_code=404, detail="Client not found")
    
    timeline = []
    
    # Get invoices
    invoices_query = db.collection('organizations', org_id, 'invoices').where('clientId', '==', client_id)
    if event_id:
        invoices_query = invoices_query.where('eventId', '==', event_id)
    
    for invoice_doc in invoices_query.get():
        invoice_data = invoice_doc.to_dict()
        
        # Only include SENT invoices in timeline
        if invoice_data.get('status') in ['SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED']:
            timeline.append({
                "type": "invoice",
                "subType": invoice_data.get('type', 'FINAL'),
                "id": invoice_doc.id,
                "number": invoice_data.get('number', ''),
                "date": invoice_data.get('sentAt', invoice_data.get('issueDate')),
                "amount": invoice_data.get('totals', {}).get('grandTotal', 0),
                "status": invoice_data.get('status'),
                "eventId": invoice_data.get('eventId'),
                "description": f"{invoice_data.get('type')} Invoice {invoice_data.get('number', '')}"
            })
    
    # Get payments
    payments_query = db.collection('organizations', org_id, 'payments').where('clientId', '==', client_id)
    
    for payment_doc in payments_query.get():
        payment_data = payment_doc.to_dict()
        
        # Get invoice number for payment
        invoice_ref = db.collection('organizations', org_id, 'invoices').document(payment_data.get('invoiceId', ''))
        invoice_doc = invoice_ref.get()
        invoice_number = invoice_doc.to_dict().get('number', '') if invoice_doc.exists else ''
        
        timeline.append({
            "type": "payment",
            "id": payment_doc.id,
            "date": payment_data.get('paidAt'),
            "amount": payment_data.get('amount', 0),
            "method": payment_data.get('method'),
            "reference": payment_data.get('reference'),
            "invoiceId": payment_data.get('invoiceId'),
            "invoiceNumber": invoice_number,
            "description": f"Payment for Invoice {invoice_number}"
        })
    
    # Sort timeline by date (newest first)
    timeline.sort(key=lambda x: x['date'], reverse=True)
    
    # Calculate running totals and LTV
    total_invoiced = sum(item['amount'] for item in timeline if item['type'] == 'invoice')
    total_paid = sum(item['amount'] for item in timeline if item['type'] == 'payment')
    outstanding = total_invoiced - total_paid
    
    return {
        "clientId": client_id,
        "timeline": timeline,
        "summary": {
            "totalInvoiced": round_half_up(total_invoiced),
            "totalPaid": round_half_up(total_paid),
            "outstanding": round_half_up(outstanding),
            "lifetimeValue": round_half_up(total_paid)
        }
    }

# --- Invoice Replies/Comments ---
@router.post("/invoices/{invoice_id}/replies")
async def create_invoice_reply(
    invoice_id: str,
    req: InvoiceReplyCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a reply/comment to an invoice thread"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role", "").lower()
    
    db = firestore.client()
    
    # Get invoice to verify access
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Check permissions
    if user_role == "client":
        client_id = current_user.get("uid")
        if invoice_data.get("clientId") != client_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        # Clients can only reply to sent invoices
        if invoice_data.get("status") == "DRAFT":
            raise HTTPException(status_code=404, detail="Invoice not found")
    elif not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Create reply
    reply_data = {
        "message": req.message,
        "authorId": current_user.get("uid"),
        "authorName": current_user.get("displayName", "Unknown"),
        "authorRole": user_role,
        "createdAt": get_utc_now(),
        "orgId": org_id
    }
    
    reply_ref = db.collection('organizations', org_id, 'invoiceThreads', invoice_id, 'replies').document()
    reply_ref.set(reply_data)
    
    return {"status": "success", "replyId": reply_ref.id}

@router.post("/invoices/{invoice_id}/reply")
async def create_invoice_reply_alt(
    invoice_id: str,
    req: InvoiceReplyCreate,
    current_user: dict = Depends(get_current_user)
):
    """Alternative endpoint for creating invoice replies"""
    return await create_invoice_reply(invoice_id, req, current_user)

@router.get("/invoices/{invoice_id}/thread")
async def get_invoice_thread(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get invoice thread replies (alternative endpoint)"""
    return await get_invoice_replies(invoice_id, current_user)

@router.post("/invoices/{invoice_id}/send")
async def send_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Send an invoice (mark as SENT)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    if invoice_data.get('status') != 'DRAFT':
        raise HTTPException(status_code=400, detail="Only draft invoices can be sent")
    
    # Assign number when sending if not already assigned
    update_data = {
        "status": "SENT",
        "sentAt": get_utc_now(),
        "updatedAt": get_utc_now()
    }
    
    if not invoice_data.get("number"):
        update_data["number"] = generate_invoice_number(db, org_id, invoice_data.get('type', 'FINAL'))
    
    invoice_ref.update(update_data)
    
    return {"status": "success", "message": "Invoice sent successfully"}

@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate and return invoice PDF"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role", "").lower()
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Check permissions
    if user_role == "client":
        client_id = current_user.get("uid")
        if invoice_data.get("clientId") != client_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        # Hide draft invoices from clients
        if invoice_data.get("status") == "DRAFT":
            raise HTTPException(status_code=404, detail="Invoice not found")
    elif not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    try:
        # Generate PDF using PDFGenerator utility
        pdf_generator = PDFGenerator()
        pdf_content = pdf_generator.generate_invoice_pdf(invoice_data)
        
        return Response(
            content=pdf_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=invoice-{invoice_data.get('number', invoice_id)}.pdf"
            }
        )
    except Exception as e:
        # Fallback response if PDF generation fails
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

@router.post("/invoices/{invoice_id}/convert")
async def convert_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Convert BUDGET invoice to FINAL (alternative endpoint)"""
    return await convert_budget_to_final(invoice_id, current_user)

@router.post("/invoices/{invoice_id}/cancel")
async def cancel_invoice(
    invoice_id: str,
    cancel_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Cancel an invoice"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Check if invoice has payments (FINAL only)
    has_payments = False
    if invoice_data.get('type') == "FINAL":
        payments_query = db.collection('organizations', org_id, 'payments').where('invoiceId', '==', invoice_id).get()
        has_payments = len(payments_query) > 0
    
    if has_payments:
        raise HTTPException(status_code=400, detail="Cannot cancel invoice with payments")
    
    cancel_reason = cancel_data.get('cancelReason', 'Cancelled by user')
    
    invoice_ref.update({
        'status': 'CANCELLED',
        'cancelReason': cancel_reason,
        'cancelledAt': get_utc_now(),
        'updatedAt': get_utc_now()
    })
    
    return {"status": "success", "message": "Invoice cancelled successfully"}

@router.get("/invoices/{invoice_id}/replies")
async def get_invoice_replies(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get invoice thread replies"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role", "").lower()
    
    db = firestore.client()
    
    # Get invoice to verify access
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Check permissions
    if user_role == "client":
        client_id = current_user.get("uid")
        if invoice_data.get("clientId") != client_id:
            raise HTTPException(status_code=403, detail="Not authorized")
        if invoice_data.get("status") == "DRAFT":
            raise HTTPException(status_code=404, detail="Invoice not found")
    elif not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get replies
    replies_query = db.collection('organizations', org_id, 'invoiceThreads', invoice_id, 'replies').order_by('createdAt')
    
    replies = []
    for reply_doc in replies_query.get():
        reply_data = reply_doc.to_dict()
        reply_data['id'] = reply_doc.id
        replies.append(reply_data)
    
    return replies

# --- Utility Endpoints ---
@router.post("/invoices/mark-overdue")
async def mark_overdue_invoices(
    current_user: dict = Depends(get_current_user)
):
    """Mark FINAL invoices as overdue (scheduled job)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    now = get_utc_now()
    
    # Get FINAL invoices that should be marked overdue
    invoices_query = db.collection('organizations', org_id, 'invoices').where(
        'type', '==', 'FINAL'
    ).where(
        'status', 'in', ['SENT', 'PARTIAL']
    ).where(
        'dueDate', '<', now.isoformat()
    ).get()
    
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

@router.get("/exports/invoices")
async def export_invoices_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Export invoices as CSV data"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    
    # Default to current month if no dates provided
    if not start_date or not end_date:
        now = get_ist_now()
        start_date = now.replace(day=1).isoformat()
        end_date = now.isoformat()
    
    # Get invoices for the period
    invoices_query = db.collection('organizations', org_id, 'invoices').where(
        'issueDate', '>=', start_date
    ).where(
        'issueDate', '<=', end_date
    ).get()
    
    csv_data = []
    for invoice_doc in invoices_query:
        invoice_data = invoice_doc.to_dict()
        totals = invoice_data.get('totals', {})
        
        csv_data.append({
            "invoiceId": invoice_doc.id,
            "number": invoice_data.get('number', ''),
            "type": invoice_data.get('type', ''),
            "status": invoice_data.get('status', ''),
            "clientId": invoice_data.get('clientId', ''),
            "eventId": invoice_data.get('eventId', ''),
            "issueDate": invoice_data.get('issueDate', ''),
            "dueDate": invoice_data.get('dueDate', ''),
            "currency": invoice_data.get('currency', ''),
            "subTotal": totals.get('subTotal', 0),
            "discountTotal": totals.get('discountTotal', 0),
            "taxTotal": totals.get('taxTotal', 0),
            "grandTotal": totals.get('grandTotal', 0),
            "amountPaid": totals.get('amountPaid', 0),
            "amountDue": totals.get('amountDue', 0),
            "notes": invoice_data.get('notes', ''),
            "createdAt": invoice_data.get('createdAt', ''),
            "sentAt": invoice_data.get('sentAt', '')
        })
    
    return csv_data

@router.get("/reports/aging")
async def get_aging_report(
    current_user: dict = Depends(get_current_user)
):
    """Get detailed aging report for FINAL invoices"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    
    # Get all unpaid/partially paid FINAL invoices
    invoices_query = db.collection('organizations', org_id, 'invoices').where(
        'type', '==', 'FINAL'
    ).where(
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
                "number": invoice_data.get('number', ''),
                "clientId": invoice_data.get('clientId'),
                "eventId": invoice_data.get('eventId'),
                "issueDate": invoice_data.get('issueDate'),
                "dueDate": due_date,
                "grandTotal": totals.get('grandTotal', 0),
                "amountPaid": totals.get('amountPaid', 0),
                "amountDue": amount_due,
                "daysOverdue": days_overdue,
                "status": invoice_data.get('status')
            })
    
    # Sort by days overdue (highest first)
    aging_details.sort(key=lambda x: x['daysOverdue'], reverse=True)
    
    return aging_details
