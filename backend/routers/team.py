from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth, firestore
from pydantic import BaseModel
from typing import List
import datetime
import secrets
import string

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/team",
    tags=["Team Management"],
)

class TeamInviteRequest(BaseModel): email: str; role: str; name: str; skills: List[str]
class AcceptInviteRequest(BaseModel): uid: str; inviteId: str; orgId: str
class TeamMemberUpdateRequest(BaseModel): name: str; role: str; skills: List[str]; availability: bool

@router.get("/")
async def list_team_members(current_user: dict = Depends(get_current_user)):
    """List all team members in the organization"""
    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")
    
    db = firestore.client()
    team_ref = db.collection('organizations', org_id, 'team')
    team_docs = team_ref.get()
    
    team_members = []
    for doc in team_docs:
        member_data = doc.to_dict()
        member_data["id"] = doc.id
        team_members.append(member_data)
    
    return team_members

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
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    db = firestore.client()
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    member_doc = member_ref.get()

    if not member_doc.exists:
        raise HTTPException(status_code=404, detail="Team member not found")

    member_data = member_doc.to_dict() or {}
    deleted_ref = db.collection('organizations', org_id, 'deleted_team').document(member_id)

    deleted_payload = {
        **member_data,
        "deletedAt": datetime.datetime.now(datetime.timezone.utc),
        "deletedBy": current_user.get("uid"),
        "originalId": member_id,
        "wasSoftDeleted": True
    }

    batch = db.batch()
    batch.set(deleted_ref, deleted_payload)
    batch.delete(member_ref)
    batch.commit()

    try:
        auth.update_user(member_id, disabled=True)
    except Exception:
        # User may already be disabled or not exist; ignore for soft delete
        pass

    return {"status": "success", "message": "Team member moved to deleted list"}


@router.delete("/deleted/{member_id}")
async def permanently_delete_team_member(member_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    db = firestore.client()
    deleted_ref = db.collection('organizations', org_id, 'deleted_team').document(member_id)
    deleted_doc = deleted_ref.get()

    if not deleted_doc.exists:
        raise HTTPException(status_code=404, detail="Deleted teammate not found")

    team_ref = db.collection('organizations', org_id, 'team').document(member_id)

    batch = db.batch()
    batch.delete(deleted_ref)
    if team_ref.get().exists:
        batch.delete(team_ref)
    batch.commit()

    try:
        auth.delete_user(member_id)
    except Exception:
        # Ignore if user already removed from auth
        pass

    return {"status": "success", "message": "Team member deleted permanently"}


@router.delete("/invites/{invite_id}")
async def delete_pending_invite(invite_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    db = firestore.client()
    invite_ref = db.collection('organizations', org_id, 'invites').document(invite_id)
    invite_doc = invite_ref.get()

    if not invite_doc.exists:
        raise HTTPException(status_code=404, detail="Invite not found")

    invite_data = invite_doc.to_dict() or {}
    if invite_data.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending invites can be deleted")

    invite_ref.delete()
    return {"status": "success", "message": "Invite deleted"}
