from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import auth, firestore
from pydantic import BaseModel
from typing import List
import datetime
import requests
import os

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/events",
    tags=["Event Management"],
)

# --- Pydantic Models ---
class EventRequest(BaseModel): name: str; date: str; time: str; venue: str; eventType: str; requiredSkills: List[str]; priority: str; estimatedDuration: int; expectedPhotos: int; specialRequirements: str | None
class EventAssignmentRequest(BaseModel): team: List[dict]

# --- OpenRouter Client Helper ---
def get_openrouter_suggestion(prompt_text):
    import json
    import re
    api_key = os.getenv("OPENROUTER_API_KEY")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "openrouter/auto",
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
    print("OpenRouter response:", response.json())
    content = response.json()["choices"][0]["message"]["content"]
    # Use regex to extract JSON from code block if present
    match = re.search(r'```json\\n([\s\S]+?)```', content)
    if not match:
        match = re.search(r'```([\s\S]+?)```', content)
    if match:
        content = match.group(1).strip()
    try:
        return json.loads(content)
    except Exception as e:
        print("Failed to parse AI response as JSON:", content)
        raise

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
    event_ref=db.collection('organizations',org_id,'clients',client_id,'events').document(event_id)
    event_ref.update({"assignedCrew":req.team,"updatedAt":datetime.datetime.now(datetime.timezone.utc)})
    for member in req.team:
        member_ref=db.collection('organizations',org_id,'team').document(member["userId"])
        member_ref.update({"currentWorkload":firestore.Increment(1)})
        # Add to schedules collection for event assignment
        schedule_ref = db.collection('organizations').document(org_id).collection('schedules').document()
        schedule_ref.set({
            "userId": member["userId"],
            "startDate": event_ref.get().to_dict().get("date"),
            "endDate": event_ref.get().to_dict().get("date"),
            "type": "event",
            "eventId": event_id,
            "createdAt": datetime.datetime.now(datetime.timezone.utc)
        })
    
    # No change on delete; events persist in schedules for historical records
    return {"status":"success","message":"Team assigned successfully."}

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
        busy_query = schedules_ref.where('startDate', '<=', event_data['date']).where('endDate', '>=', event_data['date'])
        busy_user_ids = [doc.to_dict()['userId'] for doc in busy_query.stream()]

        # Fetch all team members once
        team_ref = db.collection('organizations', org_id, 'team')
        team_docs = team_ref.stream()
        available_team = [
            {"name": d.to_dict().get('name'), "skills": d.to_dict().get('skills'), "role": d.to_dict().get('role'), "userId": d.id}
            for d in team_docs if d.id not in busy_user_ids and d.to_dict().get('availability', True)
        ]

        prompt_text = f"""You are an expert production manager for a photography studio. Your task is to assign the best team for an upcoming event based on the event's requirements and the team's skills and availability.\n\nEvent Details:\n- Name: {event_data.get('name')}\n- Type: {event_data.get('eventType')}\n- Required Skills: {', '.join(event_data.get('requiredSkills', []) )}\n- Priority: {event_data.get('priority')}\n- Special Requirements: {event_data.get('specialRequirements', 'None')}\n\nAvailable Team Members:\n{available_team}\n\nBased on the data provided, please suggest the ideal team members for this event. For each suggested member, provide their name, the role they should play in this event (e.g., Lead Photographer), and a confidence score from 0 to 100 on how good a fit they are. Also provide a brief reasoning for your overall selection.\n\nFormat your response as a JSON object with two keys: \"reasoning\" (a string) and \"suggestions\" (an array of objects, where each object has \"name\", \"role\", and \"confidence\" keys)."""
        ai_response = get_openrouter_suggestion(prompt_text)
        return {"ai_suggestions": ai_response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get AI suggestion: {str(e)}")
