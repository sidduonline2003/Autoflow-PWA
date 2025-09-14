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
    
    # Find event across all clients
    event_query = db.collection_group('events').where('__name__', '==', batch.eventId).limit(1)
    event_docs = list(event_query.stream())
    
    if not event_docs:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_doc = event_docs[0]
    event_data = event_doc.to_dict()
    
    # Check if user is assigned to this event
    assigned_crew = event_data.get('assignedCrew', [])
    user_assigned = any(crew.get('userId') == user_id for crew in assigned_crew)
    
    if not user_assigned:
        raise HTTPException(status_code=403, detail="You are not assigned to this event")
    
    # Extract client_id from path
    path_parts = event_doc.reference.path.split('/')
    client_id = path_parts[3]
    
    # Create batch document
    batch_ref = db.collection('organizations', org_id, 'dataBatches').document()
    batch_id = batch_ref.id
    
    batch_data = {
        "id": batch_id,
        "eventId": batch.eventId,
        "eventName": event_data.get("name", "Unknown Event"),
        "clientId": client_id,
        "clientName": event_data.get("clientName", "Unknown Client"),
        "submittedBy": user_id,
        "submittedByName": batch.submittedByName,
        "physicalHandoverDate": batch.physicalHandoverDate,
        "storageDevices": batch.storageDevices,
        "notes": batch.notes,
        "totalDevices": batch.totalDevices,
        "estimatedDataSize": batch.estimatedDataSize,
        "status": "PENDING",
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc),
        # DM approval fields
        "approvedBy": None,
        "approvedAt": None,
        "confirmedBy": None,
        "confirmedAt": None,
        "storageMediumId": None,
        "storageLocation": {},
        "dmNotes": ""
    }
    
    batch_ref.set(batch_data)
    
    # Update event's intake stats
    event_doc.reference.update({
        "intakeStats.batchesReceived": firestore.Increment(1),
        "intakeStats.lastBatchDate": batch.physicalHandoverDate,
        "intakeStats.pendingApproval": firestore.Increment(1),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {
        "status": "success",
        "batchId": batch_id,
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
    batches_query = db.collection('organizations', org_id, 'dataBatches').where(
        'submittedBy', '==', user_id
    ).order_by('createdAt', direction=firestore.Query.DESCENDING)
    
    batches = []
    for doc in batches_query.stream():
        batch_data = doc.to_dict()
        batches.append(batch_data)
    
    return {"batches": batches}

@router.get("/events/{event_id}/batches")
async def get_event_batches(
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all data batches for a specific event"""
    org_id = current_user.get("orgId")
    
    db = firestore.client()
    batches_query = db.collection('organizations', org_id, 'dataBatches').where(
        'eventId', '==', event_id
    ).order_by('createdAt', direction=firestore.Query.DESCENDING)
    
    batches = []
    for doc in batches_query.stream():
        batch_data = doc.to_dict()
        batches.append(batch_data)
    
    return {"batches": batches}

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
    
    # Get pending batches
    pending_query = db.collection('organizations', org_id, 'dataBatches').where(
        'status', 'in', ['PENDING', 'SUBMITTED']
    ).order_by('createdAt', direction=firestore.Query.ASCENDING)
    
    pending_batches = []
    for doc in pending_query.stream():
        batch_data = doc.to_dict()
        pending_batches.append(batch_data)
    
    return {"pendingBatches": pending_batches}

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
            "storageLocation": approval.storageLocation,
            "dmNotes": approval.notes
        })
        
        # Update event intake stats
        event_ref = db.collection_group('events').where('__name__', '==', batch_data['eventId']).limit(1)
        event_docs = list(event_ref.stream())
        if event_docs:
            event_doc = event_docs[0]
            event_doc.reference.update({
                "intakeStats.confirmedBatches": firestore.Increment(1),
                "intakeStats.pendingApproval": firestore.Increment(-1),
                "updatedAt": datetime.datetime.now(datetime.timezone.utc)
            })
            
            # Check if all required data is now confirmed
            event_data = event_doc.get().to_dict()
            stats = event_data.get('intakeStats', {})
            confirmed = stats.get('confirmedBatches', 0)
            waived = stats.get('waivedBatches', 0)
            required = stats.get('requiredBatches', 0)
            
            if confirmed + waived >= required:
                # Mark data intake complete and trigger post-prod (idempotent)
                event_doc.reference.update({
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
        event_ref = db.collection_group('events').where('__name__', '==', batch_data['eventId']).limit(1)
        event_docs = list(event_ref.stream())
        if event_docs:
            event_doc = event_docs[0]
            event_doc.reference.update({
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
    
    # Get available storage media
    storage_query = db.collection('organizations', org_id, 'storageMedia').where(
        'status', '==', 'available'
    ).order_by('room').order_by('shelf').order_by('bin')
    
    storage_media = []
    for doc in storage_query.stream():
        media_data = doc.to_dict()
        media_data['id'] = doc.id
        storage_media.append(media_data)
    
    return {"storageMedia": storage_media}

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
    
    # Get batch statistics
    batches_ref = db.collection('organizations', org_id, 'dataBatches')
    
    # Count by status
    pending_count = len(list(batches_ref.where('status', '==', 'PENDING').stream()))
    confirmed_count = len(list(batches_ref.where('status', '==', 'CONFIRMED').stream()))
    rejected_count = len(list(batches_ref.where('status', '==', 'REJECTED').stream()))
    
    # Get recent activity
    recent_batches = []
    recent_query = batches_ref.order_by('updatedAt', direction=firestore.Query.DESCENDING).limit(10)
    for doc in recent_query.stream():
        batch_data = doc.to_dict()
        recent_batches.append(batch_data)
    
    # Get events needing attention
    events_query = db.collection_group('events').where('status', '==', 'DATA_INTAKE_PENDING')
    events_needing_attention = []
    for doc in events_query.stream():
        event_data = doc.to_dict()
        if event_data.get('orgId') == org_id:  # Filter by org
            events_needing_attention.append(event_data)
    
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
    query = db.collection('organizations', org_id, 'dataSubmissions').where('status', '==', 'pending')
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
    
    query = db.collection('organizations', org_id, 'dataSubmissions').where('submittedBy', '==', uid)
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
    
    # Get legacy submissions
    if status and status.lower() != 'all':
        query = db.collection('organizations', org_id, 'dataSubmissions').where('status', '==', status.lower())
    else:
        query = db.collection('organizations', org_id, 'dataSubmissions')
    
    query = query.order_by('submittedAt', direction=firestore.Query.DESCENDING)
    
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
    query = db.collection('organizations', org_id, 'dataSubmissions').where('eventId', '==', event_id).where('clientId', '==', client_id)
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
