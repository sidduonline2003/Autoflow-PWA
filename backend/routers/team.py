import datetime
import logging
import re
import time
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import ORJSONResponse
from firebase_admin import auth, firestore
from pydantic import BaseModel, Field, field_validator

from ..dependencies import get_current_user
from ..services import teammate_codes

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/team",
    tags=["Team Management"],
)

class TeamInviteRequest(BaseModel): email: str; role: str; name: str; skills: List[str]
class AcceptInviteRequest(BaseModel): uid: str; inviteId: str; orgId: str
class TeamMemberUpdateRequest(BaseModel): name: str; role: str; skills: List[str]; availability: bool

_ORG_CODE_CACHE: Dict[str, str] = {}


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

    @field_validator("orgCode")
    @classmethod
    def _validate_optional_org_code(cls, value: Optional[str]):
        if value is None:
            return value
        normalized = value.strip().upper()
        if not re.fullmatch(r"[A-Z0-9]+", normalized):
            raise ValueError("orgCode must contain only uppercase letters and digits")
        return normalized


class CodePatternRequest(BaseModel):
    pattern: str = Field(..., min_length=3, max_length=100)

    @field_validator("pattern")
    @classmethod
    def _validate_pattern(cls, value: str):
        # Must contain at least {NUMBER} placeholder
        if "{NUMBER" not in value.upper():
            raise ValueError("Pattern must include {NUMBER:digits} placeholder")
        return value.strip()

@router.get("", include_in_schema=False)
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
        employee_code = _extract_employee_code(member_data)
        if employee_code:
            member_data["employeeCode"] = employee_code
            member_data.setdefault("profile", {})["employeeCode"] = employee_code
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


@router.get("/code-pattern", response_class=ORJSONResponse)
async def get_code_pattern(current_user: dict = Depends(get_current_user)):
    """Get the current employee code pattern for the organization."""
    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")

    db = firestore.client()
    org_ref = db.collection('organizations').document(org_id)
    org_doc = org_ref.get()

    if not org_doc.exists:
        raise HTTPException(status_code=404, detail="Organization not found")

    org_data = org_doc.to_dict() or {}
    pattern = org_data.get("codePattern", "{ORGCODE}-{ROLE}-{NUMBER:5}")

    return {"pattern": pattern}


@router.put("/code-pattern", response_class=ORJSONResponse)
async def update_code_pattern(req: CodePatternRequest, current_user: dict = Depends(get_current_user)):
    """Update the employee code pattern for the organization."""
    if (current_user.get("role") or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")

    db = firestore.client()
    org_ref = db.collection('organizations').document(org_id)
    org_doc = org_ref.get()

    if not org_doc.exists:
        raise HTTPException(status_code=404, detail="Organization not found")

    org_ref.update({
        "codePattern": req.pattern,
        "codePatternUpdatedAt": firestore.SERVER_TIMESTAMP,
        "codePatternUpdatedBy": current_user.get("uid"),
    })

    logger.info(
        "team.code_pattern.updated",
        extra={
            "orgId": org_id,
            "pattern": req.pattern,
            "updatedBy": current_user.get("uid"),
        },
    )

    return {"pattern": req.pattern, "status": "success"}


@router.post("/codes", response_class=ORJSONResponse)
async def generate_teammate_code(req: TeammateCodeRequest, current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")

    start = time.perf_counter()

    # Fetch code pattern from organization
    db = firestore.client()
    org_ref = db.collection('organizations').document(org_id)
    org_doc = org_ref.get()
    org_data = org_doc.to_dict() if org_doc.exists else {}
    pattern = org_data.get("codePattern", "{ORGCODE}-{ROLE}-{NUMBER:5}")

    try:
        result = await teammate_codes.allocate_teammate_code(
            firestore,
            org_code=req.orgCode,
            role=req.role,
            expected_org_id=org_id,
            teammate_uid=req.teammateUid,
            pattern=pattern,
        )
    except teammate_codes.OrgCodeNotFoundError:
        raise HTTPException(status_code=404, detail="Organization code not found")
    except teammate_codes.OrgMismatchError:
        raise HTTPException(status_code=403, detail="Org code does not belong to caller")
    except teammate_codes.AllocationExhaustedError:
        raise HTTPException(status_code=409, detail="No codes available after collision retries")
    except teammate_codes.AllocationFailedError:
        raise HTTPException(status_code=503, detail="Unable to allocate teammate code at this time")

    latency_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "teammate_code.generated",
        extra={
            "orgId": result.org_id,
            "role": result.role,
            "number": result.number,
            "code": result.code,
            "attempts": result.attempts,
            "latencyMs": round(latency_ms, 2),
        },
    )

    response = {
        "code": result.code,
        "role": result.role,
        "orgId": result.org_id,
        "number": result.number,
        "attempts": result.attempts,
        "latencyMs": round(latency_ms, 2),
    }
    if req.teammateUid:
        response["teammateUid"] = req.teammateUid
    return response


def _normalize_org_code_candidate(value: Optional[str]) -> Optional[str]:
    if not value or not isinstance(value, str):
        return None
    normalized = re.sub(r"[^A-Z0-9]+", "", value.strip().upper())
    return normalized or None


def _resolve_org_code_from_org_document(db, org_id: str) -> Optional[str]:
    try:
        snapshot = db.collection("organizations").document(org_id).get()
    except Exception as exc:  # pragma: no cover - Firestore errors
        logger.warning("team.resolve_org_code.org_doc_failed", extra={"orgId": org_id, "error": str(exc)})
        return None

    if not snapshot or not getattr(snapshot, "exists", False):
        return None

    data = snapshot.to_dict() or {}
    candidate_fields = ["orgCode", "code", "codePrefix", "org_code", "shortCode", "short_code"]
    for field in candidate_fields:
        candidate = _normalize_org_code_candidate(data.get(field))
        if candidate:
            return candidate
    return None


def _resolve_org_code_from_team_members(db, org_id: str) -> Optional[str]:
    team_ref = db.collection('organizations', org_id, 'team')
    try:
        stream = team_ref.stream()
    except Exception as exc:  # pragma: no cover - Firestore errors
        logger.warning("team.resolve_org_code.team_stream_failed", extra={"orgId": org_id, "error": str(exc)})
        return None

    count = 0
    for member_snapshot in stream:
        count += 1
        if count > 50:
            break
        data = member_snapshot.to_dict() or {}
        employee_code = _extract_employee_code(data)
        if not employee_code:
            continue
        prefix = employee_code.split('-', 1)[0]
        normalized = _normalize_org_code_candidate(prefix)
        if normalized:
            return normalized
    return None


def _persist_org_code_mapping(codes_collection, org_code: str, org_id: str) -> None:
    doc_ref = codes_collection.document(org_code)
    try:
        doc_ref.set({
            "orgId": org_id,
            "backfilled": True,
            "backfilledAt": firestore.SERVER_TIMESTAMP,
        }, merge=True)
    except Exception as exc:  # pragma: no cover - Firestore errors
        logger.error(
            "team.resolve_org_code.backfill_failed",
            extra={"orgId": org_id, "orgCode": org_code, "error": str(exc)},
        )
        raise teammate_codes.OrgCodeNotFoundError(org_id) from exc


def _resolve_org_code_from_user_claims(current_user: Optional[dict]) -> Optional[str]:
    if not current_user or not isinstance(current_user, dict):
        return None

    candidate_fields = [
        "orgCode",
        "org_code",
        "orgcode",
        "orgPrefix",
        "org_prefix",
    ]

    for field in candidate_fields:
        candidate = _normalize_org_code_candidate(current_user.get(field))
        if candidate:
            return candidate

    org_info = current_user.get("org")
    if isinstance(org_info, dict):
        nested_fields = ["code", "orgCode", "prefix", "shortCode"]
        for field in nested_fields:
            candidate = _normalize_org_code_candidate(org_info.get(field))
            if candidate:
                return candidate

    return None


def _resolve_org_code(db, org_id: str, *, override_code: Optional[str] = None, current_user: Optional[dict] = None) -> str:
    cached = _ORG_CODE_CACHE.get(org_id)
    if cached:
        return cached

    codes_collection = db.collection("indexes").document("orgCodes").collection("codes")
    try:
        matches = list(codes_collection.where("orgId", "==", org_id).limit(1).stream())
    except Exception as exc:  # pragma: no cover - Firestore errors
        logger.warning("team.resolve_org_code.query_failed", extra={"orgId": org_id, "error": str(exc)})
        matches = []

    if matches:
        code = _normalize_org_code_candidate(matches[0].id)
        if code:
            _ORG_CODE_CACHE[org_id] = code
            return code

    fallback_code = _normalize_org_code_candidate(override_code)
    if not fallback_code:
        fallback_code = _resolve_org_code_from_user_claims(current_user)
    if not fallback_code:
        fallback_code = _resolve_org_code_from_org_document(db, org_id)
    if not fallback_code:
        fallback_code = _resolve_org_code_from_team_members(db, org_id)

    if not fallback_code:
        raise teammate_codes.OrgCodeNotFoundError(org_id)

    _persist_org_code_mapping(codes_collection, fallback_code, org_id)
    _ORG_CODE_CACHE[org_id] = fallback_code

    logger.info(
        "team.resolve_org_code.backfilled",
        extra={"orgId": org_id, "orgCode": fallback_code},
    )

    return fallback_code


@router.post("/codes/assign", response_class=ORJSONResponse)
async def assign_teammate_codes(req: BulkTeammateCodeRequest, current_user: dict = Depends(get_current_user)):
    if (current_user.get("role") or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")

    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")

    db = firestore.client()

    try:
        logger.info(
            "team.assign_codes.starting",
            extra={
                "orgId": org_id,
                "teammateCount": len(req.teammateUids),
                "overrideOrgCode": req.orgCode,
                "force": req.force,
            },
        )
        org_code = _resolve_org_code(
            db,
            org_id,
            override_code=req.orgCode,
            current_user=current_user,
        )
        logger.info(
            "team.assign_codes.resolved_org_code",
            extra={"orgId": org_id, "orgCode": org_code},
        )
    except teammate_codes.OrgCodeNotFoundError as exc:
        logger.error(
            "team.assign_codes.org_code_not_found",
            extra={"orgId": org_id, "error": str(exc)},
        )
        raise HTTPException(
            status_code=404,
            detail=(
                "Organization code not found. "
                "Please ensure your organization document includes an 'orgCode' field, "
                "or pass 'orgCode' in the request body, "
                "or have at least one team member with an existing employeeCode."
            ),
        )

    # Fetch code pattern from organization
    org_ref = db.collection('organizations').document(org_id)
    org_doc = org_ref.get()
    org_data = org_doc.to_dict() if org_doc.exists else {}
    pattern = org_data.get("codePattern", "{ORGCODE}-{ROLE}-{NUMBER:5}")

    results = []
    for teammate_uid in req.teammateUids:
        member_ref = db.collection('organizations', org_id, 'team').document(teammate_uid)
        member_doc = member_ref.get()
        if not member_doc.exists:
            results.append({"teammateUid": teammate_uid, "status": "not_found"})
            continue

        member_data = member_doc.to_dict() or {}
        employee_code = _extract_employee_code(member_data)
        if employee_code and not req.force:
            results.append({"teammateUid": teammate_uid, "status": "skipped", "code": employee_code})
            continue

        role_value = member_data.get("role") or member_data.get("profile", {}).get("role")
        if not role_value:
            results.append({"teammateUid": teammate_uid, "status": "missing_role"})
            continue

        normalized_role = _normalize_role_for_code(role_value)
        try:
            allocation = await teammate_codes.allocate_teammate_code(
                firestore,
                org_code,
                normalized_role,
                expected_org_id=org_id,
                teammate_uid=teammate_uid,
                pattern=pattern,
            )
            results.append(
                {
                    "teammateUid": teammate_uid,
                    "status": "assigned",
                    "code": allocation.code,
                    "role": allocation.role,
                    "number": allocation.number,
                }
            )
        except teammate_codes.AllocationExhaustedError:
            results.append({"teammateUid": teammate_uid, "status": "conflict"})
        except teammate_codes.AllocationFailedError:
            results.append({"teammateUid": teammate_uid, "status": "failed"})

    return {"orgCode": org_code, "results": results}

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
