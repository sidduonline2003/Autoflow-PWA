"""
Leave Router - Leave request management
Refactored from monolithic backend with full logic parity
"""

import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel, Field, field_validator

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user, require_role
from shared.firebase_client import get_db

# Use the same prefix as the old monolithic code for backward compatibility
router = APIRouter(prefix="/leave-requests", tags=["Leave Management"])


class LeaveRequest(BaseModel):
    """Leave request submission model - matches frontend expectations"""
    startDate: str
    endDate: str
    reason: str = Field(..., min_length=1, max_length=1000)
    userName: Optional[str] = None  # Optional - will be fetched if not provided
    
    @field_validator('startDate', 'endDate')
    @classmethod
    def validate_date_format(cls, v):
        """Validate date format to prevent injection"""
        try:
            datetime.datetime.strptime(v, '%Y-%m-%d')
            return v
        except ValueError:
            raise ValueError('Invalid date format. Use YYYY-MM-DD')


# ============================================================================
# SUBMIT LEAVE REQUEST - Team Member Portal
# ============================================================================
@router.post("/")
async def submit_leave_request(req: LeaveRequest, current_user: dict = Depends(get_current_user)):
    """
    Submit a leave request (Team Member Portal)
    Logic parity: Matches old monolithic backend exactly
    """
    org_id = current_user.get("orgId")
    uid = current_user.get("uid")
    
    # Security: Validate org membership
    if not org_id:
        raise HTTPException(status_code=403, detail="User not part of an organization.")
    
    db = get_db()
    
    # Logic parity: Try to get userName from request, fallback to fetching from team collection
    user_name = req.userName
    if not user_name:
        try:
            team_doc = db.collection('organizations', org_id, 'team').document(uid).get()
            if team_doc.exists:
                user_name = team_doc.to_dict().get('name', current_user.get("name", "Unknown"))
            else:
                user_name = current_user.get("name", "Unknown")
        except Exception:
            user_name = current_user.get("name", "Unknown")
    
    leave_ref = db.collection('organizations', org_id, 'leaveRequests').document()
    leave_ref.set({
        "userId": uid,
        "userName": user_name,
        "startDate": req.startDate,
        "endDate": req.endDate,
        "reason": req.reason,
        "status": "pending",
        "createdAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Leave request submitted."}


# ============================================================================
# GET MY LEAVE REQUESTS - Team Member Portal
# ============================================================================
@router.get("/my-requests")
async def get_my_leave_requests(current_user: dict = Depends(get_current_user)):
    """Get current user's leave requests"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id:
        raise HTTPException(status_code=403, detail="User not part of an organization.")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'leaveRequests').where('userId', '==', user_id)
    
    requests = []
    for doc in query.order_by('createdAt', direction=firestore.Query.DESCENDING).stream():
        data = doc.to_dict()
        data['id'] = doc.id
        # Convert Firestore timestamps to ISO strings for JSON serialization
        if 'createdAt' in data and hasattr(data['createdAt'], 'isoformat'):
            data['createdAt'] = data['createdAt'].isoformat()
        requests.append(data)
    
    return {"requests": requests}


# ============================================================================
# GET PENDING REQUESTS - Admin Panel
# ============================================================================
@router.get("/pending")
async def get_pending_requests(current_user: dict = Depends(get_current_user)):
    """Get pending leave requests (admin only)"""
    org_id = current_user.get("orgId")
    
    # Security: Admin check
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    if not org_id:
        raise HTTPException(status_code=403, detail="User not part of an organization.")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'leaveRequests').where('status', '==', 'pending')
    
    requests = []
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        requests.append(data)
    
    return {"requests": requests}


# ============================================================================
# APPROVE LEAVE REQUEST - Admin Panel
# Logic Parity: Creates schedule entry + updates team member availability
# ============================================================================
@router.put("/{request_id}/approve")
async def approve_leave_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """
    Approve a leave request (Admin Panel)
    Logic parity: Creates schedule entry + updates team member availability atomically
    """
    org_id = current_user.get("orgId")
    
    # Security: Admin only
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    if not org_id:
        raise HTTPException(status_code=403, detail="User not part of an organization.")
    
    db = get_db()
    leave_ref = db.collection('organizations', org_id, 'leaveRequests').document(request_id)
    leave_doc = leave_ref.get()
    
    if not leave_doc.exists:
        raise HTTPException(status_code=404, detail="Request not found.")
    
    leave_data = leave_doc.to_dict()
    
    # Security: Prevent re-approval
    if leave_data.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending.")
    
    member_id = leave_data.get("userId")
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    
    # Logic parity: Create schedule entry for the leave period
    schedule_ref = db.collection('organizations').document(org_id).collection('schedules').document()
    schedule_ref.set({
        "userId": member_id,
        "startDate": leave_data["startDate"],
        "endDate": leave_data["endDate"],
        "type": "leave",
        "leaveRequestId": request_id,
        "createdAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    # Logic parity: Use transaction for atomic update of leave request + team member
    transaction = db.transaction()
    
    @firestore.transactional
    def update_in_transaction(transaction, leave_ref, member_ref, leave_data):
        transaction.update(leave_ref, {
            "status": "approved",
            "approvedAt": datetime.datetime.now(datetime.timezone.utc),
            "approvedBy": current_user.get("uid")
        })
        transaction.update(member_ref, {
            "availability": False,
            "leaveStatus": {
                "isOnLeave": True,
                "leaveStart": leave_data["startDate"],
                "leaveEnd": leave_data["endDate"]
            }
        })
    
    try:
        update_in_transaction(transaction, leave_ref, member_ref, leave_data)
    except Exception as e:
        # Rollback schedule if transaction fails
        schedule_ref.delete()
        raise HTTPException(status_code=500, detail=f"Failed to approve leave: {str(e)}")
    
    return {"status": "success", "message": "Leave request approved and schedule updated."}


# ============================================================================
# REJECT LEAVE REQUEST - Admin Panel
# ============================================================================
@router.put("/{request_id}/reject")
async def reject_leave_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """Reject a leave request (Admin Panel)"""
    org_id = current_user.get("orgId")
    
    # Security: Admin only
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    if not org_id:
        raise HTTPException(status_code=403, detail="User not part of an organization.")
    
    db = get_db()
    leave_ref = db.collection('organizations', org_id, 'leaveRequests').document(request_id)
    leave_doc = leave_ref.get()
    
    if not leave_doc.exists:
        raise HTTPException(status_code=404, detail="Request not found.")
    
    # Security: Prevent re-rejection
    if leave_doc.to_dict().get("status") != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending.")
    
    leave_ref.update({
        "status": "rejected",
        "rejectedAt": datetime.datetime.now(datetime.timezone.utc),
        "rejectedBy": current_user.get("uid")
    })
    
    return {"status": "success", "message": "Leave request rejected."}


# ============================================================================
# CANCEL APPROVED LEAVE - Admin Panel
# Logic Parity: Reverts team member availability + removes schedule entries
# ============================================================================
@router.put("/{request_id}/cancel")
async def cancel_leave_request(request_id: str, current_user: dict = Depends(get_current_user)):
    """
    Cancel an approved leave request (Admin Panel)
    Logic parity: Reverts team member availability + removes schedule entries
    """
    org_id = current_user.get("orgId")
    
    # Security: Admin only
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    if not org_id:
        raise HTTPException(status_code=403, detail="User not part of an organization.")
    
    db = get_db()
    leave_ref = db.collection('organizations', org_id, 'leaveRequests').document(request_id)
    leave_doc = leave_ref.get()
    
    if not leave_doc.exists:
        raise HTTPException(status_code=404, detail="Request not found.")
    
    leave_data = leave_doc.to_dict()
    
    # Logic parity: Only approved requests can be cancelled
    if leave_data.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Only approved leave requests can be cancelled.")
    
    member_id = leave_data.get("userId")
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    
    # Logic parity: Use transaction for atomic update
    transaction = db.transaction()
    
    @firestore.transactional
    def update_in_transaction(transaction, leave_ref, member_ref):
        transaction.update(leave_ref, {
            "status": "cancelled",
            "cancelledAt": datetime.datetime.now(datetime.timezone.utc),
            "cancelledBy": current_user.get("uid")
        })
        transaction.update(member_ref, {
            "availability": True,
            "leaveStatus": {
                "isOnLeave": False,
                "leaveStart": None,
                "leaveEnd": None
            }
        })
    
    update_in_transaction(transaction, leave_ref, member_ref)
    
    # Logic parity: Remove corresponding schedule entries
    schedules_ref = db.collection('organizations', org_id, 'schedules')
    for sched in schedules_ref.where('leaveRequestId', '==', request_id).stream():
        sched.reference.delete()
    
    return {"status": "success", "message": "Leave request cancelled."}


# ============================================================================
# DELETE PENDING LEAVE REQUEST - Team Member (self) or Admin
# ============================================================================
@router.delete("/{leave_id}")
async def delete_leave_request(leave_id: str, current_user: dict = Depends(get_current_user)):
    """
    Delete/withdraw a pending leave request
    Only the owner (pending requests only) or admin can delete
    """
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id:
        raise HTTPException(status_code=403, detail="User not part of an organization.")
    
    db = get_db()
    leave_ref = db.collection('organizations', org_id, 'leaveRequests').document(leave_id)
    leave_doc = leave_ref.get()
    
    if not leave_doc.exists:
        raise HTTPException(status_code=404, detail="Leave request not found")
    
    leave_data = leave_doc.to_dict()
    
    # Security: Only owner (for pending) or admin can delete
    is_owner = leave_data.get("userId") == user_id
    is_admin = current_user.get("role") == "admin"
    
    if not is_owner and not is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    # Non-admin can only delete pending requests
    if is_owner and not is_admin and leave_data.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Can only withdraw pending requests")
    
    leave_ref.update({
        "status": "withdrawn",
        "withdrawnAt": datetime.datetime.now(datetime.timezone.utc),
        "withdrawnBy": user_id
    })
    
    return {"status": "success", "message": "Leave request withdrawn"}
