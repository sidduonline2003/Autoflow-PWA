from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth, firestore
from pydantic import BaseModel
from typing import List
import datetime
import secrets
import string

from backend.dependencies import get_current_user

router = APIRouter(
    prefix="/team",
    tags=["Team Management"],
)

class TeamInviteRequest(BaseModel): email: str; role: str; name: str; skills: List[str]
class AcceptInviteRequest(BaseModel): uid: str; inviteId: str; orgId: str
class TeamMemberUpdateRequest(BaseModel): name: str; role: str; skills: List[str]; availability: bool

@router.post("/invites")
async def create_invite(req: TeamInviteRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin": raise HTTPException(status_code=403, detail="Forbidden")
    db = firestore.client()
    # Fetch orgName from organizations collection
    org_ref = db.collection('organizations').document(org_id)
    org_doc = org_ref.get()
    org_name = org_doc.to_dict().get('name') if org_doc.exists else None
    invite_ref = db.collection('organizations', org_id, 'invites').document()
    invite_ref.set({
        "email": req.email,
        "role": req.role,
        "name": req.name,
        "skills": req.skills,
        "orgId": org_id,
        "orgName": org_name,
        "status": "pending",
        "createdAt": datetime.datetime.now(datetime.timezone.utc)
    })
    return {"status": "success", "inviteId": invite_ref.id, "orgId": org_id}

@router.post("/invites/accept")
async def accept_invite(req: AcceptInviteRequest, current_user: dict = Depends(get_current_user)):
    if req.uid != current_user.get("uid"):
        raise HTTPException(status_code=403, detail="UID mismatch")
    db = firestore.client()
    invite_ref = db.collection('organizations', req.orgId, 'invites').document(req.inviteId)
    invite_doc = invite_ref.get()
    if not invite_doc.exists or invite_doc.to_dict().get('status') != 'pending':
        raise HTTPException(status_code=404, detail="Invite not found or already used.")
    invite_data = invite_doc.to_dict()
    invite_email = (invite_data.get('email') or '').strip().lower()
    user_email = (current_user.get('email') or '').strip().lower()
    if invite_email != user_email:
        # Debug log for email mismatch
        print(f"[ACCEPT_INVITE] Email mismatch: invite_email={invite_email}, user_email={user_email}, raw_invite={invite_data.get('email')}, raw_user={current_user.get('email')}")
        raise HTTPException(status_code=403, detail="Email does not match invite.")
    
    team_member_ref = db.collection('organizations', req.orgId, 'team').document(req.uid)
    team_member_ref.set({
        "name": invite_data.get("name"),
        "email": current_user.get("email"),
        "role": invite_data.get("role"),
        "skills": invite_data.get("skills", []),
        "availability": True,
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "orgName": invite_data.get("orgName") # for convenience
    })
    auth.set_custom_user_claims(req.uid, {'role': invite_data.get("role"), 'orgId': req.orgId})
    invite_ref.update({"status": "completed", "acceptedAt": datetime.datetime.now(datetime.timezone.utc), "acceptedBy": req.uid})
    return {"status": "success", "message": "Welcome to the team!"}

@router.put("/members/{member_id}")
async def update_team_member(member_id: str, req: TeamMemberUpdateRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin": raise HTTPException(status_code=403, detail="Forbidden")
    db = firestore.client()
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    member_doc = member_ref.get()
    if not member_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
    member_ref.update(req.dict())
    auth.set_custom_user_claims(member_id, {'role': req.role, 'orgId': org_id})
    return {"status": "success"}

@router.delete("/members/{member_id}")
async def delete_team_member(member_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin": raise HTTPException(status_code=403, detail="Forbidden")
    db = firestore.client()
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    member_ref.update({"availability": False, "leaveStatus": {"isOnLeave": True, "leaveEnd": None}})
    auth.update_user(member_id, disabled=True)
    return {"status": "success"}
