"""
PostProd Availability router - Team member availability management
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, date, timedelta
from pydantic import BaseModel

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user
from shared.redis_client import cache


router = APIRouter()


# ============ SCHEMAS ============

class AvailabilitySlotCreate(BaseModel):
    user_id: str
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    available: bool = True
    notes: Optional[str] = None


class AvailabilityBulkCreate(BaseModel):
    user_id: str
    start_date: str
    end_date: str
    weekdays: List[int]  # 0=Monday, 6=Sunday
    start_time: str
    end_time: str


class TimeOffRequest(BaseModel):
    user_id: str
    start_date: str
    end_date: str
    reason: str
    type: str = "vacation"  # vacation, sick, personal, other


# ============ AVAILABILITY SLOTS ============

@router.get("/")
@cache(ttl=120)
async def get_availability(
    org_code: str,
    user_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get availability slots for team members"""
    db = get_db()
    
    query = db.collection(Collections.POSTPROD_AVAILABILITY).where("org_code", "==", org_code)
    
    if user_id:
        query = query.where("user_id", "==", user_id)
    
    if start_date:
        query = query.where("date", ">=", start_date)
    
    if end_date:
        query = query.where("date", "<=", end_date)
    
    docs = query.stream()
    slots = []
    
    for doc in docs:
        slot = doc.to_dict()
        slot["id"] = doc.id
        slots.append(slot)
    
    return {"availability": slots, "count": len(slots)}


@router.post("/")
async def create_availability_slot(
    slot: AvailabilitySlotCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create an availability slot"""
    db = get_db()
    
    slot_data = slot.dict()
    slot_data["org_code"] = org_code
    slot_data["created_at"] = datetime.utcnow().isoformat()
    slot_data["created_by"] = current_user["user_id"]
    
    doc_ref = db.collection(Collections.POSTPROD_AVAILABILITY).document()
    doc_ref.set(slot_data)
    
    return {"id": doc_ref.id, "message": "Availability slot created"}


@router.post("/bulk")
async def create_bulk_availability(
    bulk: AvailabilityBulkCreate,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Create recurring availability slots"""
    db = get_db()
    
    start = datetime.strptime(bulk.start_date, "%Y-%m-%d").date()
    end = datetime.strptime(bulk.end_date, "%Y-%m-%d").date()
    
    batch = db.batch()
    slots_created = 0
    
    current = start
    while current <= end:
        if current.weekday() in bulk.weekdays:
            slot_data = {
                "user_id": bulk.user_id,
                "org_code": org_code,
                "date": current.isoformat(),
                "start_time": bulk.start_time,
                "end_time": bulk.end_time,
                "available": True,
                "created_at": datetime.utcnow().isoformat(),
                "created_by": current_user["user_id"]
            }
            
            doc_ref = db.collection(Collections.POSTPROD_AVAILABILITY).document()
            batch.set(doc_ref, slot_data)
            slots_created += 1
        
        current += timedelta(days=1)
    
    batch.commit()
    
    return {"message": f"Created {slots_created} availability slots"}


@router.delete("/{slot_id}")
async def delete_availability_slot(
    slot_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an availability slot"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_AVAILABILITY).document(slot_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Slot not found")
    
    doc_ref.delete()
    
    return {"message": "Availability slot deleted"}


# ============ TIME OFF ============

@router.get("/time-off")
async def get_time_off_requests(
    org_code: str,
    user_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get time off requests"""
    db = get_db()
    
    query = db.collection(Collections.POSTPROD_TIME_OFF).where("org_code", "==", org_code)
    
    if user_id:
        query = query.where("user_id", "==", user_id)
    
    if status:
        query = query.where("status", "==", status)
    
    docs = query.stream()
    requests = []
    
    for doc in docs:
        req = doc.to_dict()
        req["id"] = doc.id
        requests.append(req)
    
    return {"time_off_requests": requests, "count": len(requests)}


@router.post("/time-off")
async def request_time_off(
    request: TimeOffRequest,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Submit a time off request"""
    db = get_db()
    
    request_data = request.dict()
    request_data["org_code"] = org_code
    request_data["created_at"] = datetime.utcnow().isoformat()
    request_data["status"] = "pending"
    
    doc_ref = db.collection(Collections.POSTPROD_TIME_OFF).document()
    doc_ref.set(request_data)
    
    return {"id": doc_ref.id, "message": "Time off request submitted"}


@router.post("/time-off/{request_id}/approve")
async def approve_time_off(
    request_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Approve a time off request"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_TIME_OFF).document(request_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Request not found")
    
    doc_ref.update({
        "status": "approved",
        "approved_at": datetime.utcnow().isoformat(),
        "approved_by": current_user["user_id"]
    })
    
    # Mark availability as unavailable for those dates
    request_data = doc.to_dict()
    start = datetime.strptime(request_data["start_date"], "%Y-%m-%d").date()
    end = datetime.strptime(request_data["end_date"], "%Y-%m-%d").date()
    
    batch = db.batch()
    current = start
    while current <= end:
        slot_data = {
            "user_id": request_data["user_id"],
            "org_code": request_data["org_code"],
            "date": current.isoformat(),
            "available": False,
            "reason": f"Time off: {request_data['type']}",
            "time_off_request_id": request_id
        }
        slot_ref = db.collection(Collections.POSTPROD_AVAILABILITY).document()
        batch.set(slot_ref, slot_data)
        current += timedelta(days=1)
    
    batch.commit()
    
    return {"message": "Time off approved"}


@router.post("/time-off/{request_id}/reject")
async def reject_time_off(
    request_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Reject a time off request"""
    db = get_db()
    doc_ref = db.collection(Collections.POSTPROD_TIME_OFF).document(request_id)
    
    if not doc_ref.get().exists:
        raise HTTPException(status_code=404, detail="Request not found")
    
    doc_ref.update({
        "status": "rejected",
        "rejected_at": datetime.utcnow().isoformat(),
        "rejected_by": current_user["user_id"],
        "rejection_reason": reason
    })
    
    return {"message": "Time off rejected"}


# ============ TEAM CALENDAR ============

@router.get("/calendar")
@cache(ttl=60)
async def get_team_calendar(
    org_code: str,
    month: str,  # YYYY-MM format
    current_user: dict = Depends(get_current_user)
):
    """Get team availability calendar for a month"""
    db = get_db()
    
    # Parse month
    year, month_num = map(int, month.split("-"))
    start_date = date(year, month_num, 1)
    if month_num == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month_num + 1, 1) - timedelta(days=1)
    
    # Get all availability for the month
    availability_docs = db.collection(Collections.POSTPROD_AVAILABILITY)\
        .where("org_code", "==", org_code)\
        .where("date", ">=", start_date.isoformat())\
        .where("date", "<=", end_date.isoformat())\
        .stream()
    
    # Get all assignments for the month
    assignments_docs = db.collection(Collections.POSTPROD_ASSIGNMENTS)\
        .where("org_code", "==", org_code)\
        .where("status", "==", "active")\
        .stream()
    
    # Build calendar
    calendar = {}
    
    for doc in availability_docs:
        data = doc.to_dict()
        date_key = data["date"]
        user_id = data["user_id"]
        
        if date_key not in calendar:
            calendar[date_key] = {}
        
        if user_id not in calendar[date_key]:
            calendar[date_key][user_id] = {
                "available": data.get("available", True),
                "slots": [],
                "assignments": []
            }
        
        if data.get("start_time") and data.get("end_time"):
            calendar[date_key][user_id]["slots"].append({
                "start": data["start_time"],
                "end": data["end_time"]
            })
    
    for doc in assignments_docs:
        data = doc.to_dict()
        assignment_dates = data.get("dates", [])
        user_id = data["user_id"]
        
        for date_key in assignment_dates:
            if start_date.isoformat() <= date_key <= end_date.isoformat():
                if date_key not in calendar:
                    calendar[date_key] = {}
                if user_id not in calendar[date_key]:
                    calendar[date_key][user_id] = {
                        "available": True,
                        "slots": [],
                        "assignments": []
                    }
                calendar[date_key][user_id]["assignments"].append({
                    "project_id": data.get("project_id"),
                    "task": data.get("task_name"),
                    "hours": data.get("estimated_hours")
                })
    
    return {"calendar": calendar, "month": month}
