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
    client_id = current_user.get("clientId")
    
    if not org_id or not client_id:
        raise HTTPException(status_code=400, detail="Missing organization or client information")
    
    if current_user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Access denied. Client role required.")
    
    try:
        db = firestore.client()
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
                "date": event_data.get('date'),
                "time": event_data.get('time'),
                "venue": event_data.get('venue'),
                "eventType": event_data.get('eventType'),
                "status": event_data.get('status'),
                "priority": event_data.get('priority'),
                "estimatedDuration": event_data.get('estimatedDuration'),
                "expectedPhotos": event_data.get('expectedPhotos'),
                "specialRequirements": event_data.get('specialRequirements'),
                "assignedCrew": assigned_crew,
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
    client_id = current_user.get("clientId")
    
    if not org_id or not client_id:
        raise HTTPException(status_code=400, detail="Missing organization or client information")
    
    if current_user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Access denied. Client role required.")
    
    try:
        db = firestore.client()
        
        # Get event details
        event_ref = db.collection('organizations', org_id, 'clients', client_id, 'events').document(event_id)
        event_doc = event_ref.get()
        
        if not event_doc.exists:
            raise HTTPException(status_code=404, detail="Event not found")
        
        event_data = event_doc.to_dict()
        assigned_crew = event_data.get('assignedCrew', [])
        
        # Get detailed team member information
        team_details = []
        for crew_member in assigned_crew:
            user_id = crew_member.get('userId')
            if user_id:
                # Get team member details
                member_ref = db.collection('organizations', org_id, 'team').document(user_id)
                member_doc = member_ref.get()
                
                if member_doc.exists():
                    member_data = member_doc.to_dict()
                    
                    team_member_info = {
                        "userId": user_id,
                        "name": crew_member.get('name', member_data.get('name')),
                        "role": crew_member.get('role'),
                        "skills": crew_member.get('skills', member_data.get('skills', [])),
                        "email": member_data.get('email'),
                        "phone": member_data.get('phone'),
                        "experience": member_data.get('experience'),
                        "portfolio": member_data.get('portfolio'),
                        "bio": member_data.get('bio'),
                        "profilePhoto": member_data.get('profilePhoto'),
                        "availability": member_data.get('availability', True),
                        "currentWorkload": member_data.get('currentWorkload', 0)
                    }
                    team_details.append(team_member_info)
        
        return {
            "eventId": event_id,
            "eventName": event_data.get('name'),
            "eventDate": event_data.get('date'),
            "eventTime": event_data.get('time'),
            "teamMembers": team_details,
            "teamSize": len(team_details),
            "roles": list(set([member['role'] for member in team_details if member['role']]))
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get team details: {str(e)}")

@router.post("/event/{event_id}/chat")
async def send_chat_message(event_id: str, message_data: ChatMessage, current_user: dict = Depends(get_current_user)):
    """Send a chat message to the team assigned to an event"""
    org_id = current_user.get("orgId")
    client_id = current_user.get("clientId")
    
    if not org_id or not client_id:
        raise HTTPException(status_code=400, detail="Missing organization or client information")
    
    if current_user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Access denied. Client role required.")
    
    try:
        db = firestore.client()
        
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
    client_id = current_user.get("clientId")
    
    if not org_id or not client_id:
        raise HTTPException(status_code=400, detail="Missing organization or client information")
    
    if current_user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Access denied. Client role required.")
    
    try:
        db = firestore.client()
        
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
    client_id = current_user.get("clientId")
    
    if not org_id or not client_id:
        raise HTTPException(status_code=400, detail="Missing organization or client information")
    
    if current_user.get("role") != "client":
        raise HTTPException(status_code=403, detail="Access denied. Client role required.")
    
    try:
        db = firestore.client()
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
