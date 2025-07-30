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
async def get_assigned_events_for_user(current_user: dict = Depends(get_current_user)):
    """Get all events assigned to the current user across all clients"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    try:
        db = firestore.client()
        assigned_events = []
        
        # Get all clients in the organization
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = clients_ref.stream()
        
        for client_doc in clients:
            client_id = client_doc.id
            client_data = client_doc.to_dict()
            
            # Get all events for this client
            events_ref = db.collection('organizations', org_id, 'clients', client_id, 'events')
            events = events_ref.stream()
            
            for event_doc in events:
                event_data = event_doc.to_dict()
                assigned_crew = event_data.get('assignedCrew', [])
                
                # Check if current user is assigned to this event
                is_assigned = any(member.get('userId') == user_id for member in assigned_crew)
                
                if is_assigned:
                    # Find the user's role in this event
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
        
        # Sort events by date
        assigned_events.sort(key=lambda x: x.get('date', ''))
        
        return {
            "assignedEvents": assigned_events,
            "totalCount": len(assigned_events)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get assigned events: {str(e)}")

# Team Member Chat Endpoints
@router.get("/team/my-event-chats")
async def get_team_member_event_chats(current_user: dict = Depends(get_current_user)):
    """Get all chat messages for events the team member is assigned to"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    # Remove restrictive role check - any authenticated user can access if they're assigned to events
    
    try:
        db = firestore.client()
        
        # Get all events assigned to this team member
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
                        "clientId": client_id,
                        "eventName": event_data.get('name'),
                        "eventDate": event_data.get('date'),
                        "eventTime": event_data.get('time'),
                        "venue": event_data.get('venue')
                    })
        
        # Get chat messages for all assigned events
        all_chats = []
        for event in assigned_events:
            chat_ref = db.collection('organizations', org_id, 'event_chats')
            chat_query = chat_ref.where(filter=firestore.FieldFilter('eventId', '==', event['eventId'])).order_by('timestamp')
            chat_docs = chat_query.stream()
            
            event_chats = []
            for chat_doc in chat_docs:
                chat_data = chat_doc.to_dict()
                event_chats.append({
                    "id": chat_doc.id,
                    "senderId": chat_data.get('senderId'),
                    "senderName": chat_data.get('senderName'),
                    "senderType": chat_data.get('senderType'),
                    "message": chat_data.get('message'),
                    "timestamp": chat_data.get('timestamp'),
                    "read": chat_data.get('read', False)
                })
            
            if event_chats:  # Only include events with chat messages
                all_chats.append({
                    "event": event,
                    "messages": event_chats,
                    "unreadCount": len([msg for msg in event_chats if not msg['read'] and msg['senderType'] == 'client'])
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

# --- Post-Production Workflow Endpoints ---

@router.post("/{event_id}/trigger-post-production")
async def trigger_post_production_workflow(
    event_id: str, 
    client_id: str, 
    current_user: dict = Depends(get_current_user)
):
    """Trigger post-production workflow when event is completed"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Get event details
        event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
        event_doc = event_ref.get()
        
        if not event_doc.exists:
            raise HTTPException(status_code=404, detail="Event not found")
        
        event_data = event_doc.to_dict()
        
        # Check if event is in correct status
        if event_data.get('status') not in ['COMPLETED', 'IN_PROGRESS']:
            raise HTTPException(status_code=400, detail="Event must be completed before starting post-production")
        
        # Update event status to trigger workflow
        event_ref.update({
            "status": "SHOOT_COMPLETE",
            "updatedAt": datetime.datetime.now(datetime.timezone.utc),
            "postProductionStartedAt": datetime.datetime.now(datetime.timezone.utc)
        })
        
        # Get AI editor suggestions  
        try:
            editor_suggestions = await suggest_editors_for_event(event_data, org_id)
        except Exception as e:
            print(f"AI suggestion failed: {e}")
            # Fallback suggestions
            editor_suggestions = {
                "reasoning": "AI suggestion unavailable, manual assignment recommended",
                "suggestions": {},
                "complexity": "medium",
                "totalEstimatedHours": 8
            }
        
        # Create post-production task document
        post_prod_ref = db.collection('organizations', org_id, 'post_production_tasks').document()
        task_data = {
            "eventId": event_id,
            "clientId": client_id,
            "eventName": event_data.get('name'),
            "eventType": event_data.get('eventType'),
            "complexity": editor_suggestions.get('complexity', 'medium'),
            "status": "AI_EDITOR_ASSIGNMENT",
            "aiSuggestions": editor_suggestions,
            "estimatedHours": editor_suggestions.get('totalEstimatedHours', 8),
            "createdAt": datetime.datetime.now(datetime.timezone.utc),
            "updatedAt": datetime.datetime.now(datetime.timezone.utc),
            "workflow": {
                "shootComplete": datetime.datetime.now(datetime.timezone.utc),
                "aiAssignment": datetime.datetime.now(datetime.timezone.utc),
                "editingPending": None,
                "editingInProgress": None,
                "editingReview": None,
                "uploadPending": None,
                "clientReady": None
            }
        }
        
        post_prod_ref.set(task_data)
        
        # Update event status to show AI assignment is ready
        event_ref.update({
            "status": "AI_EDITOR_ASSIGNMENT",
            "postProductionTaskId": post_prod_ref.id
        })
        
        return {
            "status": "success",
            "message": "Post-production workflow triggered successfully",
            "taskId": post_prod_ref.id,
            "aiSuggestions": editor_suggestions,
            "nextStep": "Review and assign editors"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger post-production: {str(e)}")

@router.post("/{event_id}/assign-editors")
async def assign_editors_to_event(
    event_id: str,
    client_id: str,
    req: EditorAssignmentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Assign editors to post-production task"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Get post-production task
        post_prod_ref = db.collection('organizations', org_id, 'post_production_tasks')
        task_query = post_prod_ref.where('eventId', '==', event_id).limit(1)
        task_docs = list(task_query.stream())
        
        if not task_docs:
            raise HTTPException(status_code=404, detail="Post-production task not found")
        
        task_doc = task_docs[0]
        task_data = task_doc.to_dict()
        
        # Verify editors exist and are available
        editor_ids = [req.primaryEditor]
        if req.secondaryEditor:
            editor_ids.append(req.secondaryEditor)
        editor_ids.append(req.uploader)
        
        editors_info = {}
        for editor_id in editor_ids:
            editor_ref = db.collection('organizations', org_id, 'team').document(editor_id)
            editor_doc = editor_ref.get()
            if not editor_doc.exists:
                raise HTTPException(status_code=404, detail=f"Editor {editor_id} not found")
            
            editor_data = editor_doc.to_dict()
            if not editor_data.get('availability', True):
                raise HTTPException(status_code=400, detail=f"Editor {editor_data.get('name')} is not available")
            
            editors_info[editor_id] = editor_data
        
        # Update post-production task with assignments
        update_data = {
            "primaryEditor": req.primaryEditor,
            "primaryEditorName": editors_info[req.primaryEditor].get('name'),
            "uploader": req.uploader,
            "uploaderName": editors_info[req.uploader].get('name'),
            "estimatedHours": req.estimatedHours or task_data.get('estimatedHours', 8),
            "status": "EDITING_PENDING",
            "assignedAt": datetime.datetime.now(datetime.timezone.utc),
            "updatedAt": datetime.datetime.now(datetime.timezone.utc),
            "notes": req.notes
        }
        
        if req.secondaryEditor:
            update_data.update({
                "secondaryEditor": req.secondaryEditor,
                "secondaryEditorName": editors_info[req.secondaryEditor].get('name')
            })
        
        # Update workflow tracking
        workflow = task_data.get('workflow', {})
        workflow['editingPending'] = datetime.datetime.now(datetime.timezone.utc)
        update_data['workflow'] = workflow
        
        task_doc.reference.update(update_data)
        
        # Update event status
        event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
        event_ref.update({
            "status": "EDITING_PENDING",
            "updatedAt": datetime.datetime.now(datetime.timezone.utc)
        })
        
        # Update editor workloads
        for editor_id in editor_ids:
            editor_ref = db.collection('organizations', org_id, 'team').document(editor_id)
            editor_ref.update({"currentWorkload": firestore.Increment(1)})
        
        return {
            "status": "success",
            "message": "Editors assigned successfully",
            "assignments": {
                "primaryEditor": editors_info[req.primaryEditor].get('name'),
                "secondaryEditor": editors_info.get(req.secondaryEditor, {}).get('name') if req.secondaryEditor else None,
                "uploader": editors_info[req.uploader].get('name')
            },
            "nextStep": "Editors can now start working"
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to assign editors: {str(e)}")

@router.put("/{event_id}/post-production/status")
async def update_post_production_status(
    event_id: str,
    req: TaskUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update post-production task status (for editors and uploaders)"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    try:
        db = firestore.client()
        
        # Get post-production task
        post_prod_ref = db.collection('organizations', org_id, 'post_production_tasks')
        task_query = post_prod_ref.where('eventId', '==', event_id).limit(1)
        task_docs = list(task_query.stream())
        
        if not task_docs:
            raise HTTPException(status_code=404, detail="Post-production task not found")
        
        task_doc = task_docs[0]
        task_data = task_doc.to_dict()
        
        # Check if user is assigned to this task
        assigned_users = [
            task_data.get('primaryEditor'),
            task_data.get('secondaryEditor'),
            task_data.get('uploader')
        ]
        
        if user_id not in assigned_users and current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="You are not assigned to this post-production task")
        
        # Validate status transition
        current_status = task_data.get('status')
        allowed_transitions = {
            "EDITING_PENDING": ["EDITING_IN_PROGRESS"],
            "EDITING_IN_PROGRESS": ["EDITING_REVIEW", "REVISION_NEEDED"],
            "EDITING_REVIEW": ["UPLOAD_PENDING", "REVISION_NEEDED"],
            "REVISION_NEEDED": ["EDITING_IN_PROGRESS"],
            "UPLOAD_PENDING": ["CLIENT_READY"]
        }
        
        if req.status not in allowed_transitions.get(current_status, []):
            raise HTTPException(status_code=400, detail=f"Invalid status transition from {current_status} to {req.status}")
        
        # Update task
        update_data = {
            "status": req.status,
            "updatedAt": datetime.datetime.now(datetime.timezone.utc),
            "lastUpdatedBy": user_id,
            "lastUpdatedByName": current_user.get('name', 'Unknown')
        }
        
        if req.notes:
            update_data['notes'] = req.notes
        
        if req.timeSpent:
            current_time = task_data.get('totalTimeSpent', 0)
            update_data['totalTimeSpent'] = current_time + req.timeSpent
        
        if req.completionPercentage is not None:
            update_data['completionPercentage'] = req.completionPercentage
        
        # Update workflow tracking
        workflow = task_data.get('workflow', {})
        status_mapping = {
            "EDITING_IN_PROGRESS": "editingInProgress",
            "EDITING_REVIEW": "editingReview", 
            "UPLOAD_PENDING": "uploadPending",
            "CLIENT_READY": "clientReady"
        }
        
        if req.status in status_mapping:
            workflow[status_mapping[req.status]] = datetime.datetime.now(datetime.timezone.utc)
            update_data['workflow'] = workflow
        
        task_doc.reference.update(update_data)
        
        # Update event status to match
        clients_ref = db.collection('organizations', org_id, 'clients')
        for client_doc in clients_ref.stream():
            event_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events').document(event_id)
            event_doc = event_ref.get()
            if event_doc.exists:
                event_ref.update({
                    "status": req.status,
                    "updatedAt": datetime.datetime.now(datetime.timezone.utc)
                })
                break
        
        return {
            "status": "success",
            "message": f"Post-production status updated to {req.status}",
            "currentStatus": req.status,
            "completionPercentage": req.completionPercentage
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update post-production status: {str(e)}")

@router.get("/{event_id}/post-production/status")
async def get_post_production_status(
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get post-production task status and details"""
    org_id = current_user.get("orgId")
    
    try:
        db = firestore.client()
        
        # Get post-production task
        post_prod_ref = db.collection('organizations', org_id, 'post_production_tasks')
        task_query = post_prod_ref.where('eventId', '==', event_id).limit(1)
        task_docs = list(task_query.stream())
        
        if not task_docs:
            return {
                "status": "not_started",
                "message": "Post-production not started for this event"
            }
        
        task_data = task_docs[0].to_dict()
        
        # Get editor names
        editors_info = {}
        editor_ids = [
            task_data.get('primaryEditor'),
            task_data.get('secondaryEditor'), 
            task_data.get('uploader')
        ]
        
        for editor_id in filter(None, editor_ids):
            editor_ref = db.collection('organizations', org_id, 'team').document(editor_id)
            editor_doc = editor_ref.get()
            if editor_doc.exists:
                editors_info[editor_id] = editor_doc.to_dict().get('name', 'Unknown')
        
        return {
            "status": task_data.get('status'),
            "eventId": event_id,
            "eventName": task_data.get('eventName'),
            "complexity": task_data.get('complexity'),
            "estimatedHours": task_data.get('estimatedHours'),
            "totalTimeSpent": task_data.get('totalTimeSpent', 0),
            "completionPercentage": task_data.get('completionPercentage', 0),
            "assignments": {
                "primaryEditor": {
                    "userId": task_data.get('primaryEditor'),
                    "name": task_data.get('primaryEditorName')
                },
                "secondaryEditor": {
                    "userId": task_data.get('secondaryEditor'),
                    "name": task_data.get('secondaryEditorName')
                } if task_data.get('secondaryEditor') else None,
                "uploader": {
                    "userId": task_data.get('uploader'),
                    "name": task_data.get('uploaderName')
                }
            },
            "workflow": task_data.get('workflow', {}),
            "notes": task_data.get('notes'),
            "aiSuggestions": task_data.get('aiSuggestions'),
            "createdAt": task_data.get('createdAt'),
            "updatedAt": task_data.get('updatedAt')
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get post-production status: {str(e)}")

@router.get("/post-production/dashboard")
async def get_post_production_dashboard(current_user: dict = Depends(get_current_user)):
    """Get post-production dashboard for admins"""
    org_id = current_user.get("orgId")
    
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Get all post-production tasks
        post_prod_ref = db.collection('organizations', org_id, 'post_production_tasks')
        tasks = post_prod_ref.order_by('createdAt', direction=firestore.Query.DESCENDING).stream()
        
        active_tasks = []
        completed_tasks = []
        
        for task_doc in tasks:
            task_data = task_doc.to_dict()
            task_info = {
                "taskId": task_doc.id,
                "eventId": task_data.get('eventId'),
                "eventName": task_data.get('eventName'),
                "eventType": task_data.get('eventType'),
                "status": task_data.get('status'),
                "complexity": task_data.get('complexity'),
                "estimatedHours": task_data.get('estimatedHours'),
                "totalTimeSpent": task_data.get('totalTimeSpent', 0),
                "completionPercentage": task_data.get('completionPercentage', 0),
                "primaryEditorName": task_data.get('primaryEditorName'),
                "uploaderName": task_data.get('uploaderName'),
                "createdAt": task_data.get('createdAt'),
                "updatedAt": task_data.get('updatedAt')
            }
            
            if task_data.get('status') == 'CLIENT_READY':
                completed_tasks.append(task_info)
            else:
                active_tasks.append(task_info)
        
        # Calculate summary statistics
        total_tasks = len(active_tasks) + len(completed_tasks)
        pending_tasks = len([t for t in active_tasks if t['status'] in ['EDITING_PENDING', 'AI_EDITOR_ASSIGNMENT']])
        in_progress_tasks = len([t for t in active_tasks if t['status'] == 'EDITING_IN_PROGRESS'])
        review_tasks = len([t for t in active_tasks if t['status'] in ['EDITING_REVIEW', 'UPLOAD_PENDING']])
        
        return {
            "summary": {
                "totalTasks": total_tasks,
                "activeTasks": len(active_tasks),
                "completedTasks": len(completed_tasks),
                "pendingTasks": pending_tasks,
                "inProgressTasks": in_progress_tasks,
                "reviewTasks": review_tasks
            },
            "activeTasks": active_tasks,
            "completedTasks": completed_tasks[:10]  # Last 10 completed
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get post-production dashboard: {str(e)}")

@router.get("/my-editing-tasks")
async def get_my_editing_tasks(current_user: dict = Depends(get_current_user)):
    """Get editing tasks assigned to current user"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    try:
        db = firestore.client()
        
        # Get tasks where user is assigned as editor or uploader
        post_prod_ref = db.collection('organizations', org_id, 'post_production_tasks')
        
        # Query for tasks where user is primary editor
        primary_query = post_prod_ref.where('primaryEditor', '==', user_id)
        primary_tasks = list(primary_query.stream())
        
        # Query for tasks where user is secondary editor
        secondary_query = post_prod_ref.where('secondaryEditor', '==', user_id)
        secondary_tasks = list(secondary_query.stream())
        
        # Query for tasks where user is uploader
        uploader_query = post_prod_ref.where('uploader', '==', user_id)
        uploader_tasks = list(uploader_query.stream())
        
        # Combine and deduplicate tasks
        all_task_docs = {}
        for task_doc in primary_tasks + secondary_tasks + uploader_tasks:
            all_task_docs[task_doc.id] = task_doc
        
        my_tasks = []
        for task_doc in all_task_docs.values():
            task_data = task_doc.to_dict()
            
            # Determine user's role in this task
            user_role = []
            if task_data.get('primaryEditor') == user_id:
                user_role.append('Primary Editor')
            if task_data.get('secondaryEditor') == user_id:
                user_role.append('Secondary Editor')
            if task_data.get('uploader') == user_id:
                user_role.append('Uploader')
            
            task_info = {
                "taskId": task_doc.id,
                "eventId": task_data.get('eventId'),
                "eventName": task_data.get('eventName'),
                "eventType": task_data.get('eventType'),
                "status": task_data.get('status'),
                "complexity": task_data.get('complexity'),
                "estimatedHours": task_data.get('estimatedHours'),
                "totalTimeSpent": task_data.get('totalTimeSpent', 0),
                "completionPercentage": task_data.get('completionPercentage', 0),
                "myRole": ', '.join(user_role),
                "notes": task_data.get('notes'),
                "createdAt": task_data.get('createdAt'),
                "updatedAt": task_data.get('updatedAt'),
                "canEdit": task_data.get('status') in ['EDITING_PENDING', 'EDITING_IN_PROGRESS', 'REVISION_NEEDED'],
                "canUpload": task_data.get('status') == 'UPLOAD_PENDING' and task_data.get('uploader') == user_id
            }
            
            my_tasks.append(task_info)
        
        # Sort by status priority and date
        status_priority = {
            'REVISION_NEEDED': 1,
            'EDITING_PENDING': 2,
            'EDITING_IN_PROGRESS': 3,
            'EDITING_REVIEW': 4,
            'UPLOAD_PENDING': 5,
            'CLIENT_READY': 6
        }
        
        my_tasks.sort(key=lambda x: (status_priority.get(x['status'], 99), x.get('createdAt')))
        
        return {
            "myTasks": my_tasks,
            "totalTasks": len(my_tasks),
            "pendingTasks": len([t for t in my_tasks if t['status'] in ['EDITING_PENDING', 'REVISION_NEEDED']]),
            "inProgressTasks": len([t for t in my_tasks if t['status'] == 'EDITING_IN_PROGRESS']),
            "completedTasks": len([t for t in my_tasks if t['status'] == 'CLIENT_READY'])
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get editing tasks: {str(e)}")
