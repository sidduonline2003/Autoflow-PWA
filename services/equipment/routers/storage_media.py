"""
Storage Media Router - Storage devices and media tracking
"""

import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user, require_role
from shared.firebase_client import get_db
from shared.utils.helpers import nanoid_generate

router = APIRouter(prefix="/storage-media", tags=["Storage Media"])


class StorageMediaCreate(BaseModel):
    name: str
    type: str  # "sd_card", "cf_card", "ssd", "hdd", "usb"
    capacity: str  # e.g., "256GB", "1TB"
    serialNumber: Optional[str] = None
    brand: Optional[str] = None
    condition: str = "good"


class StorageMediaUpdate(BaseModel):
    name: Optional[str] = None
    condition: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class AssignStorageRequest(BaseModel):
    eventId: str
    notes: Optional[str] = None


def generate_media_id() -> str:
    return f"MEDIA_{nanoid_generate(12)}"


@router.post("/")
async def create_storage_media(req: StorageMediaCreate, current_user: dict = Depends(get_current_user)):
    """Create a new storage media device"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    media_id = generate_media_id()
    now = datetime.datetime.now(datetime.timezone.utc)
    
    media_data = {
        "mediaId": media_id,
        "name": req.name,
        "type": req.type,
        "capacity": req.capacity,
        "serialNumber": req.serialNumber,
        "brand": req.brand,
        "condition": req.condition,
        "status": "available",
        "createdBy": current_user.get("uid"),
        "createdAt": now,
        "updatedAt": now
    }
    
    media_ref = db.collection('organizations', org_id, 'storageMedia').document(media_id)
    media_ref.set(media_data)
    
    return {"status": "success", "mediaId": media_id}


@router.get("/")
async def list_storage_media(
    status: Optional[str] = None,
    type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all storage media"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'storageMedia')
    
    if status:
        query = query.where('status', '==', status)
    if type:
        query = query.where('type', '==', type)
    
    media_list = []
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        media_list.append(data)
    
    return {"media": media_list, "count": len(media_list)}


@router.get("/{media_id}")
async def get_storage_media(media_id: str, current_user: dict = Depends(get_current_user)):
    """Get storage media details"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    media_ref = db.collection('organizations', org_id, 'storageMedia').document(media_id)
    media_doc = media_ref.get()
    
    if not media_doc.exists:
        raise HTTPException(status_code=404, detail="Storage media not found")
    
    data = media_doc.to_dict()
    data['id'] = media_id
    
    return data


@router.put("/{media_id}")
async def update_storage_media(
    media_id: str,
    req: StorageMediaUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update storage media"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    media_ref = db.collection('organizations', org_id, 'storageMedia').document(media_id)
    media_doc = media_ref.get()
    
    if not media_doc.exists:
        raise HTTPException(status_code=404, detail="Storage media not found")
    
    update_data = {k: v for k, v in req.dict().items() if v is not None}
    update_data["updatedAt"] = datetime.datetime.now(datetime.timezone.utc)
    
    media_ref.update(update_data)
    
    return {"status": "success"}


@router.post("/{media_id}/assign")
async def assign_storage(
    media_id: str,
    req: AssignStorageRequest,
    current_user: dict = Depends(get_current_user)
):
    """Assign storage media to an event"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    media_ref = db.collection('organizations', org_id, 'storageMedia').document(media_id)
    media_doc = media_ref.get()
    
    if not media_doc.exists:
        raise HTTPException(status_code=404, detail="Storage media not found")
    
    media_data = media_doc.to_dict()
    
    if media_data.get("status") != "available":
        raise HTTPException(status_code=400, detail="Storage media is not available")
    
    now = datetime.datetime.now(datetime.timezone.utc)
    
    media_ref.update({
        "status": "assigned",
        "currentEventId": req.eventId,
        "assignedTo": current_user.get("uid"),
        "assignedAt": now,
        "assignmentNotes": req.notes,
        "updatedAt": now
    })
    
    return {"status": "success", "mediaId": media_id, "eventId": req.eventId}


@router.post("/{media_id}/release")
async def release_storage(
    media_id: str,
    formatted: bool = False,
    current_user: dict = Depends(get_current_user)
):
    """Release storage media from assignment"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    media_ref = db.collection('organizations', org_id, 'storageMedia').document(media_id)
    media_doc = media_ref.get()
    
    if not media_doc.exists:
        raise HTTPException(status_code=404, detail="Storage media not found")
    
    media_data = media_doc.to_dict()
    now = datetime.datetime.now(datetime.timezone.utc)
    
    # Add to usage history
    history_entry = {
        "eventId": media_data.get("currentEventId"),
        "assignedAt": media_data.get("assignedAt"),
        "releasedAt": now,
        "releasedBy": current_user.get("uid"),
        "formatted": formatted
    }
    
    media_ref.update({
        "status": "available",
        "currentEventId": None,
        "assignedTo": None,
        "assignedAt": None,
        "lastUsedAt": now,
        "lastFormattedAt": now if formatted else media_data.get("lastFormattedAt"),
        "usageHistory": firestore.ArrayUnion([history_entry]),
        "updatedAt": now
    })
    
    return {"status": "success", "mediaId": media_id, "formatted": formatted}


@router.get("/available/list")
async def list_available_storage(current_user: dict = Depends(get_current_user)):
    """List available storage media for assignment"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'storageMedia').where('status', '==', 'available')
    
    available = []
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        available.append(data)
    
    return {"available": available, "count": len(available)}
