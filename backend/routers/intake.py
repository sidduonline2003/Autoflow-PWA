from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import Optional
from ..dependencies import get_current_user
from ..services.postprod_svc import start_postprod_if_ready
import datetime

router = APIRouter(prefix="/intake", tags=["Intake"])

class IntakeCompleteRequest(BaseModel):
    eventId: str
    notes: Optional[str] = None

@router.post("/complete")
async def complete_intake(req: IntakeCompleteRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") not in ["admin", "accountant", "teammate"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing org")

    db = firestore.client()
    event_ref = db.collection('organizations', org_id, 'events').document(req.eventId)
    event_doc = event_ref.get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")

    # Mark intake complete (idempotent)
    event_ref.set({
        'intake': {
            'status': 'DATA_INTAKE_COMPLETE',
            'completedAt': datetime.datetime.utcnow().isoformat(),
            'completedBy': current_user.get('uid'),
            'notes': req.notes or ''
        },
        'updatedAt': datetime.datetime.utcnow().isoformat()
    }, merge=True)

    hook_result = await start_postprod_if_ready(firestore, org_id, req.eventId)
    return {"ok": True, "postprod": hook_result}
