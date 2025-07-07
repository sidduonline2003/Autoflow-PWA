from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth, firestore
from pydantic import BaseModel
import datetime

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/leave-requests",
    tags=["Leave Management"],
)

class LeaveRequest(BaseModel):
    startDate: str
    endDate: str
    reason: str
    userName: str = None  # Optional field from frontend

@router.post("/")
async def submit_leave_request(req: LeaveRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    uid = current_user.get("uid")
    if not org_id: raise HTTPException(status_code=403, detail="User not part of an organization.")
    
    db = firestore.client()
    
    # Try to get userName from request, fallback to fetching from team collection
    user_name = req.userName
    if not user_name:
        try:
            team_doc = db.collection('organizations', org_id, 'team').document(uid).get()
            if team_doc.exists():
                user_name = team_doc.to_dict().get('name', current_user.get("name", "Unknown"))
            else:
                user_name = current_user.get("name", "Unknown")
        except:
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

@router.put("/{request_id}/approve")
async def approve_leave_request(request_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin": raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    leave_ref = db.collection('organizations', org_id, 'leaveRequests').document(request_id)
    leave_doc = leave_ref.get()
    if not leave_doc.exists: raise HTTPException(status_code=404, detail="Request not found.")
    
    leave_data = leave_doc.to_dict()
    member_id = leave_data.get("userId")
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    
    # Add to schedules collection
    schedule_ref = db.collection('organizations').document(org_id).collection('schedules').document()
    schedule_ref.set({
        "userId": member_id,
        "startDate": leave_data["startDate"],
        "endDate": leave_data["endDate"],
        "type": "leave",
        "leaveRequestId": request_id,
        "createdAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    transaction = db.transaction()
    @firestore.transactional
    def update_in_transaction(transaction, leave_ref, member_ref, leave_data):
        transaction.update(leave_ref, {"status": "approved"})
        transaction.update(member_ref, {"availability": False, "leaveStatus": {"isOnLeave": True, "leaveStart": leave_data["startDate"], "leaveEnd": leave_data["endDate"]}})
    
    update_in_transaction(transaction, leave_ref, member_ref, leave_data)
    
    return {"status": "success", "message": "Leave request approved and schedule updated."}

@router.put("/{request_id}/reject")
async def reject_leave_request(request_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin": raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    leave_ref = db.collection('organizations', org_id, 'leaveRequests').document(request_id)
    leave_ref.update({"status": "rejected"})
    return {"status": "success", "message": "Leave request rejected."}

@router.put("/{request_id}/cancel")
async def cancel_leave_request(request_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin": raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    leave_ref = db.collection('organizations', org_id, 'leaveRequests').document(request_id)
    leave_doc = leave_ref.get()
    if not leave_doc.exists: raise HTTPException(status_code=404, detail="Request not found.")
    
    leave_data = leave_doc.to_dict()
    if leave_data.get("status") != "approved": raise HTTPException(status_code=400, detail="Only approved leave requests can be cancelled.")
    
    member_id = leave_data.get("userId")
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    
    transaction = db.transaction()
    @firestore.transactional
    def update_in_transaction(transaction, leave_ref, member_ref):
        transaction.update(leave_ref, {"status": "cancelled"})
        transaction.update(member_ref, {"availability": True, "leaveStatus": {"isOnLeave": False, "leaveStart": None, "leaveEnd": None}})
    
    update_in_transaction(transaction, leave_ref, member_ref)

    # Remove corresponding schedule entries
    schedules_ref = db.collection('organizations', org_id, 'schedules')
    for sched in schedules_ref.where('leaveRequestId', '==', request_id).stream():
        sched.reference.delete()

    return {"status": "success", "message": "Leave request cancelled."}
