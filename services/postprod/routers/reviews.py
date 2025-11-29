"""
PostProd Reviews router - Client feedback and revision management
"""

from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
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

class ReviewVersionCreate(BaseModel):
    project_id: str
    deliverable_id: str
    version_number: int
    title: str
    description: Optional[str] = None
    video_url: str
    thumbnail_url: Optional[str] = None


class FeedbackCreate(BaseModel):
    version_id: str
    comment: str
    timecode: Optional[str] = None  # e.g., "01:23:45"
    category: str = "general"  # general, visual, audio, pacing, color, vfx
    priority: str = "normal"  # low, normal, high, critical


class FeedbackResponse(BaseModel):
    response_text: str
    status: str  # addressed, will_fix, clarification_needed, declined


# ============ REVIEW VERSIONS ============

@router.get("/versions")
@cache(ttl=120)
async def get_review_versions(
    org_code: str,
    project_id: Optional[str] = None,
    deliverable_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get review versions"""
    db = get_db()
    
    query = db.collection(Collections.POSTPROD_REVIEWS).where("org_code", "==", org_code)
    
    if project_id:
        query = query.where("project_id", "==", project_id)
    
    if deliverable_id:
        query = query.where("deliverable_id", "==", deliverable_id)
    
    docs = query.order_by("created_at", direction="DESCENDING").stream()
    versions = []
    
    for doc in docs:
        version = doc.to_dict()
        version["id"] = doc.id
        versions.append(version)
    
    return {"versions": versions, "count": len(versions)}


@router.post("/versions")
async def create_review_version(
    version: ReviewVersionCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new version for review"""
    db = get_db()
    
    version_data = version.dict()
    version_data["org_code"] = org_code
    version_data["created_at"] = datetime.utcnow().isoformat()
    version_data["created_by"] = current_user["user_id"]
    version_data["status"] = "pending_review"
    version_data["feedback_count"] = 0
    version_data["approved"] = False
    
    doc_ref = db.collection(Collections.POSTPROD_REVIEWS).document()
    doc_ref.set(version_data)
    
    return {"id": doc_ref.id, "message": "Review version created"}


@router.get("/versions/{version_id}")
async def get_review_version(
    version_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific review version with all feedback"""
    db = get_db()
    doc = db.collection(Collections.POSTPROD_REVIEWS).document(version_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Version not found")
    
    version = doc.to_dict()
    version["id"] = doc.id
    
    # Get all feedback for this version
    feedback_docs = db.collection(Collections.POSTPROD_FEEDBACK)\
        .where("version_id", "==", version_id)\
        .order_by("created_at").stream()
    
    version["feedback"] = [{"id": d.id, **d.to_dict()} for d in feedback_docs]
    
    return version


# ============ FEEDBACK ============

@router.post("/feedback")
async def add_feedback(
    feedback: FeedbackCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Add feedback to a review version"""
    db = get_db()
    
    # Verify version exists
    version_doc = db.collection(Collections.POSTPROD_REVIEWS).document(feedback.version_id).get()
    if not version_doc.exists:
        raise HTTPException(status_code=404, detail="Review version not found")
    
    feedback_data = feedback.dict()
    feedback_data["org_code"] = org_code
    feedback_data["created_at"] = datetime.utcnow().isoformat()
    feedback_data["created_by"] = current_user["user_id"]
    feedback_data["author_name"] = current_user.get("name", "Unknown")
    feedback_data["status"] = "open"
    feedback_data["responses"] = []
    
    doc_ref = db.collection(Collections.POSTPROD_FEEDBACK).document()
    doc_ref.set(feedback_data)
    
    # Update feedback count on version
    version_data = version_doc.to_dict()
    db.collection(Collections.POSTPROD_REVIEWS).document(feedback.version_id).update({
        "feedback_count": version_data.get("feedback_count", 0) + 1,
        "status": "has_feedback"
    })
    
    return {"id": doc_ref.id, "message": "Feedback added"}


@router.get("/feedback/{feedback_id}")
async def get_feedback(
    feedback_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific feedback item"""
    db = get_db()
    doc = db.collection(Collections.POSTPROD_FEEDBACK).document(feedback_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Feedback not found")
    
    feedback = doc.to_dict()
    feedback["id"] = doc.id
    
    return feedback


@router.post("/feedback/{feedback_id}/respond")
async def respond_to_feedback(
    feedback_id: str,
    response: FeedbackResponse,
    current_user: dict = Depends(get_current_user)
):
    """Respond to feedback"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_FEEDBACK).document(feedback_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Feedback not found")
    
    feedback_data = doc.to_dict()
    responses = feedback_data.get("responses", [])
    
    response_entry = response.dict()
    response_entry["responded_at"] = datetime.utcnow().isoformat()
    response_entry["responded_by"] = current_user["user_id"]
    
    responses.append(response_entry)
    
    doc_ref.update({
        "responses": responses,
        "status": response.status,
        "last_response_at": datetime.utcnow().isoformat()
    })
    
    return {"message": "Response added"}


@router.post("/feedback/{feedback_id}/resolve")
async def resolve_feedback(
    feedback_id: str,
    resolution_note: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Mark feedback as resolved"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_FEEDBACK).document(feedback_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Feedback not found")
    
    doc_ref.update({
        "status": "resolved",
        "resolved_at": datetime.utcnow().isoformat(),
        "resolved_by": current_user["user_id"],
        "resolution_note": resolution_note
    })
    
    return {"message": "Feedback resolved"}


# ============ APPROVALS ============

@router.post("/versions/{version_id}/approve")
async def approve_version(
    version_id: str,
    notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Approve a review version"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_REVIEWS).document(version_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Version not found")
    
    # Check all feedback is resolved
    open_feedback = list(db.collection(Collections.POSTPROD_FEEDBACK)
                         .where("version_id", "==", version_id)
                         .where("status", "==", "open").limit(1).stream())
    
    if open_feedback:
        raise HTTPException(status_code=400, detail="Cannot approve with open feedback")
    
    doc_ref.update({
        "status": "approved",
        "approved": True,
        "approved_at": datetime.utcnow().isoformat(),
        "approved_by": current_user["user_id"],
        "approval_notes": notes
    })
    
    # Update deliverable status
    version_data = doc.to_dict()
    deliverable_id = version_data.get("deliverable_id")
    
    if deliverable_id:
        db.collection(Collections.POSTPROD_DELIVERABLES).document(deliverable_id).update({
            "status": "approved",
            "approved_version_id": version_id
        })
    
    return {"message": "Version approved"}


@router.post("/versions/{version_id}/request-changes")
async def request_changes(
    version_id: str,
    summary: str,
    current_user: dict = Depends(get_current_user)
):
    """Request changes on a version"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_REVIEWS).document(version_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Version not found")
    
    doc_ref.update({
        "status": "changes_requested",
        "changes_requested_at": datetime.utcnow().isoformat(),
        "changes_requested_by": current_user["user_id"],
        "changes_summary": summary
    })
    
    return {"message": "Changes requested"}


# ============ CLIENT PORTAL ============

@router.get("/client-portal/{project_id}")
async def get_client_review_portal(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get client-facing review portal data"""
    db = get_db()
    
    # Get project
    project_doc = db.collection(Collections.POSTPROD_PROJECTS).document(project_id).get()
    if not project_doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = project_doc.to_dict()
    
    # Get latest versions for each deliverable
    versions_docs = db.collection(Collections.POSTPROD_REVIEWS)\
        .where("project_id", "==", project_id)\
        .where("status", "in", ["pending_review", "has_feedback"])\
        .order_by("created_at", direction="DESCENDING")\
        .stream()
    
    pending_reviews = []
    for doc in versions_docs:
        version = doc.to_dict()
        version["id"] = doc.id
        pending_reviews.append(version)
    
    # Get approved deliverables
    approved_docs = db.collection(Collections.POSTPROD_REVIEWS)\
        .where("project_id", "==", project_id)\
        .where("status", "==", "approved")\
        .stream()
    
    approved = [{"id": d.id, **d.to_dict()} for d in approved_docs]
    
    return {
        "project": {
            "id": project_id,
            "title": project.get("title"),
            "status": project.get("status")
        },
        "pending_reviews": pending_reviews,
        "approved_deliverables": approved
    }
