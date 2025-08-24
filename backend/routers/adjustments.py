from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
from uuid import uuid4
import logging

from ..dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/financial-hub/adjustments",
    tags=["Journal Adjustments"],
)

# --- Pydantic Models ---
class JournalLine(BaseModel):
    bucket: str = Field(..., pattern="^(Revenue|DirectCost|Opex|TaxCollected|TaxPaid)$")
    amount: float  # positive = increase bucket, negative = decrease
    currency: str = "INR"
    clientId: Optional[str] = None
    eventId: Optional[str] = None
    vendorId: Optional[str] = None
    memo: Optional[str] = None

class JournalAdjustmentCreate(BaseModel):
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    lines: List[JournalLine] = Field(..., min_items=1)
    notes: Optional[str] = None

class JournalAdjustmentUpdate(BaseModel):
    lines: Optional[List[JournalLine]] = None
    notes: Optional[str] = None

class JournalAdjustmentVoid(BaseModel):
    reason: str = Field(..., min_length=10)

# --- Helper Functions ---
def get_utc_now():
    """Get current time in UTC"""
    return datetime.now(timezone.utc)

def is_authorized_for_adjustments(current_user: dict) -> bool:
    """Check if user can manage adjustments (ADMIN or ACCOUNTANT only)"""
    role = current_user.get("role", "").lower()
    return role in ["admin", "accountant"]

def format_period_id(year: int, month: int) -> str:
    """Format period ID as YYYY-MM"""
    return f"{year}-{month:02d}"

def format_period_label(year: int, month: int) -> str:
    """Format period label as 'MMM YYYY'"""
    month_names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return f"{month_names[month]} {year}"

def is_period_closed(db, org_id: str, year: int, month: int) -> bool:
    """Check if a period is closed"""
    try:
        period_id = format_period_id(year, month)
        period_ref = db.collection('organizations', org_id, 'periods').document(period_id)
        period_doc = period_ref.get()
        
        if period_doc.exists:
            return period_doc.to_dict().get('status') == 'CLOSED'
        return False
    except Exception:
        return False

def calculate_adjustment_total(lines: List[JournalLine]) -> float:
    """Calculate total adjustment amount"""
    return sum(line.amount for line in lines)

def audit_log(db, org_id: str, entity: str, action: str, actor: str, payload_summary: str = ""):
    """Log audit events"""
    try:
        audit_ref = db.collection('organizations', org_id, 'auditLogs').document()
        audit_ref.set({
            "entity": entity,
            "action": action,
            "actor": actor,
            "timestamp": get_utc_now(),
            "payloadSummary": payload_summary
        })
    except Exception as e:
        logger.warning(f"Failed to write audit log: {e}")

def update_monthly_snapshot(db, org_id: str, year: int, month: int):
    """Update monthly snapshot to include adjustments"""
    try:
        # Get all published adjustments for the period
        adjustments_query = db.collection('organizations', org_id, 'journalAdjustments').where(
            'period.year', '==', year
        ).where(
            'period.month', '==', month
        ).where(
            'status', '==', 'PUBLISHED'
        ).get()
        
        # Aggregate adjustment totals by bucket
        adjustment_totals = {
            "Revenue": 0,
            "DirectCost": 0,
            "Opex": 0,
            "TaxCollected": 0,
            "TaxPaid": 0
        }
        
        for adj_doc in adjustments_query:
            adj_data = adj_doc.to_dict()
            for line in adj_data.get('lines', []):
                bucket = line.get('bucket')
                amount = line.get('amount', 0)
                if bucket in adjustment_totals:
                    adjustment_totals[bucket] += amount
        
        # Update snapshot
        snapshot_id = format_period_id(year, month)
        snapshot_ref = db.collection('organizations', org_id, 'reportSnapshots').document(snapshot_id)
        snapshot_ref.update({
            "adjustments": adjustment_totals,
            "lastUpdated": get_utc_now()
        })
        
    except Exception as e:
        logger.warning(f"Failed to update monthly snapshot: {e}")

# --- API Endpoints ---
@router.get("/")
async def list_adjustments(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    status: Optional[str] = Query(None, pattern="^(DRAFT|PUBLISHED|VOID)$"),
    current_user: dict = Depends(get_current_user)
):
    """List journal adjustments with filtering"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_adjustments(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for adjustments")
    
    db = firestore.client()
    
    # Build query
    query = db.collection('organizations', org_id, 'journalAdjustments')
    
    if year:
        query = query.where('period.year', '==', year)
    if month:
        query = query.where('period.month', '==', month)
    if status:
        query = query.where('status', '==', status)
    
    adjustments = []
    for doc in query.order_by('createdAt', direction=firestore.Query.DESCENDING).get():
        adj_data = doc.to_dict()
        adj_data['id'] = doc.id
        adjustments.append(adj_data)
    
    return adjustments

@router.post("/")
async def create_adjustment(
    req: JournalAdjustmentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new journal adjustment"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_adjustments(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for adjustments")
    
    db = firestore.client()
    
    # Validate period is closed
    if not is_period_closed(db, org_id, req.year, req.month):
        raise HTTPException(
            status_code=400, 
            detail=f"Period {format_period_label(req.year, req.month)} is not closed. Adjustments are only allowed for closed periods."
        )
    
    # Validate adjustment lines
    if not req.lines:
        raise HTTPException(status_code=400, detail="At least one adjustment line is required")
    
    total = calculate_adjustment_total(req.lines)
    
    # Create adjustment
    now = get_utc_now()
    adjustment_data = {
        "orgId": org_id,
        "period": {
            "year": req.year,
            "month": req.month,
            "label": format_period_label(req.year, req.month)
        },
        "status": "DRAFT",
        "lines": [line.dict() for line in req.lines],
        "total": total,
        "notes": req.notes,
        "createdBy": current_user.get("uid"),
        "createdAt": now,
        "updatedAt": now,
        "audit": [{
            "by": current_user.get("uid"),
            "action": "CREATED",
            "at": now
        }]
    }
    
    adjustment_ref = db.collection('organizations', org_id, 'journalAdjustments').document()
    adjustment_ref.set(adjustment_data)
    
    # Audit log
    audit_log(
        db, org_id, "ADJUSTMENT", "ADJ_CREATED", 
        current_user.get("uid"), 
        f"Created adjustment for {format_period_label(req.year, req.month)}, total: {total}"
    )
    
    return {"status": "success", "adjustmentId": adjustment_ref.id}

@router.get("/{adjustment_id}")
async def get_adjustment(
    adjustment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific adjustment"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_adjustments(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for adjustments")
    
    db = firestore.client()
    
    adjustment_ref = db.collection('organizations', org_id, 'journalAdjustments').document(adjustment_id)
    adjustment_doc = adjustment_ref.get()
    
    if not adjustment_doc.exists:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    
    adjustment_data = adjustment_doc.to_dict()
    adjustment_data['id'] = adjustment_doc.id
    
    return adjustment_data

@router.put("/{adjustment_id}")
async def update_adjustment(
    adjustment_id: str,
    req: JournalAdjustmentUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a draft adjustment"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_adjustments(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for adjustments")
    
    db = firestore.client()
    
    adjustment_ref = db.collection('organizations', org_id, 'journalAdjustments').document(adjustment_id)
    adjustment_doc = adjustment_ref.get()
    
    if not adjustment_doc.exists:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    
    adjustment_data = adjustment_doc.to_dict()
    
    # Can only edit DRAFT adjustments
    if adjustment_data.get('status') != 'DRAFT':
        raise HTTPException(
            status_code=400, 
            detail="Can only edit draft adjustments"
        )
    
    # Update fields
    updates = {"updatedAt": get_utc_now()}
    
    if req.lines is not None:
        updates["lines"] = [line.dict() for line in req.lines]
        updates["total"] = calculate_adjustment_total(req.lines)
    
    if req.notes is not None:
        updates["notes"] = req.notes
    
    # Add to audit trail
    audit_entry = {
        "by": current_user.get("uid"),
        "action": "UPDATED",
        "at": get_utc_now()
    }
    
    audit_trail = adjustment_data.get('audit', [])
    audit_trail.append(audit_entry)
    updates["audit"] = audit_trail
    
    adjustment_ref.update(updates)
    
    # Audit log
    audit_log(
        db, org_id, "ADJUSTMENT", "ADJ_UPDATED", 
        current_user.get("uid"), 
        f"Updated adjustment {adjustment_id}"
    )
    
    return {"status": "success", "message": "Adjustment updated successfully"}

@router.post("/{adjustment_id}/publish")
async def publish_adjustment(
    adjustment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Publish a draft adjustment"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_adjustments(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for adjustments")
    
    db = firestore.client()
    
    adjustment_ref = db.collection('organizations', org_id, 'journalAdjustments').document(adjustment_id)
    adjustment_doc = adjustment_ref.get()
    
    if not adjustment_doc.exists:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    
    adjustment_data = adjustment_doc.to_dict()
    
    # Can only publish DRAFT adjustments
    if adjustment_data.get('status') != 'DRAFT':
        raise HTTPException(
            status_code=400, 
            detail="Can only publish draft adjustments"
        )
    
    # Verify period is still closed
    period = adjustment_data.get('period', {})
    year = period.get('year')
    month = period.get('month')
    
    if not is_period_closed(db, org_id, year, month):
        raise HTTPException(
            status_code=400, 
            detail="Cannot publish adjustment - period is no longer closed"
        )
    
    # Publish the adjustment
    now = get_utc_now()
    audit_entry = {
        "by": current_user.get("uid"),
        "action": "PUBLISHED",
        "at": now
    }
    
    audit_trail = adjustment_data.get('audit', [])
    audit_trail.append(audit_entry)
    
    adjustment_ref.update({
        "status": "PUBLISHED",
        "publishedBy": current_user.get("uid"),
        "publishedAt": now,
        "updatedAt": now,
        "audit": audit_trail
    })
    
    # Update monthly snapshot
    update_monthly_snapshot(db, org_id, year, month)
    
    # Audit log
    audit_log(
        db, org_id, "ADJUSTMENT", "ADJ_PUBLISHED", 
        current_user.get("uid"), 
        f"Published adjustment {adjustment_id} for {format_period_label(year, month)}"
    )
    
    return {"status": "success", "message": "Adjustment published successfully"}

@router.post("/{adjustment_id}/void")
async def void_adjustment(
    adjustment_id: str,
    req: JournalAdjustmentVoid,
    current_user: dict = Depends(get_current_user)
):
    """Void a published adjustment"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_adjustments(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for adjustments")
    
    db = firestore.client()
    
    adjustment_ref = db.collection('organizations', org_id, 'journalAdjustments').document(adjustment_id)
    adjustment_doc = adjustment_ref.get()
    
    if not adjustment_doc.exists:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    
    adjustment_data = adjustment_doc.to_dict()
    
    # Can only void PUBLISHED adjustments
    if adjustment_data.get('status') != 'PUBLISHED':
        raise HTTPException(
            status_code=400, 
            detail="Can only void published adjustments"
        )
    
    # Void the adjustment
    now = get_utc_now()
    audit_entry = {
        "by": current_user.get("uid"),
        "action": "VOIDED",
        "at": now
    }
    
    audit_trail = adjustment_data.get('audit', [])
    audit_trail.append(audit_entry)
    
    adjustment_ref.update({
        "status": "VOID",
        "voidBy": current_user.get("uid"),
        "voidAt": now,
        "voidReason": req.reason,
        "updatedAt": now,
        "audit": audit_trail
    })
    
    # Update monthly snapshot
    period = adjustment_data.get('period', {})
    year = period.get('year')
    month = period.get('month')
    update_monthly_snapshot(db, org_id, year, month)
    
    # Audit log
    audit_log(
        db, org_id, "ADJUSTMENT", "ADJ_VOIDED", 
        current_user.get("uid"), 
        f"Voided adjustment {adjustment_id}: {req.reason}"
    )
    
    return {"status": "success", "message": "Adjustment voided successfully"}

@router.get("/{adjustment_id}/preview")
async def preview_adjustment_impact(
    adjustment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Preview the impact of an adjustment on P&L/Cashflow/Tax"""
    org_id = current_user.get("orgId")
    if not is_authorized_for_adjustments(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for adjustments")
    
    db = firestore.client()
    
    adjustment_ref = db.collection('organizations', org_id, 'journalAdjustments').document(adjustment_id)
    adjustment_doc = adjustment_ref.get()
    
    if not adjustment_doc.exists:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    
    adjustment_data = adjustment_doc.to_dict()
    lines = adjustment_data.get('lines', [])
    
    # Calculate impact by bucket
    impact = {
        "Revenue": 0,
        "DirectCost": 0,
        "Opex": 0,
        "TaxCollected": 0,
        "TaxPaid": 0
    }
    
    for line in lines:
        bucket = line.get('bucket')
        amount = line.get('amount', 0)
        if bucket in impact:
            impact[bucket] += amount
    
    # Calculate derived impacts
    gross_profit_impact = impact["Revenue"] - impact["DirectCost"]
    net_profit_impact = gross_profit_impact - impact["Opex"]
    tax_impact = impact["TaxCollected"] - impact["TaxPaid"]
    
    return {
        "adjustmentId": adjustment_id,
        "period": adjustment_data.get('period'),
        "bucketImpact": impact,
        "derivedImpact": {
            "grossProfit": gross_profit_impact,
            "netProfit": net_profit_impact,
            "taxNet": tax_impact
        },
        "total": adjustment_data.get('total', 0)
    }
