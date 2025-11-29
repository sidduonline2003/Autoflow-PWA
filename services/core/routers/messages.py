"""
Messages Router - Client messaging system
"""

import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user, require_role
from shared.firebase_client import get_db

router = APIRouter(prefix="/messages", tags=["Messages"])


class MessageRequest(BaseModel):
    message: str
    eventId: Optional[str] = None


@router.post("/for-client/{client_id}")
async def send_message(client_id: str, req: MessageRequest, current_user: dict = Depends(get_current_user)):
    """Send a message to a client"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = get_db()
    message_ref = db.collection('organizations', org_id, 'clients', client_id, 'messages').document()
    message_ref.set({
        "message": req.message,
        "eventId": req.eventId,
        "senderType": "admin",
        "senderId": current_user.get("uid"),
        "senderName": current_user.get("name", "Admin"),
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "read": False
    })
    
    return {"status": "success", "messageId": message_ref.id}


@router.get("/for-client/{client_id}")
async def get_client_messages(client_id: str, current_user: dict = Depends(get_current_user)):
    """Get all messages for a client"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = get_db()
    messages_ref = db.collection('organizations', org_id, 'clients', client_id, 'messages')
    messages = messages_ref.order_by('createdAt', direction=firestore.Query.DESCENDING).stream()
    
    result = []
    for message in messages:
        message_data = message.to_dict()
        message_data['id'] = message.id
        result.append(message_data)
    
    return {"messages": result}


@router.put("/{message_id}/read")
async def mark_message_read(message_id: str, client_id: str, current_user: dict = Depends(get_current_user)):
    """Mark a message as read"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = get_db()
    message_ref = db.collection('organizations', org_id, 'clients', client_id, 'messages').document(message_id)
    message_ref.update({
        "read": True,
        "readAt": datetime.datetime.now(datetime.timezone.utc)
    })
    
    return {"status": "success", "message": "Message marked as read"}
