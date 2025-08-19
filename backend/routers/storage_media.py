from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import Optional, Dict, Any
import datetime

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/storage",
    tags=["Storage Media"],
)

# ---- Models ----
class CreateStorageMediumRequest(BaseModel):
    name: str
    mediaType: str  # e.g., SSD, HDD, SD_CARD
    capacityGB: Optional[int] = None
    serialNumber: Optional[str] = None
    location: Optional[Dict[str, str]] = None  # { room, shelf, bin }

class UpdateStorageMediumRequest(BaseModel):
    name: Optional[str] = None
    mediaType: Optional[str] = None
    capacityGB: Optional[int] = None
    serialNumber: Optional[str] = None
    location: Optional[Dict[str, str]] = None
    status: Optional[str] = None  # available | in-use | damaged | retired

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

# ---- Endpoints ----

@router.get("/media")
async def list_storage_media(status: Optional[str] = None, mediaType: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    _assert_role(current_user, { 'admin', 'data-manager' })
    org_id = _assert_org(current_user)
    db = firestore.client()

    col = db.collection('organizations', org_id, 'storageMedia')
    if status:
        col = col.where('status', '==', status)
    if mediaType:
        col = col.where('mediaType', '==', mediaType)

    items = [{ **d.to_dict(), 'id': d.id } for d in col.stream()]
    return { 'items': items }


@router.post("/media")
async def create_storage_medium(req: CreateStorageMediumRequest, current_user: dict = Depends(get_current_user)):
    _assert_role(current_user, { 'admin', 'data-manager' })
    org_id = _assert_org(current_user)
    db = firestore.client()

    ref = db.collection('organizations', org_id, 'storageMedia').document()
    data = {
        'id': ref.id,
        'orgId': org_id,
        'name': req.name,
        'mediaType': req.mediaType,
        'capacityGB': req.capacityGB,
        'serialNumber': req.serialNumber,
        'location': req.location or {},
        'status': 'available',
        'createdAt': _now(),
        'updatedAt': _now(),
    }
    ref.set(data)
    return { 'status': 'success', 'id': ref.id }


@router.patch("/media/{media_id}")
async def update_storage_medium(media_id: str, req: UpdateStorageMediumRequest, current_user: dict = Depends(get_current_user)):
    _assert_role(current_user, { 'admin', 'data-manager' })
    org_id = _assert_org(current_user)
    db = firestore.client()

    ref = db.collection('organizations', org_id, 'storageMedia').document(media_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Storage medium not found")

    updates = { k: v for k, v in req.dict(exclude_unset=True).items() }
    if not updates:
        return { 'status': 'noop' }
    updates['updatedAt'] = _now()
    ref.update(updates)
    return { 'status': 'success' }
