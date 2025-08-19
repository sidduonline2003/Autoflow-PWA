from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import Optional, Dict, Any
import datetime

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/intake",
    tags=["Data Intake"],
)

# ---- Models ----
class CreateBatchRequest(BaseModel):
    captureUnit: str
    mediaType: str
    declaredNotes: Optional[str] = None
    proofPhotoFileId: Optional[str] = None

class ConfirmBatchRequest(BaseModel):
    storageMediumId: str
    storageLocation: Dict[str, str]  # { room, shelf, bin }

class RejectBatchRequest(BaseModel):
    reason: str

# ---- Helpers ----

def _now():
    return datetime.datetime.now(datetime.timezone.utc)


def _find_event_ref(db, org_id: str, event_id: str):
    """Locate the event document reference under any client in the organization."""
    clients_ref = db.collection('organizations', org_id, 'clients')
    for client_doc in clients_ref.stream():
        evt_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events').document(event_id)
        evt_doc = evt_ref.get()
        if evt_doc.exists:
            return evt_ref
    return None


def _recompute_intake_stats_and_gate(db, org_id: str, event_id: str) -> Dict[str, Any]:
    """Recompute intakeStats and advance gate if applicable. Returns updated intakeStats and event status."""
    event_ref = _find_event_ref(db, org_id, event_id)
    if not event_ref:
        raise HTTPException(status_code=404, detail="Event not found")
    event_doc = event_ref.get()
    event = event_doc.to_dict() or {}

    required_submitters = event.get('requiredSubmitters', []) or []
    required = len(required_submitters)

    batches = db.collection('organizations', org_id, 'dataBatches').where('eventId', '==', event_id).stream()
    submitted = 0
    confirmed = 0
    waived = 0
    by_user_status = {}
    for b in batches:
        d = b.to_dict() or {}
        status = d.get('status')
        suid = d.get('sourceUserId')
        if status in ('SUBMITTED', 'CONFIRMED', 'REJECTED', 'WAIVED'):
            submitted += 1
        if status == 'CONFIRMED':
            confirmed += 1
            if suid:
                by_user_status[suid] = 'CONFIRMED'
        if status == 'WAIVED':
            waived += 1
            if suid:
                by_user_status[suid] = 'WAIVED'

    intake_stats = {
        'required': required,
        'submitted': submitted,
        'confirmed': confirmed,
        'waived': waived,
    }

    # Determine intake gate and next status
    gate_passed = (confirmed + waived) >= required if required > 0 else True

    event_data_update = {
        'intakeStats': intake_stats,
        'updatedAt': _now(),
    }

    new_status = event.get('status')
    if gate_passed:
        if new_status in ('DATA_INTAKE_PENDING', 'DATA_INTAKE_IN_PROGRESS', 'SHOOT_COMPLETE'):
            new_status = 'DATA_INTAKE_COMPLETE'
    else:
        if submitted > 0:
            new_status = 'DATA_INTAKE_IN_PROGRESS'
        else:
            new_status = 'DATA_INTAKE_PENDING'

    event_data_update['status'] = new_status
    event_ref.update(event_data_update)

    return {'intakeStats': intake_stats, 'status': new_status}


def _ensure_event_shoot_complete(db, org_id: str, event_id: str):
    event_ref = _find_event_ref(db, org_id, event_id)
    if not event_ref:
        raise HTTPException(status_code=404, detail="Event not found")
    doc = event_ref.get()
    data = doc.to_dict() or {}
    # If event status is SHOOT_COMPLETE, move to DATA_INTAKE_PENDING on first intake action
    if data.get('status') == 'SHOOT_COMPLETE':
        event_ref.update({'status': 'DATA_INTAKE_PENDING', 'updatedAt': _now()})


def _assert_role(user: dict, allowed: set):
    role = user.get('role')
    if role not in allowed:
        raise HTTPException(status_code=403, detail="Forbidden")


def _assert_org(user: dict) -> str:
    org_id = user.get('orgId')
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing org context")
    return org_id


def _assert_event_membership(db, org_id: str, event_id: str, uid: str):
    # Ensure the user is assigned to event (as shooter/crew)
    evt_ref = _find_event_ref(db, org_id, event_id)
    if not evt_ref:
        raise HTTPException(status_code=404, detail="Event not found")
    data = evt_ref.get().to_dict() or {}
    assigned = data.get('assignedCrew', []) or []
    member_ids = [m.get('userId') if isinstance(m, dict) else m for m in assigned]
    if uid not in member_ids:
        raise HTTPException(status_code=403, detail="Not assigned to this event")

# ---- Endpoints ----

@router.get("/batches")
async def list_all_intake_batches(status: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """List all intake batches across the organization, optionally filtered by status (admin/data-manager only)."""
    _assert_role(current_user, { 'data-manager', 'admin' })
    org_id = _assert_org(current_user)
    db = firestore.client()

    col = db.collection('organizations', org_id, 'dataBatches')
    if status:
        col = col.where('status', '==', status)
    items = [{ **d.to_dict(), 'id': d.id } for d in col.stream()]
    return { 'items': items }


@router.post("/events/{event_id}/batches")
async def create_intake_batch(event_id: str, req: CreateBatchRequest, current_user: dict = Depends(get_current_user)):
    org_id = _assert_org(current_user)
    uid = current_user.get('uid')
    _assert_role(current_user, { 'crew', 'admin', 'data-manager' })  # Crew primarily

    db = firestore.client()
    # For crew, enforce membership
    if current_user.get('role') == 'crew':
        _assert_event_membership(db, org_id, event_id, uid)

    _ensure_event_shoot_complete(db, org_id, event_id)

    batch_ref = db.collection('organizations', org_id, 'dataBatches').document()
    batch = {
        'id': batch_ref.id,
        'orgId': org_id,
        'eventId': event_id,
        'sourceUserId': uid,
        'captureUnit': req.captureUnit,
        'mediaType': req.mediaType,
        'declaredBy': uid,
        'declaredAt': _now(),
        'declaredNotes': req.declaredNotes,
        'status': 'SUBMITTED',
        'photos': [req.proofPhotoFileId] if req.proofPhotoFileId else [],
        'audit': [{ 'by': uid, 'action': 'SUBMITTED', 'at': _now() }],
    }
    batch_ref.set(batch)

    # Update event intake status + stats
    stats = _recompute_intake_stats_and_gate(db, org_id, event_id)
    return { 'status': 'success', 'batchId': batch_ref.id, **stats }


@router.get("/events/{event_id}/batches")
async def list_intake_batches(event_id: str, current_user: dict = Depends(get_current_user)):
    org_id = _assert_org(current_user)
    db = firestore.client()
    uid = current_user.get('uid')
    role = current_user.get('role')

    col = db.collection('organizations', org_id, 'dataBatches').where('eventId', '==', event_id)
    if role == 'crew':
        col = col.where('sourceUserId', '==', uid)
    batches = [ { **d.to_dict(), 'id': d.id } for d in col.stream() ]
    return { 'items': batches }


@router.post("/batches/{batch_id}/confirm")
async def confirm_intake_batch(batch_id: str, req: ConfirmBatchRequest, current_user: dict = Depends(get_current_user)):
    _assert_role(current_user, { 'data-manager', 'admin' })
    org_id = _assert_org(current_user)
    uid = current_user.get('uid')
    db = firestore.client()

    batch_ref = db.collection('organizations', org_id, 'dataBatches').document(batch_id)
    doc = batch_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Batch not found")
    data = doc.to_dict() or {}
    if data.get('status') in ('CONFIRMED', 'REJECTED', 'WAIVED'):
        raise HTTPException(status_code=409, detail="Batch immutable in current status")

    updates = {
        'status': 'CONFIRMED',
        'confirmedBy': uid,
        'confirmedAt': _now(),
        'storageMediumId': req.storageMediumId,
        'storageLocation': req.storageLocation,
    }
    batch_ref.update(updates)
    batch_ref.update({ 'audit': firestore.ArrayUnion([{ 'by': uid, 'action': 'CONFIRMED', 'at': _now() }]) })

    event_id = data.get('eventId')
    stats = _recompute_intake_stats_and_gate(db, org_id, event_id)
    return { 'status': 'success', **stats }


@router.post("/batches/{batch_id}/reject")
async def reject_intake_batch(batch_id: str, req: RejectBatchRequest, current_user: dict = Depends(get_current_user)):
    _assert_role(current_user, { 'data-manager', 'admin' })
    org_id = _assert_org(current_user)
    uid = current_user.get('uid')
    db = firestore.client()

    batch_ref = db.collection('organizations', org_id, 'dataBatches').document(batch_id)
    doc = batch_ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Batch not found")
    data = doc.to_dict() or {}
    if data.get('status') in ('CONFIRMED', 'REJECTED', 'WAIVED'):
        raise HTTPException(status_code=409, detail="Batch immutable in current status")

    batch_ref.update({ 'status': 'REJECTED' })
    batch_ref.update({ 'audit': firestore.ArrayUnion([{ 'by': uid, 'action': f"REJECTED:{req.reason}", 'at': _now() }]) })

    event_id = data.get('eventId')
    stats = _recompute_intake_stats_and_gate(db, org_id, event_id)
    return { 'status': 'success', **stats }


@router.post("/events/{event_id}/waive/{user_id}")
async def waive_submitter(event_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    _assert_role(current_user, { 'admin' })
    org_id = _assert_org(current_user)
    uid = current_user.get('uid')
    db = firestore.client()

    # Try find an existing batch by this shooter to mark as WAIVED, else create a placeholder waiver record
    q = db.collection('organizations', org_id, 'dataBatches').where('eventId', '==', event_id).where('sourceUserId', '==', user_id).limit(1)
    results = list(q.stream())
    if results:
        b_ref = results[0].reference
    else:
        b_ref = db.collection('organizations', org_id, 'dataBatches').document()
        b_ref.set({
            'id': b_ref.id,
            'orgId': org_id,
            'eventId': event_id,
            'sourceUserId': user_id,
            'declaredBy': uid,
            'declaredAt': _now(),
            'status': 'SUBMITTED',
            'audit': [{ 'by': uid, 'action': 'PLACEHOLDER_FOR_WAIVE', 'at': _now() }],
        })

    b_ref.update({ 'status': 'WAIVED' })
    b_ref.update({ 'audit': firestore.ArrayUnion([{ 'by': uid, 'action': 'WAIVED', 'at': _now() }]) })

    stats = _recompute_intake_stats_and_gate(db, org_id, event_id)
    return { 'status': 'success', **stats }
