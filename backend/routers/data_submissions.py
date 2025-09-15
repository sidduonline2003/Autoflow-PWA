from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import datetime
import uuid

from backend.dependencies import get_current_user


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
    clients_ref = db.collection('organizations', org_id, 'clients')
    for client_doc in clients_ref.stream():
        ev_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events').document(event_id)
        ev_snap = ev_ref.get()
        if ev_snap.exists:
            return ev_ref, client_doc.id, ev_snap
    return None, None, None

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

class StorageLocation(BaseModel):
    room: str
    shelf: str
    bin: str

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
        "status": "PENDING",
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc),
        "approvedBy": None,
        "approvedAt": None,
        "confirmedBy": None,
        "confirmedAt": None,
        "storageMediumId": None,
        "storageLocation": {},
        "dmNotes": ""
    }

    batch_ref = db.collection('organizations', org_id, 'dataBatches').document()
    batch_data["id"] = batch_ref.id
    batch_ref.set(batch_data)

    # Update event's intake stats and intake badge info
    event_ref.update({
        "intakeStats.batchesReceived": firestore.Increment(1),
        "intakeStats.lastBatchDate": batch.physicalHandoverDate,
        "intakeStats.pendingApproval": firestore.Increment(1),
        "dataIntake.status": "PENDING",
        "dataIntake.lastSubmittedBy": user_id,
        "dataIntake.lastSubmittedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })

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
    try:
        pending_batches = []
        
        # Get PENDING batches
        pending_query = db.collection('organizations', org_id, 'dataBatches').where(
            filter=firestore.FieldFilter('status', '==', 'PENDING')
        ).limit(25)
        
        for doc in pending_query.stream():
            batch_data = doc.to_dict()
            pending_batches.append(batch_data)
        
        # Get SUBMITTED batches
        submitted_query = db.collection('organizations', org_id, 'dataBatches').where(
            filter=firestore.FieldFilter('status', '==', 'SUBMITTED')
        ).limit(25)
        
        for doc in submitted_query.stream():
            batch_data = doc.to_dict()
            pending_batches.append(batch_data)
        
        # Sort by createdAt in Python instead of Firestore
        pending_batches.sort(key=lambda x: x.get('createdAt', datetime.datetime.min), reverse=False)
        
        return {"pendingBatches": pending_batches}
    
    except Exception as e:
        # Return empty result instead of 500 error
        return {"pendingBatches": [], "error": f"Could not fetch pending batches: {str(e)}"}

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

        update_data.update({
            "status": "CONFIRMED",
            "confirmedBy": user_id,
            "confirmedAt": datetime.datetime.now(datetime.timezone.utc),
            "storageMediumId": approval.storageMediumId,
            "storageLocation": approval.storageLocation.dict() if approval.storageLocation else {},
            "dmNotes": approval.notes
        })

        # Update event intake stats
        event_ref = db.collection('organizations', org_id, 'clients', batch_data['clientId'], 'events').document(batch_data['eventId'])
        event_snap = event_ref.get()
        if event_snap.exists:
            event_ref.update({
                "intakeStats.confirmedBatches": firestore.Increment(1),
                "intakeStats.pendingApproval": firestore.Increment(-1),
                "dataIntake.status": "APPROVED",
                "dataIntake.lastApprovedAt": datetime.datetime.now(datetime.timezone.utc),
                "updatedAt": datetime.datetime.now(datetime.timezone.utc)
            })

            # Check if all required data is now confirmed
            event_data = event_snap.to_dict()
            stats = event_data.get('intakeStats', {})
            confirmed = stats.get('confirmedBatches', 0) + 1  # we just incremented
            waived = stats.get('waivedBatches', 0)
            required = stats.get('requiredBatches', 0)

            if confirmed + waived >= required:
                event_ref.update({
                    "status": "DATA_INTAKE_COMPLETE",
                    "intakeStats.completedAt": datetime.datetime.now(datetime.timezone.utc),
                    "postProduction.triggered": True,
                    "postProduction.triggeredAt": datetime.datetime.now(datetime.timezone.utc)
                })
        
    elif approval.action == "reject":
        if not approval.rejectionReason:
            raise HTTPException(status_code=400, detail="Rejection reason required")
        
        update_data.update({
            "status": "REJECTED",
            "rejectedBy": user_id,
            "rejectedAt": datetime.datetime.now(datetime.timezone.utc),
            "rejectionReason": approval.rejectionReason,
            "dmNotes": approval.notes
        })
        
        # Update event stats
        event_ref = db.collection('organizations', org_id, 'clients', batch_data['clientId'], 'events').document(batch_data['eventId'])
        event_snap = event_ref.get()
        if event_snap.exists:
            event_ref.update({
                "intakeStats.rejectedBatches": firestore.Increment(1),
                "intakeStats.pendingApproval": firestore.Increment(-1),
                "updatedAt": datetime.datetime.now(datetime.timezone.utc)
            })
    
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
        # Get batch statistics - simplified to avoid index requirements
        batches_ref = db.collection('organizations', org_id, 'dataBatches')
        
        # Count by status using simple queries
        pending_count = 0
        confirmed_count = 0
        rejected_count = 0
        
        try:
            pending_docs = list(batches_ref.where(filter=firestore.FieldFilter('status', '==', 'PENDING')).limit(100).stream())
            pending_count = len(pending_docs)
        except:
            pending_count = 0
            
        try:
            confirmed_docs = list(batches_ref.where(filter=firestore.FieldFilter('status', '==', 'CONFIRMED')).limit(100).stream())
            confirmed_count = len(confirmed_docs)
        except:
            confirmed_count = 0
            
        try:
            rejected_docs = list(batches_ref.where(filter=firestore.FieldFilter('status', '==', 'REJECTED')).limit(100).stream())
            rejected_count = len(rejected_docs)
        except:
            rejected_count = 0
        
        # Get recent activity without ordering (to avoid index requirement)
        recent_batches = []
        try:
            all_batches = []
            for doc in batches_ref.limit(50).stream():
                batch_data = doc.to_dict()
                all_batches.append(batch_data)
            
            # Sort in Python instead of Firestore
            all_batches.sort(key=lambda x: x.get('updatedAt', datetime.datetime.min), reverse=True)
            recent_batches = all_batches[:10]
        except:
            recent_batches = []
        
        # Remove problematic collection_group query
        events_needing_attention = []
        
        return {
            "stats": {
                "pendingBatches": pending_count,
                "confirmedBatches": confirmed_count,
                "rejectedBatches": rejected_count,
                "totalBatches": pending_count + confirmed_count + rejected_count
            },
            "recentActivity": recent_batches,
            "eventsNeedingAttention": events_needing_attention
        }
    
    except Exception as e:
        # Return safe fallback data instead of 500 error
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
