import datetime
from firebase_admin import firestore
from typing import Dict, Optional, Tuple

POSTPROD_INIT_STATUS = "POST_PRODUCTION_INIT"

# Helper: get a firestore client from either module or client
_def = object()

def _get_client(db_like):
    try:
        # If a module was passed (firebase_admin.firestore), get a client
        return db_like.client()
    except Exception:
        # Assume it's already a client
        return db_like

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

async def start_postprod_if_ready(db_like, org_id: str, event_id: str) -> Dict[str, bool]:
    """
    If intake for this event is COMPLETE and no postprodJob doc exists, create it.
    Prefer root path: organizations/{orgId}/events/{eventId}/postprodJob/job
    If event exists only under clients/{clientId}/events/{eventId}, create a mirror in root and then create job under the mirror.
    Idempotent.
    """
    if not org_id or not event_id:
        return {"created": False}

    db = _get_client(db_like)

    # Find the event (root or nested under clients)
    event_ref, client_id = await find_event_ref(db, org_id, event_id)
    if not event_ref:
        return {"created": False}

    # Ensure we operate under a root mirror
    root_event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    if not root_event_ref.get().exists:
        root_event_ref = await ensure_root_event_mirror(db, org_id, event_ref, client_id)

    event_doc = root_event_ref.get()
    event_data = event_doc.to_dict() or {}

    # Check intake status on event document (consider legacy and new fields)
    intake_map = event_data.get('intake') or {}
    data_intake_map = event_data.get('dataIntake') or {}
    intake_status = intake_map.get('status') or event_data.get('intakeStatus') or data_intake_map.get('status')
    allowed_complete = { 'DATA_INTAKE_COMPLETE', 'APPROVED', 'CONFIRMED', 'COMPLETE' }
    if intake_status not in allowed_complete:
        return {"created": False}

    job_ref = root_event_ref.collection('postprodJob').document('job')

    def _create_if_absent(transaction: firestore.Transaction):
        snap = job_ref.get(transaction=transaction)
        if snap.exists:
            return False
        transaction.set(job_ref, {
            'status': POSTPROD_INIT_STATUS,
            'waived': {'photo': False, 'video': False},
            'photo': {'state': None, 'version': 0},
            'video': {'state': None, 'version': 0},
            'updatedAt': firestore.SERVER_TIMESTAMP
        })
        return True

    transaction = db.transaction()
    @firestore.transactional
    def run_txn(transaction):
        return _create_if_absent(transaction)
    created = run_txn(transaction)
    return {"created": created}
