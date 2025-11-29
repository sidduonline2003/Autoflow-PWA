"""
Suggestions router - AI-powered smart suggestions for workflows
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List
from datetime import datetime, date, timedelta
from pydantic import BaseModel

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.firebase_client import get_db, Collections
from shared.auth import get_current_user


router = APIRouter()


# ============ SCHEMAS ============

class EventSuggestionRequest(BaseModel):
    event_type: str
    event_date: str
    client_id: Optional[str] = None
    location: Optional[str] = None
    guest_count: Optional[int] = None


class TeamSuggestionRequest(BaseModel):
    event_id: Optional[str] = None
    roles_needed: List[str] = []
    event_date: str
    duration_hours: Optional[int] = 8


class PricingSuggestionRequest(BaseModel):
    event_type: str
    duration_hours: int
    services: List[str] = []
    location: Optional[str] = None
    guest_count: Optional[int] = None


# ============ EVENT SUGGESTIONS ============

@router.post("/event-setup")
async def suggest_event_setup(
    request: EventSuggestionRequest,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Suggest event setup based on event type and history"""
    db = get_db()
    
    # Get similar past events
    similar_events = list(db.collection(Collections.EVENTS)
                          .where("org_code", "==", org_code)
                          .where("event_type", "==", request.event_type)
                          .limit(20).stream())
    
    # Analyze past events for patterns
    equipment_used = {}
    team_sizes = []
    durations = []
    
    for event_doc in similar_events:
        event = event_doc.to_dict()
        
        # Get equipment used
        checkouts = list(db.collection(Collections.EQUIPMENT_CHECKOUTS)
                        .where("event_id", "==", event_doc.id).stream())
        for checkout in checkouts:
            eq_type = checkout.to_dict().get("equipment_type", "other")
            equipment_used[eq_type] = equipment_used.get(eq_type, 0) + 1
        
        # Get team size
        assignments = list(db.collection(Collections.EVENT_ASSIGNMENTS)
                          .where("event_id", "==", event_doc.id).stream())
        team_sizes.append(len(assignments))
        
        # Get duration
        if event.get("duration"):
            durations.append(event["duration"])
    
    # Build suggestions
    suggestions = {
        "event_type": request.event_type,
        "recommended_equipment": [],
        "recommended_team_size": 0,
        "typical_duration": 0,
        "tips": []
    }
    
    # Equipment recommendations
    if equipment_used:
        sorted_equipment = sorted(equipment_used.items(), key=lambda x: x[1], reverse=True)
        suggestions["recommended_equipment"] = [
            {"type": eq[0], "frequency": eq[1], "usage_percent": eq[1] / len(similar_events) * 100}
            for eq in sorted_equipment[:5]
        ]
    
    # Team size
    if team_sizes:
        avg_team = sum(team_sizes) / len(team_sizes)
        suggestions["recommended_team_size"] = round(avg_team)
        
        # Adjust for guest count
        if request.guest_count:
            guest_factor = request.guest_count / 100  # 1 extra per 100 guests
            suggestions["recommended_team_size"] = max(
                suggestions["recommended_team_size"],
                round(avg_team + guest_factor)
            )
    
    # Duration
    if durations:
        suggestions["typical_duration"] = sum(durations) / len(durations)
    
    # AI-generated tips
    try:
        from gemini_client import get_gemini_client
        client = get_gemini_client()
        
        prompt = f"""Give 3 brief, actionable tips for a {request.event_type} event:
- Guest count: {request.guest_count or 'Unknown'}
- Location: {request.location or 'Not specified'}
- Date: {request.event_date}

Format as a JSON array of strings, each tip under 100 characters."""

        result = await client.generate_text(
            prompt=prompt,
            task_type="general",
            temperature=0.5
        )
        
        import json
        try:
            tips = json.loads(result["text"].strip().replace("```json", "").replace("```", ""))
            if isinstance(tips, list):
                suggestions["tips"] = tips[:3]
        except:
            suggestions["tips"] = [result["text"][:200]]
            
    except Exception as e:
        suggestions["tips"] = [
            "Arrive early to set up equipment",
            "Prepare backup equipment",
            "Confirm timeline with client"
        ]
    
    return {
        "based_on_events": len(similar_events),
        "suggestions": suggestions
    }


# ============ TEAM SUGGESTIONS ============

@router.post("/team-assignment")
async def suggest_team_assignment(
    request: TeamSuggestionRequest,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Suggest optimal team assignments for an event"""
    db = get_db()
    event_date = request.event_date
    
    # Get all active team members
    team_docs = list(db.collection(Collections.TEAM)
                     .where("org_code", "==", org_code)
                     .where("status", "==", "active").stream())
    
    suggestions = []
    
    for doc in team_docs:
        member = doc.to_dict()
        member_id = doc.id
        member_role = member.get("role", "")
        
        # Check if role matches
        role_match = not request.roles_needed or member_role in request.roles_needed
        
        # Check availability (no other assignments that day)
        existing_assignments = list(db.collection(Collections.EVENT_ASSIGNMENTS)
                                   .where("employee_id", "==", member_id)
                                   .where("event_date", "==", event_date).stream())
        is_available = len(existing_assignments) == 0
        
        # Check leave status
        leave_requests = list(db.collection(Collections.LEAVE)
                             .where("employee_id", "==", member_id)
                             .where("start_date", "<=", event_date)
                             .where("end_date", ">=", event_date)
                             .where("status", "==", "approved").stream())
        on_leave = len(leave_requests) > 0
        
        # Calculate experience (events worked)
        past_assignments = list(db.collection(Collections.EVENT_ASSIGNMENTS)
                               .where("employee_id", "==", member_id).limit(50).stream())
        experience_score = min(100, len(past_assignments) * 5)
        
        # Get recent attendance rate
        recent_attendance = list(db.collection(Collections.ATTENDANCE)
                                .where("employee_id", "==", member_id)
                                .order_by("date", direction="DESCENDING")
                                .limit(30).stream())
        
        if recent_attendance:
            present_count = sum(1 for a in recent_attendance if a.to_dict().get("status") == "present")
            reliability_score = present_count / len(recent_attendance) * 100
        else:
            reliability_score = 80  # Default
        
        # Overall score
        overall_score = (experience_score * 0.4 + reliability_score * 0.6) if is_available and not on_leave else 0
        
        suggestions.append({
            "employee_id": member_id,
            "name": member.get("name", "Unknown"),
            "role": member_role,
            "is_available": is_available,
            "on_leave": on_leave,
            "role_matches": role_match,
            "experience_score": experience_score,
            "reliability_score": reliability_score,
            "overall_score": overall_score,
            "recommendation": "highly_recommended" if overall_score > 80 and role_match else 
                             "recommended" if overall_score > 60 and role_match else
                             "available" if is_available and not on_leave else
                             "unavailable"
        })
    
    # Sort by overall score
    suggestions.sort(key=lambda x: x["overall_score"], reverse=True)
    
    return {
        "event_date": event_date,
        "roles_requested": request.roles_needed,
        "total_team_members": len(team_docs),
        "available_members": len([s for s in suggestions if s["is_available"] and not s["on_leave"]]),
        "suggestions": suggestions,
        "top_recommendations": [s for s in suggestions if s["recommendation"] in ["highly_recommended", "recommended"]][:5]
    }


# ============ PRICING SUGGESTIONS ============

@router.post("/pricing")
async def suggest_pricing(
    request: PricingSuggestionRequest,
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Suggest pricing based on event type and historical data"""
    db = get_db()
    
    # Get similar past invoices
    similar_invoices = list(db.collection(Collections.INVOICES)
                            .where("org_code", "==", org_code)
                            .limit(100).stream())
    
    # Filter by event type (if linked to events)
    matching_prices = []
    
    for inv_doc in similar_invoices:
        inv = inv_doc.to_dict()
        if inv.get("event_type") == request.event_type or not inv.get("event_type"):
            matching_prices.append({
                "total": float(inv.get("total", 0)),
                "event_type": inv.get("event_type"),
                "services": inv.get("services", [])
            })
    
    # Calculate statistics
    if matching_prices:
        amounts = [p["total"] for p in matching_prices if p["total"] > 0]
        if amounts:
            avg_price = sum(amounts) / len(amounts)
            min_price = min(amounts)
            max_price = max(amounts)
        else:
            avg_price = min_price = max_price = 0
    else:
        avg_price = min_price = max_price = 0
    
    # Base price estimation
    base_price = avg_price if avg_price > 0 else 2000  # Default fallback
    
    # Adjustments
    adjustments = []
    
    # Duration adjustment
    if request.duration_hours > 8:
        extra_hours = request.duration_hours - 8
        duration_adjustment = extra_hours * (base_price * 0.1)  # 10% per extra hour
        adjustments.append({
            "type": "duration",
            "reason": f"{extra_hours} extra hours beyond standard 8 hours",
            "amount": duration_adjustment
        })
    
    # Guest count adjustment
    if request.guest_count and request.guest_count > 100:
        guest_adjustment = (request.guest_count - 100) * 5  # $5 per guest over 100
        adjustments.append({
            "type": "guest_count",
            "reason": f"Large event ({request.guest_count} guests)",
            "amount": guest_adjustment
        })
    
    # Services adjustment
    if request.services:
        services_adjustment = len(request.services) * (base_price * 0.15)  # 15% per service
        adjustments.append({
            "type": "services",
            "reason": f"{len(request.services)} additional services",
            "amount": services_adjustment
        })
    
    total_adjustments = sum(a["amount"] for a in adjustments)
    suggested_price = base_price + total_adjustments
    
    return {
        "event_type": request.event_type,
        "historical_analysis": {
            "similar_events_analyzed": len(matching_prices),
            "average_price": avg_price,
            "price_range": {"min": min_price, "max": max_price}
        },
        "suggested_pricing": {
            "base_price": base_price,
            "adjustments": adjustments,
            "total_adjustments": total_adjustments,
            "suggested_total": suggested_price,
            "price_range_suggestion": {
                "competitive": suggested_price * 0.9,
                "standard": suggested_price,
                "premium": suggested_price * 1.2
            }
        }
    }


# ============ EQUIPMENT SUGGESTIONS ============

@router.post("/equipment")
async def suggest_equipment(
    event_type: str,
    org_code: str,
    guest_count: Optional[int] = None,
    location_type: Optional[str] = None,  # indoor, outdoor, both
    current_user: dict = Depends(get_current_user)
):
    """Suggest equipment based on event type"""
    db = get_db()
    
    # Get past events of this type
    past_events = list(db.collection(Collections.EVENTS)
                       .where("org_code", "==", org_code)
                       .where("event_type", "==", event_type)
                       .limit(30).stream())
    
    equipment_usage = {}
    
    for event_doc in past_events:
        # Get equipment used
        checkouts = list(db.collection(Collections.EQUIPMENT_CHECKOUTS)
                        .where("event_id", "==", event_doc.id).stream())
        
        for checkout in checkouts:
            data = checkout.to_dict()
            eq_id = data.get("equipment_id")
            eq_type = data.get("equipment_type", "other")
            
            if eq_type not in equipment_usage:
                equipment_usage[eq_type] = {"count": 0, "items": set()}
            equipment_usage[eq_type]["count"] += 1
            if eq_id:
                equipment_usage[eq_type]["items"].add(eq_id)
    
    # Get current available equipment
    available_equipment = list(db.collection(Collections.EQUIPMENT)
                               .where("org_code", "==", org_code)
                               .where("status", "==", "available").stream())
    
    suggestions = []
    
    for eq_type, usage in equipment_usage.items():
        frequency_percent = (usage["count"] / len(past_events) * 100) if past_events else 0
        avg_quantity = len(usage["items"]) / len(past_events) if past_events else 1
        
        # Find available items of this type
        available_of_type = [
            {"id": eq.id, "name": eq.to_dict().get("name", "Unknown")}
            for eq in available_equipment
            if eq.to_dict().get("equipment_type") == eq_type or eq.to_dict().get("category") == eq_type
        ]
        
        suggestions.append({
            "equipment_type": eq_type,
            "usage_frequency": frequency_percent,
            "typical_quantity": round(avg_quantity),
            "available_items": available_of_type[:5],
            "priority": "high" if frequency_percent > 80 else "medium" if frequency_percent > 50 else "low"
        })
    
    # Sort by usage frequency
    suggestions.sort(key=lambda x: x["usage_frequency"], reverse=True)
    
    return {
        "event_type": event_type,
        "based_on_events": len(past_events),
        "suggestions": suggestions,
        "essential_equipment": [s for s in suggestions if s["priority"] == "high"],
        "recommended_equipment": [s for s in suggestions if s["priority"] == "medium"]
    }


# ============ FOLLOW-UP SUGGESTIONS ============

@router.get("/follow-ups")
async def suggest_follow_ups(
    org_code: str,
    current_user: dict = Depends(get_current_user)
):
    """Suggest client follow-ups and actions"""
    db = get_db()
    today = date.today()
    
    follow_ups = []
    
    # Find clients with no recent activity (30+ days)
    clients = list(db.collection(Collections.CLIENTS)
                   .where("org_code", "==", org_code).stream())
    
    for client_doc in clients:
        client = client_doc.to_dict()
        client_id = client_doc.id
        
        # Get last event
        last_event = list(db.collection(Collections.EVENTS)
                         .where("client_id", "==", client_id)
                         .order_by("event_date", direction="DESCENDING")
                         .limit(1).stream())
        
        if last_event:
            last_event_date = last_event[0].to_dict().get("event_date")
            if last_event_date:
                days_since = (today - date.fromisoformat(last_event_date)).days
                
                if days_since > 90:
                    follow_ups.append({
                        "type": "re_engagement",
                        "priority": "medium",
                        "client_id": client_id,
                        "client_name": client.get("name", "Unknown"),
                        "action": "Re-engagement outreach",
                        "reason": f"No events in {days_since} days",
                        "suggested_message": f"Hi! It's been a while since we worked together. Would love to discuss your upcoming events."
                    })
    
    # Find upcoming event anniversaries
    year_ago_start = (today - timedelta(days=365)).isoformat()
    year_ago_end = (today - timedelta(days=358)).isoformat()
    
    anniversary_events = list(db.collection(Collections.EVENTS)
                              .where("org_code", "==", org_code)
                              .where("event_date", ">=", year_ago_start)
                              .where("event_date", "<=", year_ago_end).stream())
    
    for event_doc in anniversary_events:
        event = event_doc.to_dict()
        follow_ups.append({
            "type": "anniversary",
            "priority": "high",
            "client_id": event.get("client_id"),
            "event_name": event.get("name", "Event"),
            "action": "Anniversary follow-up",
            "reason": f"Event anniversary coming up",
            "suggested_message": f"It's almost a year since '{event.get('name', 'your event')}'. Planning anything this year?"
        })
    
    # Find clients with outstanding payments
    overdue_ar = list(db.collection(Collections.AR)
                      .where("org_code", "==", org_code)
                      .where("status", "!=", "paid")
                      .where("due_date", "<", today.isoformat()).stream())
    
    for ar_doc in overdue_ar:
        ar = ar_doc.to_dict()
        days_overdue = (today - date.fromisoformat(ar.get("due_date", today.isoformat()))).days
        
        follow_ups.append({
            "type": "payment_reminder",
            "priority": "high" if days_overdue > 30 else "medium",
            "client_id": ar.get("client_id"),
            "amount": ar.get("balance", 0),
            "action": "Payment follow-up",
            "reason": f"Payment {days_overdue} days overdue",
            "days_overdue": days_overdue
        })
    
    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    follow_ups.sort(key=lambda x: priority_order.get(x["priority"], 2))
    
    return {
        "total_follow_ups": len(follow_ups),
        "follow_ups": follow_ups[:20],  # Limit to top 20
        "by_type": {
            "re_engagement": len([f for f in follow_ups if f["type"] == "re_engagement"]),
            "anniversary": len([f for f in follow_ups if f["type"] == "anniversary"]),
            "payment_reminder": len([f for f in follow_ups if f["type"] == "payment_reminder"])
        }
    }
