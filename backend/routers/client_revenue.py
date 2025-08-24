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
    description: str
    quantity: float = 1.0
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
    shippingTotal: float
    grandTotal: float
    amountPaid: float = 0.0
    amountDue: float

class InvoiceBase(BaseModel):
    type: str  # BUDGET or FINAL
    clientId: str
    eventId: Optional[str] = None
    issueDate: Optional[str] = None  # ISO date, defaults to today
    dueDate: Optional[str] = None  # ISO date, defaults to issueDate + orgDefaultNetDays
    currency: str = "INR"
    items: List[LineItem]
    discount: Discount = Discount()
    taxMode: str = "EXCLUSIVE"  # EXCLUSIVE or INCLUSIVE
    shippingAmount: float = 0.0
    notes: Optional[str] = None

class InvoiceCreate(InvoiceBase):
    pass

class InvoiceUpdate(BaseModel):
    issueDate: Optional[str] = None
    dueDate: Optional[str] = None
    items: Optional[List[LineItem]] = None
    discount: Optional[Discount] = None
    taxMode: Optional[str] = None
    shippingAmount: Optional[float] = None
    notes: Optional[str] = None

class PaymentCreate(BaseModel):
    amount: float
    paidAt: str  # ISO datetime
    method: str  # BANK_TRANSFER, UPI, CASH, CARD, CHEQUE, OTHER
    reference: Optional[str] = None
    notes: Optional[str] = None
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

def round_currency(amount: float) -> float:
    """Round amount to currency precision (2 decimal places, half-up)"""
    return float(Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

def calculate_totals(items: List[LineItem], discount: Discount, tax_mode: str, shipping: float = 0.0) -> Totals:
    """Calculate invoice totals with proper rounding"""
    sub_total = sum(item.quantity * item.unitPrice for item in items)
    
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
            (item.quantity * item.unitPrice * item.taxRatePct / (100 + item.taxRatePct))
            for item in items
        )
        # Apply discount proportionally to tax
        tax_total = tax_total * (discounted_subtotal / sub_total) if sub_total > 0 else 0
        grand_total = discounted_subtotal + shipping
    else:
        # Tax is exclusive
        tax_total = sum(
            ((item.quantity * item.unitPrice) * (item.taxRatePct / 100))
            for item in items
        )
        # Apply discount proportionally to tax
        tax_total = tax_total * (discounted_subtotal / sub_total) if sub_total > 0 else 0
        grand_total = discounted_subtotal + tax_total + shipping
    
    return Totals(
        subTotal=round_currency(sub_total),
        discountTotal=round_currency(discount_total),
        taxTotal=round_currency(tax_total),
        shippingTotal=round_currency(shipping),
        grandTotal=round_currency(grand_total),
        amountDue=round_currency(grand_total)
    )

def generate_invoice_number(db, org_id: str, invoice_type: str) -> str:
    """Generate sequential invoice numbers per org/year"""
    current_year = get_ist_now().year
    
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
            'type': invoice_type,
            'year': current_year,
            'next': new_num,
            'updatedAt': get_utc_now()
        })
        
        return f"INV-{current_year}-{str(current_num).zfill(4)}"
    
    seq_ref = db.collection('organizations', org_id, 'sequences').document(f"invoice_{current_year}")
    transaction = db.transaction()
    return update_sequence(transaction, seq_ref)

def is_authorized_for_financial_hub(current_user: dict) -> bool:
    """Check if user has Financial Hub access"""
    role = current_user.get("role", "").lower()
    return role in ["admin", "accountant"]

def update_invoice_status(db, org_id: str, invoice_id: str):
    """Update invoice status based on payments and due date"""
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        return
    
    invoice_data = invoice_doc.to_dict()
    invoice_type = invoice_data.get('type', 'FINAL')
    grand_total = invoice_data.get('totals', {}).get('grandTotal', 0)
    amount_paid = invoice_data.get('totals', {}).get('amountPaid', 0)
    current_status = invoice_data.get('status', 'DRAFT')
    due_date = invoice_data.get('dueDate')
    
    # BUDGET invoices never become OVERDUE
    if invoice_type == 'BUDGET':
        return
    
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

def get_org_default_net_days(db, org_id: str) -> int:
    """Get organization's default net payment days"""
    try:
        org_doc = db.collection('organizations').document(org_id).get()
        if org_doc.exists:
            return org_doc.to_dict().get('defaultNetDays', 15)
        return 15
    except:
        return 15

# --- Overview Endpoints ---
@router.get("/overview")
async def get_financial_overview(
    period: str = Query("month", pattern="^(day|week|month|quarter|year|custom)$"),
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get Financial Hub overview data"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    
    # Calculate period dates
    now = get_ist_now()
    if period == "day":
        start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = now.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == "week":
        start_dt = now - timedelta(days=now.weekday())
        start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = start_dt + timedelta(days=6, hours=23, minutes=59, seconds=59, microseconds=999999)
    elif period == "month":
        start_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        next_month = start_dt + timedelta(days=32)
        end_dt = next_month.replace(day=1) - timedelta(microseconds=1)
    elif period == "quarter":
        quarter = (now.month - 1) // 3 + 1
        start_dt = now.replace(month=(quarter-1)*3+1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_dt = start_dt + timedelta(days=92)
        end_dt = end_dt.replace(day=1) - timedelta(microseconds=1)
    elif period == "year":
        start_dt = now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
        end_dt = now.replace(month=12, day=31, hour=23, minute=59, second=59, microsecond=999999)
    elif period == "custom":
        if not start_date or not end_date:
            raise HTTPException(status_code=400, detail="Start and end dates required for custom period")
        start_dt = datetime.fromisoformat(start_date)
        end_dt = datetime.fromisoformat(end_date)
    
    start_iso = start_dt.astimezone(timezone.utc).isoformat()
    end_iso = end_dt.astimezone(timezone.utc).isoformat()
    
    # Get all FINAL invoices and filter by date in-memory to avoid composite index requirement
    try:
        all_invoices = db.collection('organizations', org_id, 'invoices').where(
            'type', '==', 'FINAL'
        ).get()
        
        # Filter by date range in-memory
        invoices_query = []
        for doc in all_invoices:
            data = doc.to_dict()
            issue_date = data.get('issueDate')
            if issue_date and start_iso <= issue_date <= end_iso:
                invoices_query.append(doc)
    except Exception as e:
        # If no invoices collection exists yet, return empty data
        invoices_query = []
    
    total_invoiced = 0
    total_collected = 0
    outstanding = 0
    overdue_amount = 0
    
    aging_buckets = {"0-15": 0, "16-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
    now_utc = get_utc_now()
    
    for invoice_doc in invoices_query:
        invoice_data = invoice_doc.to_dict()
        if invoice_data.get('status') == 'CANCELLED':
            continue
            
        totals = invoice_data.get('totals', {})
        grand_total = totals.get('grandTotal', 0)
        amount_paid = totals.get('amountPaid', 0)
        amount_due = totals.get('amountDue', 0)
        
        total_invoiced += grand_total
        total_collected += amount_paid
        outstanding += amount_due
        
        # Calculate aging for unpaid amounts
        if amount_due > 0 and invoice_data.get('status') in ['SENT', 'PARTIAL', 'OVERDUE']:
            due_date = invoice_data.get('dueDate')
            if due_date:
                due_dt = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
                days_overdue = (now_utc - due_dt).days
                
                if days_overdue > 0:
                    overdue_amount += amount_due
                    
                    if days_overdue <= 15:
                        aging_buckets["0-15"] += amount_due
                    elif days_overdue <= 30:
                        aging_buckets["16-30"] += amount_due
                    elif days_overdue <= 60:
                        aging_buckets["31-60"] += amount_due
                    elif days_overdue <= 90:
                        aging_buckets["61-90"] += amount_due
                    else:
                        aging_buckets["90+"] += amount_due
    
    # Get monthly trend data (last 12 months)
    monthly_trend = []
    for i in range(12):
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=30*i)
        month_end = month_start + timedelta(days=32)
        month_end = month_end.replace(day=1) - timedelta(microseconds=1)
        
        # Get all FINAL invoices and filter by date in-memory to avoid index requirements
        all_month_invoices = db.collection('organizations', org_id, 'invoices').where(
            'type', '==', 'FINAL'
        ).get()
        
        month_start_iso = month_start.astimezone(timezone.utc).isoformat()
        month_end_iso = month_end.astimezone(timezone.utc).isoformat()
        
        month_invoices = []
        for doc in all_month_invoices:
            data = doc.to_dict()
            issue_date = data.get('issueDate')
            if issue_date and month_start_iso <= issue_date <= month_end_iso:
                month_invoices.append(doc)
        
        month_invoiced = sum(doc.to_dict().get('totals', {}).get('grandTotal', 0) 
                           for doc in month_invoices if doc.to_dict().get('status') != 'CANCELLED')
        month_collected = sum(doc.to_dict().get('totals', {}).get('amountPaid', 0) 
                            for doc in month_invoices if doc.to_dict().get('status') != 'CANCELLED')
        
        monthly_trend.append({
            "month": month_start.strftime("%b %Y"),
            "invoiced": round_currency(month_invoiced),
            "collected": round_currency(month_collected)
        })
    
    monthly_trend.reverse()
    
    # Get upcoming due invoices (next 7 days) - use simple query and filter in memory
    upcoming_due_date = now_utc + timedelta(days=7)
    all_invoices_for_due = db.collection('organizations', org_id, 'invoices').where(
        'type', '==', 'FINAL'
    ).get()
    
    upcoming_invoices = []
    upcoming_due_iso = upcoming_due_date.isoformat()
    now_utc_iso = now_utc.isoformat()
    
    for doc in all_invoices_for_due:
        data = doc.to_dict()
        status = data.get('status')
        due_date = data.get('dueDate')
        if (status in ['SENT', 'PARTIAL'] and due_date and 
            now_utc_iso <= due_date <= upcoming_due_iso):
            upcoming_invoices.append(doc)
    
    upcoming_due = []
    for doc in upcoming_invoices:
        invoice_data = doc.to_dict()
        amount_due = invoice_data.get('totals', {}).get('amountDue', 0)
        if amount_due > 0:
            upcoming_due.append({
                "invoiceId": doc.id,
                "number": invoice_data.get('number', ''),
                "clientId": invoice_data.get('clientId'),
                "dueDate": invoice_data.get('dueDate'),
                "amountDue": amount_due
            })
    
    return {
        "period": {"type": period, "startDate": start_iso, "endDate": end_iso},
        "kpis": {
            "totalInvoiced": round_currency(total_invoiced),
            "totalCollected": round_currency(total_collected),
            "outstanding": round_currency(outstanding),
            "overdueAmount": round_currency(overdue_amount)
        },
        "monthlyTrend": monthly_trend,
        "agingBuckets": {k: round_currency(v) for k, v in aging_buckets.items()},
        "upcomingDue": upcoming_due
    }

# --- Invoice Endpoints ---
@router.post("/invoices")
async def create_invoice(
    req: InvoiceCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new invoice (BUDGET or FINAL)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    
    # Validate invoice type
    if req.type not in ['BUDGET', 'FINAL']:
        raise HTTPException(status_code=400, detail="Invoice type must be BUDGET or FINAL")
    
    # Verify client exists
    client_ref = db.collection('organizations', org_id, 'clients').document(req.clientId)
    if not client_ref.get().exists:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Validate items
    if not req.items or len(req.items) == 0:
        raise HTTPException(status_code=400, detail="Invoice must have at least one item")
    
    # Calculate totals
    totals = calculate_totals(req.items, req.discount, req.taxMode, req.shippingAmount)
    
    if totals.grandTotal <= 0:
        raise HTTPException(status_code=400, detail="Invoice grand total must be positive")
    
    # Set dates
    issue_date = req.issueDate
    if not issue_date:
        issue_date = get_utc_now().isoformat()
    
    due_date = req.dueDate
    if not due_date and req.type == 'FINAL':
        # Use org default net days
        default_net_days = get_org_default_net_days(db, org_id)
        issue_dt = datetime.fromisoformat(issue_date.replace('Z', '+00:00'))
        due_dt = issue_dt + timedelta(days=default_net_days)
        due_date = due_dt.isoformat()
    
    # Create invoice
    invoice_data = {
        **req.dict(),
        "orgId": org_id,
        "number": "",  # Will be assigned when sent
        "issueDate": issue_date,
        "dueDate": due_date,
        "totals": totals.dict(),
        "status": "DRAFT",
        "createdAt": get_utc_now(),
        "createdBy": current_user.get("uid"),
        "updatedAt": get_utc_now()
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
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Check if invoice has payments (FINAL only)
    if invoice_data.get('type') == 'FINAL':
        payments_query = db.collection('organizations', org_id, 'payments').where('invoiceId', '==', invoice_id).get()
        has_payments = len(payments_query) > 0
        
        # Prevent editing money fields if payments exist
        if has_payments and any(field in req.dict(exclude_unset=True) for field in ['items', 'discount', 'taxMode', 'shippingAmount']):
            raise HTTPException(status_code=400, detail="Cannot edit invoice amounts after payments exist")
    
    update_data = {"updatedAt": get_utc_now()}
    
    # Update fields if provided
    for field, value in req.dict(exclude_unset=True).items():
        update_data[field] = value
    
    # Recalculate totals if items changed
    if "items" in update_data:
        items = update_data["items"]
        discount = update_data.get("discount", invoice_data.get("discount", {}))
        tax_mode = update_data.get("taxMode", invoice_data.get("taxMode", "EXCLUSIVE"))
        shipping = update_data.get("shippingAmount", invoice_data.get("shippingAmount", 0))
        
        if not items or len(items) == 0:
            raise HTTPException(status_code=400, detail="Invoice must have at least one item")
        
        totals = calculate_totals(items, Discount(**discount), tax_mode, shipping)
        
        if totals.grandTotal <= 0:
            raise HTTPException(status_code=400, detail="Invoice grand total must be positive")
        
        update_data["totals"] = totals.dict()
    
    invoice_ref.update(update_data)
    
    return {"status": "success"}

@router.post("/invoices/{invoice_id}/send")
async def send_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Send an invoice (assign number and mark as SENT)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    if invoice_data.get("status") != "DRAFT":
        raise HTTPException(status_code=400, detail="Only draft invoices can be sent")
    
    # Validate invoice has items and positive total
    totals = invoice_data.get('totals', {})
    if not invoice_data.get('items') or totals.get('grandTotal', 0) <= 0:
        raise HTTPException(status_code=400, detail="Cannot send invoice without items or with zero total")
    
    # Assign number if not already assigned
    if not invoice_data.get("number"):
        number = generate_invoice_number(db, org_id, invoice_data.get('type', 'FINAL'))
    else:
        number = invoice_data.get("number")
    
    # Update invoice
    update_data = {
        "number": number,
        "status": "SENT",
        "sentAt": get_utc_now(),
        "updatedAt": get_utc_now()
    }
    
    invoice_ref.update(update_data)
    
    return {"status": "success", "number": number}

@router.post("/invoices/{budget_id}/convert-to-final")
async def convert_budget_to_final(
    budget_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Convert a BUDGET invoice to FINAL invoice"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    budget_ref = db.collection('organizations', org_id, 'invoices').document(budget_id)
    budget_doc = budget_ref.get()
    
    if not budget_doc.exists:
        raise HTTPException(status_code=404, detail="Budget invoice not found")
    
    budget_data = budget_doc.to_dict()
    
    if budget_data.get("type") != "BUDGET":
        raise HTTPException(status_code=400, detail="Only BUDGET invoices can be converted to FINAL")
    
    # Clone budget data to create FINAL invoice
    final_invoice_data = {
        "type": "FINAL",
        "clientId": budget_data.get("clientId"),
        "eventId": budget_data.get("eventId"),
        "orgId": org_id,
        "number": "",  # Will be assigned when sent
        "issueDate": get_utc_now().isoformat(),
        "currency": budget_data.get("currency"),
        "items": budget_data.get("items"),
        "discount": budget_data.get("discount"),
        "taxMode": budget_data.get("taxMode"),
        "shippingAmount": budget_data.get("shippingAmount"),
        "totals": budget_data.get("totals"),
        "notes": budget_data.get("notes"),
        "status": "DRAFT",
        "createdAt": get_utc_now(),
        "createdBy": current_user.get("uid"),
        "updatedAt": get_utc_now(),
        "convertedFromBudget": budget_id
    }
    
    # Set due date using org default
    default_net_days = get_org_default_net_days(db, org_id)
    issue_dt = datetime.fromisoformat(final_invoice_data["issueDate"].replace('Z', '+00:00'))
    due_dt = issue_dt + timedelta(days=default_net_days)
    final_invoice_data["dueDate"] = due_dt.isoformat()
    
    # Create FINAL invoice
    final_ref = db.collection('organizations', org_id, 'invoices').document()
    final_ref.set(final_invoice_data)
    
    return {"status": "success", "finalInvoiceId": final_ref.id}

@router.get("/invoices")
async def list_invoices(
    type: Optional[str] = Query(None, pattern="^(BUDGET|FINAL)$"),
    status: Optional[str] = Query(None, pattern="^(DRAFT|SENT|PARTIAL|PAID|OVERDUE|CANCELLED)$"),
    client_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List invoices with filters"""
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
    
    # Client can only see their own sent invoices
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

@router.delete("/invoices/{invoice_id}")
async def cancel_invoice(
    invoice_id: str,
    reason: str = Query(..., description="Cancellation reason"),
    current_user: dict = Depends(get_current_user)
):
    """Cancel an invoice (only if no payments exist)"""
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
    if invoice_data.get('type') == 'FINAL':
        payments_query = db.collection('organizations', org_id, 'payments').where('invoiceId', '==', invoice_id).get()
        if len(payments_query) > 0:
            raise HTTPException(status_code=400, detail="Cannot cancel invoice with payments")
    
    # Update invoice
    invoice_ref.update({
        "status": "CANCELLED",
        "cancelReason": reason,
        "cancelledAt": get_utc_now(),
        "cancelledBy": current_user.get("uid"),
        "updatedAt": get_utc_now()
    })
    
    return {"status": "success"}

# --- Payment Endpoints ---
@router.post("/invoices/{invoice_id}/payments")
async def record_payment(
    invoice_id: str,
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
    invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
    invoice_doc = invoice_ref.get()
    
    if not invoice_doc.exists:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    invoice_data = invoice_doc.to_dict()
    
    # Only FINAL invoices can have payments
    if invoice_data.get('type') != 'FINAL':
        raise HTTPException(status_code=400, detail="Only FINAL invoices can receive payments")
    
    # Validate payment
    amount_due = invoice_data.get('totals', {}).get('amountDue', 0)
    
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be positive")
    
    if req.amount > amount_due:
        raise HTTPException(status_code=400, detail="Payment amount exceeds amount due")
    
    # Create payment record
    payment_data = {
        **req.dict(),
        "invoiceId": invoice_id,
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
    update_invoice_status(db, org_id, invoice_id)
    
    return {"status": "success", "paymentId": payment_ref.id}

@router.get("/invoices/{invoice_id}/payments")
async def list_invoice_payments(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """List payments for an invoice"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role", "").lower()
    
    db = firestore.client()
    
    # Verify invoice exists and user has access
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
    elif not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get payments
    payments_query = db.collection('organizations', org_id, 'payments').where('invoiceId', '==', invoice_id)
    
    payments = []
    for doc in payments_query.order_by('createdAt', direction=firestore.Query.DESCENDING).get():
        payment_data = doc.to_dict()
        payment_data['id'] = doc.id
        payments.append(payment_data)
    
    return payments

# --- Client Timeline Endpoints ---
@router.get("/clients/{client_id}/timeline")
async def get_client_timeline(
    client_id: str,
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
    
    # Get all invoices for client
    invoices_query = db.collection('organizations', org_id, 'invoices').where('clientId', '==', client_id)
    invoices = {doc.id: doc.to_dict() for doc in invoices_query.get()}
    
    # Get all payments for client invoices
    payments_query = db.collection('organizations', org_id, 'payments').where('clientId', '==', client_id)
    payments = [doc.to_dict() for doc in payments_query.get()]
    
    # Build timeline
    timeline = []
    total_invoiced = 0
    total_paid = 0
    outstanding = 0
    
    # Add invoice events
    for invoice_id, invoice_data in invoices.items():
        if invoice_data.get('status') == 'CANCELLED':
            continue
            
        grand_total = invoice_data.get('totals', {}).get('grandTotal', 0)
        amount_due = invoice_data.get('totals', {}).get('amountDue', 0)
        
        total_invoiced += grand_total
        outstanding += amount_due
        
        # Add SENT event (for both BUDGET and FINAL)
        if invoice_data.get('status') != 'DRAFT' and invoice_data.get('sentAt'):
            timeline.append({
                "date": invoice_data.get('sentAt'),
                "type": "invoice",
                "subType": invoice_data.get('type'),
                "description": f"{invoice_data.get('type')} Invoice {invoice_data.get('number', '')} sent",
                "amount": grand_total,
                "status": invoice_data.get('status'),
                "invoiceId": invoice_id
            })
    
    # Add payment events
    for payment_data in payments:
        amount = payment_data.get('amount', 0)
        total_paid += amount
        
        timeline.append({
            "date": payment_data.get('createdAt'),
            "type": "payment",
            "description": f"Payment received via {payment_data.get('method', 'Unknown')}",
            "amount": amount,
            "method": payment_data.get('method'),
            "reference": payment_data.get('reference'),
            "invoiceId": payment_data.get('invoiceId')
        })
    
    # Sort timeline by date (newest first)
    timeline.sort(key=lambda x: x['date'], reverse=True)
    
    # Calculate lifetime value (total collected payments)
    lifetime_value = total_paid
    
    return {
        "summary": {
            "totalInvoiced": round_currency(total_invoiced),
            "totalPaid": round_currency(total_paid),
            "outstanding": round_currency(outstanding),
            "lifetimeValue": round_currency(lifetime_value)
        },
        "timeline": timeline
    }

# --- Invoice Thread Endpoints ---
@router.post("/invoices/{invoice_id}/replies")
async def create_invoice_reply(
    invoice_id: str,
    req: InvoiceReplyCreate,
    current_user: dict = Depends(get_current_user)
):
    """Add a reply to an invoice thread"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role", "").lower()
    
    db = firestore.client()
    
    # Verify invoice exists
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
        "createdAt": get_utc_now(),
        "createdBy": current_user.get("uid"),
        "createdByName": current_user.get("displayName", "Unknown"),
        "createdByRole": current_user.get("role", "unknown")
    }
    
    # Add to invoice thread
    thread_ref = db.collection('organizations', org_id, 'invoiceThreads').document(invoice_id)
    thread_doc = thread_ref.get()
    
    if thread_doc.exists:
        # Append to existing thread
        thread_ref.update({
            "replies": firestore.ArrayUnion([reply_data]),
            "updatedAt": get_utc_now(),
            "lastReplyAt": get_utc_now()
        })
    else:
        # Create new thread
        thread_ref.set({
            "invoiceId": invoice_id,
            "orgId": org_id,
            "clientId": invoice_data.get("clientId"),
            "replies": [reply_data],
            "createdAt": get_utc_now(),
            "updatedAt": get_utc_now(),
            "lastReplyAt": get_utc_now()
        })
    
    return {"status": "success"}

@router.get("/invoices/{invoice_id}/replies")
async def get_invoice_replies(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get invoice thread replies"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role", "").lower()
    
    db = firestore.client()
    
    # Verify invoice exists and user has access
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
    
    # Get thread
    thread_ref = db.collection('organizations', org_id, 'invoiceThreads').document(invoice_id)
    thread_doc = thread_ref.get()
    
    if not thread_doc.exists:
        return {"replies": []}
    
    thread_data = thread_doc.to_dict()
    return {"replies": thread_data.get("replies", [])}

# --- Aging and Reports ---
@router.get("/aging")
async def get_aging_report(
    current_user: dict = Depends(get_current_user)
):
    """Get aging report for FINAL invoices"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    
    # Get all FINAL invoices and filter unpaid/partially paid ones in memory
    all_invoices = db.collection('organizations', org_id, 'invoices').where(
        'type', '==', 'FINAL'
    ).get()
    
    # Filter by status in memory to avoid composite index
    invoices_query = []
    for doc in all_invoices:
        data = doc.to_dict()
        status = data.get('status')
        if status in ['SENT', 'PARTIAL', 'OVERDUE']:
            invoices_query.append(doc)
    
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
@router.post("/mark-overdue")
async def mark_invoices_overdue(
    current_user: dict = Depends(get_current_user)
):
    """Mark overdue FINAL invoices (scheduled job)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    now = get_utc_now()
    
    # Get FINAL invoices and filter overdue ones in memory
    all_invoices = db.collection('organizations', org_id, 'invoices').where(
        'type', '==', 'FINAL'
    ).get()
    
    # Filter by status and due date in memory to avoid composite index
    invoices_query = []
    now_iso = now.isoformat()
    for doc in all_invoices:
        data = doc.to_dict()
        status = data.get('status')
        due_date = data.get('dueDate')
        if status in ['SENT', 'PARTIAL'] and due_date and due_date < now_iso:
            invoices_query.append(doc)
    
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

# --- PDF Generation ---
@router.get("/invoices/{invoice_id}/pdf")
async def generate_invoice_pdf(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Generate and download invoice PDF"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role", "").lower()
    
    db = firestore.client()
    
    # Get invoice
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
    
    try:
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
        invoice_type = invoice_data.get('type', 'Invoice')
        number = invoice_data.get('number', invoice_id)
        filename = f"{invoice_type}-{number}.pdf"
        
        return Response(
            content=pdf_buffer.read(),
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating PDF: {str(e)}")
