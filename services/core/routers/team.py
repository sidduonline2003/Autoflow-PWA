"""
Team Management Router - Team members, invites, and employee codes
"""

import datetime
import logging
import re
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import ORJSONResponse
from firebase_admin import auth, firestore
from pydantic import BaseModel, Field, field_validator

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user, require_role
from shared.firebase_client import get_db, Collections
from shared.redis_client import redis_client, cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/team", tags=["Team Management"])


# --- Pydantic Models ---
class TeamInviteRequest(BaseModel):
    email: str
    role: str
    name: str
    skills: List[str]


class AcceptInviteRequest(BaseModel):
    uid: str
    inviteId: str
    orgId: str


class TeamMemberUpdateRequest(BaseModel):
    name: str
    role: str
    skills: List[str]
    availability: bool


class TeammateCodeRequest(BaseModel):
    orgCode: str = Field(..., min_length=2, max_length=32)
    role: str = Field(..., min_length=2, max_length=32)
    teammateUid: Optional[str] = Field(default=None, min_length=1, max_length=128)

    @field_validator("orgCode", "role")
    @classmethod
    def _ensure_upper_alnum(cls, value: str):
        normalized = value.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]+", normalized):
            raise ValueError("orgCode and role must contain only uppercase letters and digits")
        return normalized


class BulkTeammateCodeRequest(BaseModel):
    teammateUids: List[str] = Field(..., min_length=1, max_length=1000)
    force: bool = Field(default=False)
    orgCode: Optional[str] = Field(default=None, min_length=2, max_length=32)


class CodePatternRequest(BaseModel):
    pattern: str = Field(..., min_length=3, max_length=100)

    @field_validator("pattern")
    @classmethod
    def _validate_pattern(cls, value: str):
        if "{NUMBER" not in value.upper():
            raise ValueError("Pattern must include {NUMBER:digits} placeholder")
        return value.strip()


# --- Helper Functions ---
def _normalize_role_for_code(role: str) -> str:
    normalized = (role or "").strip().upper()
    normalized = re.sub(r"[^A-Z0-9]+", "_", normalized)
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized or "TEAM"


def _extract_employee_code(member_data: dict) -> Optional[str]:
    if not member_data:
        return None
    if member_data.get("employeeCode"):
        return member_data["employeeCode"]
    profile = member_data.get("profile") or {}
    if profile.get("employeeCode"):
        return profile["employeeCode"]
    return None


@router.get("", include_in_schema=False)
@router.get("/")
async def list_team_members(current_user: dict = Depends(get_current_user)):
    """List all team members in the organization"""
    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")
    
    db = get_db()
    team_ref = db.collection('organizations', org_id, 'team')
    team_docs = team_ref.get()
    
    team_members = []
    for doc in team_docs:
        member_data = doc.to_dict()
        member_data["id"] = doc.id
        employee_code = _extract_employee_code(member_data)
        if employee_code:
            member_data["employeeCode"] = employee_code
            member_data.setdefault("profile", {})["employeeCode"] = employee_code
        team_members.append(member_data)
    
    return team_members


@router.post("/invites")
async def create_invite(req: TeamInviteRequest, current_user: dict = Depends(get_current_user)):
    """Create an invite for a new team member"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = get_db()
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
    """Accept a team invite"""
    if req.uid != current_user.get("uid"):
        raise HTTPException(status_code=403, detail="UID mismatch")
    
    db = get_db()
    invite_ref = db.collection('organizations', req.orgId, 'invites').document(req.inviteId)
    invite_doc = invite_ref.get()
    
    if not invite_doc.exists or invite_doc.to_dict().get('status') != 'pending':
        raise HTTPException(status_code=404, detail="Invite not found or already used.")
    
    invite_data = invite_doc.to_dict()
    invite_email = (invite_data.get('email') or '').strip().lower()
    user_email = (current_user.get('email') or '').strip().lower()
    
    if invite_email != user_email:
        raise HTTPException(status_code=403, detail="Email does not match invite.")
    
    team_member_ref = db.collection('organizations', req.orgId, 'team').document(req.uid)
    team_member_ref.set({
        "name": invite_data.get("name"),
        "email": current_user.get("email"),
        "role": invite_data.get("role"),
        "skills": invite_data.get("skills", []),
        "availability": True,
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "orgName": invite_data.get("orgName")
    })
    
    auth.set_custom_user_claims(req.uid, {'role': invite_data.get("role"), 'orgId': req.orgId})
    invite_ref.update({
        "status": "completed",
        "acceptedAt": datetime.datetime.now(datetime.timezone.utc),
        "acceptedBy": req.uid
    })
    
    return {"status": "success", "message": "Welcome to the team!"}


@router.get("/{member_id}")
async def get_team_member(member_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific team member"""
    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")
    
    db = get_db()
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    member_doc = member_ref.get()
    
    if not member_doc.exists:
        raise HTTPException(status_code=404, detail="Team member not found")
    
    member_data = member_doc.to_dict()
    member_data["id"] = member_doc.id
    
    return member_data


@router.put("/{member_id}")
async def update_team_member(
    member_id: str,
    req: TeamMemberUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update a team member's information"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = get_db()
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    member_doc = member_ref.get()
    
    if not member_doc.exists:
        raise HTTPException(status_code=404, detail="Team member not found")
    
    member_ref.update({
        "name": req.name,
        "role": req.role,
        "skills": req.skills,
        "availability": req.availability,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Team member updated"}


@router.delete("/{member_id}")
async def delete_team_member(member_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a team member from the organization"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = get_db()
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    member_doc = member_ref.get()
    
    if not member_doc.exists:
        raise HTTPException(status_code=404, detail="Team member not found")
    
    member_ref.delete()
    
    return {"status": "success", "message": "Team member removed"}


@router.get("/code-pattern", response_class=ORJSONResponse)
async def get_code_pattern(current_user: dict = Depends(get_current_user)):
    """Get the current employee code pattern for the organization"""
    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")

    db = get_db()
    org_ref = db.collection('organizations').document(org_id)
    org_doc = org_ref.get()

    if not org_doc.exists:
        raise HTTPException(status_code=404, detail="Organization not found")

    org_data = org_doc.to_dict() or {}
    pattern = org_data.get("codePattern", "{ORGCODE}-{ROLE}-{NUMBER:5}")

    return {"pattern": pattern}


@router.put("/code-pattern", response_class=ORJSONResponse)
async def update_code_pattern(req: CodePatternRequest, current_user: dict = Depends(require_role(["admin"]))):
    """Update the employee code pattern for the organization"""
    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")

    db = get_db()
    org_ref = db.collection('organizations').document(org_id)
    org_doc = org_ref.get()

    if not org_doc.exists:
        raise HTTPException(status_code=404, detail="Organization not found")

    org_ref.update({"codePattern": req.pattern})
    
    return {"status": "success", "pattern": req.pattern}
