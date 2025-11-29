"""
Events Router - Event management and team assignments
This is a comprehensive router handling events, assignments, and AI suggestions
"""

import datetime
import json
import logging
import os
import re
import traceback
from typing import Dict, List, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore
from pydantic import BaseModel

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user
from shared.firebase_client import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events", tags=["Event Management"])


# --- Constants ---
POST_PRODUCTION_STATUSES = [
    "SHOOT_COMPLETE", "AI_EDITOR_ASSIGNMENT", "EDITING_PENDING",
    "EDITING_IN_PROGRESS", "EDITING_REVIEW", "REVISION_NEEDED",
    "UPLOAD_PENDING", "CLIENT_READY"
]

ALLOWED_EVENT_STATUSES = [
    "UPCOMING", "IN_PROGRESS", "COMPLETED", "POST_PRODUCTION",
    "DELIVERED", "ON_HOLD", "CANCELLED"
] + POST_PRODUCTION_STATUSES


# --- Pydantic Models ---
class EventRequest(BaseModel):
    name: str
    date: str
    time: str
    venue: str
    eventType: str
    requiredSkills: List[str]
    priority: str
    estimatedDuration: int
    expectedPhotos: int
    specialRequirements: str | None = None


class EventAssignmentRequest(BaseModel):
    team: List[dict]


class EventStatusRequest(BaseModel):
    status: str


class ManualAssignmentRequest(BaseModel):
    userId: str
    role: str


class PostProductionTask(BaseModel):
    eventId: str
    primaryEditor: Optional[str] = None
    secondaryEditor: Optional[str] = None
    uploader: Optional[str] = None
    estimatedCompletionDate: Optional[str] = None
    specialInstructions: Optional[str] = None


class EditorAssignmentRequest(BaseModel):
    primaryEditor: str
    secondaryEditor: Optional[str] = None
    uploader: str
    estimatedHours: Optional[float] = None
    notes: Optional[str] = None


class TaskUpdateRequest(BaseModel):
    status: str
    notes: Optional[str] = None
    timeSpent: Optional[float] = None
    completionPercentage: Optional[int] = None


# --- Helper Functions ---
def get_openrouter_suggestion(prompt_text):
    """Get AI suggestion from OpenRouter"""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        return {"reasoning": "AI not configured", "suggestions": []}
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "google/gemma-3-4b-it:free",
        "messages": [{"role": "user", "content": prompt_text}]
    }
    
    try:
        response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data, timeout=30)
        response.raise_for_status()
        
        response_data = response.json()
        content = response_data["choices"][0]["message"]["content"]
        
        # Clean up markdown code blocks
        patterns = [
            r'```json\s*\n([\s\S]+?)\n\s*```',
            r'```json([\s\S]+?)```',
            r'```\s*\n([\s\S]+?)\n\s*```',
            r'```([\s\S]+?)```'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, content)
            if match:
                content = match.group(1).strip()
                break
        
        return json.loads(content)
    except Exception as e:
        logger.error(f"AI suggestion error: {e}")
        return {"reasoning": "AI temporarily unavailable", "suggestions": []}


def generate_rule_based_suggestion(event_data, available_team):
    """Generate team suggestions using rule-based logic"""
    required_skills = event_data.get('requiredSkills', [])
    priority = event_data.get('priority', 'Medium')
    
    suggestions = []
    reasoning_parts = []
    
    # Sort team by workload and skills match
    def score_member(member):
        workload_score = -member.get('currentWorkload', 0)
        skill_match_score = len(set(member.get('skills', [])) & set(required_skills)) * 10
        return workload_score + skill_match_score
    
    sorted_team = sorted(available_team, key=score_member, reverse=True)
    
    # Determine team size based on priority
    team_size = {"High": 3, "Medium": 2, "Low": 1}.get(priority, 2)
    team_size = min(team_size, len(sorted_team))
    
    for i, member in enumerate(sorted_team[:team_size]):
        role = "Lead Photographer" if i == 0 else "Assistant"
        suggestions.append({
            "userId": member.get("id"),
            "name": member.get("name"),
            "role": role,
            "confidence": 80 - (i * 5),
            "matchingSkills": list(set(member.get('skills', [])) & set(required_skills))
        })
    
    return {
        "reasoning": f"Selected {len(suggestions)} team members based on skills and availability",
        "suggestions": suggestions
    }


# --- Event CRUD ---
@router.post("/")
async def create_event(event_data: EventRequest, current_user: dict = Depends(get_current_user)):
    """Create a new event"""
    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")
    
    db = get_db()
    event_ref = db.collection('organizations', org_id, 'events').document()
    
    event_dict = event_data.dict()
    event_dict.update({
        "id": event_ref.id,
        "status": "UPCOMING",
        "createdBy": current_user.get("uid"),
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc),
        "team": []
    })
    
    event_ref.set(event_dict)
    
    return {"status": "success", "eventId": event_ref.id}


@router.get("/")
async def list_events(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all events, optionally filtered by status"""
    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")
    
    db = get_db()
    events_ref = db.collection('organizations', org_id, 'events')
    
    if status:
        events_ref = events_ref.where('status', '==', status)
    
    events = []
    for doc in events_ref.stream():
        event_data = doc.to_dict()
        event_data['id'] = doc.id
        events.append(event_data)
    
    return events


# IMPORTANT: This must come BEFORE /{event_id} routes to avoid path conflicts
@router.get("/assigned-to-me")
async def get_assigned_events(current_user: dict = Depends(get_current_user)):
    """Get events assigned to the current user"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    try:
        db = get_db()
        assigned_events = []
        
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = clients_ref.stream()
        
        for client_doc in clients:
            client_id = client_doc.id
            client_data = client_doc.to_dict()
            events_ref = db.collection('organizations', org_id, 'clients', client_id, 'events')
            events = events_ref.stream()
            
            for event_doc in events:
                event_data = event_doc.to_dict()
                assigned_crew = event_data.get('assignedCrew', [])
                
                # Check if current user is assigned to this event
                is_assigned = any(member.get('userId') == user_id for member in assigned_crew)
                
                if is_assigned:
                    user_role = next(
                        (member.get('role') for member in assigned_crew if member.get('userId') == user_id),
                        'Team Member'
                    )
                    intake_stats = event_data.get('intakeStats') or {}
                    data_intake = event_data.get('dataIntake') or {}
                    
                    event_info = {
                        "id": event_doc.id,
                        "clientId": client_id,
                        "clientName": client_data.get('profile', {}).get('name', 'Unknown Client'),
                        "name": event_data.get('name'),
                        "date": event_data.get('date'),
                        "time": event_data.get('time'),
                        "venue": event_data.get('venue'),
                        "eventType": event_data.get('eventType'),
                        "status": event_data.get('status'),
                        "priority": event_data.get('priority'),
                        "estimatedDuration": event_data.get('estimatedDuration'),
                        "userRole": user_role,
                        "assignedCrew": assigned_crew,
                        "createdAt": event_data.get('createdAt'),
                        "updatedAt": event_data.get('updatedAt'),
                        "deliverableSubmitted": event_data.get('deliverableSubmitted', False),
                        "deliverableSubmittedAt": event_data.get('deliverableSubmittedAt'),
                        "deliverableStatus": event_data.get('deliverableStatus'),
                        "deliverablePendingBatchId": event_data.get('deliverablePendingBatchId'),
                        "deliverableBatchId": event_data.get('deliverableBatchId'),
                        "deliverableSubmission": event_data.get('deliverableSubmission'),
                        "dataIntakeStatus": data_intake.get('status'),
                        "dataIntakePending": bool(intake_stats.get('pendingApproval')),
                        "dataIntake": data_intake,
                        "intakeStats": intake_stats,
                        "postProduction": event_data.get('postProduction')
                    }
                    assigned_events.append(event_info)
        
        assigned_events.sort(key=lambda x: x.get('date', ''))
        
        return {
            "assignedEvents": assigned_events,
            "totalCount": len(assigned_events)
        }
    except Exception as e:
        logger.error(f"Failed to get assigned events: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get assigned events: {str(e)}")


@router.get("/{event_id}")
async def get_event(event_id: str, current_user: dict = Depends(get_current_user)):
    """Get a specific event"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    event_doc = event_ref.get()
    
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_data = event_doc.to_dict()
    event_data['id'] = event_doc.id
    
    return event_data


@router.put("/{event_id}")
async def update_event(event_id: str, event_data: EventRequest, current_user: dict = Depends(get_current_user)):
    """Update an event"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    event_doc = event_ref.get()
    
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    update_dict = event_data.dict()
    update_dict["updatedAt"] = datetime.datetime.now(datetime.timezone.utc)
    update_dict["updatedBy"] = current_user.get("uid")
    
    event_ref.update(update_dict)
    
    return {"status": "success"}


@router.delete("/{event_id}")
async def delete_event(event_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an event"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = get_db()
    event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    event_doc = event_ref.get()
    
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_ref.delete()
    
    return {"status": "success"}


@router.patch("/{event_id}/status")
async def update_event_status(event_id: str, req: EventStatusRequest, current_user: dict = Depends(get_current_user)):
    """Update event status"""
    org_id = current_user.get("orgId")
    
    if req.status not in ALLOWED_EVENT_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {ALLOWED_EVENT_STATUSES}")
    
    db = get_db()
    event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    event_doc = event_ref.get()
    
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_ref.update({
        "status": req.status,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedBy": current_user.get("uid")
    })
    
    return {"status": "success", "newStatus": req.status}


# --- Team Assignments ---
@router.post("/{event_id}/assignments")
async def assign_team(event_id: str, req: EventAssignmentRequest, current_user: dict = Depends(get_current_user)):
    """Assign team members to an event"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    event_doc = event_ref.get()
    
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_ref.update({
        "team": req.team,
        "assignedAt": datetime.datetime.now(datetime.timezone.utc),
        "assignedBy": current_user.get("uid"),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success"}


@router.post("/{event_id}/manual-assignment")
async def manual_assign(event_id: str, req: ManualAssignmentRequest, current_user: dict = Depends(get_current_user)):
    """Manually assign a single team member"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    event_doc = event_ref.get()
    
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_data = event_doc.to_dict()
    current_team = event_data.get("team", [])
    
    # Check if user already assigned
    for member in current_team:
        if member.get("userId") == req.userId:
            member["role"] = req.role
            break
    else:
        # Add new assignment
        team_ref = db.collection('organizations', org_id, 'team').document(req.userId)
        team_doc = team_ref.get()
        member_name = team_doc.to_dict().get("name", "Unknown") if team_doc.exists else "Unknown"
        
        current_team.append({
            "userId": req.userId,
            "name": member_name,
            "role": req.role,
            "assignedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()
        })
    
    event_ref.update({
        "team": current_team,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "team": current_team}


# --- AI Suggestions ---
@router.get("/{event_id}/suggest-team")
async def suggest_team(event_id: str, current_user: dict = Depends(get_current_user)):
    """Get AI-powered team suggestions for an event"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    
    # Get event
    event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    event_doc = event_ref.get()
    
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_data = event_doc.to_dict()
    
    # Get available team members
    team_ref = db.collection('organizations', org_id, 'team')
    team_members = []
    
    for doc in team_ref.where('availability', '==', True).stream():
        member_data = doc.to_dict()
        member_data['id'] = doc.id
        team_members.append(member_data)
    
    if not team_members:
        return {"reasoning": "No available team members", "suggestions": []}
    
    # Try AI suggestion first, fallback to rule-based
    try:
        prompt = f"""
        Suggest the best team for this event:
        Event: {event_data.get('name')}
        Type: {event_data.get('eventType')}
        Required Skills: {event_data.get('requiredSkills')}
        Priority: {event_data.get('priority')}
        Duration: {event_data.get('estimatedDuration')} hours
        
        Available Team:
        {json.dumps([{
            'id': m.get('id'),
            'name': m.get('name'),
            'skills': m.get('skills'),
            'workload': m.get('currentWorkload', 0)
        } for m in team_members], indent=2)}
        
        Return JSON with: {{"reasoning": "...", "suggestions": [{{"userId": "...", "name": "...", "role": "...", "confidence": 0-100}}]}}
        """
        
        result = get_openrouter_suggestion(prompt)
        if result.get("suggestions"):
            return result
    except Exception as e:
        logger.warning(f"AI suggestion failed: {e}")
    
    # Fallback to rule-based
    return generate_rule_based_suggestion(event_data, team_members)
