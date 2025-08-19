from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import datetime

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/postprod",
    tags=["Post-Production"],
)

# ---- Models ----
class InitJobRequest(BaseModel):
    clientId: str

class SuggestRequest(BaseModel):
    # Simple rule inputs v1
    eventType: Optional[str] = None
    estimatedDuration: Optional[int] = None

class AssignRequest(BaseModel):
    primaryEditor: str
    secondaryEditor: Optional[str] = None
    uploader: str
    estimatedHours: Optional[float] = None
    notes: Optional[str] = None

class StatusPatchRequest(BaseModel):
    status: str
    notes: Optional[str] = None
    completionPercentage: Optional[int] = None

# ---- Helpers ----

def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _assert_role(user: dict, allowed: set):
    role = user.get('role')
    if role not in allowed:
        raise HTTPException(status_code=403, detail="Forbidden")


def _assert_org(user: dict) -> str:
    org_id = user.get('orgId')
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing org context")
    return org_id


def _find_event_ref(db, org_id: str, client_id: str, event_id: str):
    return db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)


# ---- Endpoints ----
