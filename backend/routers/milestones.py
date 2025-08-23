from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import Optional
import datetime

from backend.dependencies import get_current_user

router = APIRouter(
    prefix="/milestones",
    tags=["Milestone Management"],
)

# --- Pydantic Models ---
class MilestoneRequest(BaseModel):
    title: str
    dueDate: str
    priority: str
    description: Optional[str] = None

# --- Milestone Management Endpoints ---
@router.post("/events/{event_id}")
async def create_milestone(
    event_id: str,
    client_id: str,
    req: MilestoneRequest,
    current_user: dict = Depends(get_current_user)
):
    """Create a milestone for an event"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    milestone_ref = db.collection('organizations', org_id, 'clients', client_id, 'milestones').document()
    
    milestone_ref.set({
        "eventId": event_id,
        "title": req.title,
        "dueDate": req.dueDate,
        "priority": req.priority,
        "description": req.description,
        "status": "pending",
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "milestoneId": milestone_ref.id}

@router.get("/for-client/{client_id}")
async def get_client_milestones(
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all milestones for a client"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    milestones_ref = db.collection('organizations', org_id, 'clients', client_id, 'milestones')
    milestones = milestones_ref.stream()
    
    return {
        "milestones": [{"id": milestone.id, **milestone.to_dict()} for milestone in milestones]
    }

@router.put("/{milestone_id}/status")
async def update_milestone_status(
    milestone_id: str,
    client_id: str,
    status: str,
    current_user: dict = Depends(get_current_user)
):
    """Update milestone status (pending, in_progress, completed)"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    milestone_ref = db.collection('organizations', org_id, 'clients', client_id, 'milestones').document(milestone_id)
    
    milestone_doc = milestone_ref.get()
    if not milestone_doc.exists:
        raise HTTPException(status_code=404, detail="Milestone not found")
    
    update_data = {
        "status": status,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    }
    
    if status == "completed":
        update_data["completedAt"] = datetime.datetime.now(datetime.timezone.utc)
    
    milestone_ref.update(update_data)
    
    return {"status": "success", "message": f"Milestone status updated to {status}"}
