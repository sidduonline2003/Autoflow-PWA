"""
Intake Router - Data intake and submission management
"""

import datetime
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user
from shared.firebase_client import get_db

router = APIRouter(prefix="/intake", tags=["Data Intake"])


class DataSubmission(BaseModel):
    eventId: str
    deviceCount: int
    estimatedDataSize: str
    storageAssignment: Optional[Dict[str, Any]] = None
    handoffReference: Optional[str] = None
    notes: Optional[str] = None


class SubmissionApproval(BaseModel):
    status: str  # "approved" or "rejected"
    notes: Optional[str] = None


@router.post("/submit")
async def submit_data(req: DataSubmission, current_user: dict = Depends(get_current_user)):
    """Submit data intake for an event"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = get_db()
    event_ref = db.collection('organizations', org_id, 'events').document(req.eventId)
    event_doc = event_ref.get()
    
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    # Create or update dataIntake
    submission_id = f"sub_{user_id}_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    event_ref.update({
        f"dataIntake.submissions.{user_id}": {
            "submissionId": submission_id,
            "submittedBy": user_id,
            "submittedByName": current_user.get("name", ""),
            "deviceCount": req.deviceCount,
            "estimatedDataSize": req.estimatedDataSize,
            "storageAssignment": req.storageAssignment,
            "handoffReference": req.handoffReference,
            "notes": req.notes,
            "status": "pending",
            "submittedAt": datetime.datetime.now(datetime.timezone.utc),
            "updatedAt": datetime.datetime.now(datetime.timezone.utc)
        },
        "dataIntake.updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "submissionId": submission_id}


@router.get("/event/{event_id}")
async def get_event_submissions(event_id: str, current_user: dict = Depends(get_current_user)):
    """Get all data submissions for an event"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    event_doc = event_ref.get()
    
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_data = event_doc.to_dict()
    data_intake = event_data.get("dataIntake", {})
    submissions = data_intake.get("submissions", {})
    
    return {
        "eventId": event_id,
        "submissions": submissions,
        "updatedAt": data_intake.get("updatedAt")
    }


@router.post("/event/{event_id}/approve/{submitter_id}")
async def approve_submission(
    event_id: str,
    submitter_id: str,
    req: SubmissionApproval,
    current_user: dict = Depends(get_current_user)
):
    """Approve or reject a data submission"""
    org_id = current_user.get("orgId")
    
    if current_user.get("role") not in ["admin", "manager", "data_manager"]:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = get_db()
    event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    event_doc = event_ref.get()
    
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_ref.update({
        f"dataIntake.submissions.{submitter_id}.status": req.status,
        f"dataIntake.submissions.{submitter_id}.approvedBy": current_user.get("uid"),
        f"dataIntake.submissions.{submitter_id}.approverName": current_user.get("name", ""),
        f"dataIntake.submissions.{submitter_id}.approvalNotes": req.notes,
        f"dataIntake.submissions.{submitter_id}.approvedAt": datetime.datetime.now(datetime.timezone.utc),
        f"dataIntake.submissions.{submitter_id}.updatedAt": datetime.datetime.now(datetime.timezone.utc),
        "dataIntake.updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "submissionStatus": req.status}


@router.put("/event/{event_id}/storage/{submitter_id}")
async def update_storage_assignment(
    event_id: str,
    submitter_id: str,
    storage: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    """Update storage assignment for a submission"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    event_doc = event_ref.get()
    
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_ref.update({
        f"dataIntake.submissions.{submitter_id}.storageAssignment": storage,
        f"dataIntake.submissions.{submitter_id}.updatedAt": datetime.datetime.now(datetime.timezone.utc),
        "dataIntake.updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success"}
