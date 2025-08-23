from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth, firestore
from pydantic import BaseModel
import datetime

from backend.dependencies import get_current_user

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)

# --- Pydantic Models ---
class OrgRegistrationRequest(BaseModel): uid: str; orgName: str; orgAddress: str | None; orgEmail: str | None; orgPhone: str | None; orgWebUrl: str | None
class AcceptInviteRequest(BaseModel): uid: str; inviteId: str; orgId: str

@router.post("/register-organization")
async def register_organization(req: OrgRegistrationRequest):
    uid = req.uid
    try:
        db = firestore.client()
        org_ref = db.collection('organizations').document()
        new_org_id = org_ref.id
        org_ref.set({"name": req.orgName, "address": req.orgAddress, "contactEmail": req.orgEmail, "contactPhone": req.orgPhone, "webUrl": req.orgWebUrl, "owner": uid, "createdAt": datetime.datetime.now(datetime.timezone.utc), "id": new_org_id})
        auth.set_custom_user_claims(uid, {'role': 'admin', 'orgId': new_org_id})
        return {"status": "success", "orgId": new_org_id}
    except Exception as e:
        print(f"Error in register_organization: {e}")  # Log the actual error
        raise HTTPException(status_code=500, detail="Internal server error during registration.")

@router.post("/accept-invite")
async def accept_invite(req: AcceptInviteRequest, current_user: dict = Depends(get_current_user)):
    if req.uid != current_user.get("uid"): 
        print(f"[ACCEPT_INVITE] UID mismatch: req.uid={req.uid}, current_user.uid={current_user.get('uid')}")
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
        print(f"[ACCEPT_INVITE] Email mismatch: invite_email={invite_email}, user_email={user_email}, raw_invite={invite_data.get('email')}, raw_user={current_user.get('email')}")
        raise HTTPException(status_code=403, detail="Email does not match invite.")
    
    team_member_ref = db.collection('organizations', req.orgId, 'team').document(req.uid)
    team_member_ref.set({
        "name": invite_data.get("name"),
        "email": current_user.get("email"),
        "role": invite_data.get("role"),
        "skills": invite_data.get("skills", []),
        "availability": True,
        "createdAt": datetime.datetime.now(datetime.timezone.utc)
    })
    auth.set_custom_user_claims(req.uid, {'role': invite_data.get("role"), 'orgId': req.orgId})
    invite_ref.update({"status": "completed", "acceptedAt": datetime.datetime.now(datetime.timezone.utc), "acceptedBy": req.uid})
    return {"status": "success", "message": "Welcome to the team!"}
