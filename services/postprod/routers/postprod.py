"""
PostProd main router - Core post-production functionality
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, date
from pydantic import BaseModel

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user
from shared.redis_client import cache


router = APIRouter()


# ============ SCHEMAS ============

class PostProdProfileCreate(BaseModel):
    user_id: str
    name: str
    email: str
    role: str  # editor, colorist, sound_designer, vfx_artist, etc.
    skills: List[str] = []
    hourly_rate: Optional[float] = None
    availability_hours: int = 40  # Weekly hours


class ProjectCreate(BaseModel):
    title: str
    client_id: str
    event_id: Optional[str] = None
    description: Optional[str] = None
    deadline: Optional[str] = None
    priority: str = "normal"  # low, normal, high, urgent
    project_type: str  # wedding, corporate, commercial, music_video, etc.


class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    deadline: Optional[str] = None
    priority: Optional[str] = None
    notes: Optional[str] = None


# ============ POSTPROD PROFILES ============

@router.get("/profiles")
@cache(ttl=300)
async def get_postprod_profiles(
    org_code: str,
    role: Optional[str] = None,
    skill: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all post-production team profiles"""
    db = get_db()
    
    query = db.collection(Collections.POSTPROD_PROFILES).where("org_code", "==", org_code)
    
    if role:
        query = query.where("role", "==", role)
    
    docs = query.stream()
    profiles = []
    
    for doc in docs:
        profile = doc.to_dict()
        profile["id"] = doc.id
        
        # Filter by skill if specified
        if skill and skill not in profile.get("skills", []):
            continue
            
        profiles.append(profile)
    
    return {"profiles": profiles, "count": len(profiles)}


@router.post("/profiles")
async def create_postprod_profile(
    profile: PostProdProfileCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a post-production profile for a team member"""
    db = get_db()
    
    profile_data = profile.dict()
    profile_data["org_code"] = org_code
    profile_data["created_at"] = datetime.utcnow().isoformat()
    profile_data["created_by"] = current_user["user_id"]
    profile_data["status"] = "active"
    profile_data["total_projects"] = 0
    profile_data["rating"] = 0.0
    
    doc_ref = db.collection(Collections.POSTPROD_PROFILES).document()
    doc_ref.set(profile_data)
    
    return {"id": doc_ref.id, "message": "Profile created successfully"}


@router.get("/profiles/{profile_id}")
async def get_profile(
    profile_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific post-production profile"""
    db = get_db()
    doc = db.collection(Collections.POSTPROD_PROFILES).document(profile_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    profile = doc.to_dict()
    profile["id"] = doc.id
    
    return profile


# ============ PROJECTS ============

@router.get("/projects")
@cache(ttl=120)
async def get_projects(
    org_code: str,
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user)
):
    """Get post-production projects"""
    db = get_db()
    
    query = db.collection(Collections.POSTPROD_PROJECTS).where("org_code", "==", org_code)
    
    if status:
        query = query.where("status", "==", status)
    
    if client_id:
        query = query.where("client_id", "==", client_id)
    
    query = query.order_by("created_at", direction="DESCENDING").limit(limit)
    
    docs = query.stream()
    projects = []
    
    for doc in docs:
        project = doc.to_dict()
        project["id"] = doc.id
        
        # Filter by assigned_to if specified
        if assigned_to:
            assignments = project.get("assignments", [])
            if assigned_to not in [a.get("user_id") for a in assignments]:
                continue
        
        projects.append(project)
    
    return {"projects": projects, "count": len(projects)}


@router.post("/projects")
async def create_project(
    project: ProjectCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new post-production project"""
    db = get_db()
    
    project_data = project.dict()
    project_data["org_code"] = org_code
    project_data["created_at"] = datetime.utcnow().isoformat()
    project_data["created_by"] = current_user["user_id"]
    project_data["status"] = "pending"
    project_data["assignments"] = []
    project_data["milestones"] = []
    project_data["deliverables"] = []
    project_data["progress_percent"] = 0
    
    doc_ref = db.collection(Collections.POSTPROD_PROJECTS).document()
    doc_ref.set(project_data)
    
    return {"id": doc_ref.id, "message": "Project created successfully"}


@router.get("/projects/{project_id}")
async def get_project(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific project with full details"""
    db = get_db()
    doc = db.collection(Collections.POSTPROD_PROJECTS).document(project_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = doc.to_dict()
    project["id"] = doc.id
    
    # Get related data
    # Assignments
    assignments_docs = db.collection(Collections.POSTPROD_ASSIGNMENTS)\
        .where("project_id", "==", project_id).stream()
    project["assignments"] = [{"id": d.id, **d.to_dict()} for d in assignments_docs]
    
    # Milestones
    milestones_docs = db.collection(Collections.POSTPROD_MILESTONES)\
        .where("project_id", "==", project_id).stream()
    project["milestones"] = [{"id": d.id, **d.to_dict()} for d in milestones_docs]
    
    return project


@router.patch("/projects/{project_id}")
async def update_project(
    project_id: str,
    update: ProjectUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a project"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_PROJECTS).document(project_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user["user_id"]
    
    doc_ref.update(update_data)
    
    return {"message": "Project updated successfully"}


@router.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a project"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_PROJECTS).document(project_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Soft delete
    doc_ref.update({
        "status": "deleted",
        "deleted_at": datetime.utcnow().isoformat(),
        "deleted_by": current_user["user_id"]
    })
    
    return {"message": "Project deleted successfully"}


# ============ WORKFLOW ============

@router.post("/projects/{project_id}/start")
async def start_project(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Start a project - move from pending to in_progress"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_PROJECTS).document(project_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = doc.to_dict()
    if project.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Project must be in pending status to start")
    
    doc_ref.update({
        "status": "in_progress",
        "started_at": datetime.utcnow().isoformat(),
        "started_by": current_user["user_id"]
    })
    
    return {"message": "Project started successfully"}


@router.post("/projects/{project_id}/complete")
async def complete_project(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark a project as completed"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_PROJECTS).document(project_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project = doc.to_dict()
    if project.get("status") != "in_progress":
        raise HTTPException(status_code=400, detail="Project must be in progress to complete")
    
    doc_ref.update({
        "status": "completed",
        "completed_at": datetime.utcnow().isoformat(),
        "completed_by": current_user["user_id"],
        "progress_percent": 100
    })
    
    return {"message": "Project completed successfully"}


# ============ MY ASSIGNMENTS (for editors) ============

def _to_iso(value):
    """Convert value to ISO format string"""
    if value is None:
        return None
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return str(value)


def _normalize_status(state: Optional[str]) -> str:
    """Normalize stream status to a standard status"""
    if not state:
        return "ASSIGNED"
    state_upper = state.upper()
    if state_upper.endswith("ASSIGNED"):
        return "ASSIGNED"
    if state_upper.endswith("IN_PROGRESS"):
        return "IN_PROGRESS"
    if state_upper.endswith("SUBMITTED") or state_upper.endswith("REVIEW"):
        return "REVIEW"
    if state_upper.endswith("CHANGES") or state_upper.endswith("REVISION"):
        return "REVISION"
    if state_upper.endswith("DONE") or state_upper.endswith("READY"):
        return "READY"
    return "ASSIGNED"


def _job_ref(db, org_id: str, event_id: str):
    """Get reference to a post-production job"""
    return db.collection('organizations', org_id, 'postProductionJobs').document(event_id)


def _build_complexity(job: dict) -> dict:
    """Build complexity info from job data"""
    ai_summary = job.get('aiSummary') or {}
    intake_summary = job.get('intakeSummary') or {}

    estimated_sizes = ai_summary.get('estimatedDataSizes') or intake_summary.get('estimatedDataSizes') or []
    if isinstance(estimated_sizes, (list, tuple)):
        gb_value = ", ".join(str(v) for v in estimated_sizes if v is not None)
    else:
        gb_value = str(estimated_sizes) if estimated_sizes else None

    return {
        'estimatedHours': ai_summary.get('estimatedHours'),
        'gb': gb_value,
        'cams': intake_summary.get('totalDevices'),
    }


def _build_assignment_entry(
    org_id: str,
    event_id: str,
    event_data: dict,
    job: dict,
    stream: str,
    editor_entry: dict,
    db
) -> dict:
    """Build an assignment entry from job data"""
    stream_state = job.get(stream) or {}
    final_due = _to_iso(stream_state.get('finalDue'))
    draft_due = _to_iso(stream_state.get('draftDue'))
    due = final_due or draft_due

    event_name = (
        event_data.get('eventName')
        or event_data.get('name')
        or job.get('eventName')
        or event_id
    )
    client_name = (
        event_data.get('clientName')
        or event_data.get('client')
        or job.get('clientName')
        or ''
    )

    stream_label = stream.upper()
    role_label = (editor_entry.get('role') or '').upper()

    intake_summary = job.get('intakeSummary') or {}
    assigned_storage = stream_state.get('assignedStorage')
    
    if assigned_storage is not None:
        approved_submissions = assigned_storage
    else:
        approved_submissions = intake_summary.get('approvedSubmissions') or []

    return {
        'jobId': f"{event_id}:{stream}",
        'assignmentId': f"{event_id}:{stream}",
        'eventId': event_id,
        'eventName': event_name,
        'eventType': event_data.get('eventType') or job.get('eventType'),
        'eventDate': _to_iso(event_data.get('date')),
        'eventTime': event_data.get('time'),
        'venue': event_data.get('venue') or job.get('venue'),
        'clientName': client_name,
        'orgId': org_id,
        'status': _normalize_status(stream_state.get('state')),
        'state': stream_state.get('state'),
        'stream': stream,
        'myRole': f"{stream_label}_{role_label}" if role_label else stream_label,
        'role': role_label,
        'due': due,
        'draftDue': draft_due,
        'finalDue': final_due,
        'updatedAt': _to_iso(job.get('updatedAt')),
        'createdAt': _to_iso(job.get('createdAt')),
        'intakeSummary': intake_summary,
        'complexity': _build_complexity(job),
        'deliverables': stream_state.get('deliverables') or [],
        'lastSubmission': stream_state.get('lastSubmission'),
        'waived': (job.get('waived') or {}).get(stream),
    }


def _iter_assignments_for_user(org_id: str, user_uid: str) -> list:
    """Iterate through all assignments for a user"""
    db = get_db()
    events_ref = db.collection('organizations', org_id, 'events')

    assignments = []
    for event_snap in events_ref.stream():
        event_id = event_snap.id
        event_data = event_snap.to_dict() or {}

        job_snapshot = _job_ref(db, org_id, event_id).get()
        if not job_snapshot.exists:
            continue
        job_data = job_snapshot.to_dict() or {}

        for stream in ('photo', 'video'):
            stream_state = job_data.get(stream) or {}
            editors = stream_state.get('editors') or []
            editor_entry = next((e for e in editors if e.get('uid') == user_uid), None)
            if not editor_entry:
                continue
            assignments.append(_build_assignment_entry(org_id, event_id, event_data, job_data, stream, editor_entry, db))

    return assignments


@router.get('/my-assignments')
async def my_assignments(current_user: dict = Depends(get_current_user)):
    """Get the current user's post-production assignments"""
    from fastapi import HTTPException
    
    uid = current_user.get('uid')
    org_id = current_user.get('orgId')

    if not uid:
        raise HTTPException(status_code=401, detail='Missing user')
    if not org_id:
        raise HTTPException(status_code=400, detail='Missing organization context')

    try:
        assignments = _iter_assignments_for_user(org_id, uid)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Failed to load assignments: {exc}') from exc

    assignments.sort(key=lambda item: (item.get('due') or '', item.get('eventName') or ''))
    return assignments


# ============ DASHBOARD ============

@router.get("/dashboard")
@cache(ttl=60)
async def get_postprod_dashboard(
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Get post-production dashboard summary"""
    db = get_db()
    
    # Get project stats
    projects_ref = db.collection(Collections.POSTPROD_PROJECTS)
    
    pending = len(list(projects_ref.where("org_code", "==", org_code)
                       .where("status", "==", "pending").stream()))
    in_progress = len(list(projects_ref.where("org_code", "==", org_code)
                           .where("status", "==", "in_progress").stream()))
    completed = len(list(projects_ref.where("org_code", "==", org_code)
                         .where("status", "==", "completed").stream()))
    
    # Get active assignments
    assignments_ref = db.collection(Collections.POSTPROD_ASSIGNMENTS)
    active_assignments = len(list(assignments_ref.where("org_code", "==", org_code)
                                  .where("status", "==", "active").stream()))
    
    # Get overdue projects (deadline passed, not completed)
    today = date.today().isoformat()
    overdue_docs = projects_ref.where("org_code", "==", org_code)\
        .where("status", "==", "in_progress")\
        .where("deadline", "<", today).stream()
    overdue = len(list(overdue_docs))
    
    return {
        "projects": {
            "pending": pending,
            "in_progress": in_progress,
            "completed": completed,
            "overdue": overdue,
            "total": pending + in_progress + completed
        },
        "active_assignments": active_assignments
    }
