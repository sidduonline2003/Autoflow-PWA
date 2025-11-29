"""
PostProd Deliverables router - Final output management
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user
from shared.redis_client import cache


router = APIRouter()


# ============ SCHEMAS ============

class DeliverableCreate(BaseModel):
    project_id: str
    title: str
    deliverable_type: str  # highlight_reel, full_video, teaser, social_cut, etc.
    description: Optional[str] = None
    specifications: Optional[dict] = None  # resolution, format, duration, etc.
    deadline: Optional[str] = None


class DeliverableUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    specifications: Optional[dict] = None
    deadline: Optional[str] = None


class DeliveryCreate(BaseModel):
    deliverable_id: str
    delivery_method: str  # download_link, cloud_share, physical, streaming
    delivery_url: Optional[str] = None
    notes: Optional[str] = None


# ============ DELIVERABLES ============

@router.get("/")
@cache(ttl=120)
async def get_deliverables(
    org_code: str,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    deliverable_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get deliverables"""
    db = get_db()
    
    query = db.collection(Collections.POSTPROD_DELIVERABLES).where("org_code", "==", org_code)
    
    if project_id:
        query = query.where("project_id", "==", project_id)
    
    if status:
        query = query.where("status", "==", status)
    
    if deliverable_type:
        query = query.where("deliverable_type", "==", deliverable_type)
    
    docs = query.stream()
    deliverables = []
    
    for doc in docs:
        deliverable = doc.to_dict()
        deliverable["id"] = doc.id
        deliverables.append(deliverable)
    
    return {"deliverables": deliverables, "count": len(deliverables)}


@router.post("/")
async def create_deliverable(
    deliverable: DeliverableCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new deliverable"""
    db = get_db()
    
    # Verify project exists
    project_doc = db.collection(Collections.POSTPROD_PROJECTS).document(deliverable.project_id).get()
    if not project_doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    
    deliverable_data = deliverable.dict()
    deliverable_data["org_code"] = org_code
    deliverable_data["created_at"] = datetime.utcnow().isoformat()
    deliverable_data["created_by"] = current_user["user_id"]
    deliverable_data["status"] = "pending"
    deliverable_data["versions"] = []
    deliverable_data["current_version"] = 0
    
    doc_ref = db.collection(Collections.POSTPROD_DELIVERABLES).document()
    doc_ref.set(deliverable_data)
    
    return {"id": doc_ref.id, "message": "Deliverable created"}


@router.get("/{deliverable_id}")
async def get_deliverable(
    deliverable_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific deliverable"""
    db = get_db()
    doc = db.collection(Collections.POSTPROD_DELIVERABLES).document(deliverable_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    
    deliverable = doc.to_dict()
    deliverable["id"] = doc.id
    
    # Get review versions
    versions_docs = db.collection(Collections.POSTPROD_REVIEWS)\
        .where("deliverable_id", "==", deliverable_id)\
        .order_by("version_number").stream()
    
    deliverable["versions"] = [{"id": d.id, **d.to_dict()} for d in versions_docs]
    
    return deliverable


@router.patch("/{deliverable_id}")
async def update_deliverable(
    deliverable_id: str,
    update: DeliverableUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a deliverable"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_DELIVERABLES).document(deliverable_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user["user_id"]
    
    doc_ref.update(update_data)
    
    return {"message": "Deliverable updated"}


@router.delete("/{deliverable_id}")
async def delete_deliverable(
    deliverable_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a deliverable"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_DELIVERABLES).document(deliverable_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    
    # Soft delete
    doc_ref.update({
        "status": "deleted",
        "deleted_at": datetime.utcnow().isoformat(),
        "deleted_by": current_user["user_id"]
    })
    
    return {"message": "Deliverable deleted"}


# ============ DELIVERY ============

@router.post("/deliver")
async def create_delivery(
    delivery: DeliveryCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a delivery record for a deliverable"""
    db = get_db()
    
    # Verify deliverable exists and is approved
    deliverable_doc = db.collection(Collections.POSTPROD_DELIVERABLES).document(delivery.deliverable_id).get()
    if not deliverable_doc.exists:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    
    deliverable = deliverable_doc.to_dict()
    if deliverable.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Deliverable must be approved before delivery")
    
    delivery_data = delivery.dict()
    delivery_data["org_code"] = org_code
    delivery_data["created_at"] = datetime.utcnow().isoformat()
    delivery_data["created_by"] = current_user["user_id"]
    delivery_data["status"] = "delivered"
    
    doc_ref = db.collection(Collections.POSTPROD_DELIVERIES).document()
    doc_ref.set(delivery_data)
    
    # Update deliverable status
    db.collection(Collections.POSTPROD_DELIVERABLES).document(delivery.deliverable_id).update({
        "status": "delivered",
        "delivered_at": datetime.utcnow().isoformat()
    })
    
    return {"id": doc_ref.id, "message": "Delivery created"}


@router.get("/deliveries")
async def get_deliveries(
    org_code: str,
    project_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get delivery records"""
    db = get_db()
    
    query = db.collection(Collections.POSTPROD_DELIVERIES).where("org_code", "==", org_code)
    
    docs = query.stream()
    deliveries = []
    
    for doc in docs:
        delivery = doc.to_dict()
        delivery["id"] = doc.id
        
        # Get deliverable info
        deliverable_id = delivery.get("deliverable_id")
        if deliverable_id:
            del_doc = db.collection(Collections.POSTPROD_DELIVERABLES).document(deliverable_id).get()
            if del_doc.exists:
                del_data = del_doc.to_dict()
                delivery["deliverable_title"] = del_data.get("title")
                delivery["project_id"] = del_data.get("project_id")
                
                # Filter by project if specified
                if project_id and del_data.get("project_id") != project_id:
                    continue
        
        deliveries.append(delivery)
    
    return {"deliveries": deliveries, "count": len(deliveries)}


# ============ SPECIFICATIONS ============

@router.get("/specifications/templates")
async def get_specification_templates():
    """Get common deliverable specification templates"""
    return {
        "templates": {
            "highlight_reel": {
                "duration": "3-5 minutes",
                "resolution": "4K (3840x2160)",
                "format": "H.264/MP4",
                "frame_rate": "24fps or 30fps",
                "audio": "Stereo, 48kHz"
            },
            "full_video": {
                "duration": "Varies",
                "resolution": "4K (3840x2160)",
                "format": "ProRes 422 or H.264",
                "frame_rate": "24fps or 30fps",
                "audio": "5.1 or Stereo, 48kHz"
            },
            "social_cut": {
                "duration": "30-90 seconds",
                "resolution": "1080x1920 (vertical) or 1080x1080 (square)",
                "format": "H.264/MP4",
                "frame_rate": "30fps",
                "audio": "Stereo, 48kHz"
            },
            "teaser": {
                "duration": "15-45 seconds",
                "resolution": "4K or 1080p",
                "format": "H.264/MP4",
                "frame_rate": "24fps",
                "audio": "Stereo, 48kHz"
            }
        }
    }


# ============ BATCH OPERATIONS ============

@router.post("/project/{project_id}/create-standard")
async def create_standard_deliverables(
    project_id: str,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create standard set of deliverables for a project"""
    db = get_db()
    
    # Verify project exists
    project_doc = db.collection(Collections.POSTPROD_PROJECTS).document(project_id).get()
    if not project_doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = project_doc.to_dict()
    project_type = project.get("project_type", "wedding")
    
    # Standard deliverables by project type
    standard_sets = {
        "wedding": [
            {"title": "Highlight Reel", "type": "highlight_reel"},
            {"title": "Full Ceremony", "type": "full_video"},
            {"title": "Instagram Teaser", "type": "social_cut"},
            {"title": "Reception Highlights", "type": "highlight_reel"}
        ],
        "corporate": [
            {"title": "Main Video", "type": "full_video"},
            {"title": "Social Media Cut", "type": "social_cut"},
            {"title": "Teaser Trailer", "type": "teaser"}
        ],
        "commercial": [
            {"title": "30 Second Spot", "type": "commercial"},
            {"title": "15 Second Spot", "type": "commercial"},
            {"title": "Extended Cut", "type": "full_video"}
        ]
    }
    
    deliverables_to_create = standard_sets.get(project_type, standard_sets["corporate"])
    
    batch = db.batch()
    created_ids = []
    
    for item in deliverables_to_create:
        deliverable_data = {
            "project_id": project_id,
            "org_code": org_code,
            "title": item["title"],
            "deliverable_type": item["type"],
            "created_at": datetime.utcnow().isoformat(),
            "created_by": current_user["user_id"],
            "status": "pending",
            "versions": [],
            "current_version": 0
        }
        
        doc_ref = db.collection(Collections.POSTPROD_DELIVERABLES).document()
        batch.set(doc_ref, deliverable_data)
        created_ids.append(doc_ref.id)
    
    batch.commit()
    
    return {
        "message": f"Created {len(created_ids)} standard deliverables",
        "deliverable_ids": created_ids
    }
