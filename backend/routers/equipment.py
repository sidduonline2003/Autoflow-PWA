from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import List, Optional
import datetime

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/equipment",
    tags=["Equipment Management"],
)

# --- Pydantic Models ---
class EquipmentAssignmentRequest(BaseModel):
    equipment: List[str]

# --- Equipment Management Endpoints ---
@router.post("/events/{event_id}/assign")
async def assign_equipment_to_event(
    event_id: str,
    client_id: str,
    req: EquipmentAssignmentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Assign equipment to an event"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
    
    event_doc = event_ref.get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_ref.update({
        "assignedEquipment": req.equipment,
        "equipmentAssigned": True,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Equipment assigned successfully"}

@router.get("/events/{event_id}")
async def get_event_equipment(
    event_id: str,
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get equipment assigned to an event"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
    
    event_doc = event_ref.get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_data = event_doc.to_dict()
    return {
        "equipment": event_data.get("assignedEquipment", []),
        "equipmentAssigned": event_data.get("equipmentAssigned", False)
    }
