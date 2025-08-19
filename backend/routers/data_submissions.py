from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
import datetime
from typing import Optional

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/data-submissions",
    tags=["Data Management"],
)

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

@router.post("/submit")
async def submit_data(submission: DataSubmission, current_user: dict = Depends(get_current_user)):
    """Team member submits data after event completion"""
    print(f"Received data submission request from user: {current_user}")
    print(f"Submission data: {submission}")
    
    try:
        org_id = current_user.get("orgId")
        uid = current_user.get("uid")
        print(f"User org_id: {org_id}, uid: {uid}")
        
        if not org_id:
            raise HTTPException(status_code=403, detail="User not part of an organization.")
        
        db = firestore.client()
        
        # Get team member info
        try:
            team_doc = db.collection('organizations', org_id, 'team').document(uid).get()
            user_name = team_doc.to_dict().get('name', 'Unknown') if team_doc.exists else 'Unknown'
            print(f"Found user name: {user_name}")
        except Exception as e:
            print(f"Error getting team member info: {e}")
            user_name = 'Unknown'
        
        # Create data submission record
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
            "status": "pending",  # pending -> processed -> archived
            "submittedAt": datetime.datetime.now(datetime.timezone.utc),
            "processedAt": None,
            "processedBy": None,
            "processingInfo": None
        }
        
        print(f"Creating submission with data: {submission_data}")
        submission_ref.set(submission_data)
        print(f"Successfully created submission with ID: {submission_ref.id}")
        
        return {"status": "success", "message": "Data submitted successfully", "submissionId": submission_ref.id}
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in submit_data: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@router.get("/pending")
async def get_pending_submissions(current_user: dict = Depends(get_current_user)):
    """Data manager gets pending data submissions"""
    org_id = current_user.get("orgId")
    role = current_user.get("role")
    
    if role not in ("admin", "data-manager"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = firestore.client()
    submissions = []
    
    query = db.collection('organizations', org_id, 'dataSubmissions').where('status', '==', 'pending')
    for doc in query.stream():
        data = doc.to_dict()
        
        # Get event info
        try:
            event_doc = db.collection('organizations', org_id, 'clients', data['clientId'], 'events').document(data['eventId']).get()
            event_data = event_doc.to_dict() if event_doc.exists() else {}
            data['eventName'] = event_data.get('name', 'Unknown Event')
            data['eventDate'] = event_data.get('date', 'Unknown Date')
        except:
            data['eventName'] = 'Unknown Event'
            data['eventDate'] = 'Unknown Date'
            
        # Get client info
        try:
            client_doc = db.collection('organizations', org_id, 'clients').document(data['clientId']).get()
            client_data = client_doc.to_dict() if client_doc.exists() else {}
            data['clientName'] = client_data.get('profile', {}).get('name', 'Unknown Client')
        except:
            data['clientName'] = 'Unknown Client'
            
        submissions.append(data)
    
    return submissions

@router.get("/all")
async def get_all_submissions(status: str = None, current_user: dict = Depends(get_current_user)):
    """Data manager gets all data submissions with optional status filter"""
    org_id = current_user.get("orgId")
    role = current_user.get("role")
    
    if role not in ("admin", "data-manager"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = firestore.client()
    submissions = []
    
    # Build query based on status filter
    if status and status.lower() != 'all':
        query = db.collection('organizations', org_id, 'dataSubmissions').where('status', '==', status.lower())
    else:
        query = db.collection('organizations', org_id, 'dataSubmissions')
    
    # Order by submission date (newest first)
    query = query.order_by('submittedAt', direction=firestore.Query.DESCENDING)
    
    for doc in query.stream():
        data = doc.to_dict()
        
        # Get event info
        try:
            event_doc = db.collection('organizations', org_id, 'clients', data['clientId'], 'events').document(data['eventId']).get()
            event_data = event_doc.to_dict() if event_doc.exists() else {}
            data['eventName'] = event_data.get('name', 'Unknown Event')
            data['eventDate'] = event_data.get('date', 'Unknown Date')
        except:
            data['eventName'] = 'Unknown Event'
            data['eventDate'] = 'Unknown Date'
            
        # Get client info
        try:
            client_doc = db.collection('organizations', org_id, 'clients').document(data['clientId']).get()
            client_data = client_doc.to_dict() if client_doc.exists() else {}
            data['clientName'] = client_data.get('profile', {}).get('name', 'Unknown Client')
        except:
            data['clientName'] = 'Unknown Client'
            
        submissions.append(data)
    
    return submissions

@router.put("/{submission_id}/process")
async def process_data_submission(submission_id: str, processing: DataProcessing, current_user: dict = Depends(get_current_user)):
    """Data manager processes submitted data"""
    org_id = current_user.get("orgId")
    role = current_user.get("role")
    uid = current_user.get("uid")
    
    if role not in ("admin", "data-manager"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = firestore.client()
    
    # Get data manager info
    team_doc = db.collection('organizations', org_id, 'team').document(uid).get()
    manager_name = team_doc.to_dict().get('name', 'Unknown') if team_doc.exists else 'Unknown'
    
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
    
    # Update event with data info
    try:
        event_ref = db.collection('organizations', org_id, 'clients', submission_data['clientId'], 'events').document(submission_data['eventId'])
        event_doc = event_ref.get()
        
        if event_doc.exists:
            event_data = event_doc.to_dict()
            data_submissions = event_data.get('dataSubmissions', [])
            
            # Add or update this submission
            submission_info = {
                "submissionId": submission_id,
                "submittedBy": submission_data['submittedBy'],
                "submittedByName": submission_data['submittedByName'],
                "submittedAt": submission_data['submittedAt'],
                "storageType": submission_data['storageType'],
                "deviceInfo": submission_data['deviceInfo'],
                "dataSize": submission_data.get('dataSize'),
                "fileCount": submission_data.get('fileCount'),
                "processedBy": manager_name,
                "processedAt": datetime.datetime.now(datetime.timezone.utc),
                "storageLocation": processing.storageLocation,
                "diskName": processing.diskName,
                "archiveLocation": processing.archiveLocation,
                "processingNotes": processing.processingNotes
            }
            
            # Remove existing entry if any and add new one
            data_submissions = [d for d in data_submissions if d.get('submissionId') != submission_id]
            data_submissions.append(submission_info)
            
            event_ref.update({"dataSubmissions": data_submissions})
    except Exception as e:
        print(f"Error updating event: {e}")
    
    return {"status": "success", "message": "Data submission processed successfully"}

@router.get("/my-submissions")
async def get_my_submissions(current_user: dict = Depends(get_current_user)):
    """Get submissions by current user"""
    org_id = current_user.get("orgId")
    uid = current_user.get("uid")
    
    db = firestore.client()
    submissions = []
    
    query = db.collection('organizations', org_id, 'dataSubmissions').where('submittedBy', '==', uid)
    for doc in query.stream():
        data = doc.to_dict()
        
        # Get event info
        try:
            event_doc = db.collection('organizations', org_id, 'clients', data['clientId'], 'events').document(data['eventId']).get()
            event_data = event_doc.to_dict() if event_doc.exists else {}
            data['eventName'] = event_data.get('name', 'Unknown Event')
        except:
            data['eventName'] = 'Unknown Event'
            
        submissions.append(data)
    
    return submissions

@router.get("/event/{event_id}")
async def get_event_data_submissions(event_id: str, client_id: str, current_user: dict = Depends(get_current_user)):
    """Get all data submissions for a specific event"""
    org_id = current_user.get("orgId")
    role = current_user.get("role")
    
    if role not in ("admin", "client"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    db = firestore.client()
    submissions = []
    
    query = db.collection('organizations', org_id, 'dataSubmissions').where('eventId', '==', event_id).where('clientId', '==', client_id)
    for doc in query.stream():
        submissions.append(doc.to_dict())
    
    return submissions
