import json
import os
import re
from typing import Any, Dict, List

import requests
from fastapi import Depends, HTTPException, Query
from firebase_admin import firestore

from ..dependencies import get_current_user
from ..services.postprod_svc import ensure_root_event_mirror, find_event_ref
from .postprod import StreamType, router, _job_ref


async def _get_event_and_team(org_id: str, event_id: str):
    db = firestore.client()
    event_ref, client_id = await find_event_ref(firestore, org_id, event_id)
    if not event_ref:
        raise HTTPException(status_code=404, detail="Event not found")

    event_doc = event_ref.get()
    if not event_doc.exists:
        raise HTTPException(status_code=404, detail="Event not available")

    event_data = event_doc.to_dict() or {}

    if client_id:
        root_ref = db.collection("organizations", org_id, "events").document(event_id)
        root_doc = root_ref.get()
        if not root_doc.exists:
            try:
                root_ref = await ensure_root_event_mirror(firestore, org_id, event_ref, client_id)
                root_doc = root_ref.get()
            except Exception:
                root_doc = None
        if root_doc and root_doc.exists:
            event_data = root_doc.to_dict() or event_data

    team_ref = db.collection("organizations", org_id, "team")
    return event_data, team_ref


async def _list_available_editors(org_id: str, event_id: str, stream: StreamType) -> Dict[str, Any]:
    db = firestore.client()
    job_snapshot = _job_ref(db, org_id, event_id).get()
    job = job_snapshot.to_dict() if job_snapshot.exists else {}

    try:
        event_data, team_ref = await _get_event_and_team(org_id, event_id)
    except HTTPException as exc:
        if exc.status_code == 404 and job:
            ai_summary = job.get("aiSummary") or {}
            intake_summary = job.get("intakeSummary") or {}
            event_data = {
                "date": ai_summary.get("eventDate") or intake_summary.get("recordedAt"),
            }
            team_ref = db.collection("organizations", org_id, "team")
        else:
            raise

    event_date = (event_data or {}).get("date")
    busy_user_ids: set[str] = set()
    if event_date:
        schedules_ref = db.collection("organizations", org_id, "schedules")
        try:
            if hasattr(firestore, "FieldFilter"):
                busy_query = schedules_ref.where(filter=firestore.FieldFilter("startDate", "<=", event_date)).where(
                    filter=firestore.FieldFilter("endDate", ">=", event_date)
                )
            else:
                busy_query = schedules_ref.where("startDate", "<=", event_date).where("endDate", ">=", event_date)
            for doc in busy_query.stream():
                data = doc.to_dict() or {}
                if data.get("eventId") != event_id:
                    uid = data.get("userId")
                    if uid:
                        busy_user_ids.add(uid)
        except Exception:
            pass

    current_editors = ((job.get(stream) or {}).get("editors") or [])
    assigned_ids = {e.get("uid") for e in current_editors if e.get("uid")}

    available: List[Dict[str, Any]] = []
    unavailable: List[Dict[str, Any]] = []

    for member in team_ref.stream():
        metadata = member.to_dict() or {}
        info = {
            "uid": member.id,
            "name": metadata.get("name"),
            "email": metadata.get("email"),
            "skills": metadata.get("skills", []),
            "availability": metadata.get("availability", True),
            "currentWorkload": metadata.get("currentWorkload", 0),
        }
        if not metadata.get("availability", True):
            info["reason"] = "Marked unavailable"
            unavailable.append(info)
        elif member.id in busy_user_ids:
            info["reason"] = "Busy on event date"
            unavailable.append(info)
        elif member.id in assigned_ids:
            info["reason"] = "Already assigned to this stream"
            unavailable.append(info)
        else:
            available.append(info)

    return {
        "eventDate": event_date,
        "availableEditors": available,
        "unavailableEditors": unavailable,
        "currentEditors": current_editors,
    }


def _openrouter_suggest(prompt_text: str) -> Dict[str, Any]:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI service is not configured")

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    body = {
        "model": "google/gemma-3-4b-it:free",
        "messages": [{"role": "user", "content": prompt_text}],
    }

    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=body,
            timeout=15,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        detail = getattr(exc.response, "text", str(exc)) if hasattr(exc, "response") else str(exc)
        raise HTTPException(status_code=502, detail=f"AI provider error: {detail[:200]}") from exc

    payload = response.json()
    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    for pattern in (r"```json\s*\n([\s\S]+?)\n\s*```", r"```([\s\S]+?)```"):
        match = re.search(pattern, content)
        if match:
            content = match.group(1).strip()
            break
    try:
        return json.loads(content)
    except Exception:
        return {"reasoning": "Failed to parse AI response", "candidates": []}


@router.get('/{event_id}/postprod/available-editors')
async def available_editors(
    event_id: str,
    stream: StreamType = Query('photo'),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    org_id = current_user.get('orgId')
    return await _list_available_editors(org_id, event_id, stream)


@router.get('/{event_id}/postprod/suggest-editors')
async def suggest_editors(
    event_id: str,
    stream: StreamType = Query('photo'),
    current_user: dict = Depends(get_current_user),
):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    org_id = current_user.get('orgId')
    availability = await _list_available_editors(org_id, event_id, stream)
    available = availability.get('availableEditors', [])

    prompt = (
        "You are an expert post-production coordinator.\n"
        f"Event has a {stream} stream. Select a LEAD editor and up to two ASSIST editors from the AVAILABLE list.\n"
        "Choose based on skills match and low currentWorkload. Only pick from AVAILABLE.\n\n"
        f"AVAILABLE:\n{json.dumps(available)[:4000]}\n\n"
        "Respond strictly as JSON: {\"lead\": {\"uid\":\"...\",\"displayName\":\"...\"}, "
        "\"assistants\": [{\"uid\":\"...\",\"displayName\":\"...\"}]}. If none suitable, return empty arrays."
    )

    try:
        ai = _openrouter_suggest(prompt)
    except HTTPException as exc:
        if exc.status_code == 500:
            raise HTTPException(status_code=404, detail='AI not available')
        raise

    lead = ai.get('lead') if isinstance(ai.get('lead'), dict) else None
    assistants = ai.get('assistants') if isinstance(ai.get('assistants'), list) else []

    return {
        'lead': lead,
        'assistants': assistants,
        'candidates': available[:10],
    }
