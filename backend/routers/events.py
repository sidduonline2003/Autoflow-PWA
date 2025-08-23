from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth, firestore
from pydantic import BaseModel
from typing import List, Optional, Dict
import datetime
import requests
import os
import json
import re
import os

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/events",
    tags=["Event Management"],
)

# --- Post-Production Status Constants ---
POST_PRODUCTION_STATUSES = [
    "SHOOT_COMPLETE",
    "AI_EDITOR_ASSIGNMENT", 
    "EDITING_PENDING",
    "EDITING_IN_PROGRESS",
    "EDITING_REVIEW",
    "REVISION_NEEDED",
    "UPLOAD_PENDING", 
    "CLIENT_READY"
]

ALLOWED_EVENT_STATUSES = [
    "UPCOMING", 
    "IN_PROGRESS", 
    "COMPLETED",
    "POST_PRODUCTION",
    "DELIVERED",
    "ON_HOLD",
    "CANCELLED"
] + POST_PRODUCTION_STATUSES

# --- Pydantic Models ---
class EventRequest(BaseModel): name: str; date: str; time: str; venue: str; eventType: str; requiredSkills: List[str]; priority: str; estimatedDuration: int; expectedPhotos: int; specialRequirements: str | None
class EventAssignmentRequest(BaseModel): team: List[dict]
class EventStatusRequest(BaseModel): status: str
class ManualAssignmentRequest(BaseModel): userId: str; role: str

# Post-Production Models
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

# --- OpenRouter Client Helper ---

# --- OpenRouter Client Helper ---
def get_openrouter_suggestion(prompt_text):
    api_key = os.getenv("OPENROUTER_API_KEY")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "google/gemma-3-4b-it:free",  # Changed model here
        "messages": [{"role": "user", "content": prompt_text}]
    }
    print("OpenRouter request payload:", data)
    response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data)
    try:
        response.raise_for_status()
    except Exception as e:
        print("OpenRouter API error:", response.text)
        print("Status code:", response.status_code)
        raise
    
    response_data = response.json()
    print("OpenRouter response:", response_data)
    content = response_data["choices"][0]["message"]["content"]
    
    # Clean up the content - handle various code block formats
    # Remove markdown code blocks if present
    patterns = [
        r'```json\s*\n([\s\S]+?)\n\s*```',  # ```json with newlines
        r'```json([\s\S]+?)```',             # ```json without newlines
        r'```\s*\n([\s\S]+?)\n\s*```',       # ``` with newlines
        r'```([\s\S]+?)```'                  # ``` without newlines
    ]
    
    for pattern in patterns:
        match = re.search(pattern, content)
        if match:
            content = match.group(1).strip()
            break
    
    try:
        return json.loads(content)
    except Exception as e:
        print("Failed to parse AI response as JSON:", content)
        print("Attempting to extract JSON from content...")
        
        # Try to find JSON object in the content
        json_pattern = r'\{[\s\S]*\}'
        json_match = re.search(json_pattern, content)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except:
                pass
        
        # If all parsing fails, return a fallback response
        return {
            "reasoning": "Failed to parse AI response. Please try again.",
            "suggestions": []
        }

# --- Event Management Endpoints ---
@router.get("/")
async def get_all_events(current_user: dict = Depends(get_current_user)):
    """Get all events for the organization"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role")
    
    if user_role not in ["admin", "accountant", "teammate"] or not org_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    try:
        db = firestore.client()
        events_ref = db.collection('organizations', org_id, 'events')
        events = []
        
        for doc in events_ref.stream():
            event_data = doc.to_dict()
            event_info = {
                "id": doc.id,
                "eventName": event_data.get("eventName", event_data.get("name", "")),
                "date": event_data.get("date", ""),
                "time": event_data.get("time", ""),
                "venue": event_data.get("venue", ""),
                "eventType": event_data.get("eventType", ""),
                "status": event_data.get("status", "UPCOMING"),
                "clientId": event_data.get("clientId", ""),
                "createdAt": event_data.get("createdAt", ""),
            }
            events.append(event_info)
        
        return events
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")

@router.post("/for-client/{client_id}")
async def create_event(client_id: str, req: EventRequest, current_user: dict = Depends(get_current_user)):
    org_id=current_user.get("orgId")
    if not current_user.get("role")=="admin": raise HTTPException(status_code=403,detail="Forbidden")
    db=firestore.client()
    event_ref=db.collection('organizations',org_id,'clients',client_id,'events').document()
    event_ref.set({"name":req.name,"date":req.date,"time":req.time,"venue":req.venue,"eventType":req.eventType,"requiredSkills":req.requiredSkills,"priority":req.priority,"estimatedDuration":req.estimatedDuration,"expectedPhotos":req.expectedPhotos,"specialRequirements":req.specialRequirements,"status":"UPCOMING","assignedCrew":[],"suggestedCrew":[],"createdAt":datetime.datetime.now(datetime.timezone.utc),"updatedAt":datetime.datetime.now(datetime.timezone.utc)})
    return {"status":"success","eventId":event_ref.id}

@router.post("/{event_id}/assign-crew")
async def assign_crew_to_event(event_id: str, client_id: str, req: EventAssignmentRequest, current_user: dict = Depends(get_current_user)):
    org_id=current_user.get("orgId")
    if current_user.get("role")!="admin": raise HTTPException(status_code=403,detail="Forbidden")
    db=firestore.client()
    
    # Get event details first
    event_ref=db.collection('organizations',org_id,'clients',client_id,'events').document(event_id)
    event_doc = event_ref.get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not found")
    
    event_data = event_doc.to_dict()
    event_date = event_data.get('date')
    current_crew = event_data.get('assignedCrew', [])
    
    # Get list of currently assigned user IDs
    currently_assigned_ids = {member['userId'] for member in current_crew}
    
    # Process new team members - add only those not already assigned
    new_members = []
    for member in req.team:
        if member["userId"] not in currently_assigned_ids:
            # Verify that the team member exists
            member_ref = db.collection('organizations', org_id, 'team').document(member["userId"])
            member_doc = member_ref.get()
            if not member_doc.exists:
                raise HTTPException(status_code=404, detail=f"Team member {member.get('name', 'Unknown')} not found")
            
            new_members.append(member)
            
            # Update member workload
            member_ref.update({"currentWorkload":firestore.Increment(1)})
            
            # Add to schedules collection for event assignment
            schedule_ref = db.collection('organizations').document(org_id).collection('schedules').document()
            schedule_ref.set({
                "userId": member["userId"],
                "startDate": event_date,
                "endDate": event_date,
                "type": "event",
                "eventId": event_id,
                "createdAt": datetime.datetime.now(datetime.timezone.utc)
            })
    
    # Combine current crew with new members
    updated_crew = current_crew + new_members
    
    # Update event with combined crew
    event_ref.update({"assignedCrew": updated_crew, "updatedAt": datetime.datetime.now(datetime.timezone.utc)})
    
    message = f"Added {len(new_members)} new team member(s). Total crew: {len(updated_crew)}"
    return {"status":"success","message": message}

@router.get("/{event_id}/suggest-team")
async def suggest_team(event_id: str, client_id: str, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin": raise HTTPException(status_code=403, detail="Forbidden")
    if not os.getenv("OPENROUTER_API_KEY"): raise HTTPException(status_code=500, detail="AI service is not configured.")
    try:
        db = firestore.client()
        event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
        event_doc = event_ref.get()
        if not event_doc.exists: raise HTTPException(status_code=404, detail="Event not found")
        event_data = event_doc.to_dict()
        
        # Query schedules for busy members on event date  
        schedules_ref = db.collection('organizations', org_id, 'schedules')
        busy_query = schedules_ref.where(filter=firestore.FieldFilter('startDate', '<=', event_data['date'])).where(filter=firestore.FieldFilter('endDate', '>=', event_data['date']))
        
        # Filter out schedules from the current event to avoid false conflicts
        busy_user_ids = []
        for doc in busy_query.stream():
            schedule_data = doc.to_dict()
            # Only consider busy if it's NOT from the current event
            if schedule_data.get('eventId') != event_id:
                busy_user_ids.append(schedule_data['userId'])

        # Get currently assigned team members to this event
        assigned_user_ids = []
        if event_data.get('assignedCrew'):
            assigned_user_ids = [member['userId'] for member in event_data['assignedCrew']]

        # Fetch all team members and filter available ones
        team_ref = db.collection('organizations', org_id, 'team')
        team_docs = team_ref.stream()
        available_team = []
        
        for d in team_docs:
            member_data = d.to_dict()
            user_id = d.id
            
            # Skip if already assigned or busy or not available
            if (user_id in busy_user_ids or 
                user_id in assigned_user_ids or 
                not member_data.get('availability', True)):
                continue
                
            available_team.append({
                "userId": user_id,
                "name": member_data.get('name'),
                "skills": member_data.get('skills', []),
                "role": member_data.get('role'),
                "currentWorkload": member_data.get('currentWorkload', 0)
            })

        # Enhanced prompt for better AI suggestions
        prompt_text = f"""You are an expert production manager for a photography/videography studio. Your task is to recommend the optimal team for an upcoming event based on requirements, team skills, and workload.

EVENT DETAILS:
- Event Name: {event_data.get('name')}
- Event Type: {event_data.get('eventType')}
- Date: {event_data.get('date')}
- Priority Level: {event_data.get('priority')} 
- Required Skills: {', '.join(event_data.get('requiredSkills', []))}
- Estimated Duration: {event_data.get('estimatedDuration', 'N/A')} hours
- Expected Photos: {event_data.get('expectedPhotos', 'N/A')}
- Special Requirements: {event_data.get('specialRequirements', 'None')}

AVAILABLE TEAM MEMBERS (only those not busy on event date):
{available_team}

ASSIGNMENT CRITERIA:
1. Match required skills to team member skills
2. Consider current workload (lower is better)
3. Assign appropriate roles based on experience and skills
4. For photography events: consider Lead Photographer, Assistant Photographer roles
5. For videography: consider Director, Camera Operator, Sound Engineer roles
6. Balance team size with event priority (High priority = more crew, Low priority = minimal crew)

RESPONSE FORMAT:
Provide a JSON response with exactly this structure:
{{
  "reasoning": "Brief explanation of your team selection strategy and why these members were chosen",
  "suggestions": [
    {{
      "userId": "exact_userId_from_available_team",
      "name": "exact_name_from_available_team", 
      "role": "specific_role_for_this_event",
      "confidence": 85
    }}
  ]
}}

IMPORTANT: 
- Only suggest members from the available team list provided
- Include the exact userId and name from the available team data
- Confidence should be 70-95 based on skill match and workload
- Suggest 1-4 team members depending on event priority and complexity
- If no team members match the requirements, explain why in reasoning and provide empty suggestions array"""

        ai_response = get_openrouter_suggestion(prompt_text)
        
        # Validate that suggested userIds exist in available team
        if ai_response.get('suggestions'):
            available_user_ids = {member['userId'] for member in available_team}
            valid_suggestions = []
            for suggestion in ai_response['suggestions']:
                if suggestion.get('userId') in available_user_ids:
                    # Ensure we include the skills from our team data
                    team_member = next((m for m in available_team if m['userId'] == suggestion['userId']), None)
                    if team_member:
                        suggestion['skills'] = team_member['skills']
                    valid_suggestions.append(suggestion)
            ai_response['suggestions'] = valid_suggestions
            
            # If no valid suggestions after filtering, provide a helpful message
            if not valid_suggestions:
                ai_response['reasoning'] = "AI suggested team members, but they are no longer available. Please use manual assignment or try again."
        
        return {"ai_suggestions": ai_response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get AI suggestion: {str(e)}")

@router.put("/{event_id}/status")
async def update_event_status(event_id: str, client_id: str, req: EventStatusRequest, current_user: dict = Depends(get_current_user)):
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = firestore.client()
    event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
    
    update_data = {
        "status": req.status,
        "updatedAt": datetime.datetime.now(datetime.timezone.utc)
    }
    
    # Add completion date if status is COMPLETED
    if req.status == "COMPLETED":
        update_data["completedDate"] = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
    
    event_ref.update(update_data)
    
    return {"status": "success", "message": f"Event status updated to {req.status}"}

@router.get("/{event_id}/available-team")
async def get_available_team_members(event_id: str, client_id: str, current_user: dict = Depends(get_current_user)):
    """Get all available team members for manual assignment, excluding those already busy on the event date"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin": 
        raise HTTPException(status_code=403, detail="Forbidden")
    
    try:
        db = firestore.client()
        
        # Get event details
        event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
        event_doc = event_ref.get()
        if not event_doc.exists: 
            raise HTTPException(status_code=404, detail="Event not found")
        event_data = event_doc.to_dict()
        event_date = event_data.get('date')
        
        # Query schedules for busy members on event date (exclude current event)
        schedules_ref = db.collection('organizations', org_id, 'schedules')
        busy_query = schedules_ref.where(filter=firestore.FieldFilter('startDate', '<=', event_date)).where(filter=firestore.FieldFilter('endDate', '>=', event_date))
        
        # Filter out schedules from the current event to avoid false conflicts
        busy_user_ids = []
        for doc in busy_query.stream():
            schedule_data = doc.to_dict()
            # Only consider busy if it's NOT from the current event
            if schedule_data.get('eventId') != event_id:
                busy_user_ids.append(schedule_data['userId'])
        
        # Get currently assigned team members to this event
        assigned_user_ids = []
        if event_data.get('assignedCrew'):
            assigned_user_ids = [member['userId'] for member in event_data['assignedCrew']]
        
        # Fetch all team members
        team_ref = db.collection('organizations', org_id, 'team')
        team_docs = team_ref.stream()
        
        available_members = []
        unavailable_members = []
        
        for doc in team_docs:
            member_data = doc.to_dict()
            member_info = {
                "userId": doc.id,
                "name": member_data.get('name'),
                "email": member_data.get('email'),
                "role": member_data.get('role'),
                "skills": member_data.get('skills', []),
                "availability": member_data.get('availability', True)
            }
            
            if not member_data.get('availability', True):
                # Member is marked as unavailable
                member_info["unavailableReason"] = "Marked as unavailable"
                unavailable_members.append(member_info)
            elif doc.id in busy_user_ids:
                # Member is busy on this date
                member_info["unavailableReason"] = "Already scheduled on this date"
                unavailable_members.append(member_info)
            elif doc.id in assigned_user_ids:
                # Member is already assigned to this event
                member_info["unavailableReason"] = "Already assigned to this event"
                unavailable_members.append(member_info)
            else:
                # Member is available
                available_members.append(member_info)
        
        return {
            "eventDate": event_date,
            "eventName": event_data.get('name'),
            "availableMembers": available_members,
            "unavailableMembers": unavailable_members,
            "currentlyAssigned": event_data.get('assignedCrew', [])
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get available team members: {str(e)}")

@router.post("/{event_id}/manual-assign")
async def manually_assign_team_member(event_id: str, client_id: str, req: ManualAssignmentRequest, current_user: dict = Depends(get_current_user)):
    """Manually assign a team member to an event with availability conflict detection"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin": 
        raise HTTPException(status_code=403, detail="Forbidden")
    
    try:
        db = firestore.client()
        
        # Get event details
        event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
        event_doc = event_ref.get()
        if not event_doc.exists: 
            raise HTTPException(status_code=404, detail="Event not found")
        event_data = event_doc.to_dict()
        event_date = event_data.get('date')
        
        # Check if member exists and is available
        member_ref = db.collection('organizations', org_id, 'team').document(req.userId)
        member_doc = member_ref.get()
        if not member_doc.exists:
            raise HTTPException(status_code=404, detail="Team member not found")
        
        member_data = member_doc.to_dict()
        
        # Check if member is marked as available
        if not member_data.get('availability', True):
            raise HTTPException(status_code=400, detail="Team member is marked as unavailable")
        
        # Check for scheduling conflicts (exclude current event)
        schedules_ref = db.collection('organizations', org_id, 'schedules')
        conflict_query = schedules_ref.where(filter=firestore.FieldFilter('userId', '==', req.userId)).where(filter=firestore.FieldFilter('startDate', '<=', event_date)).where(filter=firestore.FieldFilter('endDate', '>=', event_date))
        
        # Filter out conflicts from the current event
        conflicts = []
        for conflict_doc in conflict_query.stream():
            conflict_data = conflict_doc.to_dict()
            # Only consider it a conflict if it's NOT from the current event
            if conflict_data.get('eventId') != event_id:
                conflicts.append(conflict_doc)
        
        if conflicts:
            conflict_details = conflicts[0].to_dict()
            conflict_type = conflict_details.get('type', 'unknown')
            raise HTTPException(status_code=409, detail=f"Team member is already scheduled on this date ({conflict_type})")
        
        # Check if already assigned to this event
        current_crew = event_data.get('assignedCrew', [])
        if any(member['userId'] == req.userId for member in current_crew):
            raise HTTPException(status_code=400, detail="Team member is already assigned to this event")
        
        # Add member to the event's assigned crew
        new_member = {
            "userId": req.userId,
            "name": member_data.get('name'),
            "role": req.role,
            "skills": member_data.get('skills', [])
        }
        
        updated_crew = current_crew + [new_member]
        
        # Update event with new crew member
        event_ref.update({
            "assignedCrew": updated_crew,
            "updatedAt": datetime.datetime.now(datetime.timezone.utc)
        })
        
        # Update member's workload
        member_ref.update({"currentWorkload": firestore.Increment(1)})
        
        # Add to schedules collection
        schedule_ref = db.collection('organizations').document(org_id).collection('schedules').document()
        schedule_ref.set({
            "userId": req.userId,
            "startDate": event_date,
            "endDate": event_date,
            "type": "event",
            "eventId": event_id,
            "createdAt": datetime.datetime.now(datetime.timezone.utc)
        })
        
        return {
            "status": "success", 
            "message": f"{member_data.get('name')} assigned to event successfully",
            "assignedMember": new_member
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to assign team member: {str(e)}")

@router.delete("/{event_id}/remove-assignment/{user_id}")
async def remove_team_assignment(event_id: str, client_id: str, user_id: str, current_user: dict = Depends(get_current_user)):
    """Remove a team member from an event assignment"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin": 
        raise HTTPException(status_code=403, detail="Forbidden")
    
    try:
        db = firestore.client()
        
        # Get event details
        event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
        event_doc = event_ref.get()
        if not event_doc.exists: 
            raise HTTPException(status_code=404, detail="Event not found")
        event_data = event_doc.to_dict()
        
        # Remove member from assigned crew
        current_crew = event_data.get('assignedCrew', [])
        updated_crew = [member for member in current_crew if member['userId'] != user_id]
        
        if len(updated_crew) == len(current_crew):
            raise HTTPException(status_code=404, detail="Team member not found in event assignment")
        
        # Update event
        event_ref.update({
            "assignedCrew": updated_crew,
            "updatedAt": datetime.datetime.now(datetime.timezone.utc)
        })
        
        # Update member's workload
        member_ref = db.collection('organizations', org_id, 'team').document(user_id)
        member_ref.update({"currentWorkload": firestore.Increment(-1)})
        
        # Remove from schedules collection
        schedules_ref = db.collection('organizations', org_id, 'schedules')
        schedule_query = schedules_ref.where(filter=firestore.FieldFilter('userId', '==', user_id)).where(filter=firestore.FieldFilter('eventId', '==', event_id))
        schedule_docs = schedule_query.stream()
        for doc in schedule_docs:
            doc.reference.delete()
        
        return {"status": "success", "message": "Team member removed from event successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove team assignment: {str(e)}")

@router.get("/assigned-to-me")
async def get_assigned_events(current_user: dict = Depends(get_current_user)):
    """Get events assigned to the current user"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    try:
        db = firestore.client()
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
                is_assigned = any(member.get('userId') == user_id for member in assigned_crew)
                if is_assigned:
                    user_role = next((member.get('role') for member in assigned_crew if member.get('userId') == user_id), 'Team Member')
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
                        "updatedAt": event_data.get('updatedAt')
                    }
                    assigned_events.append(event_info)
        assigned_events.sort(key=lambda x: x.get('date', ''))
        return {
            "assignedEvents": assigned_events,
            "totalCount": len(assigned_events)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get assigned events: {str(e)}")

# Team Member Chat Endpoints
@router.get("/team/my-event-chats")
async def get_event_chats(current_user: dict = Depends(get_current_user)):
    """Get event chats for the current user"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    try:
        db = firestore.client()
        assigned_events = []
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = clients_ref.stream()
        
        for client_doc in clients:
            client_id = client_doc.id
            events_ref = db.collection('organizations', org_id, 'clients', client_id, 'events')
            events = events_ref.stream()
            
            for event_doc in events:
                event_data = event_doc.to_dict()
                assigned_crew = event_data.get('assignedCrew', [])
                
                # Check if current user is assigned to this event
                is_assigned = any(member.get('userId') == user_id for member in assigned_crew)
                
                if is_assigned:
                    assigned_events.append({
                        "eventId": event_doc.id,
                        "eventName": event_data.get('name'),
                        "clientId": client_id
                    })
        
        # Get chat messages for all assigned events
        all_chats = []
        for event in assigned_events:
            chat_ref = db.collection('organizations', org_id, 'event_chats')
            chat_query = chat_ref.where(filter=firestore.FieldFilter('eventId', '==', event['eventId'])).order_by('timestamp')
            chat_docs = chat_query.stream()
            messages = []
            unread_count = 0
            for chat_doc in chat_docs:
                chat_data = chat_doc.to_dict()
                messages.append(chat_data)
                if not chat_data.get('read', True):
                    unread_count += 1
            all_chats.append({
                "eventId": event['eventId'],
                "eventName": event['eventName'],
                "clientId": event['clientId'],
                "messages": messages,
                "unreadCount": unread_count
            })
        return {
            "eventChats": all_chats,
            "totalUnread": sum(chat['unreadCount'] for chat in all_chats)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get team member chats: {str(e)}")

@router.post("/team/event/{event_id}/chat")
async def send_team_chat_message(event_id: str, message_data: dict, current_user: dict = Depends(get_current_user)):
    """Send a chat message from team member to client for a specific event"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    try:
        db = firestore.client()
        
        # Verify team member is assigned to this event
        is_assigned = False
        client_id = None
        
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = clients_ref.stream()
        
        for client_doc in clients:
            events_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events')
            event_ref = events_ref.document(event_id)
            event_doc = event_ref.get()
            
            if event_doc.exists:
                event_data = event_doc.to_dict()
                assigned_crew = event_data.get('assignedCrew', [])
                
                if any(member.get('userId') == user_id for member in assigned_crew):
                    is_assigned = True
                    client_id = client_doc.id
                    break
        
        if not is_assigned:
            raise HTTPException(status_code=403, detail="You are not assigned to this event")
        
        # Get team member details
        member_ref = db.collection('organizations', org_id, 'team').document(user_id)
        member_doc = member_ref.get()
        member_data = member_doc.to_dict() if member_doc.exists else {}
        member_name = member_data.get('name', current_user.get('name', 'Team Member'))
        
        # Create chat message
        chat_ref = db.collection('organizations', org_id, 'event_chats').document()
        chat_ref.set({
            "eventId": event_id,
            "clientId": client_id,
            "senderId": user_id,
            "senderName": member_name,
            "senderType": "team_member",
            "message": message_data.get('message'),
            "timestamp": datetime.datetime.now(datetime.timezone.utc),
            "read": False
        })
        
        return {
            "status": "success",
            "message": "Chat message sent successfully",
            "chatId": chat_ref.id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send team chat message: {str(e)}")

@router.get("/team/event/{event_id}/chat")
async def get_team_event_chat_messages(event_id: str, current_user: dict = Depends(get_current_user)):
    """Get all chat messages for a specific event from team member perspective"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    try:
        db = firestore.client()
        
        # Verify team member is assigned to this event
        is_assigned = False
        event_name = None
        
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = clients_ref.stream()
        
        for client_doc in clients:
            events_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events')
            event_ref = events_ref.document(event_id)
            event_doc = event_ref.get()
            
            if event_doc.exists:
                event_data = event_doc.to_dict()
                assigned_crew = event_data.get('assignedCrew', [])
                
                if any(member.get('userId') == user_id for member in assigned_crew):
                    is_assigned = True
                    event_name = event_data.get('name')
                    break
        
        if not is_assigned:
            raise HTTPException(status_code=403, detail="You are not assigned to this event")
        
        # Get chat messages
        chat_ref = db.collection('organizations', org_id, 'event_chats')
        chat_query = chat_ref.where(filter=firestore.FieldFilter('eventId', '==', event_id)).order_by('timestamp')
        chat_docs = chat_query.stream()
        
        messages = []
        for chat_doc in chat_docs:
            chat_data = chat_doc.to_dict()
            messages.append({
                "id": chat_doc.id,
                "senderId": chat_data.get('senderId'),
                "senderName": chat_data.get('senderName'),
                "senderType": chat_data.get('senderType'),
                "message": chat_data.get('message'),
                "timestamp": chat_data.get('timestamp'),
                "read": chat_data.get('read', False)
            })
        
        return {
            "eventId": event_id,
            "eventName": event_name,
            "messages": messages,
            "totalMessages": len(messages)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get team event chat: {str(e)}")

@router.get("/for-client/{client_id}")
async def get_events_for_client(client_id: str, current_user: dict = Depends(get_current_user)):
    """Get all events for a specific client"""
    org_id = current_user.get("orgId")
    if not org_id:
        raise HTTPException(status_code=400, detail="Missing organization information")
    try:
        db = firestore.client()
        client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
        client_doc = client_ref.get()
        if not client_doc.exists:
            raise HTTPException(status_code=404, detail="Client not found")
        client_data = client_doc.to_dict()
        events_ref = db.collection('organizations', org_id, 'clients', client_id, 'events')
        events = events_ref.stream()
        event_list = []
        for event_doc in events:
            event_data = event_doc.to_dict()
            event_info = {
                "id": event_doc.id,
                "name": event_data.get('name'),
                "date": event_data.get('date'),
                "time": event_data.get('time'),
                "venue": event_data.get('venue'),
                "eventType": event_data.get('eventType'),
                "status": event_data.get('status'),
                "priority": event_data.get('priority'),
                "estimatedDuration": event_data.get('estimatedDuration'),
                "assignedCrew": event_data.get('assignedCrew', []),
                "createdAt": event_data.get('createdAt'),
                "updatedAt": event_data.get('updatedAt')
            }
            event_list.append(event_info)
        event_list.sort(key=lambda x: x.get('date', ''))
        return {
            "clientId": client_id,
            "clientName": client_data.get('profile', {}).get('name', 'Unknown Client'),
            "events": event_list,
            "totalCount": len(event_list)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get events for client: {str(e)}")

# --- Endpoints ---
@router.get("/")
async def get_all_events(current_user: dict = Depends(get_current_user)):
    """Get all events for the organization"""
    org_id = current_user.get("orgId")
    user_role = current_user.get("role")
    
    if user_role not in ["admin", "accountant", "teammate"] or not org_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    
    try:
        db = firestore.client()
        events_ref = db.collection('organizations', org_id, 'events')
        events = []
        
        for doc in events_ref.stream():
            event_data = doc.to_dict()
            event_info = {
                "id": doc.id,
                "eventName": event_data.get("eventName", event_data.get("name", "")),
                "date": event_data.get("date", ""),
                "time": event_data.get("time", ""),
                "venue": event_data.get("venue", ""),
                "eventType": event_data.get("eventType", ""),
                "status": event_data.get("status", "UPCOMING"),
                "clientId": event_data.get("clientId", ""),
                "createdAt": event_data.get("createdAt", ""),
            }
            events.append(event_info)
        
        return events
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")
