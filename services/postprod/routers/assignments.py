"""
PostProd Assignments router - Task assignments for projects
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

class AssignmentCreate(BaseModel):
    project_id: str
    user_id: str
    task_name: str
    task_type: str  # editing, color_grading, sound_mixing, vfx, review
    description: Optional[str] = None
    estimated_hours: float
    deadline: Optional[str] = None
    priority: str = "normal"
    dependencies: List[str] = []  # List of assignment IDs this depends on


class AssignmentUpdate(BaseModel):
    task_name: Optional[str] = None
    description: Optional[str] = None
    estimated_hours: Optional[float] = None
    deadline: Optional[str] = None
    priority: Optional[str] = None
    progress_percent: Optional[int] = None


class WorkLogCreate(BaseModel):
    hours: float
    description: str
    date: str


# ============ ASSIGNMENTS ============

@router.get("/")
@cache(ttl=120)
async def get_assignments(
    org_code: str,
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    task_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get assignments with filters"""
    db = get_db()
    
    query = db.collection(Collections.POSTPROD_ASSIGNMENTS).where("org_code", "==", org_code)
    
    if project_id:
        query = query.where("project_id", "==", project_id)
    
    if user_id:
        query = query.where("user_id", "==", user_id)
    
    if status:
        query = query.where("status", "==", status)
    
    if task_type:
        query = query.where("task_type", "==", task_type)
    
    docs = query.stream()
    assignments = []
    
    for doc in docs:
        assignment = doc.to_dict()
        assignment["id"] = doc.id
        assignments.append(assignment)
    
    return {"assignments": assignments, "count": len(assignments)}


@router.post("/")
async def create_assignment(
    assignment: AssignmentCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create a new task assignment"""
    db = get_db()
    
    # Verify project exists
    project_doc = db.collection(Collections.POSTPROD_PROJECTS).document(assignment.project_id).get()
    if not project_doc.exists:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Verify user exists
    user_doc = db.collection(Collections.POSTPROD_PROFILES).document(assignment.user_id).get()
    if not user_doc.exists:
        # Try to find by user_id field
        users = list(db.collection(Collections.POSTPROD_PROFILES)
                     .where("user_id", "==", assignment.user_id).limit(1).stream())
        if not users:
            raise HTTPException(status_code=404, detail="User profile not found")
    
    assignment_data = assignment.dict()
    assignment_data["org_code"] = org_code
    assignment_data["created_at"] = datetime.utcnow().isoformat()
    assignment_data["created_by"] = current_user["user_id"]
    assignment_data["status"] = "pending"
    assignment_data["progress_percent"] = 0
    assignment_data["actual_hours"] = 0
    assignment_data["work_logs"] = []
    
    doc_ref = db.collection(Collections.POSTPROD_ASSIGNMENTS).document()
    doc_ref.set(assignment_data)
    
    return {"id": doc_ref.id, "message": "Assignment created successfully"}


@router.get("/{assignment_id}")
async def get_assignment(
    assignment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get a specific assignment"""
    db = get_db()
    doc = db.collection(Collections.POSTPROD_ASSIGNMENTS).document(assignment_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    assignment = doc.to_dict()
    assignment["id"] = doc.id
    
    return assignment


@router.patch("/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    update: AssignmentUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update an assignment"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_ASSIGNMENTS).document(assignment_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    update_data = {k: v for k, v in update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()
    update_data["updated_by"] = current_user["user_id"]
    
    doc_ref.update(update_data)
    
    return {"message": "Assignment updated successfully"}


@router.delete("/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an assignment"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_ASSIGNMENTS).document(assignment_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    doc_ref.delete()
    
    return {"message": "Assignment deleted"}


# ============ WORKFLOW ============

@router.post("/{assignment_id}/start")
async def start_assignment(
    assignment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Start working on an assignment"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_ASSIGNMENTS).document(assignment_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    assignment = doc.to_dict()
    
    # Check dependencies are completed
    for dep_id in assignment.get("dependencies", []):
        dep_doc = db.collection(Collections.POSTPROD_ASSIGNMENTS).document(dep_id).get()
        if dep_doc.exists and dep_doc.to_dict().get("status") != "completed":
            raise HTTPException(status_code=400, detail=f"Dependency {dep_id} not completed")
    
    doc_ref.update({
        "status": "in_progress",
        "started_at": datetime.utcnow().isoformat(),
        "started_by": current_user["user_id"]
    })
    
    return {"message": "Assignment started"}


@router.post("/{assignment_id}/complete")
async def complete_assignment(
    assignment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark an assignment as completed"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_ASSIGNMENTS).document(assignment_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    doc_ref.update({
        "status": "completed",
        "progress_percent": 100,
        "completed_at": datetime.utcnow().isoformat(),
        "completed_by": current_user["user_id"]
    })
    
    # Update project progress
    assignment = doc.to_dict()
    project_id = assignment.get("project_id")
    
    if project_id:
        # Calculate project progress based on completed assignments
        all_assignments = list(db.collection(Collections.POSTPROD_ASSIGNMENTS)
                               .where("project_id", "==", project_id).stream())
        
        if all_assignments:
            total = len(all_assignments)
            completed = sum(1 for a in all_assignments if a.to_dict().get("status") == "completed")
            progress = int((completed / total) * 100)
            
            db.collection(Collections.POSTPROD_PROJECTS).document(project_id).update({
                "progress_percent": progress
            })
    
    return {"message": "Assignment completed"}


@router.post("/{assignment_id}/reassign")
async def reassign_task(
    assignment_id: str,
    new_user_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Reassign a task to a different user"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_ASSIGNMENTS).document(assignment_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    old_user = doc.to_dict().get("user_id")
    
    doc_ref.update({
        "user_id": new_user_id,
        "reassigned_at": datetime.utcnow().isoformat(),
        "reassigned_by": current_user["user_id"],
        "reassignment_reason": reason,
        "previous_user_id": old_user
    })
    
    return {"message": "Task reassigned successfully"}


# ============ WORK LOGS ============

@router.post("/{assignment_id}/log")
async def log_work(
    assignment_id: str,
    work_log: WorkLogCreate,
    current_user: dict = Depends(get_current_user)
):
    """Log work hours on an assignment"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_ASSIGNMENTS).document(assignment_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    assignment = doc.to_dict()
    work_logs = assignment.get("work_logs", [])
    
    log_entry = work_log.dict()
    log_entry["logged_at"] = datetime.utcnow().isoformat()
    log_entry["logged_by"] = current_user["user_id"]
    
    work_logs.append(log_entry)
    
    actual_hours = sum(log["hours"] for log in work_logs)
    
    doc_ref.update({
        "work_logs": work_logs,
        "actual_hours": actual_hours
    })
    
    return {"message": "Work logged successfully", "total_hours": actual_hours}


@router.get("/{assignment_id}/logs")
async def get_work_logs(
    assignment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get work logs for an assignment"""
    db = get_db()
    doc = db.collection(Collections.POSTPROD_ASSIGNMENTS).document(assignment_id).get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    assignment = doc.to_dict()
    work_logs = assignment.get("work_logs", [])
    
    return {
        "work_logs": work_logs,
        "total_hours": assignment.get("actual_hours", 0),
        "estimated_hours": assignment.get("estimated_hours", 0)
    }


# ============ USER'S ASSIGNMENTS ============

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


@router.get("/my/tasks")
@cache(ttl=60)
async def get_my_assignments(
    org_code: str,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get current user's assignments"""
    db = get_db()
    
    query = db.collection(Collections.POSTPROD_ASSIGNMENTS)\
        .where("org_code", "==", org_code)\
        .where("user_id", "==", current_user["user_id"])
    
    if status:
        query = query.where("status", "==", status)
    
    docs = query.stream()
    assignments = []
    
    for doc in docs:
        assignment = doc.to_dict()
        assignment["id"] = doc.id
        
        # Get project info
        project_id = assignment.get("project_id")
        if project_id:
            project_doc = db.collection(Collections.POSTPROD_PROJECTS).document(project_id).get()
            if project_doc.exists:
                assignment["project_name"] = project_doc.to_dict().get("title")
        
        assignments.append(assignment)
    
    return {"assignments": assignments, "count": len(assignments)}
