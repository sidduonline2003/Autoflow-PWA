from fastapi import APIRouter, Depends, HTTPException, Query, Response
from firebase_admin import firestore
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import pytz
import io
import math
from decimal import Decimal, ROUND_HALF_UP

from ..dependencies import get_current_user
from ..utils.pdf_generator import PDFGenerator
from ..utils.email_service import email_service

router = APIRouter(
    prefix="/financial-hub",
    tags=["Financial Hub - Client Revenue"],
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
    dueDate: Optional[str] = None  # ISO date, for FINAL only
    currency: str = "INR"
    items: List[LineItem]
    discount: Discount = Discount()
    taxMode: str = "EXCLUSIVE"  # EXCLUSIVE or INCLUSIVE
    shippingAmount: float = 0.0
    notes: Optional[str] = None
    internalNotes: Optional[str] = None

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
    internalNotes: Optional[str] = None
    status: Optional[str] = None
    cancelReason: Optional[str] = None

class PaymentCreate(BaseModel):
    amount: float
    paidAt: str  # ISO datetime
    method: str  # BANK_TRANSFER, UPI, CASH, CARD, CHEQUE, OTHER
    reference: Optional[str] = None
    notes: Optional[str] = None
    idempotencyKey: str = Field(default_factory=lambda: uuid4().hex)

class InvoiceReplyCreate(BaseModel):
    message: str

class MessageCreate(BaseModel):
    message: str
    type: str = "GENERAL"  # GENERAL, CLIENT_REPLY, PAYMENT_REMINDER, OVERDUE_NOTICE
    sendEmail: bool = False

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
    try:
        print(f"DEBUG: Generating invoice number for org: {org_id}, type: {invoice_type}")
        current_year = get_ist_now().year
        print(f"DEBUG: Current year: {current_year}")
        
        @firestore.transactional
        def update_sequence(transaction, seq_ref):
            print(f"DEBUG: Getting sequence document: {seq_ref.path}")
            seq_doc = seq_ref.get(transaction=transaction)
            if seq_doc.exists:
                current_num = seq_doc.to_dict().get('next', 1)
                print(f"DEBUG: Existing sequence number: {current_num}")
            else:
                current_num = 1
                print("DEBUG: Creating new sequence, starting at 1")
            
            new_num = current_num + 1
            print(f"DEBUG: Setting next sequence number to: {new_num}")
            
            transaction.set(seq_ref, {
                'orgId': org_id,
                'type': invoice_type,
                'year': current_year,
                'next': new_num,
                'updatedAt': get_utc_now()
            })
            
            invoice_number = f"INV-{current_year}-{str(current_num).zfill(4)}"
            print(f"DEBUG: Generated invoice number: {invoice_number}")
            return invoice_number
        
        seq_ref = db.collection('organizations', org_id, 'sequences').document(f"invoice_{current_year}")
        print(f"DEBUG: Sequence reference path: {seq_ref.path}")
        
        transaction = db.transaction()
        result = update_sequence(transaction, seq_ref)
        print(f"DEBUG: Transaction completed, returning: {result}")
        return result
        
    except Exception as e:
        print(f"DEBUG: Error in generate_invoice_number: {str(e)}")
        print(f"DEBUG: Error type: {type(e)}")
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
        raise

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
            return org_doc.to_dict().get('defaultNetDays', 7)
    except:
        pass
    return 7  # Default to Net-7

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
    
    # Calculate date range
    now_utc = get_utc_now()
    if period == "custom":
        if not start_date or not end_date:
            raise HTTPException(status_code=400, detail="Custom period requires start_date and end_date")
        start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    else:
        # Default periods
        if period == "day":
            start_dt = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
            end_dt = start_dt + timedelta(days=1)
        elif period == "week":
            start_dt = now_utc - timedelta(days=now_utc.weekday())
            start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            end_dt = start_dt + timedelta(days=7)
        elif period == "month":
            start_dt = now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end_dt = (start_dt + timedelta(days=32)).replace(day=1)
        elif period == "quarter":
            quarter_month = ((now_utc.month - 1) // 3) * 3 + 1
            start_dt = now_utc.replace(month=quarter_month, day=1, hour=0, minute=0, second=0, microsecond=0)
            end_dt = (start_dt + timedelta(days=93)).replace(day=1)
        elif period == "year":
            start_dt = now_utc.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
            end_dt = start_dt.replace(year=start_dt.year + 1)
    
    start_iso = start_dt.isoformat()
    end_iso = end_dt.isoformat()
    
    # Get all FINAL invoices in date range
    try:
        all_invoices = db.collection('organizations', org_id, 'invoices').where(
            'type', '==', 'FINAL'
        ).get()
        
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
    
    # Get monthly trends (last 12 months)
    monthly_trends = []
    for i in range(12):
        month_start = (now_utc.replace(day=1) - timedelta(days=30 * i)).replace(day=1)
        month_end = (month_start + timedelta(days=32)).replace(day=1)
        
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
        
        month_invoiced = sum(doc.to_dict().get('totals', {}).get('grandTotal', 0) for doc in month_invoices if doc.to_dict().get('status') != 'CANCELLED')
        month_collected = sum(doc.to_dict().get('totals', {}).get('amountPaid', 0) for doc in month_invoices if doc.to_dict().get('status') != 'CANCELLED')
        
        monthly_trends.append({
            "month": month_start.strftime("%b %Y"),
            "invoiced": month_invoiced,
            "collected": month_collected
        })
    
    monthly_trends.reverse()  # Oldest to newest
    
    # Get upcoming due invoices (next 30 days)
    upcoming_due_iso = (now_utc + timedelta(days=30)).isoformat()
    now_utc_iso = now_utc.isoformat()
    
    all_invoices_for_due = db.collection('organizations', org_id, 'invoices').where(
        'type', '==', 'FINAL'
    ).get()
    
    upcoming_invoices = []
    for doc in all_invoices_for_due:
        invoice_data = doc.to_dict()
        status = invoice_data.get('status', 'DRAFT')
        due_date = invoice_data.get('dueDate')
        
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
        "kpis": {
            "totalInvoiced": round_currency(total_invoiced),
            "totalCollected": round_currency(total_collected),
            "outstanding": round_currency(outstanding),
            "overdueAmount": round_currency(overdue_amount)
        },
        "aging": aging_buckets,
        "monthlyTrends": monthly_trends,
        "upcomingDue": upcoming_due
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
        raise HTTPException(status_code=400, detail="Invoice total must be positive")
    
    # Set dates
    issue_date = req.issueDate or get_utc_now().isoformat()
    due_date = None
    if req.type == 'FINAL':
        if req.dueDate:
            due_date = req.dueDate
        else:
            # Calculate due date based on org default
            default_days = get_org_default_net_days(db, org_id)
            issue_dt = datetime.fromisoformat(issue_date.replace('Z', '+00:00'))
            due_dt = issue_dt + timedelta(days=default_days)
            due_date = due_dt.isoformat()
    
    # Create invoice
    invoice_data = {
        **req.dict(),
        "orgId": org_id,
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
    
    if type:
        query = query.where('type', '==', type)
    if status:
        query = query.where('status', '==', status)
    if client_id:
        query = query.where('clientId', '==', client_id)
    
    # Client can only see their own invoices
    if user_role == "client":
        client_id = current_user.get("uid")
        query = query.where('clientId', '==', client_id)
    elif not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    invoices = []
    for doc in query.order_by('createdAt', direction=firestore.Query.DESCENDING).get():
        invoice_data = doc.to_dict()
        
        # Hide draft invoices from clients
        if user_role == "client" and invoice_data.get("status") == "DRAFT":
            continue
            
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
    
    # Only allow updates to DRAFT invoices
    if invoice_data.get('status') != 'DRAFT':
        raise HTTPException(status_code=400, detail="Only DRAFT invoices can be updated")
    
    # Prepare update data
    update_data = {"updatedAt": get_utc_now()}
    
    # Update fields if provided
    for field, value in req.dict(exclude_unset=True).items():
        if field not in ['status', 'cancelReason']:  # These have special handling
            update_data[field] = value
    
    # Recalculate totals if items, discount, taxMode, or shipping changed
    if any(field in req.dict(exclude_unset=True) for field in ['items', 'discount', 'taxMode', 'shippingAmount']):
        items = req.items or invoice_data.get('items', [])
        discount = req.discount or invoice_data.get('discount', {})
        tax_mode = req.taxMode or invoice_data.get('taxMode', 'EXCLUSIVE')
        shipping = req.shippingAmount if req.shippingAmount is not None else invoice_data.get('shippingAmount', 0)
        
        totals = calculate_totals(items, discount, tax_mode, shipping)
        update_data['totals'] = totals.dict()
    
    invoice_ref.update(update_data)
    return {"status": "success"}

@router.post("/invoices/{invoice_id}/send")
async def send_invoice(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Send an invoice (assign number and mark as SENT)"""
    try:
        org_id = current_user.get("orgId")
        
        if not is_authorized_for_financial_hub(current_user):
            raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
        
        db = firestore.client()
        invoice_ref = db.collection('organizations', org_id, 'invoices').document(invoice_id)
        invoice_doc = invoice_ref.get()
        
        if not invoice_doc.exists:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        invoice_data = invoice_doc.to_dict()
        
        # Can only send DRAFT invoices
        if invoice_data.get('status') != 'DRAFT':
            raise HTTPException(status_code=400, detail="Only DRAFT invoices can be sent")
        
        # Generate invoice number if not already assigned
        invoice_number = invoice_data.get('number')
        
        if not invoice_number:
            invoice_number = generate_invoice_number(db, org_id, invoice_data.get('type', 'FINAL'))
        
        # Update invoice
        invoice_ref.update({
            'number': invoice_number,
            'status': 'SENT',
            'sentAt': get_utc_now(),
            'updatedAt': get_utc_now()
        })
        
        # TODO: Send email notification to client
        # email_service.send_invoice_email(invoice_data, invoice_number)
        
        return {"status": "success", "number": invoice_number}
    
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.post("/invoices/{budget_id}/convert-to-final")
async def convert_budget_to_final(
    budget_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Convert BUDGET invoice to FINAL"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    budget_ref = db.collection('organizations', org_id, 'invoices').document(budget_id)
    budget_doc = budget_ref.get()
    
    if not budget_doc.exists:
        raise HTTPException(status_code=404, detail="Budget invoice not found")
    
    budget_data = budget_doc.to_dict()
    
    # Validate this is a BUDGET invoice
    if budget_data.get('type') != 'BUDGET':
        raise HTTPException(status_code=400, detail="Only BUDGET invoices can be converted")
    
    # Create new FINAL invoice from budget data
    default_days = get_org_default_net_days(db, org_id)
    issue_date = get_utc_now().isoformat()
    due_date = (get_utc_now() + timedelta(days=default_days)).isoformat()
    
    final_data = {
        **budget_data,
        "type": "FINAL",
        "issueDate": issue_date,
        "dueDate": due_date,
        "status": "DRAFT",
        "createdAt": get_utc_now(),
        "createdBy": current_user.get("uid"),
        "updatedAt": get_utc_now(),
        "convertedFrom": budget_id
    }
    
    # Remove fields that shouldn't be copied
    final_data.pop('id', None)
    final_data.pop('number', None)
    final_data.pop('sentAt', None)
    
    final_ref = db.collection('organizations', org_id, 'invoices').document()
    final_ref.set(final_data)
    
    return {"status": "success", "finalInvoiceId": final_ref.id}

@router.post("/invoices/{invoice_id}/cancel")
async def cancel_invoice(
    invoice_id: str,
    cancel_data: dict,
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
    
    # Check if any payments exist
    if invoice_data.get('type') == 'FINAL':
        payments_query = db.collection('organizations', org_id, 'payments').where('invoiceId', '==', invoice_id).get()
        if len(payments_query) > 0:
            raise HTTPException(status_code=400, detail="Cannot cancel invoice with payments")
    
    # Cancel the invoice
    invoice_ref.update({
        'status': 'CANCELLED',
        'cancelReason': cancel_data.get('reason', ''),
        'cancelledAt': get_utc_now(),
        'cancelledBy': current_user.get("uid"),
        'updatedAt': get_utc_now()
    })
    
    return {"status": "success"}

# --- Payment Management ---
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
    
    # Get client invoices
    invoices_query = db.collection('organizations', org_id, 'invoices').where('clientId', '==', client_id)
    if event_id:
        invoices_query = invoices_query.where('eventId', '==', event_id)
    
    invoices = []
    for doc in invoices_query.get():
        invoice_data = doc.to_dict()
        invoice_data['id'] = doc.id
        invoices.append(invoice_data)
    
    # Get client payments
    payments_query = db.collection('organizations', org_id, 'payments').where('clientId', '==', client_id)
    payments = []
    for doc in payments_query.get():
        payment_data = doc.to_dict()
        payment_data['id'] = doc.id
        payments.append(payment_data)
    
    # Create timeline entries
    timeline = []
    
    # Add invoice events
    for invoice in invoices:
        if invoice.get('status') == 'SENT' and invoice.get('sentAt'):
            timeline.append({
                "type": "INVOICE_SENT",
                "date": invoice['sentAt'],
                "invoiceId": invoice['id'],
                "invoiceType": invoice.get('type'),
                "invoiceNumber": invoice.get('number'),
                "amount": invoice.get('totals', {}).get('grandTotal', 0),
                "eventId": invoice.get('eventId')
            })
    
    # Add payment events
    for payment in payments:
        timeline.append({
            "type": "PAYMENT_RECEIVED",
            "date": payment['paidAt'],
            "paymentId": payment['id'],
            "invoiceId": payment.get('invoiceId'),
            "amount": payment['amount'],
            "method": payment.get('method')
        })
    
    # Sort by date
    timeline.sort(key=lambda x: x['date'])
    
    # Calculate running totals
    total_invoiced = 0
    total_collected = 0
    
    for entry in timeline:
        if entry['type'] == 'INVOICE_SENT':
            total_invoiced += entry['amount']
        elif entry['type'] == 'PAYMENT_RECEIVED':
            total_collected += entry['amount']
        
        entry['runningInvoiced'] = total_invoiced
        entry['runningCollected'] = total_collected
        entry['runningOutstanding'] = total_invoiced - total_collected
    
    # Calculate lifetime value
    lifetime_value = total_collected
    
    return {
        "clientId": client_id,
        "timeline": timeline,
        "summary": {
            "totalInvoiced": total_invoiced,
            "totalCollected": total_collected,
            "outstanding": total_invoiced - total_collected,
            "lifetimeValue": lifetime_value
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
        # Hide draft invoices from clients
        if invoice_data.get("status") == "DRAFT":
            raise HTTPException(status_code=404, detail="Invoice not found")
    elif not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Create reply
    reply_data = {
        "invoiceId": invoice_id,
        "orgId": org_id,
        "message": req.message,
        "type": "CLIENT_REPLY" if user_role == "client" else "ADMIN_REPLY",
        "sentAt": get_utc_now(),
        "sentBy": current_user.get("uid"),
        "senderRole": user_role
    }
    
    reply_ref = db.collection('organizations', org_id, 'invoiceReplies').document()
    reply_ref.set(reply_data)
    
    # TODO: Send notification to the other party
    
    return {"status": "success", "replyId": reply_ref.id}

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
        # Hide draft invoices from clients
        if invoice_data.get("status") == "DRAFT":
            raise HTTPException(status_code=404, detail="Invoice not found")
    elif not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Get replies
    replies_query = db.collection('organizations', org_id, 'invoiceReplies').where('invoiceId', '==', invoice_id)
    
    replies = []
    for doc in replies_query.order_by('sentAt').get():
        reply_data = doc.to_dict()
        reply_data['id'] = doc.id
        replies.append(reply_data)
    
    return replies

# --- Invoice Communication/Messaging Endpoints ---
@router.get("/invoices/{invoice_id}/messages")
async def get_invoice_messages(
    invoice_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get communication thread for an invoice"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role", "").lower()
    
    db = firestore.client()
    
    # Check invoice exists and permissions
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
    """Send a message about an invoice"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role", "").lower()
    user_id = current_user.get("uid")
    
    db = firestore.client()
    
    # Check invoice exists and permissions
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
        # Clients can only send CLIENT_REPLY messages
        if req.type != "CLIENT_REPLY":
            req.type = "CLIENT_REPLY"
    elif not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Create message
    message_data = {
        "invoiceId": invoice_id,
        "message": req.message,
        "type": req.type,
        "sentBy": user_id,
        "sentByRole": user_role,
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
            client_ref = db.collection('organizations', org_id, 'clients').document(invoice_data.get('clientId'))
            client_doc = client_ref.get()
            client_data = client_doc.to_dict() if client_doc.exists else {}
            
            # Get org data
            org_ref = db.collection('organizations').document(org_id)
            org_doc = org_ref.get()
            org_data = org_doc.to_dict() if org_doc.exists else {}
            
            # Send email based on message type and sender
            if user_role == "client":
                # Client sent a reply - notify admin/accountant
                admin_users = db.collection('users').where('orgId', '==', org_id).where('role', 'in', ['admin', 'accountant']).get()
                for admin_doc in admin_users:
                    admin_data = admin_doc.to_dict()
                    admin_email = admin_data.get('email')
                    if admin_email:
                        email_service.send_client_reply_notification(
                            invoice_data, client_data, req.message, admin_email, org_data
                        )
            else:
                # Admin/accountant sent a message - notify client
                client_email = client_data.get('profile', {}).get('email')
                if client_email:
                    email_service.send_invoice_message_notification(
                        invoice_data, client_data, req.message, org_data
                    )
        except Exception as e:
            print(f"Failed to send email notification: {str(e)}")
            # Don't fail the API call if email fails
    
    return {"status": "success", "messageId": message_ref.id}

@router.delete("/invoices/{invoice_id}/messages/{message_id}")
async def delete_invoice_message(
    invoice_id: str,
    message_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a message (admin/accountant only)"""
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    org_id = current_user.get("orgId")
    db = firestore.client()
    
    # Check message exists and belongs to this invoice
    message_ref = db.collection('organizations', org_id, 'invoiceMessages').document(message_id)
    message_doc = message_ref.get()
    
    if not message_doc.exists:
        raise HTTPException(status_code=404, detail="Message not found")
    
    message_data = message_doc.to_dict()
    if message_data.get('invoiceId') != invoice_id:
        raise HTTPException(status_code=400, detail="Message does not belong to this invoice")
    
    # Delete message
    message_ref.delete()
    
    return {"status": "success"}

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
    now_utc = get_utc_now()
    
    # Get all SENT and PARTIAL FINAL invoices
    invoices_query = db.collection('organizations', org_id, 'invoices').where(
        'type', '==', 'FINAL'
    ).where(
        'status', 'in', ['SENT', 'PARTIAL']
    ).get()
    
    updated_count = 0
    for doc in invoices_query:
        invoice_data = doc.to_dict()
        due_date = invoice_data.get('dueDate')
        
        if due_date:
            due_dt = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
            if now_utc > due_dt:
                doc.reference.update({
                    'status': 'OVERDUE',
                    'updatedAt': now_utc
                })
                updated_count += 1
    
    return {"status": "success", "updatedCount": updated_count}

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
    query = db.collection('organizations', org_id, 'invoices')
    
    invoices = []
    for doc in query.get():
        invoice_data = doc.to_dict()
        
        # Filter by date if provided
        if start_date or end_date:
            issue_date = invoice_data.get('issueDate')
            if issue_date:
                if start_date and issue_date < start_date:
                    continue
                if end_date and issue_date > end_date:
                    continue
        
        invoices.append({
            "id": doc.id,
            "number": invoice_data.get('number', ''),
            "type": invoice_data.get('type'),
            "clientId": invoice_data.get('clientId'),
            "issueDate": invoice_data.get('issueDate'),
            "dueDate": invoice_data.get('dueDate'),
            "status": invoice_data.get('status'),
            "grandTotal": invoice_data.get('totals', {}).get('grandTotal', 0),
            "amountPaid": invoice_data.get('totals', {}).get('amountPaid', 0),
            "amountDue": invoice_data.get('totals', {}).get('amountDue', 0),
            "currency": invoice_data.get('currency', 'INR')
        })
    
    return invoices

@router.get("/reports/aging")
async def get_aging_report(
    current_user: dict = Depends(get_current_user)
):
    """Get detailed aging report for FINAL invoices"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_financial_hub(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for Financial Hub")
    
    db = firestore.client()
    now_utc = get_utc_now()
    
    # Get all FINAL invoices with amounts due
    invoices_query = db.collection('organizations', org_id, 'invoices').where(
        'type', '==', 'FINAL'
    ).get()
    
    aging_details = []
    
    for doc in invoices_query:
        invoice_data = doc.to_dict()
        amount_due = invoice_data.get('totals', {}).get('amountDue', 0)
        
        if amount_due > 0 and invoice_data.get('status') in ['SENT', 'PARTIAL', 'OVERDUE']:
            due_date = invoice_data.get('dueDate')
            if due_date:
                due_dt = datetime.fromisoformat(due_date.replace('Z', '+00:00'))
                days_overdue = (now_utc - due_dt).days
                
                aging_bucket = "Current"
                if days_overdue > 0:
                    if days_overdue <= 15:
                        aging_bucket = "0-15 days"
                    elif days_overdue <= 30:
                        aging_bucket = "16-30 days"
                    elif days_overdue <= 60:
                        aging_bucket = "31-60 days"
                    elif days_overdue <= 90:
                        aging_bucket = "61-90 days"
                    else:
                        aging_bucket = "90+ days"
                
                aging_details.append({
                    "invoiceId": doc.id,
                    "number": invoice_data.get('number', ''),
                    "clientId": invoice_data.get('clientId'),
                    "dueDate": due_date,
                    "amountDue": amount_due,
                    "daysOverdue": max(0, days_overdue),
                    "agingBucket": aging_bucket
                })
    
    return aging_details

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
    
    # Generate PDF
    try:
        pdf_generator = PDFGenerator()
        pdf_data = pdf_generator.generate_invoice_pdf(invoice_data)
        
        return Response(
            content=pdf_data,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f"attachment; filename=Invoice-{invoice_data.get('number', invoice_id)}.pdf"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")
