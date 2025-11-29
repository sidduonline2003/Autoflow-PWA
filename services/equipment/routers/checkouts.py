"""
Checkouts Router - Equipment checkout/checkin workflows
"""

import datetime
from typing import Optional, List
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user
from shared.firebase_client import get_db
from shared.utils.helpers import nanoid_generate

router = APIRouter(prefix="/equipment", tags=["Checkouts"])


class CheckoutType(str, Enum):
    EVENT = "event"
    PERSONAL = "personal"
    MAINTENANCE = "maintenance"


class CheckoutEquipmentRequest(BaseModel):
    assetId: str
    checkoutType: CheckoutType = CheckoutType.EVENT
    eventId: Optional[str] = None
    expectedReturnDate: Optional[str] = None
    notes: Optional[str] = None


class CheckinEquipmentRequest(BaseModel):
    condition: str  # "excellent", "good", "fair", "poor"
    notes: Optional[str] = None
    reportIssue: bool = False
    issueDescription: Optional[str] = None


def generate_checkout_id() -> str:
    return f"CHK_{nanoid_generate(18)}"


@router.post("/checkout")
async def checkout_equipment(req: CheckoutEquipmentRequest, current_user: dict = Depends(get_current_user)):
    """Checkout equipment to a user"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = get_db()
    
    # Verify equipment exists and is available
    equipment_ref = db.collection('organizations', org_id, 'equipment').document(req.assetId)
    equipment_doc = equipment_ref.get()
    
    if not equipment_doc.exists:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    equipment_data = equipment_doc.to_dict()
    
    if equipment_data.get("status") != "available":
        raise HTTPException(status_code=400, detail=f"Equipment is not available. Current status: {equipment_data.get('status')}")
    
    # Create checkout record
    checkout_id = generate_checkout_id()
    now = datetime.datetime.now(datetime.timezone.utc)
    
    checkout_data = {
        "checkoutId": checkout_id,
        "assetId": req.assetId,
        "assetName": equipment_data.get("name"),
        "checkoutType": req.checkoutType.value,
        "eventId": req.eventId,
        "checkedOutBy": user_id,
        "checkedOutByName": current_user.get("name", ""),
        "checkedOutAt": now,
        "expectedReturnDate": req.expectedReturnDate,
        "notes": req.notes,
        "status": "active",
        "conditionAtCheckout": equipment_data.get("condition"),
    }
    
    checkout_ref = db.collection('organizations', org_id, 'checkouts').document(checkout_id)
    checkout_ref.set(checkout_data)
    
    # Update equipment status
    equipment_ref.update({
        "status": "checked_out",
        "currentCheckoutId": checkout_id,
        "lastCheckedOutBy": user_id,
        "lastCheckedOutAt": now,
        "updatedAt": now
    })
    
    return {
        "status": "success",
        "checkoutId": checkout_id,
        "assetId": req.assetId,
        "checkedOutAt": now.isoformat()
    }


@router.post("/checkin/{checkout_id}")
async def checkin_equipment(
    checkout_id: str,
    req: CheckinEquipmentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Check in equipment"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = get_db()
    
    # Get checkout record
    checkout_ref = db.collection('organizations', org_id, 'checkouts').document(checkout_id)
    checkout_doc = checkout_ref.get()
    
    if not checkout_doc.exists:
        raise HTTPException(status_code=404, detail="Checkout record not found")
    
    checkout_data = checkout_doc.to_dict()
    
    if checkout_data.get("status") != "active":
        raise HTTPException(status_code=400, detail="Checkout is not active")
    
    now = datetime.datetime.now(datetime.timezone.utc)
    asset_id = checkout_data.get("assetId")
    
    # Update checkout record
    checkout_ref.update({
        "status": "completed",
        "checkedInBy": user_id,
        "checkedInByName": current_user.get("name", ""),
        "checkedInAt": now,
        "conditionAtCheckin": req.condition,
        "checkinNotes": req.notes,
        "hasIssue": req.reportIssue,
        "issueDescription": req.issueDescription
    })
    
    # Update equipment status
    equipment_ref = db.collection('organizations', org_id, 'equipment').document(asset_id)
    
    new_status = "maintenance" if req.reportIssue else "available"
    
    equipment_ref.update({
        "status": new_status,
        "condition": req.condition,
        "currentCheckoutId": None,
        "lastCheckedInBy": user_id,
        "lastCheckedInAt": now,
        "updatedAt": now
    })
    
    # Create maintenance request if issue reported
    if req.reportIssue and req.issueDescription:
        maintenance_ref = db.collection('organizations', org_id, 'maintenance').document()
        maintenance_ref.set({
            "assetId": asset_id,
            "type": "issue_report",
            "description": req.issueDescription,
            "reportedBy": user_id,
            "reportedAt": now,
            "status": "pending",
            "relatedCheckoutId": checkout_id
        })
    
    return {
        "status": "success",
        "checkoutId": checkout_id,
        "assetId": asset_id,
        "checkedInAt": now.isoformat(),
        "equipmentStatus": new_status
    }


@router.get("/checkouts/active")
async def list_active_checkouts(current_user: dict = Depends(get_current_user)):
    """List all active checkouts"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'checkouts').where('status', '==', 'active')
    
    checkouts = []
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        checkouts.append(data)
    
    return {"checkouts": checkouts, "count": len(checkouts)}


@router.get("/checkouts/my")
async def list_my_checkouts(current_user: dict = Depends(get_current_user)):
    """List current user's active checkouts"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'checkouts') \
        .where('checkedOutBy', '==', user_id) \
        .where('status', '==', 'active')
    
    checkouts = []
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        checkouts.append(data)
    
    return {"checkouts": checkouts, "count": len(checkouts)}


@router.get("/checkouts/history/{asset_id}")
async def get_checkout_history(asset_id: str, current_user: dict = Depends(get_current_user)):
    """Get checkout history for an asset"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'checkouts') \
        .where('assetId', '==', asset_id) \
        .order_by('checkedOutAt', direction=firestore.Query.DESCENDING)
    
    history = []
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        history.append(data)
    
    return {"assetId": asset_id, "history": history, "count": len(history)}


@router.get("/checkouts/overdue")
async def list_overdue_checkouts(current_user: dict = Depends(get_current_user)):
    """List overdue checkouts"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    
    query = db.collection('organizations', org_id, 'checkouts') \
        .where('status', '==', 'active') \
        .where('expectedReturnDate', '<', now)
    
    overdue = []
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        overdue.append(data)
    
    return {"overdue": overdue, "count": len(overdue)}
