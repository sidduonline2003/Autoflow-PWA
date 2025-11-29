"""
Leave Router - Leave request management
"""

import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user, require_role
from shared.firebase_client import get_db

router = APIRouter(prefix="/leave", tags=["Leave Management"])


class LeaveRequest(BaseModel):
    leaveType: str  # "casual", "sick", "earned", "unpaid"
    startDate: str
    endDate: str
    reason: str
    halfDay: bool = False


class LeaveApprovalRequest(BaseModel):
    status: str  # "approved" or "rejected"
    notes: Optional[str] = None


@router.post("/request")
async def submit_leave_request(req: LeaveRequest, current_user: dict = Depends(get_current_user)):
    """Submit a leave request"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = get_db()
    leave_ref = db.collection('organizations', org_id, 'leaveRequests').document()
    
    leave_ref.set({
        "userId": user_id,
        "userName": current_user.get("name", ""),
        "userEmail": current_user.get("email", ""),
        "leaveType": req.leaveType,
        "startDate": req.startDate,
        "endDate": req.endDate,
        "reason": req.reason,
        "halfDay": req.halfDay,
        "status": "pending",
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "leaveId": leave_ref.id}


@router.get("/my-requests")
async def get_my_leave_requests(current_user: dict = Depends(get_current_user)):
    """Get current user's leave requests"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'leaveRequests').where('userId', '==', user_id)
    
    requests = []
    for doc in query.order_by('createdAt', direction=firestore.Query.DESCENDING).stream():
        data = doc.to_dict()
        data['id'] = doc.id
        requests.append(data)
    
    return {"requests": requests}


@router.get("/pending")
async def get_pending_requests(current_user: dict = Depends(require_role(["admin", "manager"]))):
    """Get pending leave requests (admin/manager only)"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'leaveRequests').where('status', '==', 'pending')
    
    requests = []
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        requests.append(data)
    
    return {"requests": requests}


@router.post("/{leave_id}/approve")
async def approve_leave(
    leave_id: str,
    req: LeaveApprovalRequest,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    """Approve or reject a leave request"""
    org_id = current_user.get("orgId")
    
    if req.status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'rejected'")
    
    db = get_db()
    leave_ref = db.collection('organizations', org_id, 'leaveRequests').document(leave_id)
    leave_doc = leave_ref.get()
    
    if not leave_doc.exists:
        raise HTTPException(status_code=404, detail="Leave request not found")
    
    leave_ref.update({
        "status": req.status,
        "approvedBy": current_user.get("uid"),
        "approverName": current_user.get("name", ""),
        "approvalNotes": req.notes,
        "approvedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "leaveStatus": req.status}


@router.delete("/{leave_id}")
async def cancel_leave(leave_id: str, current_user: dict = Depends(get_current_user)):
    """Cancel a pending leave request"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = get_db()
    leave_ref = db.collection('organizations', org_id, 'leaveRequests').document(leave_id)
    leave_doc = leave_ref.get()
    
    if not leave_doc.exists:
        raise HTTPException(status_code=404, detail="Leave request not found")
    
    leave_data = leave_doc.to_dict()
    
    # Only owner or admin can cancel
    if leave_data.get("userId") != user_id and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    if leave_data.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Can only cancel pending requests")
    
    leave_ref.update({
        "status": "cancelled",
        "cancelledAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Leave request cancelled"}
