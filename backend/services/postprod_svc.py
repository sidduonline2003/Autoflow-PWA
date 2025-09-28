import datetime
from firebase_admin import firestore
from typing import Dict, Optional, Tuple

POST_PROD_STAGE_DATA_COLLECTION = "DATA_COLLECTION"
POST_PROD_STAGE_READY_FOR_JOB = "READY_FOR_JOB"
POST_PROD_STAGE_JOB_CREATED = "JOB_CREATED"

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
    """Legacy helper retained for compatibility. Ensures root mirror/doc metadata exists."""
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
    post_prod_map = event_data.get('postProduction') or {}
    updates = {}

    if not post_prod_map.get('stage'):
        updates['postProduction.stage'] = POST_PROD_STAGE_DATA_COLLECTION
    if 'initializedAt' not in (post_prod_map or {}):
        updates['postProduction.initializedAt'] = datetime.datetime.now(datetime.timezone.utc)

    if updates:
        root_event_ref.update(updates)
        if client_id:
            event_ref.update(updates)

    return {
        "created": False,
        "manualInitRequired": True,
        "stage": (post_prod_map.get('stage') or POST_PROD_STAGE_DATA_COLLECTION)
    }
