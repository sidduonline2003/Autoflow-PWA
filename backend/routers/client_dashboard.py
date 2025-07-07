from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth, firestore
from pydantic import BaseModel
from typing import List, Optional
import datetime

from ..dependencies import get_current_user

router = APIRouter(
    tags=["Client Dashboard"],
)

class ChatMessage(BaseModel):
    message: str
    eventId: Optional[str] = None

@router.get("/my-events")
async def get_client_events(current_user: dict = Depends(get_current_user)):
    """Get all events for the current client"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    if current_user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Access denied. Client role required.")
    
    try:
        db = firestore.client()
        
        # Find the client document for this user
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = clients_ref.stream()
        
        client_id = None
        
        for client_doc in clients:
            client_data = client_doc.to_dict()
            if client_data.get('profile', {}).get('authUid') == user_id:
                client_id = client_doc.id
                break
        
        if not client_id:
            raise HTTPException(status_code=404, detail="Client profile not found")
        
        events = []
        
        # Get all events for this client
        events_ref = db.collection('organizations', org_id, 'clients', client_id, 'events')
        event_docs = events_ref.stream()
        
        for event_doc in event_docs:
            event_data = event_doc.to_dict()
            assigned_crew = event_data.get('assignedCrew', [])
            
            event_info = {
                "id": event_doc.id,
                "name": event_data.get('name'),
                "title": event_data.get('name'),  # Add title field for frontend compatibility
                "date": event_data.get('date'),
                "time": event_data.get('time'),
                "venue": event_data.get('venue'),
                "location": event_data.get('venue'),  # Add location field for frontend compatibility
                "eventType": event_data.get('eventType'),
                "status": event_data.get('status'),
                "priority": event_data.get('priority'),
                "estimatedDuration": event_data.get('estimatedDuration'),
                "expectedPhotos": event_data.get('expectedPhotos'),
                "specialRequirements": event_data.get('specialRequirements'),
                "assignedCrew": assigned_crew,
                "assigned_team": assigned_crew,  # Add assigned_team field for frontend compatibility
                "crewCount": len(assigned_crew),
                "hasTeamAssigned": len(assigned_crew) > 0,
                "deliverableStatus": "submitted" if event_data.get('deliverableSubmitted') else "pending",
                "budgetApproved": event_data.get('budgetApproved', False),
                "contractSigned": event_data.get('contractSigned', False),
                "createdAt": event_data.get('createdAt'),
                "updatedAt": event_data.get('updatedAt')
            }
            events.append(event_info)
        
        # Sort events by date
        events.sort(key=lambda x: x.get('date', ''))
        
        # Categorize events
        upcoming_events = [e for e in events if e['status'] in ['UPCOMING', 'IN_PROGRESS']]
        completed_events = [e for e in events if e['status'] == 'COMPLETED']
        
        return {
            "events": events,
            "upcomingEvents": upcoming_events,
            "completedEvents": completed_events,
            "totalEvents": len(events),
            "stats": {
                "upcoming": len(upcoming_events),
                "completed": len(completed_events),
                "withTeam": len([e for e in events if e['hasTeamAssigned']]),
                "withoutTeam": len([e for e in events if not e['hasTeamAssigned']])
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get client events: {str(e)}")

@router.get("/event/{event_id}/team")
async def get_event_team_details(event_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed information about the team assigned to a specific event"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    if current_user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Access denied. Client role required.")
    
    try:
        db = firestore.client()
        
        # Find the client document that contains this event
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = clients_ref.stream()
        
        event_found = False
        event_data = None
        client_id = None
        
        for client_doc in clients:
            try:
                # Check if this client's user ID matches the current user
                client_data = client_doc.to_dict()
                if client_data and client_data.get('profile', {}).get('authUid') == user_id:
                    client_id = client_doc.id
                    # Check if this client has the requested event
                    event_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events').document(event_id)
                    event_doc = event_ref.get()
                    
                    if event_doc.exists:
                        event_data = event_doc.to_dict()
                        if event_data:  # Ensure event_data is not None
                            event_found = True
                            break
            except Exception as inner_e:
                # Log the inner exception but continue with next client
                print(f"Error checking client {client_doc.id}: {str(inner_e)}")
                continue
        
        if not event_found:
            raise HTTPException(status_code=404, detail=f"Event {event_id} not found or access denied for user {user_id}")
        
        if not event_data:
            raise HTTPException(status_code=500, detail="Event data is empty")
        
        assigned_crew = event_data.get('assignedCrew', [])
        
        # Get detailed team member information
        team_details = []
        for i, crew_member in enumerate(assigned_crew):
            try:
                if not crew_member:
                    print(f"Warning: crew_member at index {i} is None or empty")
                    continue
                    
                member_user_id = crew_member.get('userId')
                if not member_user_id:
                    print(f"Warning: crew_member at index {i} has no userId: {crew_member}")
                    continue
                
                # Get team member details
                member_ref = db.collection('organizations', org_id, 'team').document(member_user_id)
                member_doc = member_ref.get()
                
                if member_doc.exists:
                    member_data = member_doc.to_dict()
                    if member_data:  # Ensure member_data is not None
                        team_member_info = {
                            "userId": member_user_id,
                            "name": crew_member.get('name', member_data.get('name', 'Unknown')),
                            "role": crew_member.get('role', 'Team Member'),
                            "skills": crew_member.get('skills', member_data.get('skills', [])),
                            "email": member_data.get('email', ''),
                            "phone": member_data.get('phone', ''),
                            "experience": member_data.get('experience', ''),
                            "portfolio": member_data.get('portfolio', ''),
                            "bio": member_data.get('bio', ''),
                            "profilePhoto": member_data.get('profilePhoto', ''),
                            "availability": member_data.get('availability', True),
                            "currentWorkload": member_data.get('currentWorkload', 0)
                        }
                        team_details.append(team_member_info)
                    else:
                        print(f"Warning: member_data for {member_user_id} is None")
                else:
                    print(f"Warning: Team member document {member_user_id} does not exist")
                    # Still add basic info from crew_member if team document doesn't exist
                    team_member_info = {
                        "userId": member_user_id,
                        "name": crew_member.get('name', 'Unknown'),
                        "role": crew_member.get('role', 'Team Member'),
                        "skills": crew_member.get('skills', []),
                        "email": '',
                        "phone": '',
                        "experience": '',
                        "portfolio": '',
                        "bio": '',
                        "profilePhoto": '',
                        "availability": True,
                        "currentWorkload": 0
                    }
                    team_details.append(team_member_info)
                    
            except Exception as member_e:
                print(f"Error processing team member {i}: {str(member_e)}")
                # Continue with next team member instead of failing completely
                continue
        
        return {
            "eventId": event_id,
            "eventName": event_data.get('name', 'Unknown Event'),
            "eventTitle": event_data.get('name', 'Unknown Event'),  # Add title field for frontend compatibility
            "eventDate": event_data.get('date', ''),
            "eventTime": event_data.get('time', ''),
            "team_members": team_details,  # Use snake_case to match frontend expectation
            "teamMembers": team_details,   # Also include camelCase for compatibility
            "teamSize": len(team_details),
            "roles": list(set([member.get('role', 'Team Member') for member in team_details if member.get('role')]))
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        print(f"Unexpected error in get_event_team_details: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to get team details: {str(e)}")

@router.post("/event/{event_id}/chat")
async def send_chat_message(event_id: str, message_data: ChatMessage, current_user: dict = Depends(get_current_user)):
    """Send a chat message to the team assigned to an event"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    if current_user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Access denied. Client role required.")
    
    try:
        db = firestore.client()
        
        # Find the client document for this user
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = clients_ref.stream()
        
        client_id = None
        for client_doc in clients:
            client_data = client_doc.to_dict()
            if client_data.get('profile', {}).get('authUid') == user_id:
                client_id = client_doc.id
                break
        
        if not client_id:
            raise HTTPException(status_code=404, detail="Client profile not found")
        
        # Verify event exists and belongs to client
        event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
        event_doc = event_ref.get()
        
        if not event_doc.exists:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Get client details
        client_ref = db.collection('organizations', org_id, 'clients').document(client_id)
        client_doc = client_ref.get()
        client_data = client_doc.to_dict() if client_doc.exists else {}
        client_name = client_data.get('profile', {}).get('name', current_user.get('name', 'Client'))
        
        # Create chat message
        chat_ref = db.collection('organizations', org_id, 'event_chats').document()
        chat_ref.set({
            "eventId": event_id,
            "clientId": client_id,
            "senderId": current_user.get("uid"),
            "senderName": client_name,
            "senderType": "client",
            "message": message_data.message,
            "timestamp": datetime.datetime.now(datetime.timezone.utc),
            "read": False
        })
        
        return {
            "status": "success",
            "message": "Chat message sent successfully",
            "chatId": chat_ref.id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send chat message: {str(e)}")

@router.get("/event/{event_id}/chat")
async def get_event_chat_messages(event_id: str, current_user: dict = Depends(get_current_user)):
    """Get all chat messages for a specific event"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    if current_user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Access denied. Client role required.")
    
    try:
        db = firestore.client()
        
        # Find the client document for this user
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = clients_ref.stream()
        
        client_id = None
        for client_doc in clients:
            client_data = client_doc.to_dict()
            if client_data.get('profile', {}).get('authUid') == user_id:
                client_id = client_doc.id
                break
        
        if not client_id:
            raise HTTPException(status_code=404, detail="Client profile not found")
        
        # Verify event exists and belongs to client
        event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
        event_doc = event_ref.get()
        
        if not event_doc.exists:
            raise HTTPException(status_code=404, detail="Event not found")
        
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
            "messages": messages,
            "totalMessages": len(messages)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get chat messages: {str(e)}")

@router.get("/notifications")
async def get_client_notifications(current_user: dict = Depends(get_current_user)):
    """Get all notifications for the client"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    if current_user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Access denied. Client role required.")
    
    try:
        db = firestore.client()
        
        # Find the client document for this user
        clients_ref = db.collection('organizations', org_id, 'clients')
        clients = clients_ref.stream()
        
        client_id = None
        for client_doc in clients:
            client_data = client_doc.to_dict()
            if client_data.get('profile', {}).get('authUid') == user_id:
                client_id = client_doc.id
                break
        
        if not client_id:
            raise HTTPException(status_code=404, detail="Client profile not found")
        
        notifications = []
        
        # Get unread chat messages
        chat_ref = db.collection('organizations', org_id, 'event_chats')
        unread_chats = chat_ref.where(filter=firestore.FieldFilter('read', '==', False)).stream()
        
        for chat in unread_chats:
            chat_data = chat.to_dict()
            # Filter for messages not from client and for this client's events
            if (chat_data.get('senderType') != 'client' and 
                chat_data.get('clientId') == client_id):
                notifications.append({
                    "type": "chat",
                    "title": f"New message from {chat_data.get('senderName')}",
                    "message": chat_data.get('message')[:50] + "..." if len(chat_data.get('message', '')) > 50 else chat_data.get('message'),
                    "timestamp": chat_data.get('timestamp'),
                    "eventId": chat_data.get('eventId'),
                    "priority": "normal"
                })
        
        # Get approval requests
        approvals_ref = db.collection('organizations', org_id, 'clients', client_id, 'approvals')
        pending_approvals = approvals_ref.where(filter=firestore.FieldFilter('status', '==', 'pending')).stream()
        
        for approval in pending_approvals:
            approval_data = approval.to_dict()
            notifications.append({
                "type": "approval",
                "title": f"Approval Required: {approval_data.get('type', 'Unknown')}",
                "message": approval_data.get('subject', 'Please review and approve'),
                "timestamp": approval_data.get('createdAt'),
                "eventId": approval_data.get('eventId'),
                "priority": "high"
            })
        
        # Sort by timestamp (newest first)
        notifications.sort(key=lambda x: x.get('timestamp', datetime.datetime.min), reverse=True)
        
        return {
            "notifications": notifications,
            "unreadCount": len(notifications),
            "hasHighPriority": any(n['priority'] == 'high' for n in notifications)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get notifications: {str(e)}")
