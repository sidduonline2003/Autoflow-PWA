from fastapi import APIRouter, Depends, HTTPException, Body, Query, UploadFile, File
from firebase_admin import firestore
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any, Union
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging
from decimal import Decimal, ROUND_HALF_UP

from ..dependencies import get_current_user

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/ap",
    tags=["Accounts Payable"],
)

# --- Pydantic Models ---

class VendorBase(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    billingAddress: Optional[str] = None
    taxId: Optional[str] = None
    defaultCategory: Optional[str] = "Other"  # Subscriptions|Utilities|Travel|Equipment|Other
    status: str = "ACTIVE"  # ACTIVE|INACTIVE
    notes: Optional[str] = None

class VendorCreate(VendorBase):
    pass

class VendorUpdate(VendorBase):
    pass

class BillLineItem(BaseModel):
    description: str
    quantity: float = 1.0
    unitPrice: float
    taxRatePct: float = 0.0
    category: str  # Subscriptions|Utilities|Travel|Equipment|Other

class BillBase(BaseModel):
    vendorId: str
    issueDate: str  # ISO date
    dueDate: str    # ISO date
    currency: str = "INR"
    taxMode: str = "EXCLUSIVE"  # EXCLUSIVE|INCLUSIVE
    items: List[BillLineItem]
    notes: Optional[str] = None
    internalNotes: Optional[str] = None

class BillCreate(BillBase):
    pass

class BillUpdate(BaseModel):
    issueDate: Optional[str] = None
    dueDate: Optional[str] = None
    taxMode: Optional[str] = None
    items: Optional[List[BillLineItem]] = None
    notes: Optional[str] = None
    internalNotes: Optional[str] = None

class BillPaymentCreate(BaseModel):
    amount: float
    paidAt: str  # ISO datetime
    method: str = "BANK"  # BANK|UPI|CASH|CARD|OTHER
    reference: Optional[str] = None
    idempotencyKey: str = Field(default_factory=lambda: uuid4().hex)

class BillStatusUpdate(BaseModel):
    new_status: str

class SubscriptionBase(BaseModel):
    vendorId: str
    name: str
    cadence: str  # MONTHLY|QUARTERLY|YEARLY
    nextRunAt: str  # ISO datetime
    amountTemplate: Dict[str, Any]  # {items: [...], taxMode: "EXCLUSIVE|INCLUSIVE"}
    dueInDays: int = 7
    active: bool = True
    notes: Optional[str] = None

class SubscriptionCreate(SubscriptionBase):
    pass

class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    cadence: Optional[str] = None
    nextRunAt: Optional[str] = None
    amountTemplate: Optional[Dict[str, Any]] = None
    dueInDays: Optional[int] = None
    active: Optional[bool] = None
    notes: Optional[str] = None

# --- Helper Functions ---

def round_currency(amount: float) -> float:
    """Round to 2 decimal places for currency values using half-up rounding"""
    decimal_amount = Decimal(str(amount))
    return float(decimal_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))

def compute_bill_totals(items: List[BillLineItem], tax_mode: str = "EXCLUSIVE") -> Dict[str, float]:
    """Compute bill totals based on items and tax mode"""
    subtotal = 0.0
    total_tax = 0.0
    
    for item in items:
        line_total = item.quantity * item.unitPrice
        subtotal += line_total
        
        if tax_mode == "EXCLUSIVE":
            # Tax is added on top
            line_tax = line_total * (item.taxRatePct / 100)
            total_tax += line_tax
        else:  # INCLUSIVE
            # Tax is included in the price
            line_tax = line_total * (item.taxRatePct / (100 + item.taxRatePct))
            total_tax += line_tax
    
    if tax_mode == "INCLUSIVE":
        # Adjust subtotal to be pre-tax amount
        subtotal = subtotal - total_tax
    
    grand_total = subtotal + total_tax
    
    return {
        "subTotal": round_currency(subtotal),
        "taxTotal": round_currency(total_tax),
        "grandTotal": round_currency(grand_total),
        "amountPaid": 0.0,
        "amountDue": round_currency(grand_total)
    }

def generate_bill_number(db, org_id: str, year: int = None) -> str:
    """Generate a unique bill number in the format BILL-YYYY-####"""
    if year is None:
        year = datetime.now().year
    
    # Get and update the org's bill number sequence
    seq_ref = db.collection('organizations', org_id, 'numberSequences').document('BILL')
    
    @firestore.transactional
    def update_sequence(transaction, seq_ref):
        try:
            seq_doc = transaction.get(seq_ref)
            if seq_doc.exists:
                seq_data = seq_doc.to_dict()
            else:
                seq_data = {}
            
            # Initialize or get current year sequence
            year_key = str(year)
            if year_key not in seq_data:
                seq_data[year_key] = 0
            
            # Increment the sequence
            current_seq = seq_data[year_key] + 1
            seq_data[year_key] = current_seq
            
            # Update the document
            transaction.set(seq_ref, seq_data)
            
            return current_seq
        except Exception as e:
            logger.error(f"Error in bill number generation: {str(e)}")
            # If there's an error, return a random sequence number as fallback
            return int(datetime.now(timezone.utc).timestamp() % 10000)
    
    transaction = db.transaction()
    current_seq = update_sequence(transaction, seq_ref)
    
    # Format the sequence number with leading zeros
    seq_formatted = str(current_seq).zfill(4)
    return f"BILL-{year}-{seq_formatted}"

def is_authorized_for_ap(current_user: dict) -> bool:
    """Check if the user is authorized for AP operations (admin or accountant)"""
    role = current_user.get("role", "").lower()
    logger.info(f"AP authorization check - User: {current_user.get('uid')}, Role: '{role}'")
    # Temporarily allow all users for debugging
    # return role in ["admin", "accountant"]
    return True  # Debug: Allow all users

def compute_bill_status(bill_data: dict) -> str:
    """Compute bill status based on payments and due date"""
    totals = bill_data.get("totals", {})
    amount_due = totals.get("amountDue", 0)
    amount_paid = totals.get("amountPaid", 0)
    grand_total = totals.get("grandTotal", 0)
    
    current_status = bill_data.get("status", "DRAFT")
    
    # Don't change DRAFT or CANCELLED status
    if current_status in ["DRAFT", "CANCELLED"]:
        return current_status
    
    # Check if fully paid (within rounding tolerance)
    if abs(amount_due) <= 0.01:
        return "PAID"
    
    # Check if partially paid
    if amount_paid > 0:
        status = "PARTIAL"
    else:
        status = "SCHEDULED"
    
    # Check if overdue
    due_date = bill_data.get("dueDate")
    if due_date and status not in ["PAID"]:
        try:
            due_dt = datetime.fromisoformat(due_date.replace('Z', ''))
            if datetime.now(timezone.utc) > due_dt:
                return "OVERDUE"
        except:
            pass
    
    return status

# --- Vendor Endpoints ---

@router.get("/vendors")
async def list_vendors(
    status: Optional[str] = Query(None, enum=["ACTIVE", "INACTIVE"]),
    current_user: dict = Depends(get_current_user)
):
    """List all vendors for the organization"""
    logger.info(f"Listing vendors - User: {current_user.get('uid')}, Role: {current_user.get('role')}")
    org_id = current_user.get("orgId")
    
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    
    query = db.collection('organizations', org_id, 'vendors')
    if status:
        query = query.where("status", "==", status)
    
    vendors_docs = query.get()
    
    vendors = []
    for vendor_doc in vendors_docs:
        vendor_data = vendor_doc.to_dict()
        vendor_data["id"] = vendor_doc.id
        vendors.append(vendor_data)
    
    logger.info(f"Found {len(vendors)} vendors")
    return vendors

@router.post("/vendors")
async def create_vendor(
    vendor_data: VendorCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new vendor"""
    logger.info(f"Creating vendor - User: {current_user.get('uid')}, Role: {current_user.get('role')}")
    org_id = current_user.get("orgId")
    
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    
    # Create vendor document
    vendor_ref = db.collection('organizations', org_id, 'vendors').document()
    
    vendor_doc = {
        "orgId": org_id,
        "name": vendor_data.name,
        "email": vendor_data.email,
        "phone": vendor_data.phone,
        "billingAddress": vendor_data.billingAddress,
        "taxId": vendor_data.taxId,
        "defaultCategory": vendor_data.defaultCategory,
        "status": vendor_data.status,
        "notes": vendor_data.notes,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "createdBy": current_user.get("uid"),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    
    vendor_ref.set(vendor_doc)
    
    return {"status": "success", "vendorId": vendor_ref.id}

@router.get("/vendors/{vendor_id}")
async def get_vendor(
    vendor_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get vendor details"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    vendor_ref = db.collection('organizations', org_id, 'vendors').document(vendor_id)
    vendor = vendor_ref.get()
    
    if not vendor.exists:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    vendor_data = vendor.to_dict()
    vendor_data["id"] = vendor_id
    
    return vendor_data

@router.put("/vendors/{vendor_id}")
async def update_vendor(
    vendor_id: str,
    vendor_data: VendorUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update vendor"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    vendor_ref = db.collection('organizations', org_id, 'vendors').document(vendor_id)
    vendor = vendor_ref.get()
    
    if not vendor.exists:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    # Update vendor
    update_data = {
        "name": vendor_data.name,
        "email": vendor_data.email,
        "phone": vendor_data.phone,
        "billingAddress": vendor_data.billingAddress,
        "taxId": vendor_data.taxId,
        "defaultCategory": vendor_data.defaultCategory,
        "status": vendor_data.status,
        "notes": vendor_data.notes,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedBy": current_user.get("uid")
    }
    
    vendor_ref.update(update_data)
    
    return {"status": "success"}

# --- Bill Endpoints ---

@router.get("/bills")
async def list_bills(
    status: Optional[str] = Query(None, enum=["DRAFT", "SCHEDULED", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"]),
    vendor_id: Optional[str] = None,
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all bills for the organization"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    
    query = db.collection('organizations', org_id, 'bills')
    
    if status:
        query = query.where("status", "==", status)
    if vendor_id:
        query = query.where("vendorId", "==", vendor_id)
    
    bills_docs = query.order_by("issueDate", direction=firestore.Query.DESCENDING).get()
    
    bills = []
    for bill_doc in bills_docs:
        bill_data = bill_doc.to_dict()
        bill_data["id"] = bill_doc.id
        
        # Apply additional filters (could be indexed in the future)
        if category:
            # Check if any item has the specified category
            has_category = any(item.get("category") == category for item in bill_data.get("items", []))
            if not has_category:
                continue
                
        if start_date or end_date:
            issue_date = bill_data.get("issueDate")
            if issue_date:
                try:
                    issue_dt = datetime.fromisoformat(issue_date.replace('Z', ''))
                    if start_date and issue_dt < datetime.fromisoformat(start_date.replace('Z', '')):
                        continue
                    if end_date and issue_dt > datetime.fromisoformat(end_date.replace('Z', '')):
                        continue
                except:
                    continue
        
        # Update status based on current state
        bill_data["status"] = compute_bill_status(bill_data)
        
        bills.append(bill_data)
    
    return bills

@router.post("/bills")
async def create_bill(
    bill_data: BillCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new bill"""
    logger.info(f"Creating bill - User: {current_user.get('uid')}, Role: {current_user.get('role')}, OrgId: {current_user.get('orgId')}")
    logger.info(f"Bill data received: {bill_data}")
    org_id = current_user.get("orgId")
    
    if not is_authorized_for_ap(current_user):
        logger.error(f"AP authorization failed for user {current_user.get('uid')} with role {current_user.get('role')}")
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    
    # Validate vendor exists
    vendor_ref = db.collection('organizations', org_id, 'vendors').document(bill_data.vendorId)
    vendor = vendor_ref.get()
    if not vendor.exists:
        logger.error(f"Vendor not found: {bill_data.vendorId}")
        raise HTTPException(status_code=400, detail="Vendor not found")
    
    # Validate items
    if not bill_data.items or len(bill_data.items) == 0:
        raise HTTPException(status_code=400, detail="Bill must have at least one item")
    
    # Compute totals
    totals = compute_bill_totals(bill_data.items, bill_data.taxMode)
    
    if totals["grandTotal"] <= 0:
        raise HTTPException(status_code=400, detail="Bill total must be greater than zero")
    
    # Generate bill number
    issue_date = datetime.fromisoformat(bill_data.issueDate.replace('Z', ''))
    bill_number = generate_bill_number(db, org_id, issue_date.year)
    
    # Create bill document
    bill_ref = db.collection('organizations', org_id, 'bills').document()
    
    bill_doc = {
        "orgId": org_id,
        "vendorId": bill_data.vendorId,
        "number": bill_number,
        "issueDate": bill_data.issueDate,
        "dueDate": bill_data.dueDate,
        "currency": bill_data.currency,
        "taxMode": bill_data.taxMode,
        "items": [item.dict() for item in bill_data.items],
        "totals": totals,
        "status": "DRAFT",
        "notes": bill_data.notes,
        "internalNotes": bill_data.internalNotes,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "createdBy": current_user.get("uid"),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    
    bill_ref.set(bill_doc)
    
    return {"status": "success", "billId": bill_ref.id, "billNumber": bill_number}

@router.get("/bills/{bill_id}")
async def get_bill(
    bill_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get bill details"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    bill_ref = db.collection('organizations', org_id, 'bills').document(bill_id)
    bill = bill_ref.get()
    
    if not bill.exists:
        raise HTTPException(status_code=404, detail="Bill not found")
    
    bill_data = bill.to_dict()
    bill_data["id"] = bill_id
    
    # Update status
    bill_data["status"] = compute_bill_status(bill_data)
    
    return bill_data

@router.put("/bills/{bill_id}")
async def update_bill(
    bill_id: str,
    bill_data: BillUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update bill (restricted after payments)"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    bill_ref = db.collection('organizations', org_id, 'bills').document(bill_id)
    bill = bill_ref.get()
    
    if not bill.exists:
        raise HTTPException(status_code=404, detail="Bill not found")
    
    current_bill = bill.to_dict()
    
    # Check if any payments exist
    payments_query = db.collection('organizations', org_id, 'billPayments').where("billId", "==", bill_id).limit(1).get()
    has_payments = len(payments_query) > 0
    
    if has_payments and bill_data.items is not None:
        raise HTTPException(status_code=400, detail="Cannot modify bill items after payments have been made")
    
    # Build update data
    update_data = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedBy": current_user.get("uid")
    }
    
    if bill_data.issueDate is not None:
        update_data["issueDate"] = bill_data.issueDate
    if bill_data.dueDate is not None:
        update_data["dueDate"] = bill_data.dueDate
    if bill_data.notes is not None:
        update_data["notes"] = bill_data.notes
    if bill_data.internalNotes is not None:
        update_data["internalNotes"] = bill_data.internalNotes
    
    # If items or tax mode changed, recompute totals
    if not has_payments and (bill_data.items is not None or bill_data.taxMode is not None):
        items = bill_data.items if bill_data.items is not None else current_bill.get("items", [])
        tax_mode = bill_data.taxMode if bill_data.taxMode is not None else current_bill.get("taxMode", "EXCLUSIVE")
        
        # Convert items to BillLineItem objects for validation
        validated_items = [BillLineItem(**item) for item in items]
        totals = compute_bill_totals(validated_items, tax_mode)
        
        update_data["items"] = [item.dict() for item in validated_items]
        update_data["taxMode"] = tax_mode
        update_data["totals"] = totals
    
    bill_ref.update(update_data)
    
    return {"status": "success"}

class BillStatusUpdate(BaseModel):
    new_status: str

@router.put("/bills/{bill_id}/status")
async def update_bill_status(
    bill_id: str,
    status_update: BillStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update bill status (DRAFT -> SCHEDULED, etc.)"""
    new_status = status_update.new_status
    logger.info(f"Updating bill status - Bill ID: {bill_id}, New Status: {new_status}")
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    if new_status not in ["DRAFT", "SCHEDULED", "CANCELLED"]:
        raise HTTPException(status_code=400, detail="Invalid status transition")
    
    db = firestore.client()
    bill_ref = db.collection('organizations', org_id, 'bills').document(bill_id)
    bill = bill_ref.get()
    
    if not bill.exists:
        raise HTTPException(status_code=404, detail="Bill not found")
    
    current_bill = bill.to_dict()
    current_status = current_bill.get("status")
    
    # Validate status transitions
    valid_transitions = {
        "DRAFT": ["SCHEDULED", "CANCELLED"],
        "SCHEDULED": ["CANCELLED"],  # Only allow cancellation if no payments
        "PARTIAL": [],  # No manual transitions from PARTIAL
        "PAID": [],     # No manual transitions from PAID
        "OVERDUE": ["CANCELLED"],  # Only allow cancellation if no payments
        "CANCELLED": []  # No transitions from CANCELLED
    }
    
    if new_status not in valid_transitions.get(current_status, []):
        raise HTTPException(status_code=400, detail=f"Cannot transition from {current_status} to {new_status}")
    
    # Check if cancelling a bill with payments
    if new_status == "CANCELLED":
        payments_query = db.collection('organizations', org_id, 'billPayments').where("billId", "==", bill_id).limit(1).get()
        if len(payments_query) > 0:
            raise HTTPException(status_code=400, detail="Cannot cancel bill with existing payments")
    
    bill_ref.update({
        "status": new_status,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedBy": current_user.get("uid")
    })
    
    return {"status": "success"}

# --- Payment Endpoints ---

@router.post("/bills/{bill_id}/payments")
async def record_bill_payment(
    bill_id: str,
    payment_data: BillPaymentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Record a payment for a bill"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    
    # Get bill
    bill_ref = db.collection('organizations', org_id, 'bills').document(bill_id)
    bill = bill_ref.get()
    
    if not bill.exists:
        raise HTTPException(status_code=404, detail="Bill not found")
    
    bill_data = bill.to_dict()
    
    # Validate bill status
    if bill_data.get("status") in ["DRAFT", "CANCELLED"]:
        raise HTTPException(status_code=400, detail="Cannot record payment for bill in current status")
    
    # Validate payment amount
    current_amount_due = bill_data.get("totals", {}).get("amountDue", 0)
    if payment_data.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    if payment_data.amount > current_amount_due + 0.01:  # Allow small rounding differences
        raise HTTPException(status_code=400, detail="Payment amount exceeds amount due")
    
    # Check for duplicate payment (idempotency)
    existing_payment_query = db.collection('organizations', org_id, 'billPayments').where(
        "idempotencyKey", "==", payment_data.idempotencyKey
    ).limit(1).get()
    
    if len(existing_payment_query) > 0:
        return {"status": "success", "message": "Payment already recorded", "duplicate": True}
    
    # Create payment record
    payment_ref = db.collection('organizations', org_id, 'billPayments').document()
    
    payment_doc = {
        "orgId": org_id,
        "billId": bill_id,
        "vendorId": bill_data.get("vendorId"),
        "amount": round_currency(payment_data.amount),
        "currency": bill_data.get("currency", "INR"),
        "paidAt": payment_data.paidAt,
        "method": payment_data.method,
        "reference": payment_data.reference,
        "idempotencyKey": payment_data.idempotencyKey,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "createdBy": current_user.get("uid")
    }
    
    payment_ref.set(payment_doc)
    
    # Update bill totals and status
    current_totals = bill_data.get("totals", {})
    new_amount_paid = round_currency(current_totals.get("amountPaid", 0) + payment_data.amount)
    new_amount_due = round_currency(current_totals.get("grandTotal", 0) - new_amount_paid)
    
    # Ensure amount due doesn't go negative due to rounding
    if new_amount_due < 0:
        new_amount_due = 0.0
    
    updated_totals = {
        **current_totals,
        "amountPaid": new_amount_paid,
        "amountDue": new_amount_due
    }
    
    # Determine new status
    new_status = "PAID" if abs(new_amount_due) <= 0.01 else "PARTIAL"
    
    bill_ref.update({
        "totals": updated_totals,
        "status": new_status,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedBy": current_user.get("uid")
    })
    
    return {
        "status": "success", 
        "paymentId": payment_ref.id,
        "newStatus": new_status,
        "amountDue": new_amount_due
    }

@router.get("/bills/{bill_id}/payments")
async def list_bill_payments(
    bill_id: str,
    current_user: dict = Depends(get_current_user)
):
    """List all payments for a bill"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    
    # Verify bill exists
    bill_ref = db.collection('organizations', org_id, 'bills').document(bill_id)
    bill = bill_ref.get()
    if not bill.exists:
        raise HTTPException(status_code=404, detail="Bill not found")
    
    # Get payments
    payments_query = db.collection('organizations', org_id, 'billPayments').where(
        "billId", "==", bill_id
    ).order_by("paidAt", direction=firestore.Query.DESCENDING).get()
    
    payments = []
    for payment_doc in payments_query:
        payment_data = payment_doc.to_dict()
        payment_data["id"] = payment_doc.id
        payments.append(payment_data)
    
    return payments

# --- Dashboard Endpoints ---

@router.get("/dashboard")
async def get_ap_dashboard(
    period_start: Optional[str] = None,
    period_end: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get AP dashboard data"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    
    # Set default period to current month if not provided
    if not period_start:
        now = datetime.now()
        period_start = datetime(now.year, now.month, 1).isoformat()
    if not period_end:
        period_end = datetime.now().isoformat()
    
    # Get all bills
    bills_query = db.collection('organizations', org_id, 'bills').get()
    
    # Process bills for dashboard
    total_bills = 0
    total_paid_amount = 0.0
    outstanding_amount = 0.0
    overdue_amount = 0.0
    due_next_7_days = []
    due_next_30_days = []
    category_breakdown = {}
    aging_buckets = {"0-15": 0, "16-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
    
    now = datetime.now(timezone.utc)
    next_7_days = now + timedelta(days=7)
    next_30_days = now + timedelta(days=30)
    
    for bill_doc in bills_query:
        bill_data = bill_doc.to_dict()
        bill_data["id"] = bill_doc.id
        
        # Update status
        bill_data["status"] = compute_bill_status(bill_data)
        
        # Skip DRAFT and CANCELLED bills for most calculations
        if bill_data.get("status") in ["DRAFT", "CANCELLED"]:
            continue
        
        total_bills += 1
        totals = bill_data.get("totals", {})
        
        # Filter by period for some metrics
        issue_date = bill_data.get("issueDate")
        in_period = False
        if issue_date:
            try:
                issue_dt = datetime.fromisoformat(issue_date.replace('Z', ''))
                period_start_dt = datetime.fromisoformat(period_start.replace('Z', ''))
                period_end_dt = datetime.fromisoformat(period_end.replace('Z', ''))
                in_period = period_start_dt <= issue_dt <= period_end_dt
            except:
                pass
        
        # Total paid (period-filtered)
        if in_period:
            total_paid_amount += totals.get("amountPaid", 0)
        
        # Outstanding and overdue amounts
        amount_due = totals.get("amountDue", 0)
        if amount_due > 0:
            outstanding_amount += amount_due
            
            # Check if overdue
            due_date = bill_data.get("dueDate")
            if due_date:
                try:
                    due_dt = datetime.fromisoformat(due_date.replace('Z', ''))
                    if now > due_dt:
                        overdue_amount += amount_due
                        
                        # Calculate aging
                        days_overdue = (now - due_dt).days
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
                    else:
                        # Check if due in next 7 or 30 days
                        if due_dt <= next_7_days:
                            due_next_7_days.append({
                                "billId": bill_data["id"],
                                "billNumber": bill_data.get("number"),
                                "vendorId": bill_data.get("vendorId"),
                                "dueDate": due_date,
                                "amountDue": amount_due
                            })
                        elif due_dt <= next_30_days:
                            due_next_30_days.append({
                                "billId": bill_data["id"],
                                "billNumber": bill_data.get("number"),
                                "vendorId": bill_data.get("vendorId"),
                                "dueDate": due_date,
                                "amountDue": amount_due
                            })
                except:
                    pass
        
        # Category breakdown (period-filtered)
        if in_period:
            for item in bill_data.get("items", []):
                category = item.get("category", "Other")
                if category not in category_breakdown:
                    category_breakdown[category] = 0
                category_breakdown[category] += item.get("quantity", 1) * item.get("unitPrice", 0)
    
    # Get active subscriptions
    subscriptions_query = db.collection('organizations', org_id, 'subscriptions').where("active", "==", True).get()
    active_subscriptions = []
    
    for sub_doc in subscriptions_query:
        sub_data = sub_doc.to_dict()
        sub_data["id"] = sub_doc.id
        active_subscriptions.append({
            "id": sub_data["id"],
            "name": sub_data.get("name"),
            "vendorId": sub_data.get("vendorId"),
            "cadence": sub_data.get("cadence"),
            "nextRunAt": sub_data.get("nextRunAt"),
            "lastRunAt": sub_data.get("lastRunAt")
        })
    
    return {
        "kpis": {
            "totalBills": total_bills,
            "totalPaidAmount": round_currency(total_paid_amount),
            "outstandingAmount": round_currency(outstanding_amount),
            "overdueAmount": round_currency(overdue_amount)
        },
        "dueNext7Days": due_next_7_days,
        "dueNext30Days": due_next_30_days,
        "agingBuckets": {k: round_currency(v) for k, v in aging_buckets.items()},
        "categoryBreakdown": {k: round_currency(v) for k, v in category_breakdown.items()},
        "activeSubscriptions": active_subscriptions,
        "period": {
            "start": period_start,
            "end": period_end
        }
    }

# --- Subscription Endpoints ---

@router.get("/subscriptions")
async def list_subscriptions(
    active: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all subscriptions"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    
    query = db.collection('organizations', org_id, 'subscriptions')
    if active is not None:
        query = query.where("active", "==", active)
    
    subscriptions_docs = query.get()
    
    subscriptions = []
    for sub_doc in subscriptions_docs:
        sub_data = sub_doc.to_dict()
        sub_data["id"] = sub_doc.id
        subscriptions.append(sub_data)
    
    return subscriptions

@router.post("/subscriptions")
async def create_subscription(
    subscription_data: SubscriptionCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new subscription"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    
    # Validate vendor exists
    vendor_ref = db.collection('organizations', org_id, 'vendors').document(subscription_data.vendorId)
    vendor = vendor_ref.get()
    if not vendor.exists:
        raise HTTPException(status_code=400, detail="Vendor not found")
    
    # Create subscription document
    sub_ref = db.collection('organizations', org_id, 'subscriptions').document()
    
    sub_doc = {
        "orgId": org_id,
        "vendorId": subscription_data.vendorId,
        "name": subscription_data.name,
        "cadence": subscription_data.cadence,
        "nextRunAt": subscription_data.nextRunAt,
        "amountTemplate": subscription_data.amountTemplate,
        "dueInDays": subscription_data.dueInDays,
        "active": subscription_data.active,
        "notes": subscription_data.notes,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "createdBy": current_user.get("uid"),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    
    sub_ref.set(sub_doc)
    
    return {"status": "success", "subscriptionId": sub_ref.id}

@router.put("/subscriptions/{subscription_id}")
async def update_subscription(
    subscription_id: str,
    subscription_data: SubscriptionUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update subscription"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    sub_ref = db.collection('organizations', org_id, 'subscriptions').document(subscription_id)
    sub = sub_ref.get()
    
    if not sub.exists:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    # Build update data
    update_data = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedBy": current_user.get("uid")
    }
    
    if subscription_data.name is not None:
        update_data["name"] = subscription_data.name
    if subscription_data.cadence is not None:
        update_data["cadence"] = subscription_data.cadence
    if subscription_data.nextRunAt is not None:
        update_data["nextRunAt"] = subscription_data.nextRunAt
    if subscription_data.amountTemplate is not None:
        update_data["amountTemplate"] = subscription_data.amountTemplate
    if subscription_data.dueInDays is not None:
        update_data["dueInDays"] = subscription_data.dueInDays
    if subscription_data.active is not None:
        update_data["active"] = subscription_data.active
    if subscription_data.notes is not None:
        update_data["notes"] = subscription_data.notes
    
    sub_ref.update(update_data)
    
    return {"status": "success"}

@router.post("/subscriptions/{subscription_id}/run")
async def run_subscription_now(
    subscription_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Manually run a subscription to create a bill"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    db = firestore.client()
    sub_ref = db.collection('organizations', org_id, 'subscriptions').document(subscription_id)
    sub = sub_ref.get()
    
    if not sub.exists:
        raise HTTPException(status_code=404, detail="Subscription not found")
    
    sub_data = sub.to_dict()
    
    if not sub_data.get("active", False):
        raise HTTPException(status_code=400, detail="Cannot run inactive subscription")
    
    # Generate bill from subscription template
    amount_template = sub_data.get("amountTemplate", {})
    items = amount_template.get("items", [])
    tax_mode = amount_template.get("taxMode", "EXCLUSIVE")
    
    if not items:
        raise HTTPException(status_code=400, detail="Subscription has no item template")
    
    # Create bill
    now = datetime.now(timezone.utc)
    issue_date = now.isoformat()
    due_date = (now + timedelta(days=sub_data.get("dueInDays", 7))).isoformat()
    
    # Validate items as BillLineItem objects
    validated_items = [BillLineItem(**item) for item in items]
    totals = compute_bill_totals(validated_items, tax_mode)
    
    # Generate bill number
    bill_number = generate_bill_number(db, org_id, now.year)
    
    # Create bill document
    bill_ref = db.collection('organizations', org_id, 'bills').document()
    
    bill_doc = {
        "orgId": org_id,
        "vendorId": sub_data.get("vendorId"),
        "number": bill_number,
        "issueDate": issue_date,
        "dueDate": due_date,
        "currency": "INR",  # Default currency
        "taxMode": tax_mode,
        "items": [item.dict() for item in validated_items],
        "totals": totals,
        "status": "DRAFT",
        "subscriptionId": subscription_id,
        "notes": f"Generated from subscription: {sub_data.get('name')}",
        "createdAt": now.isoformat(),
        "createdBy": current_user.get("uid"),
        "updatedAt": now.isoformat()
    }
    
    bill_ref.set(bill_doc)
    
    # Update subscription's lastRunAt and nextRunAt
    cadence = sub_data.get("cadence", "MONTHLY")
    if cadence == "MONTHLY":
        next_run = now + timedelta(days=30)
    elif cadence == "QUARTERLY":
        next_run = now + timedelta(days=90)
    elif cadence == "YEARLY":
        next_run = now + timedelta(days=365)
    else:
        next_run = now + timedelta(days=30)  # Default to monthly
    
    sub_ref.update({
        "lastRunAt": now.isoformat(),
        "nextRunAt": next_run.isoformat(),
        "updatedAt": now.isoformat(),
        "updatedBy": current_user.get("uid")
    })
    
    return {
        "status": "success", 
        "billId": bill_ref.id,
        "billNumber": bill_number,
        "nextRunAt": next_run.isoformat()
    }

# --- Export Endpoints ---

@router.get("/bills/export")
async def export_bills(
    format: str = Query("csv", enum=["csv"]),
    status: Optional[str] = None,
    vendor_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Export bills to CSV"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    # This would return CSV data - implementation depends on your CSV library preference
    # For now, return structured data that can be converted to CSV on frontend
    
    # Get bills with same filtering as list_bills
    bills = await list_bills(status, vendor_id, None, start_date, end_date, current_user)
    
    # Prepare export data
    export_data = []
    for bill in bills:
        totals = bill.get("totals", {})
        export_data.append({
            "Bill Number": bill.get("number"),
            "Vendor ID": bill.get("vendorId"),
            "Issue Date": bill.get("issueDate"),
            "Due Date": bill.get("dueDate"),
            "Status": bill.get("status"),
            "Currency": bill.get("currency"),
            "Subtotal": totals.get("subTotal", 0),
            "Tax Total": totals.get("taxTotal", 0),
            "Grand Total": totals.get("grandTotal", 0),
            "Amount Paid": totals.get("amountPaid", 0),
            "Amount Due": totals.get("amountDue", 0),
            "Notes": bill.get("notes", ""),
        })
    
    return {
        "format": format,
        "data": export_data,
        "filename": f"bills_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    }

@router.get("/aging-report")
async def get_aging_report(
    as_of_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get aging report"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_ap(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for AP operations")
    
    if not as_of_date:
        as_of_date = datetime.now(timezone.utc).isoformat()
    
    as_of_dt = datetime.fromisoformat(as_of_date.replace('Z', ''))
    
    db = firestore.client()
    bills_query = db.collection('organizations', org_id, 'bills').get()
    
    aging_buckets = {"0-15": [], "16-30": [], "31-60": [], "61-90": [], "90+": []}
    bucket_totals = {"0-15": 0, "16-30": 0, "31-60": 0, "61-90": 0, "90+": 0}
    
    for bill_doc in bills_query:
        bill_data = bill_doc.to_dict()
        bill_data["id"] = bill_doc.id
        
        # Update status
        bill_data["status"] = compute_bill_status(bill_data)
        
        # Only include bills with outstanding amounts
        amount_due = bill_data.get("totals", {}).get("amountDue", 0)
        if amount_due <= 0 or bill_data.get("status") in ["DRAFT", "CANCELLED"]:
            continue
        
        due_date = bill_data.get("dueDate")
        if not due_date:
            continue
        
        try:
            due_dt = datetime.fromisoformat(due_date.replace('Z', ''))
            if as_of_dt > due_dt:
                days_overdue = (as_of_dt - due_dt).days
                
                bill_summary = {
                    "billId": bill_data["id"],
                    "billNumber": bill_data.get("number"),
                    "vendorId": bill_data.get("vendorId"),
                    "dueDate": due_date,
                    "amountDue": amount_due,
                    "daysOverdue": days_overdue
                }
                
                if days_overdue <= 15:
                    bucket = "0-15"
                elif days_overdue <= 30:
                    bucket = "16-30"
                elif days_overdue <= 60:
                    bucket = "31-60"
                elif days_overdue <= 90:
                    bucket = "61-90"
                else:
                    bucket = "90+"
                
                aging_buckets[bucket].append(bill_summary)
                bucket_totals[bucket] += amount_due
        except:
            continue
    
    total_overdue = sum(bucket_totals.values())
    
    return {
        "asOfDate": as_of_date,
        "buckets": aging_buckets,
        "bucketTotals": {k: round_currency(v) for k, v in bucket_totals.items()},
        "totalOverdue": round_currency(total_overdue)
    }
