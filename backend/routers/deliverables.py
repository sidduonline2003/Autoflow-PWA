from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import Optional
import datetime

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/deliverables",
    tags=["Deliverable Management"],
)

# --- Pydantic Models ---
class DeliverableRequest(BaseModel):
    storageType: str
    deviceInfo: str
    notes: Optional[str] = None
    eventId: str
    eventName: str

class DeliverableSubmissionRequest(BaseModel):
    storageType: str
    deviceInfo: str
    notes: Optional[str] = None
    submittedBy: str
    submittedByName: str

# --- Post-Production Enhanced Deliverable Statuses ---
DELIVERABLE_STATUSES = [
    "awaiting_submission",     # Storage device not yet submitted
    "submitted",              # Storage submitted, ready for post-production
    "in_post_production",     # Being edited/processed
    "editing_assigned",       # Assigned to specific editor
    "editing_in_progress",    # Currently being edited
    "editing_review",         # Ready for review
    "revision_needed",        # Needs changes
    "upload_pending",         # Ready for final upload
    "completed"               # Final deliverable ready
]

# Post-Production Status Update Model
class PostProductionStatusUpdate(BaseModel):
    status: str
    notes: Optional[str] = None
    editorId: Optional[str] = None
    editorName: Optional[str] = None
    estimatedCompletion: Optional[str] = None

# --- Deliverable Management Endpoints ---

@router.post("/events/{event_id}/tracking")
async def create_deliverable_tracking(
    event_id: str, 
    client_id: str, 
    req: DeliverableRequest, 
    current_user: dict = Depends(get_current_user)
):
    """Create deliverable tracking for an event - called from client workspace"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    
    # Create deliverable tracking in client's deliverables subcollection
    deliverable_ref = db.collection('organizations', org_id, 'clients', client_id, 'deliverables').document()
    deliverable_ref.set({
        "eventId": req.eventId,
        "eventName": req.eventName,
        "storageType": req.storageType,
        "deviceInfo": req.deviceInfo,
        "notes": req.notes,
        "status": "awaiting_submission",
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "deliverableId": deliverable_ref.id}

@router.post("/events/{event_id}/submit")
async def submit_storage_device(
    event_id: str, 
    req: DeliverableSubmissionRequest, 
    current_user: dict = Depends(get_current_user)
):
    """Submit storage device - called from team member dashboard"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    db = firestore.client()
    
    # Get event details to find client
    event_query = db.collection_group('events').where('__name__', '==', event_id).limit(1)
    event_docs = list(event_query.stream())
    
    if not event_docs:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_doc = event_docs[0]
    event_data = event_doc.to_dict()
    
    # Extract client_id from the event document path
    # Path format: organizations/{orgId}/clients/{clientId}/events/{eventId}
    path_parts = event_doc.reference.path.split('/')
    client_id = path_parts[3]
    
    # Create deliverable submission
    deliverable_ref = db.collection('organizations', org_id, 'clients', client_id, 'deliverables').document()
    deliverable_ref.set({
        "eventId": event_id,
        "eventName": event_data.get("name"),
        "storageType": req.storageType,
        "deviceInfo": req.deviceInfo,
        "notes": req.notes,
        "status": "submitted",
        "submittedBy": req.submittedBy,
        "submittedByName": req.submittedByName,
        "submittedAt": datetime.datetime.now(datetime.timezone.utc),
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    # Update event to mark deliverable as submitted
    event_doc.reference.update({
        "deliverableSubmitted": True,
        "deliverableSubmittedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Storage device submitted successfully"}

@router.put("/{deliverable_id}/finalize")
async def finalize_deliverable_submission(
    deliverable_id: str,
    client_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Mark deliverable as ready for post-production"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    deliverable_ref = db.collection('organizations', org_id, 'clients', client_id, 'deliverables').document(deliverable_id)
    
    deliverable_doc = deliverable_ref.get()
    if not deliverable_doc.exists:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    
    deliverable_ref.update({
        "status": "in_post_production",
        "finalizedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Deliverable moved to post-production"}

# --- Post-Production Integration Endpoints ---

@router.put("/{deliverable_id}/post-production-status")
async def update_deliverable_post_production_status(
    deliverable_id: str,
    client_id: str,
    req: PostProductionStatusUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update deliverable status during post-production workflow"""
    org_id = current_user.get("orgId")
    
    # Allow admins and assigned editors to update status
    if current_user.get("role") != "admin":
        # Check if user is assigned editor for this deliverable
        db = firestore.client()
        deliverable_ref = db.collection('organizations', org_id, 'clients', client_id, 'deliverables').document(deliverable_id)
        deliverable_doc = deliverable_ref.get()
        
        if not deliverable_doc.exists:
            raise HTTPException(status_code=404, detail="Deliverable not found")
        
        deliverable_data = deliverable_doc.to_dict()
        assigned_editor = deliverable_data.get('assignedEditor')
        
        if assigned_editor != current_user.get("uid"):
            raise HTTPException(status_code=403, detail="You are not assigned to this deliverable")
    
    try:
        db = firestore.client()
        deliverable_ref = db.collection('organizations', org_id, 'clients', client_id, 'deliverables').document(deliverable_id)
        
        # Validate status
        if req.status not in DELIVERABLE_STATUSES:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {DELIVERABLE_STATUSES}")
        
        update_data = {
            "status": req.status,
            "updatedAt": datetime.datetime.now(datetime.timezone.utc),
            "lastUpdatedBy": current_user.get("uid"),
            "lastUpdatedByName": current_user.get("name", "Unknown")
        }
        
        if req.notes:
            update_data["statusNotes"] = req.notes
        
        if req.editorId and req.editorName:
            update_data.update({
                "assignedEditor": req.editorId,
                "assignedEditorName": req.editorName,
                "assignedAt": datetime.datetime.now(datetime.timezone.utc)
            })
        
        if req.estimatedCompletion:
            update_data["estimatedCompletion"] = req.estimatedCompletion
        
        # Track status history
        deliverable_doc = deliverable_ref.get()
        if deliverable_doc.exists:
            current_data = deliverable_doc.to_dict()
            status_history = current_data.get('statusHistory', [])
            status_history.append({
                "status": req.status,
                "timestamp": datetime.datetime.now(datetime.timezone.utc),
                "updatedBy": current_user.get("name", "Unknown"),
                "notes": req.notes
            })
            update_data["statusHistory"] = status_history
        
        deliverable_ref.update(update_data)
        
        return {
            "status": "success",
            "message": f"Deliverable status updated to {req.status}",
            "currentStatus": req.status
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update deliverable status: {str(e)}")

@router.get("/post-production/dashboard")
async def get_post_production_deliverables_dashboard(current_user: dict = Depends(get_current_user)):
    """Get dashboard view of all deliverables in post-production"""
    org_id = current_user.get("orgId")
    
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Get all deliverables across all clients that are in post-production
        post_production_statuses = [
            "in_post_production", "editing_assigned", "editing_in_progress", 
            "editing_review", "revision_needed", "upload_pending"
        ]
        
        all_deliverables = []
        clients_ref = db.collection('organizations', org_id, 'clients')
        
        for client_doc in clients_ref.stream():
            client_data = client_doc.to_dict()
            client_name = client_data.get('profile', {}).get('name', 'Unknown Client')
            
            deliverables_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'deliverables')
            deliverables = deliverables_ref.where('status', 'in', post_production_statuses).stream()
            
            for deliverable_doc in deliverables:
                deliverable_data = deliverable_doc.to_dict()
                deliverable_info = {
                    "deliverableId": deliverable_doc.id,
                    "clientId": client_doc.id,
                    "clientName": client_name,
                    "eventId": deliverable_data.get('eventId'),
                    "eventName": deliverable_data.get('eventName'),
                    "status": deliverable_data.get('status'),
                    "assignedEditor": deliverable_data.get('assignedEditorName'),
                    "submittedAt": deliverable_data.get('submittedAt'),
                    "estimatedCompletion": deliverable_data.get('estimatedCompletion'),
                    "statusNotes": deliverable_data.get('statusNotes'),
                    "updatedAt": deliverable_data.get('updatedAt')
                }
                all_deliverables.append(deliverable_info)
        
        # Sort by priority (status-based) and date
        status_priority = {
            'revision_needed': 1,
            'editing_in_progress': 2,
            'editing_assigned': 3,
            'in_post_production': 4,
            'editing_review': 5,
            'upload_pending': 6
        }
        
        all_deliverables.sort(key=lambda x: (
            status_priority.get(x['status'], 99),
            x.get('submittedAt') or datetime.datetime.min
        ))
        
        # Calculate summary
        summary = {
            "totalInPostProduction": len(all_deliverables),
            "byStatus": {}
        }
        
        for status in post_production_statuses:
            count = len([d for d in all_deliverables if d['status'] == status])
            summary["byStatus"][status] = count
        
        return {
            "summary": summary,
            "deliverables": all_deliverables
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get post-production dashboard: {str(e)}")

@router.get("/my-editing-assignments")
async def get_my_editing_assignments(current_user: dict = Depends(get_current_user)):
    """Get deliverables assigned to current user for editing"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    try:
        db = firestore.client()
        
        my_assignments = []
        clients_ref = db.collection('organizations', org_id, 'clients')
        
        for client_doc in clients_ref.stream():
            client_data = client_doc.to_dict()
            client_name = client_data.get('profile', {}).get('name', 'Unknown Client')
            
            deliverables_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'deliverables')
            assigned_deliverables = deliverables_ref.where('assignedEditor', '==', user_id).stream()
            
            for deliverable_doc in assigned_deliverables:
                deliverable_data = deliverable_doc.to_dict()
                assignment_info = {
                    "deliverableId": deliverable_doc.id,
                    "clientId": client_doc.id,
                    "clientName": client_name,
                    "eventId": deliverable_data.get('eventId'),
                    "eventName": deliverable_data.get('eventName'),
                    "status": deliverable_data.get('status'),
                    "storageType": deliverable_data.get('storageType'),
                    "deviceInfo": deliverable_data.get('deviceInfo'),
                    "submittedAt": deliverable_data.get('submittedAt'),
                    "assignedAt": deliverable_data.get('assignedAt'),
                    "estimatedCompletion": deliverable_data.get('estimatedCompletion'),
                    "statusNotes": deliverable_data.get('statusNotes'),
                    "canEdit": deliverable_data.get('status') in ['editing_assigned', 'editing_in_progress', 'revision_needed']
                }
                my_assignments.append(assignment_info)
        
        # Sort by priority
        status_priority = {
            'revision_needed': 1,
            'editing_in_progress': 2,
            'editing_assigned': 3,
            'editing_review': 4,
            'upload_pending': 5,
            'completed': 6
        }
        
        my_assignments.sort(key=lambda x: (
            status_priority.get(x['status'], 99),
            x.get('assignedAt') or datetime.datetime.min
        ))
        
        return {
            "myAssignments": my_assignments,
            "totalAssignments": len(my_assignments),
            "pendingCount": len([a for a in my_assignments if a['status'] in ['editing_assigned', 'revision_needed']]),
            "inProgressCount": len([a for a in my_assignments if a['status'] == 'editing_in_progress']),
            "completedCount": len([a for a in my_assignments if a['status'] in ['completed', 'upload_pending']])
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get editing assignments: {str(e)}")
