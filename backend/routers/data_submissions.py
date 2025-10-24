from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Set
import datetime
import uuid

from backend.dependencies import get_current_user
from backend.services.postprod_svc import (
    POST_PROD_STAGE_DATA_COLLECTION,
    POST_PROD_STAGE_READY_FOR_JOB,
    POST_PROD_STAGE_JOB_CREATED
)


def _notify_postprod_ready(db, org_id: str, event_id: str, event_name: str, client_name: str, ready_at: datetime.datetime):
    """Create an admin notification indicating event is ready for manual post-production start."""
    try:
        notification = {
            'type': 'POST_PROD_READY',
            'eventId': event_id,
            'eventName': event_name or 'Untitled Event',
            'clientName': client_name or 'Unknown Client',
            'message': f"All data for {event_name or 'event'} is approved and ready for post-production.",
            'timestamp': ready_at,
            'priority': 'HIGH',
            'read': False
        }
        db.collection('organizations', org_id, 'notifications').add(notification)
    except Exception as exc:  # pragma: no cover - notification failures shouldn't block approvals
        print(f"Warning: failed to create post-production notification for {event_id}: {exc}")


router = APIRouter(
    prefix="/data-submissions",
    tags=["Data Management"],
)

# ---------- Helpers for event lookup across clients (doc reference) ----------
def _find_event_ref(db, org_id: str, event_id: str):
    """
    Return (event_ref, client_id, event_snap) by scanning clients for events/{event_id}.
    Avoids collection_group + __name__ pitfalls.
    """
    root_ref = db.collection('organizations', org_id, 'events').document(event_id)
    root_snap = root_ref.get()
    if root_snap.exists:
        root_data = root_snap.to_dict() or {}
        client_id = root_data.get('clientId')
        return root_ref, client_id, root_snap

    clients_ref = db.collection('organizations', org_id, 'clients')
    for client_doc in clients_ref.stream():
        ev_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events').document(event_id)
        ev_snap = ev_ref.get()
        if ev_snap.exists:
            return ev_ref, client_doc.id, ev_snap
    return None, None, None


def _normalize_status(status: Any) -> str:
    if status is None:
        return ""
    return str(status).strip().upper()


def _safe_datetime(value: Any) -> datetime.datetime:
    if isinstance(value, datetime.datetime):
        return value
    if isinstance(value, dict):
        seconds = value.get('seconds')
        if seconds is not None:
            nanos = value.get('nanoseconds') or value.get('nanos') or 0
            return datetime.datetime.fromtimestamp(seconds + nanos / 1e9, tz=datetime.timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.datetime.fromtimestamp(value, tz=datetime.timezone.utc)
    if isinstance(value, str):
        iso_value = value.replace('Z', '+00:00') if value.endswith('Z') else value
        try:
            return datetime.datetime.fromisoformat(iso_value)
        except ValueError:
            return datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
    return datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)


def _enrich_batch_with_event(db, org_id: str, batch_data: Dict[str, Any]) -> None:
    event_id = batch_data.get('eventId')
    if event_id and (not batch_data.get('eventName') or not batch_data.get('clientName')):
        event_ref, client_id, event_snap = _find_event_ref(db, org_id, event_id)
        if event_snap and event_snap.exists:
            event_info = event_snap.to_dict() or {}
            batch_data.setdefault('eventName', event_info.get('name', 'Unknown Event'))
            batch_data.setdefault('clientName', event_info.get('clientName') or event_info.get('client', 'Unknown Client'))
            if client_id:
                batch_data.setdefault('clientId', client_id)
    if batch_data.get('totalDevices') in (None, ''):
        batch_data['totalDevices'] = len(batch_data.get('storageDevices') or [])
    normalized_status = _normalize_status(batch_data.get('status'))
    if normalized_status:
        batch_data['status'] = normalized_status


def _crew_name_map(assigned_crew: List[Dict[str, Any]]) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    for member in assigned_crew or []:
        uid = member.get('userId')
        if not uid:
            continue
        mapping[uid] = (
            member.get('name')
            or member.get('displayName')
            or member.get('email')
            or uid
        )
    return mapping


def _get_required_contributors(event_data: Dict[str, Any]) -> int:
    stats = event_data.get('intakeStats') or {}
    required = stats.get('requiredBatches')
    try:
        required_int = int(required) if required is not None else 0
    except (TypeError, ValueError):
        required_int = 0
    assigned_count = len(event_data.get('assignedCrew') or [])
    submissions = (event_data.get('dataIntake') or {}).get('submissions') or {}
    fallback = max(assigned_count, len(submissions))
    if fallback <= 0:
        fallback = 1
    if not required_int or required_int < fallback:
        required_int = fallback
    return required_int


def _calculate_submission_progress(
    assigned_crew: List[Dict[str, Any]],
    submissions: Dict[str, Any],
    required_total: int
) -> Dict[str, Any]:
    submissions = submissions or {}
    approved_ids = []
    pending_ids = []

    for uid, record in submissions.items():
        status = _normalize_status((record or {}).get('status'))
        if status == 'APPROVED':
            approved_ids.append(uid)
        else:
            pending_ids.append(uid)

    assigned_ids = [member.get('userId') for member in assigned_crew or [] if member.get('userId')]
    for uid in assigned_ids:
        if uid not in submissions and uid not in pending_ids and uid not in approved_ids:
            pending_ids.append(uid)

    # Deduplicate while preserving order
    def _dedupe(values: List[str]) -> List[str]:
        seen: Dict[str, bool] = {}
        ordered: List[str] = []
        for value in values:
            if not value:
                continue
            if value in seen:
                continue
            seen[value] = True
            ordered.append(value)
        return ordered

    approved_ids = _dedupe(approved_ids)
    pending_ids = _dedupe(pending_ids)

    name_map = _crew_name_map(assigned_crew)
    approved_names = [name_map.get(uid, uid) for uid in approved_ids]
    pending_names = [name_map.get(uid, uid) for uid in pending_ids]

    return {
        "approved": len(approved_ids),
        "required": max(required_total, 0),
        "approvedIds": approved_ids,
        "approvedNames": approved_names,
        "pendingIds": pending_ids,
        "pendingNames": pending_names,
        "remaining": max(required_total - len(approved_ids), 0)
    }

# Legacy Models (for backward compatibility)
class DataSubmission(BaseModel):
    eventId: str
    clientId: str
    storageType: str
    deviceInfo: str
    notes: str
    dataSize: Optional[str] = None
    fileCount: Optional[int] = None

class DataProcessing(BaseModel):
    storageLocation: str
    diskName: str
    archiveLocation: str
    processingNotes: str

# New Comprehensive Models
class StorageDevice(BaseModel):
    type: str  # CF, SD, HDD, SSD, Other
    brand: str
    model: str
    capacity: str
    serialNumber: Optional[str] = None
    notes: Optional[str] = ""

class DataBatchSubmission(BaseModel):
    eventId: str
    physicalHandoverDate: str
    storageDevices: List[StorageDevice]
    notes: Optional[str] = ""
    estimatedDataSize: Optional[str] = ""
    handoffReference: Optional[str] = ""

class StorageLocation(BaseModel):
    room: str
    cabinet: Optional[str] = ""
    shelf: str
    bin: str
    additionalNotes: Optional[str] = ""

class BatchApproval(BaseModel):
    batchId: str
    action: str  # "approve" or "reject"
    storageMediumId: Optional[str] = None
    storageLocation: Optional[StorageLocation] = None
    notes: Optional[str] = ""
    rejectionReason: Optional[str] = ""

class StorageMediumCreate(BaseModel):
    type: str
    capacity: str
    room: str
    shelf: str
    bin: str

# Teammate (Shooter) endpoints
@router.post("/batches")
async def create_submission_batch(
    batch: DataBatchSubmission,
    current_user: dict = Depends(get_current_user)
):
    """Teammate creates a data submission batch after checkout"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")

    # Verify user is assigned to the event
    db = firestore.client()

    # Locate the event document (avoid collection_group + __name__)
    event_ref, client_id, event_doc = _find_event_ref(db, org_id, batch.eventId)
    if event_ref is None:
        raise HTTPException(status_code=404, detail="Event not found")
    event_data = event_doc.to_dict()

    # Check if user is assigned to this event
    assigned_crew = event_data.get('assignedCrew', [])
    user_assigned = any(crew.get('userId') == user_id for crew in assigned_crew)
    if not user_assigned:
        raise HTTPException(status_code=403, detail="You are not assigned to this event")

    user_name = get_team_member_name(db, org_id, user_id)
    total_devices = len(batch.storageDevices or [])
    storage_devices_dicts = [sd.dict() for sd in batch.storageDevices]

    now_ts = datetime.datetime.now(datetime.timezone.utc)

    batch_data = {
        "id": None,  # set after we create the doc
        "eventId": batch.eventId,
        "eventName": event_data.get("name", "Unknown Event"),
        "clientId": client_id,
        "clientName": event_data.get("clientName", "Unknown Client"),
        "submittedBy": user_id,
        "submittedByName": user_name,
        "physicalHandoverDate": batch.physicalHandoverDate,
        "storageDevices": storage_devices_dicts,
        "notes": batch.notes,
        "totalDevices": total_devices,
        "estimatedDataSize": batch.estimatedDataSize,
        "handoffReference": batch.handoffReference,
        "status": "PENDING",
        "createdAt": now_ts,
        "updatedAt": now_ts,
        "approvedBy": None,
        "approvedAt": None,
        "confirmedBy": None,
        "confirmedAt": None,
        "storageMediumId": None,
        "storageLocation": {},
        "dmNotes": "",
        "statusTimeline": [
            {
                "status": "PENDING",
                "timestamp": now_ts,
                "actorId": user_id,
                "actorRole": "team_member"
            }
        ]
    }

    batch_ref = db.collection('organizations', org_id, 'dataBatches').document()
    batch_data["id"] = batch_ref.id
    batch_ref.set(batch_data)

    existing_data_intake = event_data.get('dataIntake') or {}
    existing_submissions = existing_data_intake.get('submissions') or {}
    updated_submissions = dict(existing_submissions)

    submission_entry = {
        "status": "PENDING",
        "latestBatchId": batch_ref.id,
        "submittedAt": now_ts,
        "submittedBy": user_id,
        "submittedByName": user_name,
        "notes": batch.notes,
        "deviceCount": total_devices,
        "estimatedDataSize": batch.estimatedDataSize,
        "handoffReference": batch.handoffReference
    }
    updated_submissions[user_id] = submission_entry

    assigned_crew = event_data.get('assignedCrew') or []
    required_contributors = _get_required_contributors(event_data)
    required_contributors = max(required_contributors, len(assigned_crew) or 0, len(updated_submissions) or 0)
    progress_snapshot = _calculate_submission_progress(assigned_crew, updated_submissions, required_contributors)

    event_update = {
        "intakeStats.batchesReceived": firestore.Increment(1),
        "intakeStats.lastBatchDate": batch.physicalHandoverDate,
        "intakeStats.pendingApproval": firestore.Increment(1),
        "intakeStats.requiredBatches": progress_snapshot["required"],
        "dataIntake.status": "PENDING",
        "dataIntake.lastSubmittedBy": user_id,
        "dataIntake.lastSubmittedAt": now_ts,
        "dataIntake.lastSubmittedDevices": storage_devices_dicts,
        "dataIntake.history": firestore.ArrayUnion([
            {
                "action": "SUBMITTED",
                "timestamp": now_ts,
                "actorId": user_id,
                "actorRole": "team_member",
                "batchId": batch_ref.id,
                "deviceCount": total_devices,
                "estimatedDataSize": batch.estimatedDataSize,
                "notes": batch.notes
            }
        ]),
        "dataIntake.handoffReference": batch.handoffReference,
        "dataIntake.submissions": updated_submissions,
        "dataIntake.approvedCount": progress_snapshot["approved"],
        "dataIntake.totalRequired": progress_snapshot["required"],
        "dataIntake.pendingContributorIds": progress_snapshot["pendingIds"],
        "dataIntake.approvedContributorIds": progress_snapshot["approvedIds"],
        "updatedAt": now_ts,
        "deliverableStatus": "PENDING_REVIEW",
        "deliverableSubmitted": False,
        "deliverablePendingBatchId": batch_ref.id,
        "deliverableBatchId": firestore.DELETE_FIELD,
        "deliverableSubmission": {
            "lastSubmittedBatchId": batch_ref.id,
            "lastSubmittedAt": now_ts,
            "lastSubmittedBy": user_id,
            "lastSubmittedByName": user_name,
            "notes": batch.notes,
            "estimatedDataSize": batch.estimatedDataSize,
            "deviceCount": total_devices,
            "physicalHandoverDate": batch.physicalHandoverDate,
            "storageDevices": storage_devices_dicts,
            "handoffReference": batch.handoffReference
        },
        "deliverableApprovedAt": firestore.DELETE_FIELD,
        "deliverableApprovedBy": firestore.DELETE_FIELD,
        "deliverableRejectedAt": firestore.DELETE_FIELD,
        "deliverableRejectedBy": firestore.DELETE_FIELD,
        "deliverableRejectedReason": firestore.DELETE_FIELD,
        "postProduction.stage": POST_PROD_STAGE_DATA_COLLECTION,
        "postProduction.approvalSummary": progress_snapshot,
        "postProduction.readyAt": firestore.DELETE_FIELD
    }

    event_ref.update(event_update)

    return {
        "status": "success",
        "batchId": batch_ref.id,
        "message": "Data batch submitted successfully"
    }

@router.get("/batches/my-submissions")
async def get_my_submissions(
    current_user: dict = Depends(get_current_user)
):
    """Get all data batches submitted by the current user"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = firestore.client()
    
    try:
        # Simplified query to avoid index requirements
        batches_query = db.collection('organizations', org_id, 'dataBatches').where(
            filter=firestore.FieldFilter('submittedBy', '==', user_id)
        ).limit(50)
        
        batches = []
        for doc in batches_query.stream():
            batch_data = doc.to_dict()
            batches.append(batch_data)
        
        # Sort by createdAt in Python instead of Firestore
        batches.sort(key=lambda x: x.get('createdAt', datetime.datetime.min), reverse=True)
        
        return {"batches": batches}
    
    except Exception as e:
        return {"batches": [], "error": f"Could not fetch submissions: {str(e)}"}

@router.get("/events/{event_id}/batches")
async def get_event_batches(
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all data batches for a specific event"""
    org_id = current_user.get("orgId")
    
    db = firestore.client()
    
    try:
        # Simplified query to avoid index requirements
        batches_query = db.collection('organizations', org_id, 'dataBatches').where(
            filter=firestore.FieldFilter('eventId', '==', event_id)
        ).limit(50)
        
        batches = []
        for doc in batches_query.stream():
            batch_data = doc.to_dict()
            batches.append(batch_data)
        
        # Sort by createdAt in Python instead of Firestore
        batches.sort(key=lambda x: x.get('createdAt', datetime.datetime.min), reverse=True)
        
        return {"batches": batches}
    
    except Exception as e:
        return {"batches": [], "error": f"Could not fetch event batches: {str(e)}"}

# Data Manager endpoints
@router.get("/dm/pending-approvals")
async def get_pending_approvals(
    current_user: dict = Depends(get_current_user)
):
    """DM gets pending data submissions for approval"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role")
    
    # Only data managers and admins can access
    if user_role not in ["data-manager", "admin"]:
        raise HTTPException(status_code=403, detail="Only data managers can access this endpoint")
    
    db = firestore.client()
    
    # Get pending batches - simplified to avoid index requirements
    status_filters = [
        "PENDING",
        "SUBMITTED",
        "PENDING_REVIEW",
        "AWAITING_DM_REVIEW",
        "AWAITING_REVIEW",
        "pending",
        "submitted"
    ]

    pending_batches_map: Dict[str, Dict[str, Any]] = {}
    query_errors: List[str] = []

    for status_value in status_filters:
        try:
            status_query = db.collection('organizations', org_id, 'dataBatches').where(
                filter=firestore.FieldFilter('status', '==', status_value)
            ).limit(50)

            for doc in status_query.stream():
                batch_data = doc.to_dict() or {}
                batch_id = batch_data.get('id') or doc.id
                batch_data['id'] = batch_id
                _enrich_batch_with_event(db, org_id, batch_data)
                pending_batches_map[batch_id] = batch_data
        except Exception as query_error:  # pragma: no cover - Firestore runtime issues
            query_errors.append(str(query_error))

    pending_batches = list(pending_batches_map.values())
    pending_batches.sort(
        key=lambda batch: _safe_datetime(batch.get('createdAt') or batch.get('updatedAt')),
        reverse=True
    )

    response: Dict[str, Any] = {"pendingBatches": pending_batches}
    if query_errors:
        response["queryWarnings"] = query_errors
    return response

@router.post("/dm/approve-batch")
async def approve_batch(
    approval: BatchApproval,
    current_user: dict = Depends(get_current_user)
):
    """Data Manager approves or rejects a batch"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role")
    user_id = current_user.get("uid")
    
    if user_role not in ["data-manager", "admin"]:
        raise HTTPException(status_code=403, detail="Only data managers can approve batches")
    
    db = firestore.client()
    batch_ref = db.collection('organizations', org_id, 'dataBatches').document(approval.batchId)
    batch_doc = batch_ref.get()
    
    if not batch_doc.exists:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    batch_data = batch_doc.to_dict()
    
    if batch_data.get('status') not in ['PENDING', 'SUBMITTED']:
        raise HTTPException(status_code=400, detail="Batch is not in a state that can be approved/rejected")
    
    # Update batch based on action
    update_data = {
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    }
    
    if approval.action == "approve":
        if not approval.storageMediumId or not approval.storageLocation:
            raise HTTPException(status_code=400, detail="Storage metadata required for approval")

        storage_medium_ref = db.collection('organizations', org_id, 'storageMedia').document(approval.storageMediumId)
        storage_medium_doc = storage_medium_ref.get()

        if not storage_medium_doc.exists:
            raise HTTPException(status_code=404, detail="Selected storage medium not found")

        storage_medium_data = storage_medium_doc.to_dict()

        # Prevent assigning the same medium to multiple batches simultaneously unless reusing for this batch
        if storage_medium_data.get('status') == 'assigned' and storage_medium_data.get('assignedBatchId') not in (None, approval.batchId):
            raise HTTPException(status_code=400, detail="Storage medium already assigned to another batch")

        # Build storage assignment snapshot
        storage_location_payload = approval.storageLocation.dict() if approval.storageLocation else {}
        now_ts = datetime.datetime.now(datetime.timezone.utc)
        storage_assignment = {
            "storageMediumId": approval.storageMediumId,
            "storageMedium": {
                "id": approval.storageMediumId,
                "type": storage_medium_data.get('type'),
                "capacity": storage_medium_data.get('capacity'),
                "room": storage_medium_data.get('room'),
                "cabinet": storage_medium_data.get('cabinet'),
                "shelf": storage_medium_data.get('shelf'),
                "bin": storage_medium_data.get('bin'),
            },
            "location": storage_location_payload,
            "notes": approval.notes,
            "assignedAt": now_ts,
            "assignedBy": user_id,
        }

        update_data.update({
            "status": "CONFIRMED",
            "confirmedBy": user_id,
            "confirmedAt": now_ts,
            "storageMediumId": approval.storageMediumId,
            "storageLocation": storage_location_payload,
            "storageMediumSnapshot": storage_assignment["storageMedium"],
            "storageAssignment": storage_assignment,
            "dmNotes": approval.notes,
            "dmDecision": "APPROVED",
            "statusTimeline": firestore.ArrayUnion([
                {
                    "status": "CONFIRMED",
                    "timestamp": now_ts,
                    "actorId": user_id,
                    "actorRole": user_role,
                    "notes": approval.notes
                }
            ])
        })

        # Update event intake stats
        event_ref = db.collection('organizations', org_id, 'clients', batch_data['clientId'], 'events').document(batch_data['eventId'])
        event_snap = event_ref.get()
        if event_snap.exists:
            event_data = event_snap.to_dict()
            stats = event_data.get('intakeStats', {})
            pending_after = max(int(stats.get('pendingApproval', 0) or 0) - 1, 0)
            confirmed_after = int(stats.get('confirmedBatches', 0) or 0) + 1

            data_intake = event_data.get('dataIntake') or {}
            submissions = dict(data_intake.get('submissions') or {})
            submitter_id = batch_data.get('submittedBy')
            existing_submission = dict(submissions.get(submitter_id) or {})
            submissions[submitter_id] = {
                **existing_submission,
                "status": "APPROVED",
                "latestBatchId": approval.batchId,
                "submittedAt": existing_submission.get('submittedAt') or batch_data.get('createdAt') or now_ts,
                "submittedBy": existing_submission.get('submittedBy') or submitter_id,
                "submittedByName": existing_submission.get('submittedByName') or batch_data.get('submittedByName'),
                "deviceCount": existing_submission.get('deviceCount') or batch_data.get('totalDevices'),
                "estimatedDataSize": existing_submission.get('estimatedDataSize') or batch_data.get('estimatedDataSize'),
                "handoffReference": existing_submission.get('handoffReference') or batch_data.get('handoffReference'),
                "approvedAt": now_ts,
                "approvedBy": user_id,
                "approvedBatchId": approval.batchId,
                "storageAssignment": storage_assignment,
                "notes": approval.notes
            }

            assigned_crew = event_data.get('assignedCrew') or []
            temp_event_for_required = dict(event_data)
            temp_event_for_required.setdefault('dataIntake', {})['submissions'] = submissions
            required_contributors = _get_required_contributors(temp_event_for_required)
            required_contributors = max(required_contributors, len(assigned_crew) or 0, len(submissions) or 0)
            progress_snapshot = _calculate_submission_progress(assigned_crew, submissions, required_contributors)

            all_approved = progress_snapshot["approved"] >= progress_snapshot["required"] and progress_snapshot["required"] > 0
            deliverable_status = "APPROVED" if all_approved else "PENDING_REVIEW"
            deliverable_submitted = all_approved
            post_prod_stage = POST_PROD_STAGE_READY_FOR_JOB if all_approved else POST_PROD_STAGE_DATA_COLLECTION
            post_prod_data = event_data.get('postProduction') or {}
            ready_at_existing = post_prod_data.get('readyAt')
            ready_notified_value = post_prod_data.get('readyNotified')
            ready_at_value = ready_at_existing or (now_ts if all_approved else None)
            notify_admin = all_approved and not ready_notified_value

            event_update = {
                "intakeStats.pendingApproval": pending_after,
                "intakeStats.confirmedBatches": confirmed_after,
                "intakeStats.lastBatchDate": batch_data.get('physicalHandoverDate'),
                "intakeStats.requiredBatches": progress_snapshot["required"],
                "intakeStats.completedAt": now_ts if all_approved else (stats.get('completedAt') or firestore.DELETE_FIELD),
                "dataIntake.status": "READY_FOR_POST_PROD" if all_approved else "AWAITING_APPROVALS",
                "dataIntake.lastApprovedAt": now_ts,
                "dataIntake.lastApprovedBy": user_id,
                "dataIntake.storageMediumId": approval.storageMediumId,
                "dataIntake.storageMedium": storage_assignment["storageMedium"],
                "dataIntake.storageLocation": storage_location_payload,
                "dataIntake.storageNotes": approval.notes,
                "dataIntake.storageAssignedAt": now_ts,
                "dataIntake.storageAssignedBy": user_id,
                "dataIntake.handoffReference": batch_data.get('handoffReference'),
                "dataIntake.submissions": submissions,
                "dataIntake.approvedCount": progress_snapshot["approved"],
                "dataIntake.totalRequired": progress_snapshot["required"],
                "dataIntake.pendingContributorIds": progress_snapshot["pendingIds"],
                "dataIntake.approvedContributorIds": progress_snapshot["approvedIds"],
                "updatedAt": now_ts,
                "deliverableStatus": deliverable_status,
                "deliverableSubmitted": deliverable_submitted,
                "deliverableSubmittedAt": now_ts if deliverable_submitted else firestore.DELETE_FIELD,
                "deliverableApprovedAt": now_ts if deliverable_submitted else firestore.DELETE_FIELD,
                "deliverableApprovedBy": user_id if deliverable_submitted else firestore.DELETE_FIELD,
                "deliverablePendingBatchId": firestore.DELETE_FIELD,
                "deliverableBatchId": approval.batchId if deliverable_submitted else firestore.DELETE_FIELD,
                "deliverableSubmission": {
                    **(event_data.get('deliverableSubmission') or {}),
                    "lastSubmittedBatchId": approval.batchId,
                    "lastApprovedAt": now_ts,
                    "lastApprovedBy": user_id,
                    "lastApprovedNotes": approval.notes,
                    "storageMediumSnapshot": storage_assignment["storageMedium"],
                    "storageLocation": storage_location_payload,
                    "approvalProgress": progress_snapshot
                },
                "deliverableRejectedAt": firestore.DELETE_FIELD,
                "deliverableRejectedBy": firestore.DELETE_FIELD,
                "deliverableRejectedReason": firestore.DELETE_FIELD,
                "postProduction.stage": post_prod_stage,
                "postProduction.approvalSummary": progress_snapshot,
                "postProduction.lastApprovalBy": user_id,
                "postProduction.lastApprovalAt": now_ts,
                "postProduction.readyAt": ready_at_value if all_approved else firestore.DELETE_FIELD
            }

            if all_approved:
                event_update["postProduction.readyNotified"] = ready_notified_value or now_ts
            else:
                event_update["postProduction.readyNotified"] = firestore.DELETE_FIELD

            history_entry = {
                "action": "APPROVED",
                "timestamp": now_ts,
                "actorId": user_id,
                "actorRole": user_role,
                "batchId": approval.batchId,
                "notes": approval.notes,
                "storageMediumId": approval.storageMediumId,
                "storageLocation": storage_location_payload
            }

            event_update["dataIntake.history"] = firestore.ArrayUnion([history_entry])

            event_ref.update({
                **event_update
            })
            
            # Mirror update to root events collection for post-production init
            root_event_ref = db.collection('organizations', org_id, 'events').document(batch_data['eventId'])
            root_event_snap = root_event_ref.get()
            if root_event_snap.exists:
                root_event_ref.update({
                    **event_update
                })
            else:
                # Create root event mirror with essential data
                root_event_data = {
                    'name': event_data.get('name') or event_data.get('eventName') or batch_data.get('eventName') or '',
                    'eventName': event_data.get('eventName') or event_data.get('name') or batch_data.get('eventName') or '',
                    'date': event_data.get('date') or '',
                    'time': event_data.get('time') or '',
                    'venue': event_data.get('venue') or '',
                    'status': event_data.get('status') or 'UPCOMING',
                    'clientId': event_data.get('clientId') or batch_data.get('clientId') or '',
                    'clientName': event_data.get('clientName') or batch_data.get('clientName') or '',
                    'assignedCrew': event_data.get('assignedCrew') or [],
                    'intake': event_data.get('intake') or {},
                    'intakeStats': event_data.get('intakeStats') or {},
                    'createdAt': event_data.get('createdAt') or now_ts,
                    'updatedAt': now_ts,
                    'linkedFrom': event_ref.path,
                }
                # Merge in the update data
                for key, value in event_update.items():
                    if value != firestore.DELETE_FIELD:
                        root_event_data[key] = value
                root_event_ref.set(root_event_data)

            if notify_admin:
                event_name = event_data.get('name') or event_data.get('eventName') or batch_data.get('eventName')
                client_name = event_data.get('clientName') or batch_data.get('clientName')
                _notify_postprod_ready(db, org_id, batch_data.get('eventId'), event_name, client_name, ready_at_value or now_ts)


            # Mark the storage medium as assigned to this batch/event
            storage_medium_ref.update({
                "status": "assigned",
                "assignedBatchId": approval.batchId,
                "assignedEventId": batch_data.get('eventId'),
                "assignedEventName": batch_data.get('eventName'),
                "assignedClientId": batch_data.get('clientId'),
                "assignedClientName": batch_data.get('clientName'),
                "assignedAt": now_ts,
                "assignedBy": user_id,
                "storageLocation": storage_location_payload
            })
        
    elif approval.action == "reject":
        if not approval.rejectionReason:
            raise HTTPException(status_code=400, detail="Rejection reason required")
        
        now_ts = datetime.datetime.now(datetime.timezone.utc)
        update_data.update({
            "status": "REJECTED",
            "rejectedBy": user_id,
            "rejectedAt": now_ts,
            "rejectionReason": approval.rejectionReason,
            "dmNotes": approval.notes,
            "dmDecision": "REJECTED",
            "statusTimeline": firestore.ArrayUnion([
                {
                    "status": "REJECTED",
                    "timestamp": now_ts,
                    "actorId": user_id,
                    "actorRole": user_role,
                    "notes": approval.notes,
                    "rejectionReason": approval.rejectionReason
                }
            ])
        })
        
        # Update event stats
        event_ref = db.collection('organizations', org_id, 'clients', batch_data['clientId'], 'events').document(batch_data['eventId'])
        event_snap = event_ref.get()
        if event_snap.exists:
            event_data = event_snap.to_dict()
            stats = event_data.get('intakeStats', {})
            pending_after = max(int(stats.get('pendingApproval', 0) or 0) - 1, 0)
            rejected_after = int(stats.get('rejectedBatches', 0) or 0) + 1

            data_intake = event_data.get('dataIntake') or {}
            submissions = dict(data_intake.get('submissions') or {})
            submitter_id = batch_data.get('submittedBy')
            existing_submission = dict(submissions.get(submitter_id) or {})
            submissions[submitter_id] = {
                **existing_submission,
                "status": "REJECTED",
                "latestBatchId": approval.batchId,
                "submittedAt": existing_submission.get('submittedAt') or batch_data.get('createdAt'),
                "submittedBy": existing_submission.get('submittedBy') or submitter_id,
                "submittedByName": existing_submission.get('submittedByName') or batch_data.get('submittedByName'),
                "deviceCount": existing_submission.get('deviceCount') or batch_data.get('totalDevices'),
                "estimatedDataSize": existing_submission.get('estimatedDataSize') or batch_data.get('estimatedDataSize'),
                "handoffReference": existing_submission.get('handoffReference') or batch_data.get('handoffReference'),
                "rejectedAt": now_ts,
                "rejectedBy": user_id,
                "rejectionReason": approval.rejectionReason,
                "notes": approval.notes
            }

            assigned_crew = event_data.get('assignedCrew') or []
            temp_event_for_required = dict(event_data)
            temp_event_for_required.setdefault('dataIntake', {})['submissions'] = submissions
            required_contributors = _get_required_contributors(temp_event_for_required)
            required_contributors = max(required_contributors, len(assigned_crew) or 0, len(submissions) or 0)
            progress_snapshot = _calculate_submission_progress(assigned_crew, submissions, required_contributors)

            history_entry = {
                "action": "REJECTED",
                "timestamp": now_ts,
                "actorId": user_id,
                "actorRole": user_role,
                "batchId": approval.batchId,
                "notes": approval.notes,
                "rejectionReason": approval.rejectionReason
            }

            event_ref.update({
                "intakeStats.rejectedBatches": rejected_after,
                "intakeStats.pendingApproval": pending_after,
                "intakeStats.requiredBatches": progress_snapshot["required"],
                "dataIntake.status": "REJECTED",
                "dataIntake.lastRejectedAt": now_ts,
                "dataIntake.lastRejectedBy": user_id,
                "dataIntake.lastRejectedReason": approval.rejectionReason,
                "dataIntake.handoffReference": batch_data.get('handoffReference'),
                "dataIntake.history": firestore.ArrayUnion([history_entry]),
                "dataIntake.submissions": submissions,
                "dataIntake.approvedCount": progress_snapshot["approved"],
                "dataIntake.totalRequired": progress_snapshot["required"],
                "dataIntake.pendingContributorIds": progress_snapshot["pendingIds"],
                "dataIntake.approvedContributorIds": progress_snapshot["approvedIds"],
                "updatedAt": now_ts,
                "deliverableStatus": "REJECTED",
                "deliverableSubmitted": False,
                "deliverableSubmittedAt": firestore.DELETE_FIELD,
                "deliverableApprovedAt": firestore.DELETE_FIELD,
                "deliverableApprovedBy": firestore.DELETE_FIELD,
                "deliverablePendingBatchId": firestore.DELETE_FIELD,
                "deliverableBatchId": firestore.DELETE_FIELD,
                "deliverableSubmission": {
                    **(event_data.get('deliverableSubmission') or {}),
                    "lastRejectedAt": now_ts,
                    "lastRejectedBy": user_id,
                    "lastRejectedReason": approval.rejectionReason,
                    "notes": approval.notes
                },
                "deliverableRejectedAt": now_ts,
                "deliverableRejectedBy": user_id,
                "deliverableRejectedReason": approval.rejectionReason,
                "postProduction.stage": POST_PROD_STAGE_DATA_COLLECTION,
                "postProduction.approvalSummary": progress_snapshot,
                "postProduction.readyAt": firestore.DELETE_FIELD,
                "postProduction.readyNotified": firestore.DELETE_FIELD
            })

            if batch_data.get('storageMediumId'):
                try:
                    medium_release_ref = db.collection('organizations', org_id, 'storageMedia').document(batch_data['storageMediumId'])
                    medium_release_ref.update({
                        "status": "available",
                        "assignedBatchId": firestore.DELETE_FIELD,
                        "assignedEventId": firestore.DELETE_FIELD,
                        "assignedEventName": firestore.DELETE_FIELD,
                        "assignedClientId": firestore.DELETE_FIELD,
                        "assignedClientName": firestore.DELETE_FIELD,
                        "assignedAt": firestore.DELETE_FIELD,
                        "assignedBy": firestore.DELETE_FIELD,
                        "storageLocation": firestore.DELETE_FIELD,
                        "releasedAt": now_ts,
                        "releasedBy": user_id
                    })
                except Exception as release_error:
                    print(f"Warning: failed to release storage medium {batch_data.get('storageMediumId')}: {release_error}")
    
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Must be 'approve' or 'reject'")
    
    batch_ref.update(update_data)
    
    return {
        "status": "success",
        "action": approval.action,
        "batchId": approval.batchId,
        "message": f"Batch {approval.action}d successfully"
    }

@router.get("/dm/storage-media")
async def get_storage_media(
    current_user: dict = Depends(get_current_user)
):
    """Get available storage media for assignment"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role")
    
    if user_role not in ["data-manager", "admin"]:
        raise HTTPException(status_code=403, detail="Only data managers can access storage media")
    
    db = firestore.client()
    
    try:
        # Get available storage media - simplified to avoid index requirements
        storage_query = db.collection('organizations', org_id, 'storageMedia').where(
            filter=firestore.FieldFilter('status', '==', 'available')
        ).limit(100)
        
        storage_media = []
        for doc in storage_query.stream():
            media_data = doc.to_dict()
            media_data['id'] = doc.id
            storage_media.append(media_data)
        
        # Sort in Python instead of Firestore
        storage_media.sort(key=lambda x: (x.get('room', ''), x.get('shelf', ''), x.get('bin', '')))
        
        return {"storageMedia": storage_media}
    
    except Exception as e:
        return {"storageMedia": [], "error": f"Could not fetch storage media: {str(e)}"}

@router.post("/dm/storage-media")
async def create_storage_medium(
    storage_data: dict,
    current_user: dict = Depends(get_current_user)
):
    """Create new storage medium entry"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role")
    
    if user_role not in ["data-manager", "admin"]:
        raise HTTPException(status_code=403, detail="Only data managers can create storage media")
    
    db = firestore.client()
    storage_ref = db.collection('organizations', org_id, 'storageMedia').document()
    
    storage_medium = {
        "id": storage_ref.id,
        "type": storage_data.get("type", ""),  # HDD, SSD, Tape, etc.
        "capacity": storage_data.get("capacity", ""),
        "room": storage_data.get("room", ""),
        "cabinet": storage_data.get("cabinet", ""),
        "shelf": storage_data.get("shelf", ""),
        "bin": storage_data.get("bin", ""),
        "status": "available",  # available, assigned, full
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "createdBy": current_user.get("uid")
    }
    
    storage_ref.set(storage_medium)
    
    return {"status": "success", "storageId": storage_ref.id}

# Dashboard and reporting
@router.get("/dm/dashboard")
async def get_dm_dashboard(
    current_user: dict = Depends(get_current_user)
):
    """Get Data Manager dashboard with intake overview"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role")
    
    if user_role not in ["data-manager", "admin"]:
        raise HTTPException(status_code=403, detail="Only data managers can access dashboard")
    
    db = firestore.client()
    
    try:
        batches_ref = db.collection('organizations', org_id, 'dataBatches')

        try:
            batches_stream = batches_ref.limit(200).stream()
        except Exception:  # pragma: no cover - Firestore runtime issues
            batches_stream = []

        batches: List[Dict[str, Any]] = []
        for doc in batches_stream:
            batch_data = doc.to_dict() or {}
            batch_data['id'] = batch_data.get('id') or doc.id
            _enrich_batch_with_event(db, org_id, batch_data)
            batches.append(batch_data)

        pending_statuses = {
            "PENDING",
            "SUBMITTED",
            "PENDING_REVIEW",
            "AWAITING_REVIEW",
            "AWAITING_DM_REVIEW",
            "IN_REVIEW",
            "REVIEW"
        }
        confirmed_statuses = {"CONFIRMED", "APPROVED"}
        rejected_statuses = {"REJECTED"}

        def status_of(batch: Dict[str, Any]) -> str:
            return _normalize_status(batch.get('status'))

        pending_count = sum(1 for batch in batches if status_of(batch) in pending_statuses)
        confirmed_count = sum(1 for batch in batches if status_of(batch) in confirmed_statuses)
        rejected_count = sum(1 for batch in batches if status_of(batch) in rejected_statuses)

        total_batches = len(batches)

        recent_batches = sorted(
            batches,
            key=lambda batch: _safe_datetime(batch.get('updatedAt') or batch.get('createdAt')),
            reverse=True
        )[:10]

        events_needing_attention: List[Dict[str, Any]] = []

        return {
            "stats": {
                "pendingBatches": pending_count,
                "confirmedBatches": confirmed_count,
                "rejectedBatches": rejected_count,
                "totalBatches": total_batches
            },
            "recentActivity": recent_batches,
            "eventsNeedingAttention": events_needing_attention
        }

    except Exception as e:
        return {
            "stats": {
                "pendingBatches": 0,
                "confirmedBatches": 0,
                "rejectedBatches": 0,
                "totalBatches": 0
            },
            "recentActivity": [],
            "eventsNeedingAttention": [],
            "error": f"Dashboard temporarily unavailable: {str(e)}"
        }


@router.get("/admin/ingest-tracking")
async def get_ingest_tracking(current_user: dict = Depends(get_current_user)):
    """Admin view of events progressing through data intake approvals."""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role")

    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    db = firestore.client()
    events_summary: List[Dict[str, Any]] = []
    seen_event_ids: Set[str] = set()
    client_cache: Dict[str, str] = {}

    clients_ref = db.collection('organizations', org_id, 'clients')

    try:
        client_stream = clients_ref.stream()
    except Exception:
        client_stream = []

    def _resolve_client_name(client_id: Optional[str], fallback: str) -> str:
        if fallback:
            return fallback
        if not client_id:
            return 'Unknown Client'
        if client_id in client_cache:
            return client_cache[client_id]
        client_doc = db.collection('organizations', org_id, 'clients').document(client_id).get()
        if client_doc.exists:
            client_payload = client_doc.to_dict() or {}
            name_value = (
                client_payload.get('profile', {}).get('name')
                or client_payload.get('name')
                or client_payload.get('displayName')
            )
        else:
            name_value = 'Unknown Client'
        client_cache[client_id] = name_value
        return name_value

    def _process_event_doc(event_doc, event_data: Dict[str, Any], client_id: Optional[str], default_client_name: str):
        post_prod_meta = event_data.get('postProduction') or {}
        stage = post_prod_meta.get('stage') or POST_PROD_STAGE_DATA_COLLECTION

        if stage not in {POST_PROD_STAGE_DATA_COLLECTION, POST_PROD_STAGE_READY_FOR_JOB}:
            return

        assigned_crew = event_data.get('assignedCrew') or []
        submissions = (event_data.get('dataIntake') or {}).get('submissions') or {}

        required_contributors = _get_required_contributors(event_data)
        required_contributors = max(required_contributors, len(assigned_crew) or 0, len(submissions) or 0)

        progress_snapshot = post_prod_meta.get('approvalSummary')
        if not progress_snapshot:
            progress_snapshot = _calculate_submission_progress(assigned_crew, submissions, required_contributors)

        approved = progress_snapshot.get('approved', 0)
        required_total = progress_snapshot.get('required', required_contributors)
        pending_names = progress_snapshot.get('pendingNames') or []

        overall_status = "Data Gathering"
        if required_total <= 0:
            overall_status = "Assign Team"
        elif approved > 0 and approved < required_total:
            overall_status = "Awaiting Approvals"
        if stage == POST_PROD_STAGE_READY_FOR_JOB and approved >= required_total and required_total > 0:
            overall_status = "Ready for Post-Production"

        action_enabled = stage == POST_PROD_STAGE_READY_FOR_JOB and approved >= max(required_total, 1)
        remaining_needed = max(required_total - approved, 0)
        if action_enabled:
            action_label = "Create Post-Production Job"
            action_tooltip = "Launch the AI editor assignment workflow."
        else:
            action_label = "Awaiting Approvals"
            if required_total <= 0:
                action_tooltip = "Assign teammates to this event before creating a job."
            elif approved == 0:
                action_tooltip = "Waiting on the first approved submission."
            elif remaining_needed == 1:
                action_tooltip = "Waiting on 1 more teammate approval."
            else:
                action_tooltip = f"Waiting on {remaining_needed} more teammate approvals."

        events_summary.append({
            "eventId": event_doc.id,
            "eventName": event_data.get('name') or 'Untitled Event',
            "clientId": client_id,
            "clientName": _resolve_client_name(client_id, default_client_name),
            "submissionStatus": f"{approved} / {required_total} Approved",
            "approvedCount": approved,
            "requiredCount": required_total,
            "pendingCount": remaining_needed,
            "pendingTeammates": pending_names,
            "overallStatus": overall_status,
            "stage": stage,
            "actionEnabled": action_enabled,
            "actionLabel": action_label,
            "actionTooltip": action_tooltip,
            "lastUpdated": event_data.get('updatedAt'),
            "readyAt": post_prod_meta.get('readyAt'),
            "approvalSummary": progress_snapshot
        })
        seen_event_ids.add(event_doc.id)

    for client_doc in client_stream:
        client_id = client_doc.id
        client_data = client_doc.to_dict() or {}
        client_name = (
            client_data.get('profile', {}).get('name')
            or client_data.get('name')
            or 'Unknown Client'
        )

        events_ref = db.collection('organizations', org_id, 'clients', client_id, 'events')
        try:
            event_stream = events_ref.stream()
        except Exception:
            event_stream = []

        for event_doc in event_stream:
            if event_doc.id in seen_event_ids:
                continue
            event_data = event_doc.to_dict() or {}
            _process_event_doc(event_doc, event_data, client_id, client_name)

    root_events_ref = db.collection('organizations', org_id, 'events')
    try:
        root_stream = root_events_ref.stream()
    except Exception:
        root_stream = []

    for event_doc in root_stream:
        if event_doc.id in seen_event_ids:
            continue
        event_data = event_doc.to_dict() or {}
        _process_event_doc(event_doc, event_data, event_data.get('clientId'), event_data.get('clientName') or '')

    # Sort ready events to top, then by updated time desc
    def _sort_key(item: Dict[str, Any]):
        stage_rank = 0 if item.get('actionEnabled') else 1
        updated = item.get('lastUpdated')
        if isinstance(updated, datetime.datetime):
            updated_value = updated.timestamp()
        else:
            updated_value = 0
        return (stage_rank, -updated_value)

    events_summary.sort(key=_sort_key)

    return {"events": events_summary}

# Status tracking for teammates
@router.get("/batches/{batch_id}/status")
async def get_batch_status(
    batch_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed status of a specific batch"""
    org_id = current_user.get("orgId")
    
    db = firestore.client()
    batch_ref = db.collection('organizations', org_id, 'dataBatches').document(batch_id)
    batch_doc = batch_ref.get()
    
    if not batch_doc.exists:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    batch_data = batch_doc.to_dict()
    
    # Check if user has access (submitted by them or is DM/admin)
    user_id = current_user.get("uid")
    user_role = current_user.get("role")
    
    if batch_data.get('submittedBy') != user_id and user_role not in ["data-manager", "admin"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return {"batch": batch_data}

# =================== LEGACY ENDPOINTS (Backward Compatibility) ===================

# Helper Functions
@router.post("/admin/create-postprod-job")
async def create_postprod_job(
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Admin manually creates a post-production job for an event after all submissions are approved."""

    def _job_ref(database, organization_id: str, evt_id: str):
        return database.collection('organizations', organization_id, 'events').document(evt_id).collection('postprodJob').document('job')

    def _activity_ref(database, organization_id: str, evt_id: str):
        return database.collection('organizations', organization_id, 'events').document(evt_id).collection('postprodActivity')

    def _generate_editor_recommendations(database, organization_id: str, evt_data: Dict[str, Any], summary: Dict[str, Any]) -> List[Dict[str, Any]]:
        recommendations: List[Dict[str, Any]] = []
        try:
            team_ref = database.collection('organizations', organization_id, 'team')
            team_stream = team_ref.stream()
        except Exception:
            return recommendations

        event_type = (evt_data.get('eventType') or '').lower()
        client_requirements = (summary.get('clientRequirements') or '')
        keywords = set()
        if isinstance(client_requirements, str):
            keywords.update(word.strip().lower() for word in client_requirements.split(',') if word.strip())

        for member_doc in team_stream:
            member = member_doc.to_dict() or {}
            role = (member.get('role') or '').lower()
            skills = [s.lower() for s in (member.get('skills') or [])]
            specialties = [s.lower() for s in (member.get('specialties') or member.get('specialisations') or [])]
            if role not in {'editor', 'lead-editor', 'post-production'} and 'editing' not in skills:
                continue
            availability = member.get('availability', True)
            score = 0
            reasons: List[str] = []
            if availability:
                score += 1
            if 'editing' in skills:
                score += 2
                reasons.append('Core editing skill')
            if event_type and event_type in specialties:
                score += 2
                reasons.append(f"Specialized in {event_type}")
            overlap = keywords.intersection(skills + specialties)
            if overlap:
                score += len(overlap)
                reasons.append(f"Matches requirements: {', '.join(sorted(overlap))}")
            years = member.get('experienceYears') or member.get('experience')
            try:
                years_val = float(years)
                if years_val >= 5:
                    score += 2
                    reasons.append('5+ years experience')
                elif years_val >= 2:
                    score += 1
            except (TypeError, ValueError):
                pass

            if score <= 0:
                continue

            recommendations.append({
                'editorId': member_doc.id,
                'name': member.get('name') or member.get('displayName') or 'Unnamed Editor',
                'score': score,
                'reasons': reasons,
                'availability': availability,
                'role': role or 'editor'
            })

        recommendations.sort(key=lambda item: (-item.get('score', 0), item.get('name', '')))
        return recommendations[:5]

    org_id = current_user.get("orgId")
    user_role = current_user.get("role")
    if user_role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    if not org_id:
        raise HTTPException(status_code=400, detail="Organization context missing")

    db = firestore.client()
    event_ref, client_id, event_snap = _find_event_ref(db, org_id, event_id)
    if not event_ref or not event_snap or not event_snap.exists:
        raise HTTPException(status_code=404, detail="Event not found")

    event_data = event_snap.to_dict() or {}
    post_prod_meta = event_data.get('postProduction') or {}
    stage = post_prod_meta.get('stage') or POST_PROD_STAGE_DATA_COLLECTION
    if stage != POST_PROD_STAGE_READY_FOR_JOB:
        raise HTTPException(status_code=400, detail="Event not ready for post-production job creation")

    data_intake = event_data.get('dataIntake') or {}
    submissions_map = data_intake.get('submissions') or {}
    approved_submissions: List[Dict[str, Any]] = []
    total_devices = 0
    estimated_sizes: List[str] = []

    for submitter_id, submission in submissions_map.items():
        submission = submission or {}
        if _normalize_status(submission.get('status')) != 'APPROVED':
            continue
        try:
            total_devices += int(submission.get('deviceCount') or 0)
        except (TypeError, ValueError):
            pass
        est_size = submission.get('estimatedDataSize')
        if est_size:
            estimated_sizes.append(str(est_size))
        approved_submissions.append({
            'submitterId': submitter_id,
            'submitterName': submission.get('submittedByName') or submission.get('submittedBy') or submitter_id,
            'approvedAt': submission.get('approvedAt'),
            'storageAssignment': submission.get('storageAssignment'),
            'deviceCount': submission.get('deviceCount'),
            'estimatedDataSize': submission.get('estimatedDataSize'),
            'handoffReference': submission.get('handoffReference'),
            'notes': submission.get('notes')
        })

    if not approved_submissions:
        raise HTTPException(status_code=400, detail="No approved submissions found for this event")

    approval_summary = post_prod_meta.get('approvalSummary') or {}
    if not approval_summary:
        assigned_crew = event_data.get('assignedCrew') or []
        required_contributors = _get_required_contributors(event_data)
        required_contributors = max(required_contributors, len(assigned_crew) or 0, len(submissions_map) or 0)
        approval_summary = _calculate_submission_progress(assigned_crew, submissions_map, required_contributors)

    now_ts = datetime.datetime.now(datetime.timezone.utc)
    actor_uid = current_user.get('uid')

    root_event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    root_snap = root_event_ref.get()
    if not root_snap.exists:
        mirror_payload = {
            'name': event_data.get('name') or event_data.get('eventName') or '',
            'eventName': event_data.get('eventName') or event_data.get('name') or '',
            'clientId': client_id or event_data.get('clientId'),
            'clientName': event_data.get('clientName'),
            'assignedCrew': event_data.get('assignedCrew') or [],
            'dataIntake': data_intake,
            'postProduction': post_prod_meta,
            'createdAt': event_data.get('createdAt') or now_ts,
            'updatedAt': now_ts,
            'linkedFrom': event_ref.path
        }
        root_event_ref.set(mirror_payload, merge=True)
        root_snap = root_event_ref.get()
    else:
        root_event_ref.update({'updatedAt': now_ts})

    job_ref = _job_ref(db, org_id, event_id)
    if job_ref.get().exists:
        raise HTTPException(status_code=400, detail="Post-production job already exists for this event")

    client_name = event_data.get('clientName')
    if not client_name and client_id:
        client_doc = db.collection('organizations', org_id, 'clients').document(client_id).get()
        if client_doc.exists:
            client_payload = client_doc.to_dict() or {}
            client_name = (
                client_payload.get('profile', {}).get('name')
                or client_payload.get('name')
                or client_payload.get('displayName')
            )

    assigned_crew = event_data.get('assignedCrew') or []
    ai_summary = {
        'approvedCount': len(approved_submissions),
        'requiredCount': approval_summary.get('required'),
        'totalDevices': total_devices,
        'estimatedDataSizes': estimated_sizes,
        'approvalSummary': approval_summary,
        'assignedCrew': assigned_crew,
        'eventType': event_data.get('eventType'),
        'eventDate': event_data.get('date'),
        'venue': event_data.get('venue'),
        'clientRequirements': event_data.get('clientRequirements') or event_data.get('specialRequirements'),
        'readyAt': post_prod_meta.get('readyAt')
    }

    ai_recommendations = _generate_editor_recommendations(db, org_id, event_data, ai_summary)
    if ai_recommendations:
        ai_summary['recommendations'] = ai_recommendations

    job_payload = {
        'eventId': event_id,
        'orgId': org_id,
        'clientId': client_id or event_data.get('clientId'),
        'clientName': client_name,
        'status': 'PENDING',
        'createdAt': now_ts,
        'updatedAt': now_ts,
        'photo': {'state': 'PHOTO_ASSIGNED', 'version': 0},
        'video': {'state': 'VIDEO_ASSIGNED', 'version': 0},
        'intakeSummary': {
            'approvedCount': len(approved_submissions),
            'requiredCount': approval_summary.get('required'),
            'totalDevices': total_devices,
            'estimatedDataSizes': estimated_sizes,
            'approvedSubmissions': approved_submissions,
            'recordedAt': now_ts,
        },
        'aiSummary': ai_summary,
        'initializedBy': actor_uid
    }

    job_ref.set(job_payload)

    # Catalog entry for global admin dashboard
    catalog_ref = db.collection('organizations', org_id, 'postProductionJobs').document(event_id)
    catalog_payload = {
        'jobId': job_ref.id,
        'eventId': event_id,
        'eventName': event_data.get('name') or event_data.get('eventName') or 'Untitled Event',
        'clientId': client_id or event_data.get('clientId'),
        'clientName': client_name,
        'createdAt': now_ts,
        'createdBy': actor_uid,
        'status': 'PENDING_ASSIGNMENT',
        'aiRecommendations': ai_recommendations,
        'totalApprovedSubmissions': len(approved_submissions)
    }
    catalog_ref.set(catalog_payload)

    activity_summary = f"Job initialized from {len(approved_submissions)} approved submissions"
    _activity_ref(db, org_id, event_id).document().set({
        'at': now_ts,
        'actorUid': actor_uid,
        'kind': 'INIT',
        'summary': activity_summary
    })

    submissions_with_job = {}
    for submitter_id, submission in submissions_map.items():
        submission = dict(submission or {})
        if _normalize_status(submission.get('status')) == 'APPROVED':
            submission['postProdJobId'] = job_ref.id
            submission['postProdLinkedAt'] = now_ts
        submissions_with_job[submitter_id] = submission

    event_updates = {
        'postProduction.stage': POST_PROD_STAGE_JOB_CREATED,
        'postProduction.jobCreatedAt': now_ts,
        'postProduction.jobCreatedBy': actor_uid,
        'postProduction.jobId': job_ref.id,
        'postProduction.assignmentStatus': 'PENDING_ASSIGNMENT',
        'postProduction.lastJobInitAt': now_ts,
        'postProduction.lastJobInitBy': actor_uid,
        'postProduction.aiSummary': ai_summary,
        'postProduction.aiSuggestedAt': now_ts,
        'updatedAt': now_ts,
        'dataIntake.submissions': submissions_with_job,
        'dataIntake.postProdJobId': job_ref.id,
        'dataIntake.status': 'POST_PROD_JOB_CREATED'
    }

    root_event_ref.update(event_updates)
    if event_ref.path != root_event_ref.path:
        event_ref.update(event_updates)

    return {
        'status': 'success',
        'jobId': job_ref.id,
        'eventId': event_id,
        'job': job_payload,
        'aiRecommendations': ai_recommendations,
        'message': 'Post-production job created and event updated. Proceed to editor assignment.',
        'redirectTo': f"/admin/editor-assigner/{job_ref.id}"
    }
def get_event_details(db, org_id: str, event_id: str, client_id: str = None):
    """Get event details from database"""
    try:
        if client_id:
            event_doc = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id).get()
        else:
            # Search across all clients for the event
            clients_ref = db.collection('organizations', org_id, 'clients')
            for client_doc in clients_ref.stream():
                event_doc = db.collection('organizations', org_id, 'clients', client_doc.id, 'events').document(event_id).get()
                if event_doc.exists:
                    event_data = event_doc.to_dict()
                    event_data['clientId'] = client_doc.id
                    return event_data
            return None
        
        if event_doc.exists:
            return event_doc.to_dict()
        return None
    except Exception as e:
        print(f"Error getting event details: {e}")
        return None

def get_client_details(db, org_id: str, client_id: str):
    """Get client details from database"""
    try:
        client_doc = db.collection('organizations', org_id, 'clients').document(client_id).get()
        if client_doc.exists:
            return client_doc.to_dict()
        return None
    except Exception as e:
        print(f"Error getting client details: {e}")
        return None

def get_team_member_name(db, org_id: str, user_id: str):
    """Get team member name"""
    try:
        team_doc = db.collection('organizations', org_id, 'team').document(user_id).get()
        if team_doc.exists:
            return team_doc.to_dict().get('name', 'Unknown')
        return 'Unknown'
    except Exception as e:
        print(f"Error getting team member name: {e}")
        return 'Unknown'

@router.post("/submit")
async def submit_data(submission: DataSubmission, current_user: dict = Depends(get_current_user)):
    """Legacy: Team member submits data after event completion"""
    print(f"Legacy data submission from user: {current_user}")
    
    try:
        org_id = current_user.get("orgId")
        uid = current_user.get("uid")
        
        if not org_id:
            raise HTTPException(status_code=403, detail="User not part of an organization.")
        
        db = firestore.client()
        user_name = get_team_member_name(db, org_id, uid)
        
        # Create legacy data submission record
        submission_ref = db.collection('organizations', org_id, 'dataSubmissions').document()
        submission_data = {
            "id": submission_ref.id,
            "eventId": submission.eventId,
            "clientId": submission.clientId,
            "submittedBy": uid,
            "submittedByName": user_name,
            "storageType": submission.storageType,
            "deviceInfo": submission.deviceInfo,
            "notes": submission.notes,
            "dataSize": submission.dataSize,
            "fileCount": submission.fileCount,
            "status": "pending",
            "submittedAt": datetime.datetime.now(datetime.timezone.utc),
            "processedAt": None,
            "processedBy": None,
            "processingInfo": None,
            "isLegacy": True  # Mark as legacy submission
        }
        
        submission_ref.set(submission_data)
        return {"status": "success", "message": "Data submitted successfully", "submissionId": submission_ref.id}
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in legacy submit_data: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/pending")
async def get_pending_submissions(current_user: dict = Depends(get_current_user)):
    """Legacy: Data manager gets pending data submissions"""
    org_id = current_user.get("orgId")
    role = current_user.get("role")
    
    if role not in ("admin", "data-manager"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = firestore.client()
    submissions = []
    
    # Get legacy submissions
    query = db.collection('organizations', org_id, 'dataSubmissions').where(
        filter=firestore.FieldFilter('status', '==', 'pending')
    )
    for doc in query.stream():
        data = doc.to_dict()
        
        # Get event and client info
        event_data = get_event_details(db, org_id, data['eventId'], data.get('clientId'))
        if event_data:
            data['eventName'] = event_data.get('name', 'Unknown Event')
            data['eventDate'] = event_data.get('date', 'Unknown Date')
            client_data = get_client_details(db, org_id, data['clientId'])
            if client_data:
                data['clientName'] = client_data.get('profile', {}).get('name', 'Unknown Client')
            else:
                data['clientName'] = 'Unknown Client'
        else:
            data['eventName'] = 'Unknown Event'
            data['eventDate'] = 'Unknown Date'
            data['clientName'] = 'Unknown Client'
            
        submissions.append(data)
    
    return submissions

@router.put("/{submission_id}/process")
async def process_data_submission(submission_id: str, processing: DataProcessing, current_user: dict = Depends(get_current_user)):
    """Legacy: Data manager processes submitted data"""
    org_id = current_user.get("orgId")
    role = current_user.get("role")
    uid = current_user.get("uid")
    
    if role not in ("admin", "data-manager"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = firestore.client()
    manager_name = get_team_member_name(db, org_id, uid)
    
    # Update submission
    submission_ref = db.collection('organizations', org_id, 'dataSubmissions').document(submission_id)
    submission_doc = submission_ref.get()
    
    if not submission_doc.exists:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    submission_data = submission_doc.to_dict()
    
    # Update submission status
    submission_ref.update({
        "status": "processed",
        "processedAt": datetime.datetime.now(datetime.timezone.utc),
        "processedBy": uid,
        "processedByName": manager_name,
        "processingInfo": {
            "storageLocation": processing.storageLocation,
            "diskName": processing.diskName,
            "archiveLocation": processing.archiveLocation,
            "processingNotes": processing.processingNotes
        }
    })
    
    return {"status": "success", "message": "Data submission processed successfully"}

@router.get("/my-submissions")
async def get_my_submissions(current_user: dict = Depends(get_current_user)):
    """Legacy: Get submissions by current user"""
    org_id = current_user.get("orgId")
    uid = current_user.get("uid")
    
    db = firestore.client()
    submissions = []
    
    query = db.collection('organizations', org_id, 'dataSubmissions').where(
        filter=firestore.FieldFilter('submittedBy', '==', uid)
    )
    for doc in query.stream():
        data = doc.to_dict()
        
        # Get event info
        event_data = get_event_details(db, org_id, data['eventId'], data.get('clientId'))
        if event_data:
            data['eventName'] = event_data.get('name', 'Unknown Event')
        else:
            data['eventName'] = 'Unknown Event'
            
        submissions.append(data)
    
    return submissions

@router.get("/all")
async def get_all_submissions(status: str = None, current_user: dict = Depends(get_current_user)):
    """Legacy: Data manager gets all data submissions with optional status filter"""
    org_id = current_user.get("orgId")
    role = current_user.get("role")
    
    if role not in ("admin", "data-manager"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = firestore.client()
    submissions = []
    
    try:
        # Get legacy submissions - simplified to avoid index requirements
        if status and status.lower() != 'all':
            query = db.collection('organizations', org_id, 'dataSubmissions').where(
                filter=firestore.FieldFilter('status', '==', status.lower())
            ).limit(100)
        else:
            query = db.collection('organizations', org_id, 'dataSubmissions').limit(100)
        
        all_submissions = []
        for doc in query.stream():
            data = doc.to_dict()
            
            # Get event and client info
            event_data = get_event_details(db, org_id, data['eventId'], data.get('clientId'))
            if event_data:
                data['eventName'] = event_data.get('name', 'Unknown Event')
                data['eventDate'] = event_data.get('date', 'Unknown Date')
                client_data = get_client_details(db, org_id, data['clientId'])
                if client_data:
                    data['clientName'] = client_data.get('profile', {}).get('name', 'Unknown Client')
                else:
                    data['clientName'] = 'Unknown Client'
            else:
                data['eventName'] = 'Unknown Event'
                data['eventDate'] = 'Unknown Date'
                data['clientName'] = 'Unknown Client'
                
            all_submissions.append(data)
        
        # Sort by submittedAt in Python instead of Firestore
        all_submissions.sort(key=lambda x: x.get('submittedAt', datetime.datetime.min), reverse=True)
        submissions = all_submissions
        
    except Exception as e:
        submissions = []
    
    return submissions

@router.get("/event/{event_id}")
async def get_event_data_submissions(event_id: str, client_id: str, current_user: dict = Depends(get_current_user)):
    """Legacy: Get all data submissions for a specific event"""
    org_id = current_user.get("orgId")
    role = current_user.get("role")
    
    if role not in ("admin", "client"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = firestore.client()
    submissions = []
    
    # Legacy submissions
    query = db.collection('organizations', org_id, 'dataSubmissions').where(
        filter=firestore.FieldFilter('eventId', '==', event_id)
    ).where(
        filter=firestore.FieldFilter('clientId', '==', client_id)
    )
    for doc in query.stream():
        submissions.append(doc.to_dict())
    
    return submissions

@router.put("/{submission_id}/edit")
async def edit_processed_data_submission(submission_id: str, processing: DataProcessing, current_user: dict = Depends(get_current_user)):
    """Legacy: Data manager edits previously processed submission data"""
    org_id = current_user.get("orgId")
    role = current_user.get("role")
    uid = current_user.get("uid")
    
    if role not in ("admin", "data-manager"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = firestore.client()
    manager_name = get_team_member_name(db, org_id, uid)
    
    # Update submission
    submission_ref = db.collection('organizations', org_id, 'dataSubmissions').document(submission_id)
    submission_doc = submission_ref.get()
    
    if not submission_doc.exists:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    submission_data = submission_doc.to_dict()
    
    if submission_data.get('status') != 'processed':
        raise HTTPException(status_code=400, detail="Only processed submissions can be edited")
    
    # Update submission with new processing info
    submission_ref.update({
        "updatedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedBy": uid,
        "updatedByName": manager_name,
        "processingInfo": {
            "storageLocation": processing.storageLocation,
            "diskName": processing.diskName,
            "archiveLocation": processing.archiveLocation,
            "processingNotes": processing.processingNotes
        }
    })
    
    return {"status": "success", "message": "Data submission updated successfully"}

@router.get("/client/{client_id}/batches")
async def get_client_data_batches(
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all data batches for a specific client (Admin view)"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role")
    
    # Only admins and data managers can access
    if user_role not in ["admin", "data-manager"]:
        raise HTTPException(status_code=403, detail="Only admins and data managers can access this endpoint")
    
    db = firestore.client()
    
    try:
        # Get all batches for this client
        batches_query = db.collection('organizations', org_id, 'dataBatches').where(
            filter=firestore.FieldFilter('clientId', '==', client_id)
        ).limit(100)  # Reasonable limit
        
        batches = []
        events_cache = {}  # Cache event data to avoid repeated queries
        
        for doc in batches_query.stream():
            batch_data = doc.to_dict()
            batch_data['id'] = doc.id
            
            # Get event details if not cached
            event_id = batch_data.get('eventId')
            if event_id and event_id not in events_cache:
                try:
                    event_ref, _, event_snap = _find_event_ref(db, org_id, event_id)
                    if event_snap and event_snap.exists:
                        event_data = event_snap.to_dict()
                        events_cache[event_id] = {
                            'name': event_data.get('name', 'Unknown Event'),
                            'date': event_data.get('date'),
                            'eventType': event_data.get('eventType'),
                            'status': event_data.get('status')
                        }
                    else:
                        events_cache[event_id] = None
                except Exception as e:
                    print(f"Error fetching event {event_id}: {e}")
                    events_cache[event_id] = None
            
            # Add event info to batch
            if event_id in events_cache and events_cache[event_id]:
                batch_data['eventInfo'] = events_cache[event_id]
            
            batches.append(batch_data)
        
        # Sort by createdAt in Python
        batches.sort(key=lambda x: x.get('createdAt', datetime.datetime.min), reverse=True)
        
        # Get summary statistics
        stats = {
            'total': len(batches),
            'pending': len([b for b in batches if b.get('status') == 'PENDING']),
            'confirmed': len([b for b in batches if b.get('status') == 'CONFIRMED']),
            'rejected': len([b for b in batches if b.get('status') == 'REJECTED']),
            'submitted': len([b for b in batches if b.get('status') == 'SUBMITTED'])
        }
        
        return {
            "batches": batches,
            "stats": stats,
            "clientId": client_id
        }
    
    except Exception as e:
        print(f"Error fetching client data batches: {e}")
        return {
            "batches": [],
            "stats": {'total': 0, 'pending': 0, 'confirmed': 0, 'rejected': 0, 'submitted': 0},
            "error": f"Could not fetch data batches: {str(e)}"
        }
