from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore

from ..dependencies import get_current_user
from .postprod import StreamType, _activity_ref, _job_ref


router = APIRouter(prefix="/postprod", tags=["Post Production"])


def _to_iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _normalize_status(state: Optional[str]) -> str:
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


def _collect_recent_notes(db, org_id: str, event_id: str, stream: StreamType) -> List[Dict[str, Any]]:
    try:
        activity_query = (
            _activity_ref(db, org_id, event_id)
            .order_by('at', direction=firestore.Query.DESCENDING)
            .limit(12)
        )
        notes: List[Dict[str, Any]] = []
        for snap in activity_query.stream():
            payload = snap.to_dict() or {}
            if payload.get('kind') != 'NOTE':
                continue
            if payload.get('stream') not in (None, stream):
                continue
            notes.append({
                'id': snap.id,
                'text': payload.get('summary'),
                'actorUid': payload.get('actorUid'),
                'stream': payload.get('stream'),
                'at': _to_iso(payload.get('at')),
            })
        notes.reverse()
        return notes
    except Exception:
        return []


def _build_complexity(job: Dict[str, Any]) -> Dict[str, Any]:
    ai_summary = job.get('aiSummary') or {}
    intake_summary = job.get('intakeSummary') or {}

    estimated_sizes = ai_summary.get('estimatedDataSizes') or intake_summary.get('estimatedDataSizes') or []
    if isinstance(estimated_sizes, (list, tuple)):
        gb_value: Optional[str] = ", ".join(str(v) for v in estimated_sizes if v is not None)
    else:
        gb_value = str(estimated_sizes) if estimated_sizes else None

    return {
        'estimatedHours': ai_summary.get('estimatedHours'),
        'gb': gb_value,
        'cams': intake_summary.get('totalDevices'),
    }


def _build_assignment(
    org_id: str,
    event_id: str,
    event_data: Dict[str, Any],
    job: Dict[str, Any],
    stream: StreamType,
    editor_entry: Dict[str, Any],
    db,
) -> Dict[str, Any]:
    stream_state: Dict[str, Any] = job.get(stream) or {}
    final_due = _to_iso(stream_state.get('finalDue'))
    draft_due = _to_iso(stream_state.get('draftDue'))
    due = final_due or draft_due

    notes = _collect_recent_notes(db, org_id, event_id, stream)

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

    # Fetch detailed storage information from assigned storage (if specified) or all approved submissions
    intake_summary = job.get('intakeSummary') or {}
    
    # Use assignedStorage from stream state if available, otherwise fall back to all approved submissions
    assigned_storage = stream_state.get('assignedStorage')
    if assigned_storage is not None:
        approved_submissions = assigned_storage
    else:
        approved_submissions = intake_summary.get('approvedSubmissions') or []
    
    # Enhance approved submissions with batch details including storage locations
    detailed_storage_data = []
    for submission in approved_submissions:
        submitter_id = submission.get('submitterId')
        batch_id = None
        
        # Try to get batch_id from event's dataIntake
        data_intake = event_data.get('dataIntake') or {}
        submissions_map = data_intake.get('submissions') or {}
        submission_entry = submissions_map.get(submitter_id) or {}
        batch_id = submission_entry.get('latestBatchId')
        
        storage_info = {
            'submitterId': submitter_id,
            'submitterName': submission.get('submitterName'),
            'approvedAt': _to_iso(submission.get('approvedAt')),
            'deviceCount': submission.get('deviceCount'),
            'estimatedDataSize': submission.get('estimatedDataSize'),
            'handoffReference': submission.get('handoffReference'),
            'notes': submission.get('notes'),
            'storageAssignment': submission.get('storageAssignment'),
            'devices': []
        }
        
        # Fetch full batch details if batch_id exists
        if batch_id:
            try:
                batch_ref = db.collection('organizations', org_id, 'dataBatches').document(batch_id)
                batch_doc = batch_ref.get()
                if batch_doc.exists:
                    batch_data = batch_doc.to_dict() or {}
                    storage_info['batchId'] = batch_id
                    storage_info['physicalHandoverDate'] = _to_iso(batch_data.get('physicalHandoverDate'))
                    storage_info['devices'] = batch_data.get('storageDevices') or []
                    
                    # Include storage location if available
                    if batch_data.get('storageLocation'):
                        storage_info['storageLocation'] = batch_data.get('storageLocation')
                    if batch_data.get('storageMediumId'):
                        storage_info['storageMediumId'] = batch_data.get('storageMediumId')
            except Exception as e:
                # If batch fetch fails, continue with basic info
                pass
        
        detailed_storage_data.append(storage_info)

    assignment = {
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
        'storageData': detailed_storage_data,  # NEW: Detailed storage information
        'complexity': _build_complexity(job),
        'deliverables': stream_state.get('deliverables') or [],
        'notes': notes,
        'lastSubmission': stream_state.get('lastSubmission'),
        'waived': (job.get('waived') or {}).get(stream),
        'raw': {
            'job': job,
            'event': event_data,
            'streamState': stream_state,
        },
    }

    return assignment


def _iter_assignments_for_user(org_id: str, user_uid: str) -> List[Dict[str, Any]]:
    db = firestore.client()
    events_ref = db.collection('organizations', org_id, 'events')

    assignments: List[Dict[str, Any]] = []
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
            assignments.append(_build_assignment(org_id, event_id, event_data, job_data, stream, editor_entry, db))

    return assignments


@router.get('/my-assignments')
async def my_assignments(current_user: dict = Depends(get_current_user)) -> List[Dict[str, Any]]:
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


@router.patch('/{job_id}/status')
async def update_job_status(job_id: str, request_data: dict, current_user: dict = Depends(get_current_user)) -> Dict[str, Any]:
    """Update the status of a post-production job/assignment."""
    uid = current_user.get('uid')
    org_id = current_user.get('orgId')

    if not uid:
        raise HTTPException(status_code=401, detail='Missing user')
    if not org_id:
        raise HTTPException(status_code=400, detail='Missing organization context')

    # Parse job_id format: "eventId:stream"
    parts = job_id.split(':')
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail='Invalid job ID format. Expected "eventId:stream"')
    
    event_id, stream = parts[0], parts[1]
    
    if stream not in ('photo', 'video'):
        raise HTTPException(status_code=400, detail='Invalid stream. Must be "photo" or "video"')
    
    to_status = request_data.get('to_status')
    reason = request_data.get('reason', '')
    deliverables = request_data.get('deliverables')  # NEW: Accept deliverable links
    
    if not to_status:
        raise HTTPException(status_code=400, detail='Missing to_status in request')

    # Map generic statuses to stream-specific states
    state_map = {
        'IN_PROGRESS': f"{stream.upper()}_IN_PROGRESS",
        'REVIEW': f"{stream.upper()}_REVIEW",
        'SUBMITTED': f"{stream.upper()}_SUBMITTED",
        'CHANGES': f"{stream.upper()}_CHANGES",
        'DONE': f"{stream.upper()}_DONE",
        'ASSIGNED': f"{stream.upper()}_ASSIGNED"
    }
    
    new_state = state_map.get(to_status.upper())
    if not new_state:
        raise HTTPException(status_code=400, detail=f'Invalid status transition: {to_status}')

    db = firestore.client()
    
    # Load the job
    job_ref = _job_ref(db, org_id, event_id)
    job_doc = job_ref.get()
    
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not found')
    
    job_data = job_doc.to_dict() or {}
    stream_state = job_data.get(stream) or {}
    editors = stream_state.get('editors') or []
    
    # Verify user is assigned to this stream
    editor_entry = next((e for e in editors if e.get('uid') == uid), None)
    if not editor_entry:
        raise HTTPException(status_code=403, detail='User not assigned to this stream')
    
    # Update the stream state
    now = datetime.utcnow()
    updates = {
        f'{stream}.state': new_state,
        'updatedAt': now
    }
    
    # If deliverables are provided (when submitting for review), store them
    if deliverables and to_status.upper() in ('REVIEW', 'SUBMITTED'):
        # Validate deliverable URLs
        if isinstance(deliverables, dict):
            for key, value in deliverables.items():
                if value and isinstance(value, str):
                    if not (value.startswith('http://') or value.startswith('https://')):
                        raise HTTPException(status_code=400, detail=f'Invalid URL for {key}. Must start with http:// or https://')
        
        updates[f'{stream}.deliverables'] = deliverables
        updates[f'{stream}.lastSubmissionAt'] = now
        updates[f'{stream}.lastSubmittedBy'] = uid
        updates[f'{stream}.lastSubmittedByName'] = editor_entry.get('displayName') or current_user.get('displayName') or current_user.get('email')
    
    job_ref.update(updates)
    
    # Record activity
    activity_kind = 'STATUS_UPDATE'
    if to_status.upper() == 'IN_PROGRESS':
        activity_kind = 'START'
    elif to_status.upper() in ('REVIEW', 'SUBMITTED'):
        activity_kind = 'SUBMIT'
    
    summary = reason or f"Status changed to {to_status}"
    if deliverables:
        deliverable_count = len([v for v in (deliverables.values() if isinstance(deliverables, dict) else []) if v])
        summary += f" with {deliverable_count} deliverable(s)"
    
    _activity_ref(db, org_id, event_id).document().set({
        'at': now,
        'actorUid': uid,
        'kind': activity_kind,
        'stream': stream,
        'summary': summary,
        'statusChange': {
            'from': stream_state.get('state'),
            'to': new_state
        },
        'deliverables': deliverables if deliverables else None
    })
    
    return {
        'ok': True,
        'status': _normalize_status(new_state),
        'message': f'Status updated to {to_status}',
        'deliverablesAccepted': bool(deliverables)
    }