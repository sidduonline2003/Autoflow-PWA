import datetime
from firebase_admin import firestore
from typing import Any, Dict, List, Optional, Tuple

POST_PROD_STAGE_DATA_COLLECTION = "DATA_COLLECTION"
POST_PROD_STAGE_READY_FOR_JOB = "READY_FOR_JOB"
POST_PROD_STAGE_JOB_CREATED = "JOB_CREATED"

POSTPROD_INIT_STATUS = "POST_PRODUCTION_INIT"

APPROVED_STATUS_MARKERS = {
    "APPROVED",
    "READY",
    "READY_FOR_POSTPROD",
    "READY_FOR_POST_PROD",
    "DATA_READY",
    "COMPLETED",
    "COMPLETE",
}

STREAM_INITIAL_STATES = {
    "photo": "PHOTO_ASSIGNED",
    "video": "VIDEO_ASSIGNED",
}

# Helper: get a firestore client from either module or client
_def = object()

def _get_client(db_like):
    try:
        # If a module was passed (firebase_admin.firestore), get a client
        return db_like.client()
    except Exception:
        # Assume it's already a client
        return db_like


def _normalize_status(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip().upper()


def _is_submission_approved(status: Any) -> bool:
    normalized = _normalize_status(status)
    if not normalized:
        return False
    if normalized in APPROVED_STATUS_MARKERS:
        return True
    return normalized.endswith("_READY") or "APPROVED" in normalized


def _compute_intake_summary(
    event_data: Optional[Dict[str, Any]],
    *,
    fallback: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Compute intake summary from event's dataIntake.submissions"""
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
        or datetime.datetime.utcnow()
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


def job_ref(db, org_id: str, event_id: str):
    """Return reference to the postprodJob/job document for an event."""
    return db.collection('organizations', org_id, 'events').document(event_id).collection('postprodJob').document('job')


def activity_ref(db, org_id: str, event_id: str):
    """Return reference to the postprodActivity collection for an event."""
    return db.collection('organizations', org_id, 'events').document(event_id).collection('postprodActivity')


# Helper: locate event doc either under root events or under clients/*/events
async def find_event_ref(db_like, org_id: str, event_id: str) -> Tuple[Optional[object], Optional[str]]:
    db = _get_client(db_like)
    root_ref = db.collection('organizations', org_id, 'events').document(event_id)
    if root_ref.get().exists:
        return root_ref, None
    # Fallback: scan clients for the event
    clients_ref = db.collection('organizations', org_id, 'clients')
    try:
        for client_doc in clients_ref.stream():
            ev_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events').document(event_id)
            if ev_ref.get().exists:
                return ev_ref, client_doc.id
    except Exception:
        pass
    return None, None

# Helper: ensure we have a mirror event doc in root events collection
async def ensure_root_event_mirror(db_like, org_id: str, source_event_ref, client_id: Optional[str]) -> object:
    db = _get_client(db_like)
    root_ref = db.collection('organizations', org_id, 'events').document(source_event_ref.id)
    src = source_event_ref.get().to_dict() or {}
    payload = {
        'name': src.get('name') or src.get('eventName') or '',
        'eventName': src.get('eventName') or src.get('name') or '',
        'date': src.get('date') or '',
        'time': src.get('time') or '',
        'venue': src.get('venue') or '',
        'status': src.get('status') or 'UPCOMING',
        'clientId': client_id or src.get('clientId') or '',
        'intake': src.get('intake') or {},
        'dataIntake': src.get('dataIntake') or {},
        'createdAt': src.get('createdAt') or datetime.datetime.utcnow().isoformat(),
        'updatedAt': datetime.datetime.utcnow().isoformat(),
        'linkedFrom': source_event_ref.path,
    }
    root_ref.set(payload, merge=True)
    return root_ref


def job_ref(db, org_id: str, event_id: str):
    return db.collection('organizations', org_id, 'events').document(event_id).collection('postprodJob').document('job')


def activity_ref(db, org_id: str, event_id: str):
    return db.collection('organizations', org_id, 'events').document(event_id).collection('postprodActivity')

async def start_postprod_if_ready(db_like, org_id: str, event_id: str) -> Dict[str, bool]:
    """
    Enhanced auto-initialization: checks if event has approved submissions and creates job automatically.
    Returns dict with 'created', 'manualInitRequired', 'stage', and optional 'jobId'.
    """
    if not org_id or not event_id:
        return {"created": False, "manualInitRequired": True}

    db = _get_client(db_like)
    event_ref, client_id = await find_event_ref(db, org_id, event_id)
    if not event_ref:
        return {"created": False, "manualInitRequired": True, "reason": "event-not-found"}

    root_event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    if not root_event_ref.get().exists:
        root_event_ref = await ensure_root_event_mirror(db, org_id, event_ref, client_id)

    event_doc = root_event_ref.get()
    event_data = event_doc.to_dict() or {}
    post_prod_meta = event_data.get('postProduction') or {}
    current_stage = post_prod_meta.get('stage') or POST_PROD_STAGE_DATA_COLLECTION
    
    # Check if job already exists
    job_ref = db.collection('organizations', org_id, 'events').document(event_id).collection('postprodJob').document('job')
    job_doc = job_ref.get()
    if job_doc.exists:
        return {
            "created": False,
            "manualInitRequired": False,
            "stage": POST_PROD_STAGE_JOB_CREATED,
            "jobId": "job",
            "alreadyExists": True
        }

    # Initialize postProduction metadata if missing
    updates = {}
    if not post_prod_meta.get('stage'):
        updates['postProduction.stage'] = POST_PROD_STAGE_DATA_COLLECTION
        current_stage = POST_PROD_STAGE_DATA_COLLECTION
    if 'initializedAt' not in post_prod_meta:
        updates['postProduction.initializedAt'] = datetime.datetime.now(datetime.timezone.utc)

    # Check if we have approved submissions
    data_intake = event_data.get('dataIntake') or {}
    submissions_map = data_intake.get('submissions') or {}
    
    approved_count = sum(
        1 for s in submissions_map.values() 
        if _is_submission_approved((s or {}).get('status'))
    )
    
    # If we have approved submissions, auto-create the job
    if approved_count > 0:
        intake_summary = _compute_intake_summary(event_data)
        
        if intake_summary and intake_summary.get('approvedSubmissions'):
            now_ts = datetime.datetime.now(datetime.timezone.utc)
            
            # Get client name
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
            
            # Build AI summary
            assigned_crew = event_data.get('assignedCrew') or []
            approval_summary = post_prod_meta.get('approvalSummary') or {}
            ai_summary = {
                'totalDevices': intake_summary.get('totalDevices', 0),
                'estimatedDataSizes': intake_summary.get('estimatedDataSizes', []),
                'approvalSummary': approval_summary,
                'assignedCrew': assigned_crew,
                'eventType': event_data.get('eventType'),
                'eventDate': event_data.get('date'),
                'venue': event_data.get('venue'),
                'clientRequirements': event_data.get('clientRequirements') or event_data.get('specialRequirements'),
                'readyAt': now_ts
            }
            
            # Create job
            job_payload = {
                'eventId': event_id,
                'orgId': org_id,
                'clientId': client_id or event_data.get('clientId'),
                'clientName': client_name,
                'status': 'PENDING',
                'createdAt': now_ts,
                'updatedAt': now_ts,
                'photo': {'state': STREAM_INITIAL_STATES['photo'], 'version': 0},
                'video': {'state': STREAM_INITIAL_STATES['video'], 'version': 0},
                'intakeSummary': intake_summary,
                'aiSummary': ai_summary,
                'autoInitialized': True,
                'autoInitializedAt': now_ts
            }
            
            job_ref.set(job_payload)
            
            # Update event to READY_FOR_JOB stage
            updates.update({
                'postProduction.stage': POST_PROD_STAGE_READY_FOR_JOB,
                'postProduction.readyAt': now_ts,
                'postProduction.jobCreatedAt': now_ts,
                'postProduction.jobId': 'job',
                'postProduction.assignmentStatus': 'PENDING_ASSIGNMENT',
                'postProduction.approvalSummary': {
                    'approved': approved_count,
                    'required': intake_summary.get('requiredCount') or approved_count,
                },
                'updatedAt': now_ts,
            })
            
            root_event_ref.update(updates)
            if client_id and event_ref.path != root_event_ref.path:
                event_ref.update(updates)
            
            return {
                "created": True,
                "manualInitRequired": False,
                "stage": POST_PROD_STAGE_READY_FOR_JOB,
                "jobId": "job",
                "autoInitialized": True
            }
    
    # Just update metadata if we have updates but no approved submissions
    if updates:
        root_event_ref.update(updates)
        if client_id and event_ref.path != root_event_ref.path:
            event_ref.update(updates)

    return {
        "created": False,
        "manualInitRequired": True,
        "stage": current_stage,
        "reason": "no-approved-submissions" if approved_count == 0 else "unknown"
    }



async def ensure_postprod_job_initialized(
    db_like,
    org_id: str,
    event_id: str,
    *,
    actor_uid: Optional[str] = None,
    actor_display_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a post-production job if the event is ready and none exists.

    Returns a dictionary with keys:
      - created (bool): True if a new job was created.
      - job (dict|None): The job payload when available.
      - eventUpdates (dict|None): Firestore update payload applied to the event doc when created.
      - reason/detail/stage/status_code: Additional context when no job is created.
    """

    if not org_id or not event_id:
        return {
            "created": False,
            "reason": "missing-identifiers",
            "detail": "Missing organization or event identifier",
            "status_code": 400,
        }

    db = _get_client(db_like)
    now = datetime.datetime.now(datetime.timezone.utc)
    
    event_ref, client_id = await find_event_ref(db, org_id, event_id)
    if not event_ref:
        return {
            "created": False,
            "reason": "event-not-found",
            "detail": "Event not found",
            "status_code": 404,
        }

    root_event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    root_event_doc = root_event_ref.get()
    if not root_event_doc.exists:
        root_event_ref = await ensure_root_event_mirror(db, org_id, event_ref, client_id)
        root_event_doc = root_event_ref.get()

    if not root_event_doc.exists:
        return {
            "created": False,
            "reason": "event-not-available",
            "detail": "Event metadata is not available",
            "status_code": 404,
        }

    event_data = root_event_doc.to_dict() or {}
    post_prod_meta = event_data.get('postProduction') or {}
    stage = post_prod_meta.get('stage') or POST_PROD_STAGE_DATA_COLLECTION

    job_ref_obj = job_ref(db, org_id, event_id)
    job_doc = job_ref_obj.get()
    if job_doc.exists:
        job_payload = job_doc.to_dict() or {}
        job_payload.setdefault('id', job_ref_obj.id)
        return {
            "created": False,
            "job": job_payload,
            "stage": stage,
            "reason": "already-exists",
            "status_code": 200,
        }

    # Check for approved submissions FIRST before stage validation
    data_intake = event_data.get('dataIntake') or {}
    submissions_map = data_intake.get('submissions') or {}
    
    approved_count = sum(
        1 for s in submissions_map.values() 
        if _is_submission_approved((s or {}).get('status'))
    )

    # Auto-upgrade stage if we have approved submissions but wrong stage
    if stage != POST_PROD_STAGE_READY_FOR_JOB:
        if approved_count > 0:
            # Upgrade the stage automatically
            print(f"[POSTPROD] Auto-upgrading event {event_id} from stage '{stage}' to '{POST_PROD_STAGE_READY_FOR_JOB}' ({approved_count} approved)")
            stage = POST_PROD_STAGE_READY_FOR_JOB
            stage_upgrade_updates = {
                'postProduction.stage': POST_PROD_STAGE_READY_FOR_JOB,
                'postProduction.readyAt': now,
                'updatedAt': now
            }
            root_event_ref.update(stage_upgrade_updates)
            if client_id and event_ref.path != root_event_ref.path:
                event_ref.update(stage_upgrade_updates)
        else:
            detail = (
                f'Event is not ready for post-production job creation. '
                f'Current stage: "{stage}", Expected: "{POST_PROD_STAGE_READY_FOR_JOB}". '
                f'No approved submissions found.'
            )
            return {
                "created": False,
                "stage": stage,
                "reason": "stage-not-ready",
                "detail": detail,
                "status_code": 400,
            }

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
        return {
            "created": False,
            "reason": "no-approved-submissions",
            "detail": "No approved submissions found to create job",
            "status_code": 400,
        }

    approval_summary = (
        post_prod_meta.get('approvalSummary')
        or data_intake.get('approvalSummary')
        or {}
    )

    client_obj = event_data.get('client') or {}

    client_id_value = (
        post_prod_meta.get('clientId')
        or event_data.get('clientId')
        or event_data.get('client_id')
        or event_data.get('clientID')
        or client_obj.get('id')
        or client_id
    )

    client_name = (
        event_data.get('clientName')
        or client_obj.get('name')
        or client_obj.get('displayName')
    )

    if (not client_name) and client_id_value:
        client_doc = db.collection('organizations', org_id, 'clients').document(str(client_id_value)).get()
        if client_doc.exists:
            client_payload = client_doc.to_dict() or {}
            client_name = (
                client_payload.get('profile', {}).get('name')
                or client_payload.get('name')
                or client_payload.get('displayName')
            )

    assigned_crew = event_data.get('assignedCrew') or []
    intake_summary = {
        'approvedCount': len(approved_submissions),
        'requiredCount': approval_summary.get('required'),
        'totalDevices': total_devices,
        'estimatedDataSizes': estimated_sizes,
        'approvedSubmissions': approved_submissions,
        'recordedAt': now,
    }

    ai_summary = {
        'totalDevices': total_devices,
        'estimatedDataSizes': estimated_sizes,
        'approvalSummary': approval_summary,
        'assignedCrew': assigned_crew,
        'eventType': event_data.get('eventType'),
        'eventDate': event_data.get('date'),
        'venue': event_data.get('venue'),
        'clientRequirements': event_data.get('clientRequirements') or event_data.get('specialRequirements'),
        'readyAt': post_prod_meta.get('readyAt') or now,
    }

    job_payload = {
        'id': job_ref_obj.id,
        'eventId': event_id,
        'orgId': org_id,
        'clientId': client_id_value,
        'clientName': client_name,
        'status': 'PENDING',
        'createdAt': now,
        'updatedAt': now,
        'photo': {'state': STREAM_INITIAL_STATES['photo'], 'version': 0},
        'video': {'state': STREAM_INITIAL_STATES['video'], 'version': 0},
        'intakeSummary': intake_summary,
        'aiSummary': ai_summary,
        'initializedBy': actor_uid,
    }

    job_ref_obj.set(job_payload)

    activity_summary = f"Job initialized from {len(approved_submissions)} approved submissions"
    activity_ref(db, org_id, event_id).document().set({
        'at': now,
        'actorUid': actor_uid,
        'actorName': actor_display_name,
        'kind': 'INIT',
        'summary': activity_summary,
    })

    submissions_with_job: Dict[str, Any] = {}
    for submitter_id, submission in submissions_map.items():
        submission_copy = dict(submission or {})
        if _is_submission_approved(submission_copy.get('status')):
            submission_copy['postProdJobId'] = job_ref_obj.id
            submission_copy['postProdLinkedAt'] = now
        submissions_with_job[submitter_id] = submission_copy

    event_updates = {
        'postProduction.stage': POST_PROD_STAGE_JOB_CREATED,
        'postProduction.jobCreatedAt': now,
        'postProduction.jobCreatedBy': actor_uid,
        'postProduction.jobId': job_ref_obj.id,
        'postProduction.assignmentStatus': 'PENDING_ASSIGNMENT',
        'postProduction.lastJobInitAt': now,
        'postProduction.lastJobInitBy': actor_uid,
        'postProduction.readyAt': post_prod_meta.get('readyAt') or now,
        'postProduction.approvalSummary': approval_summary,
        'dataIntake.submissions': submissions_with_job,
        'dataIntake.postProdJobId': job_ref_obj.id,
        'updatedAt': now,
    }

    root_event_ref.update(event_updates)
    if event_ref.path != root_event_ref.path:
        event_ref.update(event_updates)

    return {
        'created': True,
        'job': job_payload,
        'eventUpdates': event_updates,
        'stage': POST_PROD_STAGE_JOB_CREATED,
        'approvalSummary': approval_summary,
        'intakeSummary': intake_summary,
    }
