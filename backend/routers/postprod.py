from fastapi import APIRouter, Depends, HTTPException, Query  # patched
from firebase_admin import firestore
from pydantic import BaseModel, Field, model_validator
from typing import List, Literal, Optional, Dict, Any
from datetime import datetime, timedelta
import json
import logging
import os
import re
import requests
from ..dependencies import get_current_user
from ..services.postprod_svc import (
    find_event_ref,
    ensure_root_event_mirror,
    POST_PROD_STAGE_READY_FOR_JOB,
    POST_PROD_STAGE_JOB_CREATED,
    POST_PROD_STAGE_DATA_COLLECTION,
    ensure_postprod_job_initialized,
    job_ref,
    activity_ref,
)
from ..services.postprod_sync_service import PostProdSyncService
import os
import json
import re
import requests

router = APIRouter(prefix="/events", tags=["Post Production"])



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


logger = logging.getLogger(__name__)

APPROVED_STATUS_MARKERS = {
    "APPROVED",
    "READY",
    "READY_FOR_POSTPROD",
    "READY_FOR_POST_PROD",
    "DATA_READY",
    "COMPLETED",
    "COMPLETE",
}


def _normalize_intake_status(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().upper()


def _is_submission_approved(status: Any) -> bool:
    normalized = _normalize_intake_status(status)
    if not normalized:
        return False
    if normalized in APPROVED_STATUS_MARKERS:
        return True
    return "APPROVED" in normalized or normalized.endswith("_READY")


def _compute_intake_summary(
    event_data: Optional[Dict[str, Any]],
    *,
    fallback: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    fallback = fallback or {}
    payload = event_data or {}
    data_intake = payload.get('dataIntake') or {}
    submissions_map = data_intake.get('submissions') or {}
    if not submissions_map:
        return fallback if fallback else None

    approved_submissions: List[Dict[str, Any]] = []
    total_devices = 0
    estimated_sizes: List[str] = []

    for submitter_id, submission in submissions_map.items():
        submission = submission or {}
        if not _is_submission_approved(submission.get('status')):
            continue

        device_count = submission.get('deviceCount')
        try:
            if device_count is not None:
                total_devices += int(device_count)
        except (TypeError, ValueError):
            pass

        est_size = submission.get('estimatedDataSize') or submission.get('estimatedDataSizes')
        if est_size:
            if isinstance(est_size, (list, tuple)):
                estimated_sizes.extend(str(v) for v in est_size if v is not None)
            else:
                estimated_sizes.append(str(est_size))

        approved_submissions.append({
            'submitterId': submitter_id,
            'submitterName': submission.get('submittedByName')
            or submission.get('submittedBy')
            or submission.get('submitterName')
            or submitter_id,
            'approvedAt': submission.get('approvedAt') or submission.get('updatedAt'),
            'storageAssignment': submission.get('storageAssignment') or submission.get('storageAssignments'),
            'deviceCount': submission.get('deviceCount'),
            'estimatedDataSize': submission.get('estimatedDataSize') or submission.get('estimatedDataSizes'),
            'handoffReference': submission.get('handoffReference') or submission.get('handoffRef'),
            'notes': submission.get('notes') or submission.get('note'),
            'latestBatchId': submission.get('latestBatchId'),
        })

    if not approved_submissions:
        return fallback if fallback else None

    approval_summary = (
        (data_intake.get('approvalSummary') or {})
        or ((payload.get('postProduction') or {}).get('approvalSummary') or {})
    )

    recorded_at = (
        data_intake.get('updatedAt')
        or fallback.get('recordedAt')
        or datetime.utcnow()
    )

    summary = {
        'approvedCount': len(approved_submissions),
        'requiredCount': approval_summary.get('required') or fallback.get('requiredCount'),
        'totalDevices': total_devices or fallback.get('totalDevices') or 0,
        'estimatedDataSizes': estimated_sizes or fallback.get('estimatedDataSizes') or [],
        'approvedSubmissions': approved_submissions,
        'recordedAt': recorded_at,
    }

    return summary

class EditorRef(BaseModel):
    uid: str
    role: Role
    displayName: Optional[str] = None

class AssignIn(BaseModel):
    editors: List[EditorRef]
    draft_due: datetime
    final_due: datetime
    ai_suggest: bool = False
    assigned_storage: Optional[List[Dict[str, Any]]] = None

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
                raise ValueError('change_list is required and must not be empty when requesting changes')
        return self

class NoteIn(BaseModel):
    summary: str = Field(min_length=1, max_length=300)
    stream: Optional[StreamType] = None

# --- Helpers ---

def _compute_intake_summary(event_data: Dict[str, Any], fallback: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Compute intake summary from event's dataIntake.submissions"""
    if not event_data:
        return fallback
    
    data_intake = event_data.get('dataIntake', {})
    submissions_raw = data_intake.get('submissions', {})
    
    # Handle submissions as dict or list
    if isinstance(submissions_raw, dict):
        submissions = list(submissions_raw.values())
    elif isinstance(submissions_raw, list):
        submissions = submissions_raw
    else:
        return fallback
    
    # Filter approved submissions
    approved = []
    for sub in submissions:
        try:
            if isinstance(sub, dict):
                status = sub.get('status', '')
                if status in ['APPROVED', 'approved', 'READY', 'ready']:
                    approved.append(sub)
        except Exception:
            continue
    
    if not approved:
        return fallback
    
    # Build intakeSummary
    intake_summary = {
        'approvedCount': len(approved),
        'approvedSubmissions': approved,
        'totalDevices': sum(len(s.get('devices', [])) for s in approved if isinstance(s, dict)),
        'estimatedDataSizes': {}
    }
    return intake_summary

def _job_ref(db, org_id: str, event_id: str):
    return job_ref(db, org_id, event_id)

def _activity_ref(db, org_id: str, event_id: str):
    return activity_ref(db, org_id, event_id)

URL_FIELDS_PHOTO = {"previewSetUrl", "heroSetUrl", "shortlistUrl"}
URL_FIELDS_VIDEO = {"previewCutUrl", "changeLogUrl"}


def _validate_urls(deliverables: Dict[str, Any]):
    for k, v in deliverables.items():
        if k.endswith('Url') and v:
            if not isinstance(v, str) or not (v.startswith('http://') or v.startswith('https://')):
                raise HTTPException(status_code=400, detail=f"Invalid URL for {k}")
        if k == 'mediaNote' and v and len(v) > 1000:
            raise HTTPException(status_code=400, detail='mediaNote too long')

def _record_activity(db, org_id: str, event_id: str, actor_uid: Optional[str], kind: str, *, stream: Optional[str] = None, summary: Optional[str] = None, extra: Optional[Dict[str, Any]] = None):
    payload: Dict[str, Any] = {
        'at': datetime.utcnow(),
        'actorUid': actor_uid,
        'kind': kind
    }
    if stream:
        payload['stream'] = stream
    if summary:
        payload['summary'] = summary
    if extra:
        payload.update(extra)
    _activity_ref(db, org_id, event_id).document().set(payload)


def _compute_overall_status(job: Dict[str, Any], *, overrides: Optional[Dict[str, str]] = None, waived_override: Optional[Dict[str, bool]] = None) -> str:
    overrides = overrides or {}
    waived = dict(job.get('waived') or {})
    if waived_override:
        waived.update(waived_override)

    states: Dict[str, Optional[str]] = {}
    for stream in ('photo', 'video'):
        if stream in overrides:
            states[stream] = overrides[stream]
        else:
            states[stream] = (job.get(stream) or {}).get('state')

    if states:
        all_done = True
        for stream in ('photo', 'video'):
            state = states.get(stream)
            if waived.get(stream):
                continue
            if state != DONE_MAP[stream]:
                all_done = False
                break
        if all_done:
            return 'EVENT_DONE'

    if any(states.get(stream) == CHANGES_MAP[stream] for stream in ('photo', 'video')):
        return 'CHANGES_REQUESTED'
    if any(states.get(stream) == REVIEW_MAP[stream] for stream in ('photo', 'video')):
        return 'UNDER_REVIEW'
    if any(states.get(stream) in (ASSIGNED_MAP[stream], IN_PROGRESS_MAP[stream]) for stream in ('photo', 'video')):
        return 'IN_PROGRESS'

    return job.get('status') or 'PENDING'


def _require_admin(user: dict):
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')


def _load_job(db, org_id: str, event_id: str):
    job_ref = _job_ref(db, org_id, event_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not initialized')
    return job_ref, job_doc.to_dict() or {}

@router.get('/{event_id}/postprod/overview')
async def get_job(event_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get('orgId')
    if not org_id:
        raise HTTPException(status_code=400, detail='Missing organization')

    db = firestore.client()
    try:
        job_ref, job = _load_job(db, org_id, event_id)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise

        auto_result = await ensure_postprod_job_initialized(
            firestore,
            org_id,
            event_id,
            actor_uid=current_user.get('uid'),
            actor_display_name=current_user.get('displayName') or current_user.get('email'),
        )

        if not auto_result.get('created') and auto_result.get('reason') not in {'already-exists', 'stage-not-ready'}:
            raise

        job_ref = _job_ref(db, org_id, event_id)
        job_doc = job_ref.get()
        if not job_doc.exists:
            raise exc
        job = job_doc.to_dict() or {}

    job = job or {}
    job.setdefault('id', 'job')

    event_data = None
    event_ref = None
    root_event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    try:
        root_event_snapshot = root_event_ref.get()
        if root_event_snapshot.exists:
            event_ref = root_event_ref
            event_data = root_event_snapshot.to_dict() or {}
    except Exception as e:
        event_data = None

    resolved_client_id = (
        job.get('clientId')
        or job.get('client_id')
        or job.get('clientID')
    )
    resolved_client_name = (
        job.get('clientName')
        or job.get('client_name')
        or job.get('clientDisplayName')
    )

    lookup_client_id = None
    if not resolved_client_id or not resolved_client_name or event_data is None:
        try:
            found_ref, client_id = await find_event_ref(firestore, org_id, event_id)
        except Exception:
            found_ref, client_id = (None, None)

        if found_ref:
            event_ref = found_ref
            lookup_client_id = client_id
            if event_data is None:
                try:
                    event_snapshot = found_ref.get()
                    event_data = event_snapshot.to_dict() or {}
                except Exception:
                    event_data = None

    if not resolved_client_id:
        resolved_client_id = (
            lookup_client_id
            or (event_data or {}).get('clientId')
            or (event_data or {}).get('client_id')
            or (event_data or {}).get('clientID')
            or ((event_data or {}).get('client') or {}).get('id')
        )

    if not resolved_client_name:
        resolved_client_name = (
            (event_data or {}).get('clientName')
            or ((event_data or {}).get('client') or {}).get('name')
            or ((event_data or {}).get('client') or {}).get('displayName')
        )

    if resolved_client_id and not resolved_client_name:
        try:
            client_snapshot = db.collection('organizations', org_id, 'clients').document(str(resolved_client_id)).get()
            if client_snapshot.exists:
                client_payload = client_snapshot.to_dict() or {}
                resolved_client_name = (
                    client_payload.get('profile', {}).get('name')
                    or client_payload.get('name')
                    or client_payload.get('displayName')
                )
        except Exception:
            pass

    if resolved_client_id is not None:
        if not isinstance(resolved_client_id, str):
            resolved_client_id = str(resolved_client_id)
        resolved_client_id = resolved_client_id.strip()
        if not resolved_client_id:
            resolved_client_id = None

    if resolved_client_name is not None:
        if not isinstance(resolved_client_name, str):
            resolved_client_name = str(resolved_client_name)
        resolved_client_name = resolved_client_name.strip()
        if not resolved_client_name:
            resolved_client_name = None

    updates = {}
    if resolved_client_id and str(job.get('clientId')) != resolved_client_id:
        updates['clientId'] = resolved_client_id
        job['clientId'] = resolved_client_id
    if resolved_client_name and job.get('clientName') != resolved_client_name:
        updates['clientName'] = resolved_client_name
        job['clientName'] = resolved_client_name

    legacy_intake = job.get('intake_summary')
    if legacy_intake and not job.get('intakeSummary'):
        job['intakeSummary'] = legacy_intake
        intake_summary = legacy_intake
        updates['intakeSummary'] = legacy_intake
    else:
        intake_summary = job.get('intakeSummary') or {}
    
    if (not intake_summary.get('approvedSubmissions')) and event_data:
        computed_summary = _compute_intake_summary(event_data, fallback=intake_summary)
        if computed_summary and computed_summary.get('approvedSubmissions'):
            job['intakeSummary'] = computed_summary
            intake_summary = computed_summary
            updates['intakeSummary'] = computed_summary

    if updates:
        if 'intakeSummary' in updates:
            updates.setdefault('updatedAt', datetime.utcnow())
        try:
            job_ref.update(updates)
        except Exception as e:
            # Job may be read-only in rare cases; skip persistence but still return hydrated data
            pass

    if job.get('intakeSummary') and not job['intakeSummary'].get('approvedCount') and job['intakeSummary'].get('approvedSubmissions'):
        job['intakeSummary']['approvedCount'] = len(job['intakeSummary']['approvedSubmissions'])

    return job


@router.post('/{event_id}/postprod/{stream}/assign')
async def assign_stream(event_id: str, stream: StreamType, req: AssignIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    org_id = current_user.get('orgId')
    if not org_id:
        raise HTTPException(status_code=400, detail='Missing organization')
    db = firestore.client()
    job_ref, job = _load_job(db, org_id, event_id)
    now = datetime.utcnow()
    editors_data = [e.dict() for e in req.editors]
    version = (job.get(stream) or {}).get('version', 0) + 1
    status = _compute_overall_status(job, overrides={stream: ASSIGNED_MAP[stream]})

    # Include intake summary data for editors to access storage information
    intake_summary = job.get('intakeSummary') or job.get('intake_summary') or {}
    if intake_summary and not job.get('intakeSummary'):
        job['intakeSummary'] = intake_summary
    summary_update: Dict[str, Any] = {}
    if not intake_summary.get('approvedSubmissions'):
        event_payload = None
        try:
            event_snapshot = db.collection('organizations', org_id, 'events').document(event_id).get()
            if event_snapshot.exists:
                event_payload = event_snapshot.to_dict() or {}
        except Exception:
            event_payload = None
        computed_summary = _compute_intake_summary(event_payload, fallback=intake_summary)
        if computed_summary and computed_summary.get('approvedSubmissions'):
            intake_summary = computed_summary
            job['intakeSummary'] = computed_summary
            summary_update['intakeSummary'] = computed_summary

    # Use selected storage submissions if provided, otherwise use all approved submissions
    assigned_storage = req.assigned_storage if req.assigned_storage is not None else intake_summary.get('approvedSubmissions', [])
    
    updates = {
        f'{stream}.editors': editors_data,
        f'{stream}.draftDue': req.draft_due,
        f'{stream}.finalDue': req.final_due,
        f'{stream}.state': ASSIGNED_MAP[stream],
        f'{stream}.version': version,
        f'{stream}.assignedAt': now,
        f'{stream}.assignedBy': current_user.get('uid'),
        f'{stream}.assignedStorage': assigned_storage,  # Store only selected storage submissions
        'status': status,
        'updatedAt': now
    }

    if summary_update:
        updates.update(summary_update)

    job_ref.update(updates)
    storage_count = len(assigned_storage) if assigned_storage else 0
    _record_activity(db, org_id, event_id, current_user.get('uid'), 'ASSIGN', stream=stream,
                     summary=f"Assigned {len(editors_data)} editor(s) with {storage_count} storage submission(s)")

    try:
        sync = PostProdSyncService(org_id, event_id)
        sync.update_stream_state(
            stream=stream,
            state=ASSIGNED_MAP[stream],
            user_uid=current_user.get('uid'),
            user_name=current_user.get('displayName') or 'Admin',
            action_type='assign',
            metadata={
                'editorCount': len(editors_data),
                'storageCount': storage_count,
                'draftDue': req.draft_due.isoformat(),
                'finalDue': req.final_due.isoformat(),
            },
            version_override=version,
        )
    except Exception as exc:  # pragma: no cover - best effort sync
        logger.warning("PostProdSyncService assign failed: %s", exc, exc_info=True)

    return {'ok': True, 'status': status, 'version': version, 'assignedStorageCount': storage_count}


class ReassignIn(BaseModel):
    editors: List[EditorRef]
    draft_due: Optional[datetime] = None
    final_due: Optional[datetime] = None
    ai_suggest: bool = False
    assigned_storage: Optional[List[Dict[str, Any]]] = None

    @model_validator(mode='after')
    def one_lead(self):
        leads = [e for e in (self.editors or []) if e.role == 'LEAD']
        if len(leads) != 1:
            raise ValueError('Exactly one LEAD required')
        return self


@router.post('/{event_id}/postprod/{stream}/reassign')
async def reassign_stream(event_id: str, stream: StreamType, req: ReassignIn, current_user: dict = Depends(get_current_user)):
    _require_admin(current_user)
    org_id = current_user.get('orgId')
    if not org_id:
        raise HTTPException(status_code=400, detail='Missing organization')
    db = firestore.client()
    job_ref, job = _load_job(db, org_id, event_id)
    now = datetime.utcnow()
    stream_state = job.get(stream) or {}

    draft_due = req.draft_due or stream_state.get('draftDue')
    final_due = req.final_due or stream_state.get('finalDue')
    if not draft_due or not final_due:
        raise HTTPException(status_code=400, detail='draft_due and final_due are required')

    editors_data = [e.dict() for e in req.editors]
    version = (stream_state.get('version') or 0) + 1
    status = _compute_overall_status(job, overrides={stream: ASSIGNED_MAP[stream]})

    # Include intake summary data for editors
    intake_summary = job.get('intakeSummary') or job.get('intake_summary') or {}
    if intake_summary and not job.get('intakeSummary'):
        job['intakeSummary'] = intake_summary
    summary_update: Dict[str, Any] = {}
    if not intake_summary.get('approvedSubmissions'):
        event_payload = None
        try:
            event_snapshot = db.collection('organizations', org_id, 'events').document(event_id).get()
            if event_snapshot.exists:
                event_payload = event_snapshot.to_dict() or {}
        except Exception:
            event_payload = None
        computed_summary = _compute_intake_summary(event_payload, fallback=intake_summary)
        if computed_summary and computed_summary.get('approvedSubmissions'):
            intake_summary = computed_summary
            job['intakeSummary'] = computed_summary
            summary_update['intakeSummary'] = computed_summary

    # Use selected storage submissions if provided, otherwise keep existing or use all approved
    assigned_storage = req.assigned_storage if req.assigned_storage is not None else stream_state.get('assignedStorage', intake_summary.get('approvedSubmissions', []))

    updates = {
        f'{stream}.editors': editors_data,
        f'{stream}.draftDue': draft_due,
        f'{stream}.finalDue': final_due,
        f'{stream}.state': ASSIGNED_MAP[stream],
        f'{stream}.version': version,
        f'{stream}.reassignedAt': now,
        f'{stream}.reassignedBy': current_user.get('uid'),
        f'{stream}.assignedStorage': assigned_storage,  # Update storage assignments on reassign
        'status': status,
        'updatedAt': now
    }

    if summary_update:
        updates.update(summary_update)

    job_ref.update(updates)
    storage_count = len(assigned_storage) if assigned_storage else 0
    _record_activity(db, org_id, event_id, current_user.get('uid'), 'REASSIGN', stream=stream,
                     summary=f"Reassigned {len(editors_data)} editor(s) with {storage_count} storage submission(s)")

    try:
        sync = PostProdSyncService(org_id, event_id)
        reassign_meta = {
            'editorCount': len(editors_data),
            'storageCount': storage_count,
        }
        if draft_due:
            reassign_meta['draftDue'] = draft_due.isoformat()
        if final_due:
            reassign_meta['finalDue'] = final_due.isoformat()

        sync.update_stream_state(
            stream=stream,
            state=ASSIGNED_MAP[stream],
            user_uid=current_user.get('uid'),
            user_name=current_user.get('displayName') or 'Admin',
            action_type='reassign',
            metadata=reassign_meta,
            version_override=version,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("PostProdSyncService reassign failed: %s", exc, exc_info=True)

    return {'ok': True, 'status': status, 'version': version, 'assignedStorageCount': storage_count}


@router.post('/{event_id}/postprod/{stream}/submit')
async def submit_stream(event_id: str, stream: StreamType, req: SubmitIn, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get('orgId')
    if not org_id:
        raise HTTPException(status_code=400, detail='Missing organization')
    db = firestore.client()
    job_ref, job = _load_job(db, org_id, event_id)

    _validate_urls(req.deliverables)
    now = datetime.utcnow()
    new_state = REVIEW_MAP[stream] if req.kind == 'draft' else DONE_MAP[stream]
    status = _compute_overall_status(job, overrides={stream: new_state})

    updates = {
        f'{stream}.state': new_state,
        f'{stream}.version': req.version,
        f'{stream}.whatChanged': req.what_changed,
        f'{stream}.deliverables': req.deliverables,
        f'{stream}.lastSubmissionAt': now,
        f'{stream}.lastSubmissionKind': req.kind,
        'status': status,
        'updatedAt': now
    }

    job_ref.update(updates)
    summary = 'Submitted draft deliverables' if req.kind == 'draft' else 'Submitted final deliverables'
    _record_activity(db, org_id, event_id, current_user.get('uid'), 'SUBMIT', stream=stream, summary=summary)

    try:
        sync = PostProdSyncService(org_id, event_id)
        if isinstance(req.deliverables, dict):
            deliverable_count = sum(1 for v in req.deliverables.values() if v)
        elif isinstance(req.deliverables, list):
            deliverable_count = len(req.deliverables)
        else:
            deliverable_count = 1 if req.deliverables else 0
        sync.update_stream_state(
            stream=stream,
            state=new_state,
            user_uid=current_user.get('uid'),
            user_name=current_user.get('displayName') or 'Editor',
            action_type='submit',
            metadata={
                'deliverableCount': deliverable_count,
                'kind': req.kind,
            },
            version_override=req.version,
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("PostProdSyncService submit failed: %s", exc, exc_info=True)

    return {'ok': True, 'status': status}


@router.post('/{event_id}/postprod/{stream}/review')
async def review_stream(event_id: str, stream: StreamType, req: ReviewIn, current_user: dict = Depends(get_current_user)):
    """Admin endpoint to review submitted deliverables - approve or request changes"""
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    
    org_id = current_user.get('orgId')
    if not org_id:
        raise HTTPException(status_code=400, detail='Missing organization')
    
    db = firestore.client()
    job_ref, job = _load_job(db, org_id, event_id)
    
    stream_state = job.get(stream) or {}
    current_version = stream_state.get('version') or 0
    
    if current_version == 0:
        raise HTTPException(status_code=400, detail='Nothing submitted yet')
    
    now = datetime.utcnow()
    
    if req.decision == 'approve':
        # Approve the deliverables - mark as DONE
        new_state = DONE_MAP[stream]
        updates = {
            f'{stream}.state': new_state,
            'updatedAt': now
        }
        
        # Check if both streams are complete
        status = _compute_overall_status(job, overrides={stream: new_state})
        updates['status'] = status
        
        job_ref.update(updates)
        _record_activity(db, org_id, event_id, current_user.get('uid'), 'REVIEW', 
                        stream=stream, summary='Approved deliverables')
        
        # Sync to event document
        try:
            sync = PostProdSyncService(org_id, event_id)
            sync.update_stream_state(
                stream=stream,
                state=new_state,
                user_uid=current_user.get('uid'),
                user_name=current_user.get('displayName') or 'Admin',
                action_type='approve',
                metadata={'decision': 'approve'},
                version_override=current_version,
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("PostProdSyncService review/approve failed: %s", exc, exc_info=True)
        
        return {'ok': True, 'decision': 'approve', 'status': status}
    
    else:
        # Request changes - send back to editor
        next_due = req.next_due or (now + timedelta(hours=24))
        
        # Keep history of change requests
        existing_changes = stream_state.get('changes', [])
        existing_changes.append({
            'at': now.isoformat(),
            'version': current_version,
            'changeList': req.change_list or [],
            'nextDue': next_due.isoformat()
        })
        
        new_state = IN_PROGRESS_MAP[stream]
        status = _compute_overall_status(job, overrides={stream: new_state})
        
        updates = {
            f'{stream}.changes': existing_changes,
            f'{stream}.state': new_state,
            f'{stream}.draftDue': next_due.isoformat(),
            'status': status,
            'updatedAt': now
        }
        
        job_ref.update(updates)
        change_count = len(req.change_list or [])
        _record_activity(db, org_id, event_id, current_user.get('uid'), 'REVIEW', 
                        stream=stream, summary=f'Requested changes: {change_count} items')
        
        # Sync to event document
        try:
            sync = PostProdSyncService(org_id, event_id)
            sync.update_stream_state(
                stream=stream,
                state=new_state,
                user_uid=current_user.get('uid'),
                user_name=current_user.get('displayName') or 'Admin',
                action_type='request_changes',
                metadata={
                    'decision': 'changes',
                    'changeCount': change_count,
                    'nextDue': next_due.isoformat()
                },
                version_override=current_version,
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("PostProdSyncService review/changes failed: %s", exc, exc_info=True)
        
        return {'ok': True, 'decision': 'changes', 'changeCount': change_count, 'nextDue': next_due.isoformat(), 'status': status}


@router.get('/{event_id}/postprod/activity')
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

@router.post('/{event_id}/postprod/activity/note')
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

# test comment

@router.post('/{event_id}/postprod/init')
async def init_postprod(event_id: str, current_user: dict = Depends(get_current_user)):
    """Initialize post-production job for an event via manual admin action."""
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')

    org_id = current_user.get('orgId')
    if not org_id:
        raise HTTPException(status_code=400, detail='Missing organization')

    result = await ensure_postprod_job_initialized(
        firestore,
        org_id,
        event_id,
        actor_uid=current_user.get('uid'),
        actor_display_name=current_user.get('displayName') or current_user.get('email'),
    )

    if result.get('created'):
        approval_summary = result.get('approvalSummary') or {}
        return {
            'ok': True,
            'job': result.get('job'),
            'event': {
                'eventId': event_id,
                'stage': POST_PROD_STAGE_JOB_CREATED,
                'approvalSummary': approval_summary,
                'assignmentStatus': 'PENDING_ASSIGNMENT'
            }
        }

    reason = result.get('reason')
    detail = result.get('detail') or 'Unable to initialize post-production job'
    status_code = result.get('status_code') or 400

    if reason == 'already-exists':
        detail = 'Job already initialized'
    elif reason in ('event-not-found', 'event-not-available'):
        status_code = 404
    elif reason == 'missing-identifiers':
        status_code = 400

    raise HTTPException(status_code=status_code, detail=detail)


@router.post('/{event_id}/postprod/{stream}/waive')
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
    status = _compute_overall_status(job, waived_override={stream: True})
    updates = {'waived': waived, 'updatedAt': now, 'status': status}
    job_ref.update(updates)
    _activity_ref(db, org_id, event_id).document().set({
        'at': now,
        'actorUid': current_user.get('uid'),
        'kind': 'WAIVE',
        'stream': stream,
        'summary': 'Stream waived'
    })
    return {'ok': True, 'waived': stream, 'status': status}

@router.post('/{event_id}/postprod/{stream}/start')
async def start_stream(event_id: str, stream: StreamType, current_user: dict = Depends(get_current_user)):
    """Mark a stream as started."""
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_ref = _job_ref(db, org_id, event_id)
    job_doc = job_ref.get()
    
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not initialized')
    
    job = job_doc.to_dict()
    stream_state = job.get(stream) or {}
    editors = stream_state.get('editors') or []
    
    # Check if current user is the LEAD editor
    lead = next((e for e in editors if e.get('role') == 'LEAD'), None)
    if not lead or lead.get('uid') != current_user.get('uid'):
        raise HTTPException(status_code=403, detail='Only LEAD can start stream')
    
    # Update stream state to IN_PROGRESS
    now = datetime.utcnow()
    status = _compute_overall_status(job, overrides={stream: IN_PROGRESS_MAP[stream]})
    job_ref.update({
        f'{stream}.state': IN_PROGRESS_MAP[stream],
        'status': status,
        'updatedAt': now
    })

    _record_activity(db, org_id, event_id, current_user.get('uid'), 'START', stream=stream, summary=f"Started {stream} stream")
    
    return {'ok': True, 'status': status}

@router.patch('/{event_id}/postprod/due')
async def extend_due(event_id: str, req: dict, current_user: dict = Depends(get_current_user)):
    """Extend due dates for streams."""
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_ref = _job_ref(db, org_id, event_id)
    
    if not job_ref.get().exists:
        raise HTTPException(status_code=404, detail='Job not initialized')
    
    updates = {'updatedAt': datetime.utcnow()}
    
    # Update due dates if provided
    if 'draftDueAt' in req:
        updates['photo.draftDue'] = req['draftDueAt']
        updates['video.draftDue'] = req['draftDueAt']
    
    if 'finalDueAt' in req:
        updates['photo.finalDue'] = req['finalDueAt']
        updates['video.finalDue'] = req['finalDueAt']
    
    job_ref.update(updates)
    
    _activity_ref(db, org_id, event_id).document().set({
        'at': datetime.utcnow(),
        'actorUid': current_user.get('uid'),
        'kind': 'EXTEND_DUE',
        'summary': 'Extended due dates'
    })
    
    return {'ok': True}

# --- Availability & AI helpers ---
async def _get_event_and_team(org_id: str, event_id: str):
    db = firestore.client()
    event_ref, client_id = await find_event_ref(firestore, org_id, event_id)
    if not event_ref:
        raise HTTPException(status_code=404, detail='Event not found')

    event_doc = event_ref.get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail='Event not available')

    event_data = event_doc.to_dict() or {}

    if client_id:
        root_ref = db.collection('organizations', org_id, 'events').document(event_id)
        root_doc = root_ref.get()
        if not root_doc.exists:
            try:
                root_ref = await ensure_root_event_mirror(firestore, org_id, event_ref, client_id)
                root_doc = root_ref.get()
            except Exception:
                root_doc = None
        if root_doc and root_doc.exists:
            event_data = root_doc.to_dict() or event_data

    team_ref = db.collection('organizations', org_id, 'team')
    return event_data, team_ref

async def _list_available_editors(org_id: str, event_id: str, stream: StreamType):
    db = firestore.client()
    job_snapshot = _job_ref(db, org_id, event_id).get()
    job = job_snapshot.to_dict() if job_snapshot.exists else {}

    try:
        event_data, team_ref = await _get_event_and_team(org_id, event_id)
    except HTTPException as exc:
        if exc.status_code == 404 and job:
            ai_summary = job.get('aiSummary') or {}
            intake_summary = job.get('intakeSummary') or {}
            event_data = {
                'date': ai_summary.get('eventDate') or intake_summary.get('recordedAt')
            }
            team_ref = db.collection('organizations', org_id, 'team')
        else:
            raise

    event_date = (event_data or {}).get('date')
    busy_user_ids = set()
    if event_date:
        schedules_ref = db.collection('organizations', org_id, 'schedules')
        try:
            busy_query = schedules_ref.where(filter=firestore.FieldFilter('startDate', '<=', event_date)).where(filter=firestore.FieldFilter('endDate', '>=', event_date))
            for doc in busy_query.stream():
                data = doc.to_dict() or {}
                if data.get('eventId') != event_id:
                    busy_user_ids.add(data.get('userId'))
        except Exception:
            pass

    current_editors = ((job.get(stream) or {}).get('editors') or [])
    assigned_ids = {e.get('uid') for e in current_editors if e.get('uid')}

    available, unavailable = [], []
    for member in team_ref.stream():
        metadata = member.to_dict() or {}
        info = {
            'uid': member.id,
            'name': metadata.get('name'),
            'email': metadata.get('email'),
            'skills': metadata.get('skills', []),
            'availability': metadata.get('availability', True),
            'currentWorkload': metadata.get('currentWorkload', 0)
        }
        if not metadata.get('availability', True):
            info['reason'] = 'Marked unavailable'
            unavailable.append(info)
        elif member.id in busy_user_ids:
            info['reason'] = 'Busy on event date'
            unavailable.append(info)
        elif member.id in assigned_ids:
            info['reason'] = 'Already assigned to this stream'
            unavailable.append(info)
        else:
            available.append(info)

    return {
        'eventDate': event_date,
        'availableEditors': available,
        'unavailableEditors': unavailable,
        'currentEditors': current_editors
    }

def _openrouter_suggest(prompt_text: str):
    api_key = os.getenv('OPENROUTER_API_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail='AI service is not configured')

    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    body = {
        'model': 'google/gemma-3-4b-it:free',
        'messages': [
            {'role': 'user', 'content': prompt_text}
        ]
    }

    try:
        response = requests.post('https://openrouter.ai/api/v1/chat/completions', headers=headers, json=body, timeout=15)
        response.raise_for_status()
    except requests.RequestException as exc:
        detail = getattr(exc.response, 'text', str(exc)) if hasattr(exc, 'response') else str(exc)
        raise HTTPException(status_code=502, detail=f'AI provider error: {detail[:200]}') from exc

    payload = response.json()
    content = payload.get('choices', [{}])[0].get('message', {}).get('content', '')
    for pattern in (r'```json\s*\n([\s\S]+?)\n\s*```', r'```([\s\S]+?)```'):
        match = re.search(pattern, content)
        if match:
            content = match.group(1).strip()
            break
    try:
        return json.loads(content)
    except Exception:
        return {'reasoning': 'Failed to parse AI response', 'candidates': []}

@router.get('/{event_id}/postprod/available-editors')
async def available_editors(event_id: str, stream: StreamType = Query('photo'), current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    org_id = current_user.get('orgId')
    return await _list_available_editors(org_id, event_id, stream)

@router.get('/{event_id}/postprod/suggest-editors')
async def suggest_editors(event_id: str, stream: StreamType = Query('photo'), current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    org_id = current_user.get('orgId')
    availability = await _list_available_editors(org_id, event_id, stream)
    available = availability.get('availableEditors', [])

    prompt = f"""You are an expert post-production coordinator.\nEvent has a {stream} stream. Select a LEAD editor and up to two ASSIST editors from the AVAILABLE list.\nChoose based on skills match and low currentWorkload. Only pick from AVAILABLE.\n\nAVAILABLE:\n{json.dumps(available)[:4000]}\n\nRespond strictly as JSON: {{\"lead\": {{\"uid\":\"...\",\"displayName\":\"...\"}}, \"assistants\": [{{\"uid\":\"...\",\"displayName\":\"...\"}}]}}. If none suitable, return empty arrays."""

    try:
        ai = _openrouter_suggest(prompt)
    except HTTPException as exc:
        if exc.status_code == 500:
            raise HTTPException(status_code=404, detail='AI not available')
        raise

    lead = ai.get('lead') if isinstance(ai.get('lead'), dict) else None
    assistants = ai.get('assistants') if isinstance(ai.get('assistants'), list) else []

    return {
        'lead': lead,
        'assistants': assistants,
        'candidates': available[:10]
    }
