import datetime
from firebase_admin import firestore
from typing import Dict

POSTPROD_INIT_STATUS = "POST_PRODUCTION_INIT"

async def start_postprod_if_ready(db, org_id: str, event_id: str) -> Dict[str, bool]:
    """
    If intake for this event is COMPLETE and no postprodJob doc exists, create it.
    Path convention (collection alternating rule): organizations/{orgId}/events/{eventId}/postprodJob/job
    We store the single job document with id 'job' inside a subcollection 'postprodJob'.
    Structure:
      status = POST_PRODUCTION_INIT
      waived = {photo: False, video: False}
      photo = { state: None }
      video = { state: None }
      updatedAt = server timestamp
    Returns: {"created": bool}
    Idempotent.
    """
    if not org_id or not event_id:
        return {"created": False}

    event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    event_doc = event_ref.get()
    if not event_doc.exists:
        # Event may be nested under clients; attempt lookup via collection group (fallback best effort)
        # NOTE: For now we silently return if not found.
        return {"created": False}

    # Check intake status on event document (or nested intake.status). We assume an 'intake' map.
    event_data = event_doc.to_dict() or {}
    intake_status = (event_data.get('intake') or {}).get('status') or event_data.get('intakeStatus')
    if intake_status != 'DATA_INTAKE_COMPLETE':
        return {"created": False}

    job_ref = event_ref.collection('postprodJob').document('job')

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
