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

@router.post("/events/{event_id}/init")
async def init_postprod_job(event_id: str, req: InitJobRequest, current_user: dict = Depends(get_current_user)):
    _assert_role(current_user, { 'admin', 'data-manager' })
    org_id = _assert_org(current_user)
    db = firestore.client()

    # idempotent: one job per event
    jobs = db.collection('organizations', org_id, 'post_production_tasks').where('eventId', '==', event_id).limit(1).stream()
    jobs = list(jobs)
    if jobs:
        return { 'status': 'exists', 'jobId': jobs[0].id }

    event_ref = _find_event_ref(db, org_id, req.clientId, event_id)
    evt = event_ref.get()
    if not evt.exists:
        raise HTTPException(status_code=404, detail='Event not found')
    evt_data = evt.to_dict() or {}

    job_ref = db.collection('organizations', org_id, 'post_production_tasks').document()
    job = {
        'id': job_ref.id,
        'orgId': org_id,
        'eventId': event_id,
        'clientId': req.clientId,
        'eventName': evt_data.get('name'),
        'eventType': evt_data.get('eventType'),
        'status': 'AI_EDITOR_ASSIGNMENT',
        'createdAt': _now(),
        'updatedAt': _now(),
        'workflow': {
            'shootComplete': _now(),
            'aiAssignment': _now(),
            'editingPending': None,
            'editingInProgress': None,
            'editingReview': None,
            'uploadPending': None,
            'clientReady': None,
        },
    }
    job_ref.set(job)

    # reflect status on the event
    event_ref.update({ 'status': 'AI_EDITOR_ASSIGNMENT', 'postProductionTaskId': job_ref.id, 'updatedAt': _now() })

    return { 'status': 'created', 'jobId': job_ref.id }


@router.get("/{job_id}")
async def get_job(job_id: str, current_user: dict = Depends(get_current_user)):
    org_id = _assert_org(current_user)
    db = firestore.client()
    ref = db.collection('organizations', org_id, 'post_production_tasks').document(job_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail='Job not found')
    return doc.to_dict()


@router.post("/{job_id}/suggest")
async def suggest_editors(job_id: str, req: SuggestRequest, current_user: dict = Depends(get_current_user)):
    _assert_role(current_user, { 'admin', 'data-manager' })
    org_id = _assert_org(current_user)
    db = firestore.client()

    job_ref = db.collection('organizations', org_id, 'post_production_tasks').document(job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not found')
    job = job_doc.to_dict() or {}

    # naive rule-based suggestion v1
    event_type = req.eventType or job.get('eventType')
    est = req.estimatedDuration or 8

    # find editors by skill and workload
    team_col = db.collection('organizations', org_id, 'team')
    candidates: List[Dict[str, Any]] = []
    for d in team_col.stream():
        td = d.to_dict() or {}
        if td.get('role') in ('editor', 'uploader') and td.get('availability', True):
            skills = td.get('skills', [])
            score = 0
            if event_type and any(event_type.lower() in s.lower() for s in skills):
                score += 2
            score -= td.get('currentWorkload', 0)
            candidates.append({ 'userId': d.id, 'name': td.get('name'), 'role': td.get('role'), 'score': score, 'skills': skills })

    candidates.sort(key=lambda x: x['score'], reverse=True)
    primary = next((c for c in candidates if c['role'] == 'editor'), None)
    uploader = next((c for c in candidates if c['role'] == 'uploader'), None)

    suggestions = {
        'reasoning': 'Rule-based v1: skill match and lower workload preferred',
        'suggestions': [c for c in candidates[:5]],
        'primaryEditor': primary,
        'uploader': uploader,
        'estimatedHours': est,
    }

    job_ref.update({ 'aiSuggestions': suggestions, 'updatedAt': _now() })
    return suggestions


@router.post("/{job_id}/assign")
async def assign_editors(job_id: str, req: AssignRequest, current_user: dict = Depends(get_current_user)):
    _assert_role(current_user, { 'admin', 'data-manager' })
    org_id = _assert_org(current_user)
    db = firestore.client()

    job_ref = db.collection('organizations', org_id, 'post_production_tasks').document(job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not found')
    job = job_doc.to_dict() or {}

    # validate team users exist
    for uid in filter(None, [req.primaryEditor, req.secondaryEditor, req.uploader]):
        uref = db.collection('organizations', org_id, 'team').document(uid)
        if not uref.get().exists:
            raise HTTPException(status_code=404, detail=f"Team member {uid} not found")

    updates = {
        'primaryEditor': req.primaryEditor,
        'secondaryEditor': req.secondaryEditor,
        'uploader': req.uploader,
        'estimatedHours': req.estimatedHours or job.get('estimatedHours', 8),
        'notes': req.notes,
        'status': 'EDITING_PENDING',
        'updatedAt': _now(),
    }
    job_ref.update(updates)

    # reflect status on event
    # find event by clientId from job
    event_ref = _find_event_ref(db, org_id, job.get('clientId'), job.get('eventId'))
    if event_ref:
        event_ref.update({ 'status': 'EDITING_PENDING', 'updatedAt': _now() })

    return { 'status': 'success' }


@router.patch("/{job_id}/status")
async def patch_status(job_id: str, req: StatusPatchRequest, current_user: dict = Depends(get_current_user)):
    org_id = _assert_org(current_user)
    uid = current_user.get('uid')
    db = firestore.client()

    job_ref = db.collection('organizations', org_id, 'post_production_tasks').document(job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not found')
    job = job_doc.to_dict() or {}

    # Only assigned users or admin can update
    if current_user.get('role') not in ('admin', 'data-manager') and uid not in [job.get('primaryEditor'), job.get('secondaryEditor'), job.get('uploader')]:
        raise HTTPException(status_code=403, detail='Forbidden')

    allowed_transitions = {
        'EDITING_PENDING': ['EDITING_IN_PROGRESS'],
        'EDITING_IN_PROGRESS': ['EDITING_REVIEW', 'REVISION_NEEDED'],
        'EDITING_REVIEW': ['UPLOAD_PENDING', 'REVISION_NEEDED'],
        'REVISION_NEEDED': ['EDITING_IN_PROGRESS'],
        'UPLOAD_PENDING': ['CLIENT_READY'],
    }
    cur = job.get('status')
    if req.status not in allowed_transitions.get(cur, []):
        raise HTTPException(status_code=400, detail=f'Invalid status transition from {cur} to {req.status}')

    updates = {
        'status': req.status,
        'notes': req.notes,
        'completionPercentage': req.completionPercentage,
        'lastUpdatedBy': uid,
        'updatedAt': _now(),
    }

    # workflow timestamps
    mapping = {
        'EDITING_IN_PROGRESS': 'editingInProgress',
        'EDITING_REVIEW': 'editingReview',
        'UPLOAD_PENDING': 'uploadPending',
        'CLIENT_READY': 'clientReady',
    }
    wf = job.get('workflow', {})
    if req.status in mapping:
        wf[mapping[req.status]] = _now()
        updates['workflow'] = wf

    job_ref.update({ k: v for k, v in updates.items() if v is not None })

    # mirror on event
    event_ref = _find_event_ref(db, org_id, job.get('clientId'), job.get('eventId'))
    if event_ref:
        event_ref.update({ 'status': req.status, 'updatedAt': _now() })

    return { 'status': 'success' }
