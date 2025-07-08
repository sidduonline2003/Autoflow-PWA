from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel
from typing import Optional, List, Dict, Tuple
import datetime
import math
import requests
import json
import asyncio
import aiohttp

from ..dependencies import get_current_user

router = APIRouter(
    prefix="/attendance",
    tags=["Attendance Management"],
)

# Ola Maps API configuration
OLA_MAPS_API_KEY = "your_ola_maps_api_key"  # Set this in environment variables
OLA_MAPS_BASE_URL = "https://api.olamaps.io/places/v1"

# --- Pydantic Models ---
class CheckInRequest(BaseModel):
    eventId: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    timestamp: Optional[str] = None

class CheckOutRequest(BaseModel):
    eventId: str
    latitude: float
    longitude: float
    notes: Optional[str] = None

class AttendanceRecord(BaseModel):
    userId: str
    eventId: str
    checkInTime: datetime.datetime
    checkInLocation: dict
    checkOutTime: Optional[datetime.datetime] = None
    checkOutLocation: Optional[dict] = None
    status: str  # 'checked_in', 'checked_out', 'late', 'no_show'
    distance: float  # Distance from venue in meters
    notes: Optional[str] = None

# --- Helper Functions ---
def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points using Haversine formula"""
    R = 6371000  # Earth's radius in meters
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = (math.sin(delta_phi/2) * math.sin(delta_phi/2) + 
         math.cos(phi1) * math.cos(phi2) * 
         math.sin(delta_lambda/2) * math.sin(delta_lambda/2))
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def parse_venue_coordinates(venue: str) -> Optional[tuple]:
    """Extract coordinates from venue string if available"""
    # This is a simple implementation - can be enhanced with geocoding
    # Format expected: "Venue Name, City (lat,lng)" or just coordinates
    try:
        if '(' in venue and ')' in venue:
            coords_part = venue.split('(')[1].split(')')[0]
            if ',' in coords_part:
                lat, lng = map(float, coords_part.split(','))
                return (lat, lng)
    except:
        pass
    return None

async def geocode_venue_with_ola_maps(venue: str) -> Optional[Tuple[float, float]]:
    """Geocode venue address using Ola Maps API"""
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{OLA_MAPS_BASE_URL}/geocode"
            params = {
                'address': venue,
                'api_key': OLA_MAPS_API_KEY
            }
            
            async with session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get('geocodingResults') and len(data['geocodingResults']) > 0:
                        location = data['geocodingResults'][0]['geometry']['location']
                        return (location['lat'], location['lng'])
    except Exception as e:
        print(f"Error geocoding with Ola Maps: {e}")
    
    return None

def get_venue_coordinates(venue: str) -> Tuple[float, float]:
    """Get venue coordinates with fallback options"""
    # First try to parse from venue string
    coords = parse_venue_coordinates(venue)
    if coords:
        return coords
    
    # Try geocoding with Ola Maps (you'd need to implement async properly)
    # For now, use default coordinates as fallback
    return (17.4065, 78.4772)  # Hyderabad coordinates as fallback

# Enhanced GPS and venue location functions
def validate_location_accuracy(accuracy: float) -> bool:
    """Validate if GPS accuracy is sufficient for check-in"""
    # Require accuracy better than 50 meters
    return accuracy <= 900.0

def calculate_venue_proximity_score(distance: float, accuracy: float) -> Dict[str, any]:
    """Calculate a comprehensive proximity score"""
    # Base proximity score
    if distance <= 50:
        proximity_score = 100
        proximity_level = "excellent"
    elif distance <= 100:
        proximity_score = 80
        proximity_level = "good"
    elif distance <= 200:
        proximity_score = 60
        proximity_level = "acceptable"
    elif distance <= 500:
        proximity_score = 40
        proximity_level = "far"
    else:
        proximity_score = 20
        proximity_level = "very_far"
    
    # Adjust for GPS accuracy
    if accuracy > 50:
        proximity_score *= 0.8  # Reduce score for poor accuracy
    
    return {
        "score": min(100, max(0, proximity_score)),
        "level": proximity_level,
        "distance": distance,
        "accuracy": accuracy,
        "is_within_range": distance <= 100,
        "is_accurate": accuracy <= 50
    }

def get_venue_coordinates_enhanced(venue: str) -> Tuple[float, float]:
    """Get venue coordinates with enhanced fallback options"""
    # First try to parse from venue string
    coords = parse_venue_coordinates(venue)
    if coords:
        return coords
    
    # For demo purposes, use default coordinates
    # In production, you would integrate with Ola Maps geocoding API here
    return (17.4065, 78.4772)  # Hyderabad coordinates as fallback

def calculate_direction(lat1: float, lon1: float, lat2: float, lon2: float) -> str:
    """Calculate direction from current location to venue"""
    dLon = math.radians(lon2 - lon1)
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    
    y = math.sin(dLon) * math.cos(lat2_rad)
    x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(dLon)
    
    bearing = math.atan2(y, x) * 180 / math.pi
    normalized_bearing = (bearing + 360) % 360
    
    directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    index = round(normalized_bearing / 45) % 8
    
    return directions[index]

# --- Attendance Endpoints ---

@router.post("/check-in")
async def check_in_to_event(req: CheckInRequest, current_user: dict = Depends(get_current_user)):
    """Check in to an event with GPS location verification"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    try:
        db = firestore.client()
        
        # Find the event across all clients in the organization
        clients_ref = db.collection('organizations', org_id, 'clients')
        event_found = False
        event_data = None
        client_id = None
        
        for client_doc in clients_ref.stream():
            try:
                event_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events').document(req.eventId)
                event_doc = event_ref.get()
                
                if event_doc.exists:
                    event_data = event_doc.to_dict()
                    if event_data:
                        # Check if user is assigned to this event
                        assigned_crew = event_data.get('assignedCrew', [])
                        if any(member.get('userId') == user_id for member in assigned_crew):
                            event_found = True
                            client_id = client_doc.id
                            break
            except Exception:
                continue
        
        if not event_found:
            raise HTTPException(status_code=404, detail="Event not found or you are not assigned to this event")
        
        # Get venue coordinates (this could be enhanced with geocoding API)
        venue = event_data.get('venue', '')
        venue_coords = parse_venue_coordinates(venue)
        
        # For now, if no coordinates in venue, use a default location or require coordinates to be set
        if not venue_coords:
            # Default coordinates for demo - should be set in event creation
            venue_coords = (17.4065, 78.4772)  # Hyderabad coordinates as fallback
        
        venue_lat, venue_lng = venue_coords
        
        # Calculate distance from venue
        distance = calculate_distance(req.latitude, req.longitude, venue_lat, venue_lng)
        
        # Check if within acceptable range (100 meters)
        max_distance = 100  # meters
        is_within_range = distance <= max_distance
        
        # Check if already checked in
        attendance_ref = db.collection('organizations', org_id, 'attendance')
        existing_query = attendance_ref.where('userId', '==', user_id).where('eventId', '==', req.eventId).limit(1)
        existing_docs = list(existing_query.stream())
        
        if existing_docs:
            existing_record = existing_docs[0].to_dict()
            if existing_record.get('status') == 'checked_in':
                raise HTTPException(status_code=400, detail="You are already checked in to this event")
        
        # Determine status based on distance and time
        event_time = event_data.get('time', '')
        event_date = event_data.get('date', '')
        current_time = datetime.datetime.now(datetime.timezone.utc)
        
        # Parse event datetime if available
        is_late = False
        if event_date and event_time:
            try:
                event_datetime_str = f"{event_date} {event_time}"
                event_datetime = datetime.datetime.strptime(event_datetime_str, "%Y-%m-%d %H:%M")
                event_datetime = event_datetime.replace(tzinfo=datetime.timezone.utc)
                is_late = current_time > event_datetime
            except:
                pass
        
        # Determine check-in status
        if not is_within_range:
            status = "checked_in_remote"  # Allow but mark as remote
        elif is_late:
            status = "checked_in_late"
        else:
            status = "checked_in"
        
        # Create attendance record
        attendance_data = {
            "userId": user_id,
            "eventId": req.eventId,
            "clientId": client_id,
            "eventName": event_data.get('name', 'Unknown Event'),
            "checkInTime": current_time,
            "checkInLocation": {
                "latitude": req.latitude,
                "longitude": req.longitude,
                "accuracy": req.accuracy
            },
            "venueLocation": {
                "latitude": venue_lat,
                "longitude": venue_lng
            },
            "distance": distance,
            "status": status,
            "isWithinRange": is_within_range,
            "createdAt": current_time,
            "updatedAt": current_time
        }
        
        # Save attendance record
        if existing_docs:
            # Update existing record
            attendance_ref.document(existing_docs[0].id).update(attendance_data)
            attendance_id = existing_docs[0].id
        else:
            # Create new record
            attendance_doc = attendance_ref.document()
            attendance_doc.set(attendance_data)
            attendance_id = attendance_doc.id
        
        return {
            "status": "success",
            "message": "Check-in successful" if is_within_range else "Check-in recorded (outside venue range)",
            "attendanceId": attendance_id,
            "distance": round(distance, 2),
            "isWithinRange": is_within_range,
            "checkInStatus": status,
            "venueDistance": f"{round(distance, 2)}m from venue",
            "eventDetails": {
                "name": event_data.get('name'),
                "date": event_data.get('date'),
                "time": event_data.get('time'),
                "venue": venue
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Check-in failed: {str(e)}")

@router.post("/check-out")
async def check_out_from_event(req: CheckOutRequest, current_user: dict = Depends(get_current_user)):
    """Check out from an event"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    try:
        db = firestore.client()
        
        # Find existing attendance record
        attendance_ref = db.collection('organizations', org_id, 'attendance')
        attendance_query = attendance_ref.where('userId', '==', user_id).where('eventId', '==', req.eventId).limit(1)
        attendance_docs = list(attendance_query.stream())
        
        if not attendance_docs:
            raise HTTPException(status_code=404, detail="No check-in record found for this event")
        
        attendance_doc = attendance_docs[0]
        attendance_data = attendance_doc.to_dict()
        
        if attendance_data.get('checkOutTime'):
            raise HTTPException(status_code=400, detail="You have already checked out from this event")
        
        current_time = datetime.datetime.now(datetime.timezone.utc)
        
        # Calculate work duration
        check_in_time = attendance_data.get('checkInTime')
        duration_hours = 0
        if check_in_time:
            if isinstance(check_in_time, str):
                check_in_time = datetime.datetime.fromisoformat(check_in_time.replace('Z', '+00:00'))
            duration = current_time - check_in_time
            duration_hours = duration.total_seconds() / 3600
        
        # Update attendance record with check-out
        update_data = {
            "checkOutTime": current_time,
            "checkOutLocation": {
                "latitude": req.latitude,
                "longitude": req.longitude
            },
            "status": "checked_out",
            "workDurationHours": round(duration_hours, 2),
            "notes": req.notes,
            "updatedAt": current_time
        }
        
        attendance_ref.document(attendance_doc.id).update(update_data)
        
        return {
            "status": "success",
            "message": "Check-out successful",
            "workDuration": f"{round(duration_hours, 2)} hours",
            "checkOutTime": current_time.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Check-out failed: {str(e)}")

@router.get("/event/{event_id}/status")
async def get_event_attendance_status(event_id: str, current_user: dict = Depends(get_current_user)):
    """Get attendance status for a specific event (for team members)"""
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not org_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing organization or user information")
    
    try:
        db = firestore.client()
        
        # Get user's attendance record for this event
        attendance_ref = db.collection('organizations', org_id, 'attendance')
        attendance_query = attendance_ref.where('userId', '==', user_id).where('eventId', '==', event_id).limit(1)
        attendance_docs = list(attendance_query.stream())
        
        if not attendance_docs:
            return {
                "status": "not_checked_in",
                "message": "You haven't checked in to this event yet",
                "canCheckIn": True,
                "canCheckOut": False
            }
        
        attendance_data = attendance_docs[0].to_dict()
        
        return {
            "status": attendance_data.get('status'),
            "checkInTime": attendance_data.get('checkInTime'),
            "checkOutTime": attendance_data.get('checkOutTime'),
            "distance": attendance_data.get('distance'),
            "isWithinRange": attendance_data.get('isWithinRange'),
            "workDurationHours": attendance_data.get('workDurationHours'),
            "canCheckIn": attendance_data.get('status') not in ['checked_in', 'checked_in_late', 'checked_in_remote'],
            "canCheckOut": attendance_data.get('status') in ['checked_in', 'checked_in_late', 'checked_in_remote'] and not attendance_data.get('checkOutTime'),
            "eventDetails": {
                "name": attendance_data.get('eventName'),
                "venue": attendance_data.get('venue')
            }
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get attendance status: {str(e)}")

@router.get("/event/{event_id}/admin")
async def get_event_attendance_admin(event_id: str, client_id: str, current_user: dict = Depends(get_current_user)):
    """Get all attendance records for an event (for admins)"""
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
        assigned_crew = event_data.get('assignedCrew', [])
        
        # Get attendance records for this event
        attendance_ref = db.collection('organizations', org_id, 'attendance')
        attendance_query = attendance_ref.where('eventId', '==', event_id)
        attendance_docs = list(attendance_query.stream())
        
        # Create attendance map
        attendance_map = {}
        for doc in attendance_docs:
            data = doc.to_dict()
            attendance_map[data['userId']] = data
        
        # Build response with all assigned crew members
        attendance_records = []
        for crew_member in assigned_crew:
            user_id = crew_member.get('userId')
            attendance = attendance_map.get(user_id, {})
            
            record = {
                "userId": user_id,
                "name": crew_member.get('name'),
                "role": crew_member.get('role'),
                "status": attendance.get('status', 'not_checked_in'),
                "checkInTime": attendance.get('checkInTime'),
                "checkOutTime": attendance.get('checkOutTime'),
                "distance": attendance.get('distance'),
                "isWithinRange": attendance.get('isWithinRange'),
                "workDurationHours": attendance.get('workDurationHours'),
                "checkInLocation": attendance.get('checkInLocation'),
                "checkOutLocation": attendance.get('checkOutLocation')
            }
            attendance_records.append(record)
        
        return {
            "eventId": event_id,
            "eventName": event_data.get('name'),
            "eventDate": event_data.get('date'),
            "eventTime": event_data.get('time'),
            "venue": event_data.get('venue'),
            "totalAssigned": len(assigned_crew),
            "checkedIn": len([r for r in attendance_records if r['status'] in ['checked_in', 'checked_in_late', 'checked_in_remote']]),
            "checkedOut": len([r for r in attendance_records if r['status'] == 'checked_out']),
            "attendanceRecords": attendance_records
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get attendance records: {str(e)}")

@router.get("/dashboard/live")
async def get_live_attendance_dashboard(current_user: dict = Depends(get_current_user)):
    """Get live attendance dashboard for admins"""
    org_id = current_user.get("orgId")
    
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        current_date = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
        
        # Get all events for today
        clients_ref = db.collection('organizations', org_id, 'clients')
        today_events = []
        
        for client_doc in clients_ref.stream():
            events_ref = db.collection('organizations', org_id, 'clients', client_doc.id, 'events')
            events_query = events_ref.where('date', '==', current_date)
            
            for event_doc in events_query.stream():
                event_data = event_doc.to_dict()
                event_data['id'] = event_doc.id
                event_data['clientId'] = client_doc.id
                event_data['clientName'] = client_doc.to_dict().get('profile', {}).get('name', 'Unknown Client')
                today_events.append(event_data)
        
        # Get attendance for today's events
        attendance_ref = db.collection('organizations', org_id, 'attendance')
        attendance_query = attendance_ref.where('checkInTime', '>=', 
                                               datetime.datetime.now(datetime.timezone.utc).replace(hour=0, minute=0, second=0))
        attendance_docs = list(attendance_query.stream())
        
        # Process attendance by event
        events_with_attendance = []
        for event in today_events:
            event_attendance = [doc.to_dict() for doc in attendance_docs if doc.to_dict().get('eventId') == event['id']]
            assigned_crew = event.get('assignedCrew', [])
            
            events_with_attendance.append({
                "eventId": event['id'],
                "eventName": event.get('name'),
                "clientName": event.get('clientName'),
                "time": event.get('time'),
                "venue": event.get('venue'),
                "status": event.get('status'),
                "totalAssigned": len(assigned_crew),
                "checkedIn": len([a for a in event_attendance if a.get('status') in ['checked_in', 'checked_in_late', 'checked_in_remote']]),
                "checkedOut": len([a for a in event_attendance if a.get('status') == 'checked_out']),
                "lateArrivals": len([a for a in event_attendance if a.get('status') == 'checked_in_late']),
                "remoteCheckIns": len([a for a in event_attendance if a.get('status') == 'checked_in_remote']),
                "attendanceRecords": event_attendance
            })
        
        # Calculate summary statistics
        total_events = len(today_events)
        total_assigned = sum(len(event.get('assignedCrew', [])) for event in today_events)
        total_checked_in = sum(event['checkedIn'] for event in events_with_attendance)
        total_checked_out = sum(event['checkedOut'] for event in events_with_attendance)
        
        return {
            "date": current_date,
            "summary": {
                "totalEvents": total_events,
                "totalAssigned": total_assigned,
                "totalCheckedIn": total_checked_in,
                "totalCheckedOut": total_checked_out,
                "attendanceRate": round((total_checked_in / total_assigned * 100) if total_assigned > 0 else 0, 1)
            },
            "events": events_with_attendance
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get live dashboard: {str(e)}")
