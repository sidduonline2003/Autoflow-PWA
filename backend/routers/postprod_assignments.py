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
        'intakeSummary': job.get('intakeSummary'),
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