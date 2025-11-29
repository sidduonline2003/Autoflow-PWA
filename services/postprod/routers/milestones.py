"""
PostProd Milestones router - Project milestone tracking
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

class MilestoneCreate(BaseModel):
    project_id: str
    title: str
    description: Optional[str] = None
    due_date: str
    order: int = 0
    dependencies: List[str] = []  # List of milestone IDs


class MilestoneUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    order: Optional[int] = None


# ============ MILESTONES ============

@router.get("/")
@cache(ttl=120)
async def get_milestones(
    org_code: str,
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get milestones"""
    db = get_db()
    
    query = db.collection(Collections.POSTPROD_MILESTONES).where("org_code", "==", org_code)
    
    if project_id:
        query = query.where("project_id", "==", project_id)
    
    if status:
        query = query.where("status", "==", status)
    
    docs = query.stream()
    milestones = []
    
    for doc in docs:
        milestone = doc.to_dict()
        milestone["id"] = doc.id
        milestones.append(milestone)
    
    # Sort by order
    milestones.sort(key=lambda x: x.get("order", 0))
    
    return {"milestones": milestones, "count": len(milestones)}


@router.post("/")
async def create_milestone(
    milestone: MilestoneCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new milestone"""
    db = get_db()
    
    # Verify project exists
    project_doc = db.collection(Collections.POSTPROD_PROJECTS).document(milestone.project_id).get()
    if not project_doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    
    milestone_data = milestone.dict()
    milestone_data["org_code"] = org_code
    milestone_data["created_at"] = datetime.utcnow().isoformat()
    milestone_data["created_by"] = current_user["user_id"]
    milestone_data["status"] = "pending"
    milestone_data["progress_percent"] = 0
    
    doc_ref = db.collection(Collections.POSTPROD_MILESTONES).document()
    doc_ref.set(milestone_data)
    
    return {"id": doc_ref.id, "message": "Milestone created"}


@router.get("/{milestone_id}")
async def get_milestone(
    milestone_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific milestone"""
    db = get_db()
    doc = db.collection(Collections.POSTPROD_MILESTONES).document(milestone_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Milestone not found")
    
    milestone = doc.to_dict()
    milestone["id"] = doc.id
    
    # Get related assignments
    assignments_docs = db.collection(Collections.POSTPROD_ASSIGNMENTS)\
        .where("milestone_id", "==", milestone_id).stream()
    
    milestone["assignments"] = [{"id": d.id, **d.to_dict()} for d in assignments_docs]
    
    return milestone


@router.patch("/{milestone_id}")
async def update_milestone(
    milestone_id: str,
    update: MilestoneUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a milestone"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_MILESTONES).document(milestone_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Milestone not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user["user_id"]
    
    doc_ref.update(update_data)
    
    return {"message": "Milestone updated"}


@router.delete("/{milestone_id}")
async def delete_milestone(
    milestone_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a milestone"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_MILESTONES).document(milestone_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Milestone not found")
    
    doc_ref.delete()
    
    return {"message": "Milestone deleted"}


# ============ WORKFLOW ============

@router.post("/{milestone_id}/start")
async def start_milestone(
    milestone_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Start working on a milestone"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_MILESTONES).document(milestone_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Milestone not found")
    
    milestone = doc.to_dict()
    
    # Check dependencies are completed
    for dep_id in milestone.get("dependencies", []):
        dep_doc = db.collection(Collections.POSTPROD_MILESTONES).document(dep_id).get()
        if dep_doc.exists and dep_doc.to_dict().get("status") != "completed":
            raise HTTPException(status_code=400, detail=f"Dependency milestone {dep_id} not completed")
    
    doc_ref.update({
        "status": "in_progress",
        "started_at": datetime.utcnow().isoformat(),
        "started_by": current_user["user_id"]
    })
    
    return {"message": "Milestone started"}


@router.post("/{milestone_id}/complete")
async def complete_milestone(
    milestone_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a milestone as completed"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_MILESTONES).document(milestone_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Milestone not found")
    
    # Check all assignments are completed
    open_assignments = list(db.collection(Collections.POSTPROD_ASSIGNMENTS)
                            .where("milestone_id", "==", milestone_id)
                            .where("status", "!=", "completed").limit(1).stream())
    
    if open_assignments:
        raise HTTPException(status_code=400, detail="All assignments must be completed first")
    
    doc_ref.update({
        "status": "completed",
        "progress_percent": 100,
        "completed_at": datetime.utcnow().isoformat(),
        "completed_by": current_user["user_id"]
    })
    
    return {"message": "Milestone completed"}


# ============ TEMPLATES ============

@router.get("/templates")
async def get_milestone_templates():
    """Get common milestone templates by project type"""
    return {
        "templates": {
            "wedding": [
                {"title": "Initial Edit Assembly", "order": 1, "days_from_event": 7},
                {"title": "Color Grading", "order": 2, "days_from_event": 10},
                {"title": "Sound Design & Music", "order": 3, "days_from_event": 12},
                {"title": "First Client Review", "order": 4, "days_from_event": 14},
                {"title": "Revisions", "order": 5, "days_from_event": 18},
                {"title": "Final Delivery", "order": 6, "days_from_event": 21}
            ],
            "corporate": [
                {"title": "Rough Cut", "order": 1, "days_from_event": 3},
                {"title": "Graphics & Animation", "order": 2, "days_from_event": 5},
                {"title": "Audio Mix", "order": 3, "days_from_event": 6},
                {"title": "Client Review", "order": 4, "days_from_event": 7},
                {"title": "Final Revisions", "order": 5, "days_from_event": 9},
                {"title": "Delivery", "order": 6, "days_from_event": 10}
            ],
            "commercial": [
                {"title": "Concept & Storyboard", "order": 1, "days_from_event": 2},
                {"title": "Assembly", "order": 2, "days_from_event": 4},
                {"title": "VFX & Motion Graphics", "order": 3, "days_from_event": 7},
                {"title": "Color Grade", "order": 4, "days_from_event": 8},
                {"title": "Sound Mix", "order": 5, "days_from_event": 9},
                {"title": "Client Approval", "order": 6, "days_from_event": 10},
                {"title": "Final Master", "order": 7, "days_from_event": 11}
            ]
        }
    }


@router.post("/project/{project_id}/create-from-template")
async def create_milestones_from_template(
    project_id: str,
    template_type: str,
    base_date: str,  # YYYY-MM-DD
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create milestones for a project from a template"""
    db = get_db()
    from datetime import timedelta
    
    # Verify project exists
    project_doc = db.collection(Collections.POSTPROD_PROJECTS).document(project_id).get()
    if not project_doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get template
    templates = (await get_milestone_templates())["templates"]
    template = templates.get(template_type)
    
    if not template:
        raise HTTPException(status_code=400, detail=f"Template '{template_type}' not found")
    
    base = datetime.strptime(base_date, "%Y-%m-%d").date()
    
    batch = db.batch()
    created_ids = []
    
    for item in template:
        due_date = base + timedelta(days=item["days_from_event"])
        
        milestone_data = {
            "project_id": project_id,
            "org_code": org_code,
            "title": item["title"],
            "order": item["order"],
            "due_date": due_date.isoformat(),
            "created_at": datetime.utcnow().isoformat(),
            "created_by": current_user["user_id"],
            "status": "pending",
            "progress_percent": 0,
            "dependencies": []
        }
        
        doc_ref = db.collection(Collections.POSTPROD_MILESTONES).document()
        batch.set(doc_ref, milestone_data)
        created_ids.append(doc_ref.id)
    
    batch.commit()
    
    return {
        "message": f"Created {len(created_ids)} milestones from template",
        "milestone_ids": created_ids
    }
