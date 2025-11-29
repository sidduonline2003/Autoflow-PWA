"""
Attendance Router - Employee attendance tracking
"""

import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore
from pydantic import BaseModel

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user
from shared.firebase_client import get_db

router = APIRouter(prefix="/attendance", tags=["Attendance"])


class AttendanceMarkRequest(BaseModel):
    type: str  # "check_in" or "check_out"
    notes: Optional[str] = None
    location: Optional[dict] = None


class AttendanceUpdateRequest(BaseModel):
    checkIn: Optional[str] = None
    checkOut: Optional[str] = None
    notes: Optional[str] = None


@router.post("/mark")
async def mark_attendance(req: AttendanceMarkRequest, current_user: dict = Depends(get_current_user)):
    """Mark check-in or check-out"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    today = datetime.date.today().isoformat()
    
    db = get_db()
    attendance_ref = db.collection('organizations', org_id, 'attendance').document(f"{user_id}_{today}")
    attendance_doc = attendance_ref.get()
    
    now = datetime.datetime.now(datetime.timezone.utc)
    
    if req.type == "check_in":
        if attendance_doc.exists and attendance_doc.to_dict().get("checkIn"):
            raise HTTPException(status_code=400, detail="Already checked in today")
        
        attendance_ref.set({
            "userId": user_id,
            "date": today,
            "checkIn": now,
            "location": req.location,
            "notes": req.notes,
            "createdAt": now
        }, merge=True)
        
        return {"status": "success", "message": "Checked in", "time": now.isoformat()}
    
    elif req.type == "check_out":
        if not attendance_doc.exists or not attendance_doc.to_dict().get("checkIn"):
            raise HTTPException(status_code=400, detail="Must check in first")
        
        attendance_ref.update({
            "checkOut": now,
            "checkOutNotes": req.notes,
            "updatedAt": now
        })
        
        return {"status": "success", "message": "Checked out", "time": now.isoformat()}
    
    else:
        raise HTTPException(status_code=400, detail="Invalid type. Use 'check_in' or 'check_out'")


@router.get("/today")
async def get_today_attendance(current_user: dict = Depends(get_current_user)):
    """Get current user's attendance for today"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    today = datetime.date.today().isoformat()
    
    db = get_db()
    attendance_ref = db.collection('organizations', org_id, 'attendance').document(f"{user_id}_{today}")
    attendance_doc = attendance_ref.get()
    
    if not attendance_doc.exists:
        return {"status": "not_checked_in", "date": today}
    
    data = attendance_doc.to_dict()
    return {
        "status": "checked_out" if data.get("checkOut") else "checked_in",
        "date": today,
        **data
    }


@router.get("/history")
async def get_attendance_history(
    user_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get attendance history"""
    org_id = current_user.get("orgId")
    target_user = user_id or current_user.get("uid")
    
    # Only admin can view others' attendance
    if target_user != current_user.get("uid") and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'attendance').where('userId', '==', target_user)
    
    if start_date:
        query = query.where('date', '>=', start_date)
    if end_date:
        query = query.where('date', '<=', end_date)
    
    records = []
    for doc in query.stream():
        record = doc.to_dict()
        record['id'] = doc.id
        records.append(record)
    
    return {"records": records, "count": len(records)}


@router.get("/team")
async def get_team_attendance(
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get team attendance for a specific date (admin only)"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    target_date = date or datetime.date.today().isoformat()
    
    db = get_db()
    query = db.collection('organizations', org_id, 'attendance').where('date', '==', target_date)
    
    records = []
    for doc in query.stream():
        record = doc.to_dict()
        record['id'] = doc.id
        records.append(record)
    
    return {"date": target_date, "records": records, "count": len(records)}
