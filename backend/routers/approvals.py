from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import Optional
import datetime

from backend.dependencies import get_current_user

router = APIRouter(
    prefix="/approvals",
    tags=["Approval Management"],
)

# --- Pydantic Models ---
class ApprovalRequest(BaseModel):
    type: str  # budget, contract, concept, final_delivery
    subject: str
    message: str
    eventId: Optional[str] = None

# --- Approval Management Endpoints ---
@router.post("/for-client/{client_id}")
async def request_client_approval(
    client_id: str,
    req: ApprovalRequest,
    current_user: dict = Depends(get_current_user)
):
    """Send approval request to client"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    approval_ref = db.collection('organizations', org_id, 'clients', client_id, 'approvals').document()
    
    approval_ref.set({
        "type": req.type,
        "subject": req.subject,
        "message": req.message,
        "eventId": req.eventId,
        "status": "pending",
        "requestedBy": current_user.get("uid"),
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "approvalId": approval_ref.id}

@router.get("/for-client/{client_id}")
async def get_client_approvals(
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all approval requests for a client"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    approvals_ref = db.collection('organizations', org_id, 'clients', client_id, 'approvals')
    approvals = approvals_ref.stream()
    
    return {
        "approvals": [{"id": approval.id, **approval.to_dict()} for approval in approvals]
    }

@router.put("/{approval_id}/respond")
async def respond_to_approval(
    approval_id: str,
    client_id: str,
    status: str,  # approved, rejected
    notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Respond to an approval request"""
    org_id = current_user.get("orgId")
    
    db = firestore.client()
    approval_ref = db.collection('organizations', org_id, 'clients', client_id, 'approvals').document(approval_id)
    
    approval_doc = approval_ref.get()
    if not approval_doc.exists:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    update_data = {
        "status": status,
        "responseNotes": notes,
        "respondedBy": current_user.get("uid"),
        "respondedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    }
    
    approval_ref.update(update_data)
    
    return {"status": "success", "message": f"Approval {status} successfully"}
