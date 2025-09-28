from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple, Literal

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

from ..dependencies import get_current_user
from .postprod import (
    ASSIGNED_MAP,
    CHANGES_MAP,
    DONE_MAP,
    IN_PROGRESS_MAP,
    REVIEW_MAP,
    StreamType,
    _activity_ref,
    _job_ref,
)


router = APIRouter(prefix="/postprod", tags=["Post Production"])


class UpdateStatusRequest(BaseModel):
    to_status: Literal[
        "ASSIGNED",
        "IN_PROGRESS",
        "REVIEW",
        "REVISION",
        "CHANGES",
        "READY",
        "DONE",
    ]
    reason: Optional[str] = None


_STATUS_TO_STATE: Dict[str, Dict[str, str]] = {
    "ASSIGNED": ASSIGNED_MAP,
    "IN_PROGRESS": IN_PROGRESS_MAP,
    "REVIEW": REVIEW_MAP,
    "REVISION": CHANGES_MAP,
    "CHANGES": CHANGES_MAP,
    "READY": DONE_MAP,
    "DONE": DONE_MAP,
}

_COMPLETED_STATUSES = {"done", "delivered", "approved", "complete", "completed", "ready"}
_IN_PROGRESS_STATUSES = {"in_progress", "working", "editing", "processing", "revision", "changes"}


def _resolve_target_state(stream: StreamType, to_status: str) -> Optional[str]:
    mapping = _STATUS_TO_STATE.get(to_status.upper())
    if not mapping:
        return None
    return mapping.get(stream)


def _resolve_client_info(
    db,
    org_id: str,
    client_id: Optional[str],
    cache: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    if not client_id:
        return {}
    if client_id in cache:
        return cache[client_id]

    client_doc = (
        db.collection('organizations', org_id, 'clients').document(client_id).get()
    )
    if client_doc.exists:
        payload = client_doc.to_dict() or {}
        info = {
            'clientId': client_id,
            'clientName': payload.get('displayName')
            or payload.get('name')
            or payload.get('companyName')
            or payload.get('legalName'),
            'clientEmail': payload.get('primaryEmail') or payload.get('email'),
            'clientPhone': payload.get('phone') or payload.get('primaryPhone'),
        }
    else:
        info = {'clientId': client_id}

    cache[client_id] = info
    return info


def _normalize_deliverable_collection(candidate: Any) -> List[Dict[str, Any]]:
    if not candidate:
        return []
    normalized: List[Dict[str, Any]] = []
    if isinstance(candidate, dict):
        for key, value in candidate.items():
            if isinstance(value, dict):
                entry = dict(value)
            else:
                entry = {'value': value}
            entry.setdefault('id', key)
            normalized.append(entry)
        return normalized
    if isinstance(candidate, list):
        for item in candidate:
            if isinstance(item, dict):
                normalized.append(dict(item))
            elif item is not None:
                normalized.append({'value': item})
    return normalized


def _merge_deliverables(*sources: Any) -> List[Dict[str, Any]]:
    merged: Dict[str, Dict[str, Any]] = {}
    fallback: List[Dict[str, Any]] = []
    for source in sources:
        for item in _normalize_deliverable_collection(source):
            key = (
                item.get('id')
                or item.get('deliverableId')
                or item.get('name')
                or item.get('title')
            )
            if key:
                existing = merged.get(key, {})
                existing.update(item)
                existing.setdefault('id', key)
                merged[key] = existing
            else:
                fallback.append(item)
    merged_list = list(merged.values())
    merged_list.extend(fallback)
    return merged_list


def _summarize_deliverables(deliverables: List[Dict[str, Any]]) -> Dict[str, int]:
    total = len(deliverables)
    completed = 0
    in_progress = 0
    for item in deliverables:
        status = str(item.get('status') or '').strip().lower()
        if status in _COMPLETED_STATUSES:
            completed += 1
        elif status in _IN_PROGRESS_STATUSES:
            in_progress += 1
    pending = max(total - completed - in_progress, 0)
    return {
        'total': total,
        'completed': completed,
        'inProgress': in_progress,
        'pending': pending,
    }


def _parse_job_id(job_id: str) -> Tuple[str, StreamType]:
    parts = job_id.split(':', 1)
    if len(parts) != 2:
        raise HTTPException(status_code=400, detail='Invalid job identifier')
    event_id, stream_raw = parts[0], parts[1].lower()
    if stream_raw not in ('photo', 'video'):
        raise HTTPException(status_code=400, detail='Invalid stream in job identifier')
    return event_id, stream_raw  # type: ignore[return-value]


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
    client_cache: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    stream_state: Dict[str, Any] = job.get(stream) or {}
    final_due = _to_iso(stream_state.get('finalDue'))
    draft_due = _to_iso(stream_state.get('draftDue'))
    due = final_due or draft_due

    notes = _collect_recent_notes(db, org_id, event_id, stream)

    intake_summary = job.get('intakeSummary') or {}
    ai_summary = job.get('aiSummary') or {}

    event_name = (
        event_data.get('eventName')
        or event_data.get('name')
        or intake_summary.get('eventName')
        or ai_summary.get('eventName')
        or job.get('eventName')
        or event_id
    )

    event_type = (
        event_data.get('eventType')
        or event_data.get('type')
        or intake_summary.get('eventType')
        or ai_summary.get('eventType')
        or job.get('eventType')
    )

    event_venue = (
        event_data.get('venue')
        or intake_summary.get('venue')
        or (ai_summary.get('venue') if isinstance(ai_summary, dict) else None)
        or job.get('venue')
    )

    event_date = _to_iso(
        event_data.get('date')
        or intake_summary.get('eventDate')
        or ai_summary.get('eventDate')
    )
    event_time = (
        event_data.get('time')
        or intake_summary.get('eventTime')
        or ai_summary.get('eventTime')
    )

    event_client = event_data.get('client')
    if isinstance(event_client, dict):
        client_id = event_client.get('id') or event_client.get('clientId')
    else:
        client_id = None

    client_id = (
        event_data.get('clientId')
        or client_id
        or job.get('clientId')
        or intake_summary.get('clientId')
        or ai_summary.get('clientId')
    )

    client_info = _resolve_client_info(db, org_id, client_id, client_cache)

    client_name = event_data.get('clientName')
    if not client_name and isinstance(event_client, dict):
        client_name = (
            event_client.get('name')
            or event_client.get('displayName')
            or event_client.get('companyName')
        )
    if not client_name:
        client_name = (
            job.get('clientName')
            or intake_summary.get('clientName')
            or ai_summary.get('clientName')
            or client_info.get('clientName')
            or ''
        )

    stream_label = stream.upper()
    role_label = (editor_entry.get('role') or '').upper()

    deliverables = _merge_deliverables(
        stream_state.get('deliverables'),
        stream_state.get('pendingDeliverables'),
        stream_state.get('completedDeliverables'),
        (job.get('deliverables') or {}).get(stream)
        if isinstance(job.get('deliverables'), dict)
        else None,
        job.get(f'{stream}Deliverables'),
        (job.get('deliverablesByStream') or {}).get(stream),
    )

    deliverables_summary = _summarize_deliverables(deliverables)

    assignment = {
        'jobId': f"{event_id}:{stream}",
        'assignmentId': f"{event_id}:{stream}",
        'eventId': event_id,
        'eventName': event_name,
        'eventType': event_type,
        'eventDate': event_date,
        'eventTime': event_time,
        'venue': event_venue,
        'clientId': client_info.get('clientId') or client_id,
        'clientName': client_name,
        'clientEmail': client_info.get('clientEmail'),
        'clientPhone': client_info.get('clientPhone'),
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
        'aiSummary': ai_summary,
        'complexity': _build_complexity(job),
        'deliverables': deliverables,
        'deliverablesSummary': deliverables_summary,
        'submissionSummary': job.get('submissionSummary'),
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
    client_cache: Dict[str, Dict[str, Any]] = {}
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
            assignments.append(
                _build_assignment(
                    org_id,
                    event_id,
                    event_data,
                    job_data,
                    stream,
                    editor_entry,
                    db,
                    client_cache,
                )
            )

    return assignments


@router.patch('/{job_id}/status')
async def update_assignment_status(
    job_id: str,
    payload: UpdateStatusRequest,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    uid = current_user.get('uid')
    org_id = current_user.get('orgId')

    if not uid:
        raise HTTPException(status_code=401, detail='Missing user')
    if not org_id:
        raise HTTPException(status_code=400, detail='Missing organization context')

    event_id, stream = _parse_job_id(job_id)
    target_state = _resolve_target_state(stream, payload.to_status)
    if not target_state:
        raise HTTPException(status_code=400, detail='Unsupported status transition')

    db = firestore.client()
    job_ref = _job_ref(db, org_id, event_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not found')

    job_data = job_doc.to_dict() or {}
    stream_state = job_data.get(stream) or {}
    editors = stream_state.get('editors') or []
    editor_entry = next((e for e in editors if e.get('uid') == uid), None)
    if not editor_entry:
        raise HTTPException(status_code=403, detail='You are not assigned to this job')

    current_state = stream_state.get('state')
    now = datetime.utcnow()

    updates: Dict[str, Any] = {
        f'{stream}.state': target_state,
        f'{stream}.status': payload.to_status.upper(),
        'updatedAt': now,
    }
    job_ref.update(updates)

    activity_payload: Dict[str, Any] = {
        'at': now,
        'actorUid': uid,
        'kind': 'STATUS_CHANGE',
        'stream': stream,
        'summary': payload.reason or f'{stream.upper()} moved to {payload.to_status.upper()}',
        'details': {
            'fromState': current_state,
            'toState': target_state,
            'toStatus': payload.to_status.upper(),
        },
    }
    if payload.reason:
        activity_payload['reason'] = payload.reason
    _activity_ref(db, org_id, event_id).document().set(activity_payload)

    refreshed_doc = job_ref.get()
    refreshed_job = refreshed_doc.to_dict() or {}
    refreshed_stream_state = refreshed_job.get(stream) or {}
    refreshed_editors = refreshed_stream_state.get('editors') or []
    refreshed_editor = next((e for e in refreshed_editors if e.get('uid') == uid), editor_entry)

    event_doc = db.collection('organizations', org_id, 'events').document(event_id).get()
    event_data = event_doc.to_dict() if event_doc.exists else {}

    assignment = _build_assignment(
        org_id,
        event_id,
        event_data or {},
        refreshed_job,
        stream,
        refreshed_editor,
        db,
        {},
    )

    return {'ok': True, 'assignment': assignment}


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