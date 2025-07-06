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
    api_key = os.getenv("OPENROUTER_API_KEY")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "qwen/qwen-72b-instruct",
        "messages": [{"role": "user", "content": prompt_text}],
        "response_format": {"type": "json_object"}
    }
    response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=data)
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]

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
        # Query schedules for busy team members on the event date
        schedules_ref = db.collection('organizations').document(org_id).collection('schedules')
        busy_query = schedules_ref.where('startDate', '<=', event_data['date']).where('endDate', '>=', event_data['date'])
        busy_schedules = busy_query.stream()
        busy_user_ids = set([doc.to_dict()['userId'] for doc in busy_schedules])
        # Get all available team members not in busy_user_ids
        team_ref = db.collection('organizations', org_id, 'team')
        team_snapshot = team_ref.where('availability', '==', True).stream()
        available_team = [
            {"name": doc.to_dict().get('name'), "skills": doc.to_dict().get('skills'), "role": doc.to_dict().get('role'), "userId": doc.id}
            for doc in team_snapshot if doc.id not in busy_user_ids
        ]
        prompt_text = f"""You are an expert production manager for a photography studio. Your task is to assign the best team for an upcoming event based on the event's requirements and the team's skills and availability.\n\nEvent Details:\n- Name: {event_data.get('name')}\n- Type: {event_data.get('eventType')}\n- Required Skills: {', '.join(event_data.get('requiredSkills', []) )}\n- Priority: {event_data.get('priority')}\n- Special Requirements: {event_data.get('specialRequirements', 'None')}\n\nAvailable Team Members:\n{available_team}\n\nBased on the data provided, please suggest the ideal team members for this event. For each suggested member, provide their name, the role they should play in this event (e.g., Lead Photographer), and a confidence score from 0 to 100 on how good a fit they are. Also provide a brief reasoning for your overall selection.\n\nFormat your response as a JSON object with two keys: \"reasoning\" (a string) and \"suggestions\" (an array of objects, where each object has \"name\", \"role\", and \"confidence\" keys)."""
        ai_response = get_openrouter_suggestion(prompt_text)
        return {"ai_suggestions": ai_response}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get AI suggestion: {str(e)}")
