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
from pydantic import BaseModel, Field, field_validator, EmailStr

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user, require_role
from shared.firebase_client import get_db, Collections
from shared.redis_client import redis_client, cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/team", tags=["Team Management"])


# --- Pydantic Models with Enhanced Validation ---
class TeamInviteRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    role: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    skills: List[str] = Field(default_factory=list)
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        # Basic email validation
        email = v.strip().lower()
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, email):
            raise ValueError("Invalid email format")
        return email
    
    @field_validator('role')
    @classmethod
    def validate_role(cls, v):
        # Include all roles used by frontend AND any legacy roles
        allowed_roles = [
            'admin', 'editor', 'photographer', 'cinematographer', 
            'data-manager', 'accountant', 'team-member', 'data manager',
            'crew'  # Added: Used by frontend AddTeamMemberModal
        ]
        normalized = v.lower().strip().replace('_', '-')
        # Handle special case for "data manager" -> "data-manager"
        if normalized == 'data manager':
            normalized = 'data-manager'
        if normalized not in allowed_roles:
            raise ValueError(f"Invalid role. Allowed: {', '.join(allowed_roles)}")
        return normalized
    
    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v):
        # Remove any potentially dangerous characters (XSS prevention)
        sanitized = re.sub(r'[<>"\'/\\;]', '', v.strip())
        if not sanitized:
            raise ValueError("Name cannot be empty after sanitization")
        return sanitized
    
    @field_validator('skills')
    @classmethod
    def validate_skills(cls, v):
        if len(v) > 20:
            raise ValueError("Maximum 20 skills allowed")
        # Sanitize each skill
        return [re.sub(r'[<>"\'/\\;]', '', skill.strip())[:50] for skill in v if skill.strip()]


class AcceptInviteRequest(BaseModel):
    uid: str = Field(..., min_length=1, max_length=128)
    inviteId: str = Field(..., min_length=1, max_length=100)
    orgId: str = Field(..., min_length=1, max_length=100)
    
    @field_validator('orgId', 'inviteId', 'uid')
    @classmethod
    def validate_ids(cls, v):
        # Prevent path traversal and injection attacks
        if '..' in v or '/' in v or '\\' in v:
            raise ValueError("Invalid ID format")
        return v.strip()


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
        raise HTTPException(status_code=403, detail="Only admins can create invites")
    
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID not found in user claims")
    
    db = get_db()
    
    try:
        # Security: Verify organization exists
        org_ref = db.collection('organizations').document(org_id)
        org_doc = org_ref.get()
        if not org_doc.exists:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        org_data = org_doc.to_dict()
        org_name = org_data.get('name', 'Unknown Organization')
        
        # Security: Check for duplicate pending invites (prevent spam)
        existing_invite_query = db.collection('organizations', org_id, 'invites') \
            .where('email', '==', req.email.lower()) \
            .where('status', '==', 'pending') \
            .limit(1) \
            .stream()
        
        if any(existing_invite_query):
            raise HTTPException(
                status_code=409, 
                detail="A pending invite already exists for this email address"
            )
        
        # Security: Check if user is already a team member
        team_query = db.collection('organizations', org_id, 'team') \
            .where('email', '==', req.email.lower()) \
            .limit(1) \
            .stream()
        
        if any(team_query):
            raise HTTPException(
                status_code=409, 
                detail="This email is already registered as a team member"
            )
        
        # Create the invite with expiration
        invite_ref = db.collection('organizations', org_id, 'invites').document()
        invite_data = {
            "email": req.email.lower(),  # Normalize email to lowercase
            "role": req.role,
            "name": req.name,
            "skills": req.skills,
            "orgId": org_id,  # CRITICAL: Include orgId for frontend copy link functionality
            "orgName": org_name,
            "status": "pending",
            "createdAt": datetime.datetime.now(datetime.timezone.utc),
            "createdBy": current_user.get("uid"),
            "expiresAt": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=7)
        }
        invite_ref.set(invite_data)
        
        logger.info(f"Invite created: {invite_ref.id} for {req.email} by {current_user.get('uid')}")
        
        return {
            "status": "success", 
            "inviteId": invite_ref.id, 
            "orgId": org_id,
            "message": f"Invite sent to {req.email}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating invite: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create invite")


@router.post("/invites/accept")
async def accept_invite(req: AcceptInviteRequest, current_user: dict = Depends(get_current_user)):
    """Accept a team invite"""
    # Security: Verify UID matches the current authenticated user
    if req.uid != current_user.get("uid"):
        logger.warning(f"UID mismatch in accept_invite: req.uid={req.uid}, current_user.uid={current_user.get('uid')}")
        raise HTTPException(status_code=403, detail="User ID mismatch")
    
    db = get_db()
    
    try:
        invite_ref = db.collection('organizations', req.orgId, 'invites').document(req.inviteId)
        invite_doc = invite_ref.get()
        
        if not invite_doc.exists:
            raise HTTPException(status_code=404, detail="Invite not found")
        
        invite_data = invite_doc.to_dict()
        
        # Security: Verify invite is still pending
        if invite_data.get('status') != 'pending':
            raise HTTPException(status_code=400, detail="This invite has already been used or cancelled")
        
        # Security: Check invite expiration
        expires_at = invite_data.get("expiresAt")
        if expires_at:
            # Handle both datetime and Firestore timestamp
            if hasattr(expires_at, 'timestamp'):
                expires_dt = datetime.datetime.fromtimestamp(expires_at.timestamp(), tz=datetime.timezone.utc)
            else:
                expires_dt = expires_at
            
            if expires_dt < datetime.datetime.now(datetime.timezone.utc):
                raise HTTPException(status_code=410, detail="This invite has expired")
        
        # Security: Verify email matches (CRITICAL - prevents IDOR attacks)
        invite_email = (invite_data.get('email') or '').strip().lower()
        user_email = (current_user.get('email') or '').strip().lower()
        
        if invite_email != user_email:
            logger.warning(f"Email mismatch: invite_email={invite_email}, user_email={user_email}")
            raise HTTPException(status_code=403, detail="Email does not match invite")
        
        # Security: Verify invite belongs to the claimed organization
        if invite_data.get('orgId') != req.orgId:
            logger.warning(f"OrgId mismatch in invite data")
            raise HTTPException(status_code=403, detail="Invalid organization")
        
        # Create team member document
        team_member_ref = db.collection('organizations', req.orgId, 'team').document(req.uid)
        team_member_data = {
            "name": invite_data.get("name"),
            "email": user_email,
            "role": invite_data.get("role"),
            "skills": invite_data.get("skills", []),
            "availability": True,
            "createdAt": datetime.datetime.now(datetime.timezone.utc),
            "orgId": req.orgId,
            "orgName": invite_data.get("orgName"),
            "inviteId": req.inviteId,
            "status": "active"
        }
        team_member_ref.set(team_member_data)
        
        # Set Firebase custom claims for role-based access
        auth.set_custom_user_claims(req.uid, {
            'role': invite_data.get("role"),
            'orgId': req.orgId
        })
        
        # Update invite status to completed
        invite_ref.update({
            "status": "completed",
            "acceptedAt": datetime.datetime.now(datetime.timezone.utc),
            "acceptedBy": req.uid
        })
        
        # Invalidate any cached team data
        try:
            if redis_client:
                redis_client.delete(f"team:{req.orgId}")
        except Exception as cache_err:
            logger.warning(f"Failed to invalidate cache: {cache_err}")
        
        logger.info(f"Invite accepted: {req.inviteId} by {req.uid}")
        
        return {
            "status": "success", 
            "message": "Welcome to the team!",
            "role": invite_data.get("role"),
            "orgId": req.orgId
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting invite: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to accept invite")


@router.delete("/invites/{invite_id}")
async def delete_invite(invite_id: str, current_user: dict = Depends(get_current_user)):
    """Delete/cancel a pending invite"""
    org_id = current_user.get("orgId")
    role = current_user.get("role")
    
    # Security: Admin-only operation
    if role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete invites")
    
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization ID not found")
    
    # Security: Validate invite_id format (prevent path traversal)
    if '..' in invite_id or '/' in invite_id or '\\' in invite_id:
        raise HTTPException(status_code=400, detail="Invalid invite ID format")
    
    db = get_db()
    
    try:
        invite_ref = db.collection('organizations', org_id, 'invites').document(invite_id)
        invite_doc = invite_ref.get()
        
        if not invite_doc.exists:
            raise HTTPException(status_code=404, detail="Invite not found")
        
        invite_data = invite_doc.to_dict() or {}
        
        # Security: Verify invite belongs to this organization
        if invite_data.get("orgId") and invite_data.get("orgId") != org_id:
            logger.warning(f"Attempted to delete invite from different org: {invite_id}")
            raise HTTPException(status_code=403, detail="Invite does not belong to your organization")
        
        # Only allow deletion of pending invites
        if invite_data.get("status") != "pending":
            raise HTTPException(status_code=400, detail="Only pending invites can be deleted")
        
        # Delete the invite
        invite_ref.delete()
        
        logger.info(f"Invite deleted: {invite_id} by {current_user.get('uid')}")
        
        return {"status": "success", "message": "Invite cancelled successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting invite: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete invite")


@router.get("/members/{member_id}")
async def get_team_member(member_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific team member"""
    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")
    
    # Security: Validate member_id format
    if '..' in member_id or '/' in member_id or '\\' in member_id:
        raise HTTPException(status_code=400, detail="Invalid member ID format")
    
    db = get_db()
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    member_doc = member_ref.get()
    
    if not member_doc.exists:
        raise HTTPException(status_code=404, detail="Team member not found")
    
    member_data = member_doc.to_dict()
    member_data["id"] = member_doc.id
    # Don't expose sensitive fields
    member_data.pop('passwordHash', None)
    member_data.pop('tokens', None)
    
    return member_data


@router.put("/members/{member_id}")
async def update_team_member(
    member_id: str,
    req: TeamMemberUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update a team member's information"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update team members")
    
    # Security: Validate member_id format
    if '..' in member_id or '/' in member_id or '\\' in member_id:
        raise HTTPException(status_code=400, detail="Invalid member ID format")
    
    db = get_db()
    member_ref = db.collection('organizations', org_id, 'team').document(member_id)
    member_doc = member_ref.get()
    
    if not member_doc.exists:
        raise HTTPException(status_code=404, detail="Team member not found")
    
    # Update member data
    member_ref.update({
        "name": req.name,
        "role": req.role,
        "skills": req.skills,
        "availability": req.availability,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedBy": current_user.get("uid")
    })
    
    # Update Firebase custom claims for role change
    try:
        auth.set_custom_user_claims(member_id, {'role': req.role, 'orgId': org_id})
    except Exception as e:
        logger.warning(f"Failed to update user claims for {member_id}: {e}")
    
    return {"status": "success", "message": "Team member updated"}


@router.delete("/members/{member_id}")
async def delete_team_member(member_id: str, current_user: dict = Depends(get_current_user)):
    """
    Soft delete: Move a team member to the deleted_team collection.
    This matches the old monolith behavior - members are archived, not permanently deleted.
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete team members")
    
    # Security: Validate member_id format
    if '..' in member_id or '/' in member_id or '\\' in member_id:
        raise HTTPException(status_code=400, detail="Invalid member ID format")
    
    db = get_db()
    
    try:
        member_ref = db.collection('organizations', org_id, 'team').document(member_id)
        member_doc = member_ref.get()
        
        if not member_doc.exists:
            raise HTTPException(status_code=404, detail="Team member not found")
        
        member_data = member_doc.to_dict() or {}
        
        # Move to deleted_team collection (soft delete)
        deleted_ref = db.collection('organizations', org_id, 'deleted_team').document(member_id)
        
        deleted_payload = {
            **member_data,
            "deletedAt": datetime.datetime.now(datetime.timezone.utc),
            "deletedBy": current_user.get("uid"),
            "originalId": member_id,
            "wasSoftDeleted": True
        }
        
        # Use batch write for atomic operation
        batch = db.batch()
        batch.set(deleted_ref, deleted_payload)
        batch.delete(member_ref)
        batch.commit()
        
        # Disable the user in Firebase Auth
        try:
            auth.update_user(member_id, disabled=True)
        except Exception as auth_err:
            # User may already be disabled or not exist; log but don't fail
            logger.warning(f"Could not disable user {member_id}: {auth_err}")
        
        logger.info(f"Team member soft deleted: {member_id} by {current_user.get('uid')}")
        
        return {"status": "success", "message": "Team member moved to deleted list"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting team member: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete team member")


@router.delete("/deleted/{member_id}")
async def permanently_delete_team_member(member_id: str, current_user: dict = Depends(get_current_user)):
    """
    Permanent delete: Remove a team member from the deleted_team collection forever.
    Also removes from Firebase Auth.
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can permanently delete team members")
    
    # Security: Validate member_id format
    if '..' in member_id or '/' in member_id or '\\' in member_id:
        raise HTTPException(status_code=400, detail="Invalid member ID format")
    
    db = get_db()
    
    try:
        deleted_ref = db.collection('organizations', org_id, 'deleted_team').document(member_id)
        deleted_doc = deleted_ref.get()
        
        if not deleted_doc.exists:
            raise HTTPException(status_code=404, detail="Deleted teammate not found")
        
        # Also check if they're still in the team collection (shouldn't be, but just in case)
        team_ref = db.collection('organizations', org_id, 'team').document(member_id)
        
        batch = db.batch()
        batch.delete(deleted_ref)
        
        # If for some reason they're still in team, remove them
        if team_ref.get().exists:
            batch.delete(team_ref)
        
        batch.commit()
        
        # Delete from Firebase Auth completely
        try:
            auth.delete_user(member_id)
        except Exception as auth_err:
            # Ignore if user already removed from auth
            logger.warning(f"Could not delete user from auth {member_id}: {auth_err}")
        
        logger.info(f"Team member permanently deleted: {member_id} by {current_user.get('uid')}")
        
        return {"status": "success", "message": "Team member deleted permanently"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error permanently deleting team member: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to permanently delete team member")


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
