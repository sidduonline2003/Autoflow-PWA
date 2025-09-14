from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore
from pydantic import BaseModel, Field, model_validator
from typing import List, Literal, Optional, Dict, Any
from datetime import datetime, timedelta
from ..dependencies import get_current_user

router = APIRouter(prefix="/postprod", tags=["Post Production"])

StreamType = Literal["photo", "video"]
Role = Literal["LEAD", "ASSIST"]
Decision = Literal["approve", "changes"]

PHOTO_STATES = [
    "PHOTO_ASSIGNED",
    "PHOTO_IN_PROGRESS",
    "PHOTO_SUBMITTED",
    "PHOTO_REVIEW",
    "PHOTO_CHANGES",
    "PHOTO_DONE"
]
VIDEO_STATES = [
    "VIDEO_ASSIGNED",
    "VIDEO_IN_PROGRESS",
    "VIDEO_SUBMITTED",
    "VIDEO_REVIEW",
    "VIDEO_CHANGES",
    "VIDEO_DONE"
]

ASSIGNED_MAP = {"photo": "PHOTO_ASSIGNED", "video": "VIDEO_ASSIGNED"}
IN_PROGRESS_MAP = {"photo": "PHOTO_IN_PROGRESS", "video": "VIDEO_IN_PROGRESS"}
REVIEW_MAP = {"photo": "PHOTO_REVIEW", "video": "VIDEO_REVIEW"}
CHANGES_MAP = {"photo": "PHOTO_CHANGES", "video": "VIDEO_CHANGES"}
DONE_MAP = {"photo": "PHOTO_DONE", "video": "VIDEO_DONE"}

class EditorRef(BaseModel):
    uid: str
    role: Role
    displayName: Optional[str] = None

class AssignIn(BaseModel):
    editors: List[EditorRef]
    draft_due: datetime
    final_due: datetime
    ai_suggest: bool = False

    @model_validator(mode='after')
    def one_lead(self):
        leads = [e for e in (self.editors or []) if e.role == 'LEAD']
        if len(leads) != 1:
            raise ValueError('Exactly one LEAD required')
        return self

class SubmitIn(BaseModel):
    version: int
    kind: Literal['draft', 'final']
    what_changed: str = Field(min_length=3, max_length=1000)
    deliverables: Dict[str, Any]

class ReviewIn(BaseModel):
    decision: Decision
    change_list: Optional[List[str]] = None
    next_due: Optional[datetime] = None

    @model_validator(mode='after')
    def validate_changes(self):
        if self.decision == 'changes':
            if not self.change_list or len(self.change_list) == 0:
                raise ValueError('change_list required for changes')
        return self

class NoteIn(BaseModel):
    summary: str = Field(min_length=1, max_length=300)
    stream: Optional[StreamType] = None

# --- Helpers ---

def _job_ref(db, org_id: str, event_id: str):
    return db.collection('organizations', org_id, 'events').document(event_id).collection('postprodJob').document('job')

def _activity_ref(db, org_id: str, event_id: str):
    return db.collection('organizations', org_id, 'events').document(event_id).collection('postprodActivity')

URL_FIELDS_PHOTO = {"previewSetUrl", "heroSetUrl", "shortlistUrl"}
URL_FIELDS_VIDEO = {"previewCutUrl", "changeLogUrl"}


def _validate_urls(deliverables: Dict[str, Any]):
    for k, v in deliverables.items():
        if k.endswith('Url') and v:
            if not isinstance(v, str) or not (v.startswith('http://') or v.startswith('https://')):
                raise HTTPException(status_code=400, detail=f"Invalid URL for {k}")
        if k == 'mediaNote' and v and len(v) > 1000:
            raise HTTPException(status_code=400, detail='mediaNote too long')

@router.get('/events/{event_id}')
async def get_job(event_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_doc = _job_ref(db, org_id, event_id).get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Post-prod job not found')
    data = job_doc.to_dict()
    return data

@router.post('/events/{event_id}/{stream}/assign')
async def assign_stream(event_id: str, stream: StreamType, req: AssignIn, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_ref = _job_ref(db, org_id, event_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not initialized')
    job = job_doc.to_dict()
    stream_state = job.get(stream, {})
    if stream_state.get('state') and not stream_state.get('state').endswith('ASSIGNED'):
        # allow reassignment via reassign endpoint
        pass
    leads = [e for e in req.editors if e.role == 'LEAD']
    if len(leads) != 1:
        raise HTTPException(status_code=400, detail='Exactly one LEAD required')
    job_ref.update({
        f'{stream}': {
            'state': ASSIGNED_MAP[stream],
            'editors': [e.dict() for e in req.editors],
            'draftDue': req.draft_due.isoformat(),
            'finalDue': req.final_due.isoformat(),
            'version': 0
        },
        'status': 'IN_PROGRESS',
        'updatedAt': datetime.utcnow()
    })
    _activity_ref(db, org_id, event_id).document().set({
        'at': datetime.utcnow(), 'actorUid': current_user.get('uid'), 'kind': 'ASSIGN', 'stream': stream, 'summary': f"Assigned {stream} stream"
    })
    return {'ok': True}

@router.post('/events/{event_id}/{stream}/submit')
async def submit_version(event_id: str, stream: StreamType, req: SubmitIn, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_ref = _job_ref(db, org_id, event_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not initialized')
    job = job_doc.to_dict()
    stream_state = job.get(stream) or {}
    editors = stream_state.get('editors') or []
    lead = next((e for e in editors if e.get('role') == 'LEAD'), None)
    if not lead or lead.get('uid') != current_user.get('uid'):
        raise HTTPException(status_code=403, detail='Only LEAD can submit')
    expected_version = (stream_state.get('version') or 0) + 1
    if req.version != expected_version:
        raise HTTPException(status_code=400, detail='Version sequence error')
    _validate_urls(req.deliverables)
    # Basic deliverable expectation checks
    if stream == 'photo' and not any(k in req.deliverables for k in URL_FIELDS_PHOTO.union({'mediaNote'})):
        raise HTTPException(status_code=400, detail='No photo deliverables provided')
    if stream == 'video' and not any(k in req.deliverables for k in URL_FIELDS_VIDEO.union({'mediaNote'})):
        raise HTTPException(status_code=400, detail='No video deliverables provided')

    version_ref = job_ref.collection('streams').document(stream).collection('versions').document(str(req.version))
    now = datetime.utcnow()
    version_ref.set({
        'stream': stream,
        'version': req.version,
        'submittedBy': current_user.get('uid'),
        'submittedAt': now,
        'type': req.kind,
        'whatChanged': req.what_changed,
        'deliverables': req.deliverables
    })
    job_ref.update({
        f'{stream}.version': req.version,
        f'{stream}.state': REVIEW_MAP[stream],
        f'{stream}.lastSubmission': {'version': req.version, 'at': now.isoformat(), 'whatChanged': req.what_changed},
        'updatedAt': now
    })
    _activity_ref(db, org_id, event_id).document().set({
        'at': now, 'actorUid': current_user.get('uid'), 'kind': 'SUBMIT', 'stream': stream, 'version': req.version, 'summary': req.what_changed[:120]
    })
    return {'ok': True, 'version': req.version}

@router.post('/events/{event_id}/{stream}/review')
async def review_version(event_id: str, stream: StreamType, req: ReviewIn, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_ref = _job_ref(db, org_id, event_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not initialized')
    job = job_doc.to_dict()
    stream_state = job.get(stream) or {}
    current_version = stream_state.get('version') or 0
    if current_version == 0:
        raise HTTPException(status_code=400, detail='Nothing submitted')
    now = datetime.utcnow()
    updates = {'updatedAt': now}
    if req.decision == 'approve':
        updates[f'{stream}.state'] = DONE_MAP[stream]
    else:
        next_due = req.next_due or (now + timedelta(hours=24))
        # keep history of change requests
        existing_changes = stream_state.get('changes', [])
        existing_changes.append({
            'at': now.isoformat(),
            'version': current_version,
            'changeList': req.change_list,
            'nextDue': next_due.isoformat()
        })
        updates[f'{stream}.changes'] = existing_changes
        updates[f'{stream}.state'] = IN_PROGRESS_MAP[stream]
        updates[f'{stream}.draftDue'] = next_due.isoformat()
    # Check overall completion
    other_stream = 'video' if stream == 'photo' else 'photo'
    other_state = (job.get(other_stream) or {}).get('state')
    this_state = updates.get(f'{stream}.state')
    if (this_state == DONE_MAP[stream] and (other_state == DONE_MAP[other_stream] or job.get('waived', {}).get(other_stream))):
        updates['status'] = 'EVENT_DONE'
    job_ref.update(updates)
    _activity_ref(db, org_id, event_id).document().set({
        'at': now,
        'actorUid': current_user.get('uid'),
        'kind': 'REVIEW',
        'stream': stream,
        'version': current_version,
        'summary': req.decision if req.decision == 'approve' else f"changes: {len(req.change_list or [])} items"
    })
    return {'ok': True, 'decision': req.decision}

@router.post('/events/{event_id}/{stream}/reassign')
async def reassign_stream(event_id: str, stream: StreamType, req: AssignIn, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_ref = _job_ref(db, org_id, event_id)
    if not job_ref.get().exists:
        raise HTTPException(status_code=404, detail='Job not initialized')
    leads = [e for e in req.editors if e.role == 'LEAD']
    if len(leads) != 1:
        raise HTTPException(status_code=400, detail='Exactly one LEAD required')
    job_ref.update({
        f'{stream}.editors': [e.dict() for e in req.editors],
        f'{stream}.draftDue': req.draft_due.isoformat(),
        f'{stream}.finalDue': req.final_due.isoformat(),
        'updatedAt': datetime.utcnow()
    })
    _activity_ref(db, org_id, event_id).document().set({
        'at': datetime.utcnow(), 'actorUid': current_user.get('uid'), 'kind': 'REASSIGN', 'stream': stream, 'summary': 'Reassigned editors'
    })
    return {'ok': True}

@router.post('/events/{event_id}/{stream}/waive')
async def waive_stream(event_id: str, stream: StreamType, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_ref = _job_ref(db, org_id, event_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not initialized')
    job = job_doc.to_dict()
    now = datetime.utcnow()
    waived = job.get('waived', {})
    waived[stream] = True
    updates = {'waived': waived, 'updatedAt': now}
    other = 'video' if stream == 'photo' else 'photo'
    other_done = ((job.get(other) or {}).get('state') == DONE_MAP[other]) or waived.get(other)
    if other_done:
        updates['status'] = 'EVENT_DONE'
    job_ref.update(updates)
    _activity_ref(db, org_id, event_id).document().set({
        'at': now, 'actorUid': current_user.get('uid'), 'kind': 'WAIVE', 'stream': stream, 'summary': 'Stream waived'
    })
    return {'ok': True, 'waived': stream}

@router.get('/events/{event_id}/activity')
async def list_activity(event_id: str, limit: int = Query(50, le=100), cursor: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get('orgId')
    db = firestore.client()
    q = _activity_ref(db, org_id, event_id).order_by('at', direction=firestore.Query.DESCENDING).limit(limit)
    if cursor:
        # simplistic cursor: timestamp iso
        try:
            cursor_dt = datetime.fromisoformat(cursor)
            q = q.start_after({'at': cursor_dt})
        except Exception:
            pass
    snaps = q.get()
    items = []
    next_cursor = None
    for s in snaps:
        d = s.to_dict()
        d['id'] = s.id
        items.append(d)
    if len(items) == limit:
        next_cursor = items[-1]['at'] if isinstance(items[-1]['at'], str) else items[-1]['at'].isoformat()
    return {'items': items, 'nextCursor': next_cursor}

@router.post('/events/{event_id}/activity/note')
async def add_note(event_id: str, req: NoteIn, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_ref = _job_ref(db, org_id, event_id)
    if not job_ref.get().exists:
        raise HTTPException(status_code=404, detail='Job not initialized')
    now = datetime.utcnow()
    _activity_ref(db, org_id, event_id).document().set({
        'at': now,
        'actorUid': current_user.get('uid'),
        'kind': 'NOTE',
        'stream': req.stream,
        'summary': req.summary
    })
    job_ref.update({'updatedAt': now})
    return {'ok': True}
