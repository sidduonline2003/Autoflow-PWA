from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import Optional
import datetime

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/deliverables",
    tags=["Deliverable Management"],
)

# --- Pydantic Models ---
class DeliverableRequest(BaseModel):
    storageType: str
    deviceInfo: str
    notes: Optional[str] = None
    eventId: str
    eventName: str

class DeliverableSubmissionRequest(BaseModel):
    storageType: str
    deviceInfo: str
    notes: Optional[str] = None
    submittedBy: str
    submittedByName: str

# --- Deliverable Management Endpoints ---

@router.post("/events/{event_id}/tracking")
async def create_deliverable_tracking(
    event_id: str, 
    client_id: str, 
    req: DeliverableRequest, 
    current_user: dict = Depends(get_current_user)
):
    """Create deliverable tracking for an event - called from client workspace"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    
    # Create deliverable tracking in client's deliverables subcollection
    deliverable_ref = db.collection('organizations', org_id, 'clients', client_id, 'deliverables').document()
    deliverable_ref.set({
        "eventId": req.eventId,
        "eventName": req.eventName,
        "storageType": req.storageType,
        "deviceInfo": req.deviceInfo,
        "notes": req.notes,
        "status": "awaiting_submission",
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "deliverableId": deliverable_ref.id}

@router.post("/events/{event_id}/submit")
async def submit_storage_device(
    event_id: str, 
    req: DeliverableSubmissionRequest, 
    current_user: dict = Depends(get_current_user)
):
    """Submit storage device - called from team member dashboard"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = firestore.client()
    
    # Get event details to find client
    event_query = db.collection_group('events').where('__name__', '==', event_id).limit(1)
    event_docs = list(event_query.stream())
    
    if not event_docs:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_doc = event_docs[0]
    event_data = event_doc.to_dict()
    
    # Extract client_id from the event document path
    # Path format: organizations/{orgId}/clients/{clientId}/events/{eventId}
    path_parts = event_doc.reference.path.split('/')
    client_id = path_parts[3]
    
    # Create deliverable submission
    deliverable_ref = db.collection('organizations', org_id, 'clients', client_id, 'deliverables').document()
    deliverable_ref.set({
        "eventId": event_id,
        "eventName": event_data.get("name"),
        "storageType": req.storageType,
        "deviceInfo": req.deviceInfo,
        "notes": req.notes,
        "status": "submitted",
        "submittedBy": req.submittedBy,
        "submittedByName": req.submittedByName,
        "submittedAt": datetime.datetime.now(datetime.timezone.utc),
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    # Update event to mark deliverable as submitted
    event_doc.reference.update({
        "deliverableSubmitted": True,
        "deliverableSubmittedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Storage device submitted successfully"}

@router.put("/{deliverable_id}/finalize")
async def finalize_deliverable_submission(
    deliverable_id: str,
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark deliverable as ready for post-production"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    deliverable_ref = db.collection('organizations', org_id, 'clients', client_id, 'deliverables').document(deliverable_id)
    
    deliverable_doc = deliverable_ref.get()
    if not deliverable_doc.exists:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    
    deliverable_ref.update({
        "status": "in_post_production",
        "finalizedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Deliverable moved to post-production"}

@router.put("/{deliverable_id}/complete")
async def complete_deliverable(
    deliverable_id: str,
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark deliverable as completed and delivered"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    deliverable_ref = db.collection('organizations', org_id, 'clients', client_id, 'deliverables').document(deliverable_id)
    
    deliverable_doc = deliverable_ref.get()
    if not deliverable_doc.exists:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    
    deliverable_ref.update({
        "status": "completed",
        "completedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Deliverable marked as completed"}
