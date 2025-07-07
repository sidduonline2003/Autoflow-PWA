from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import List, Optional
import datetime

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/budgets",
    tags=["Budget Management"],
)

# --- Pydantic Models ---
class BudgetRequest(BaseModel):
    estimatedCost: str
    actualCost: Optional[str] = None
    items: List[str]

# --- Budget Management Endpoints ---
@router.put("/events/{event_id}")
async def update_event_budget(
    event_id: str,
    client_id: str,
    req: BudgetRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update budget for an event"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
    
    event_doc = event_ref.get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_ref.update({
        "estimatedBudget": req.estimatedCost,
        "actualCost": req.actualCost,
        "budgetItems": req.items,
        "budgetUpdated": True,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Budget updated successfully"}

@router.post("/events/{event_id}/approve")
async def approve_event_budget(
    event_id: str,
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Approve budget for an event"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
    
    event_doc = event_ref.get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_ref.update({
        "budgetApproved": True,
        "budgetApprovedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Budget approved successfully"}

@router.get("/events/{event_id}")
async def get_event_budget(
    event_id: str,
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get budget details for an event"""
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
        "estimatedBudget": event_data.get("estimatedBudget"),
        "actualCost": event_data.get("actualCost"),
        "budgetItems": event_data.get("budgetItems", []),
        "budgetApproved": event_data.get("budgetApproved", False),
        "budgetUpdated": event_data.get("budgetUpdated", False)
    }
