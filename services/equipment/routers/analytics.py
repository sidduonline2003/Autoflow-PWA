"""
Analytics Router - Equipment utilization and reporting
"""

import datetime
from typing import Optional, List
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore
from pydantic import BaseModel

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user, require_role
from shared.firebase_client import get_db
from shared.redis_client import cache

router = APIRouter(prefix="/equipment/analytics", tags=["Analytics"])


@router.get("/summary")
async def get_analytics_summary(current_user: dict = Depends(get_current_user)):
    """Get equipment analytics summary"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    
    # Equipment counts by status
    equipment_ref = db.collection('organizations', org_id, 'equipment')
    
    total = 0
    by_status = defaultdict(int)
    by_category = defaultdict(int)
    
    for doc in equipment_ref.stream():
        data = doc.to_dict()
        total += 1
        by_status[data.get("status", "unknown")] += 1
        by_category[data.get("category", "unknown")] += 1
    
    # Active checkouts
    checkouts_ref = db.collection('organizations', org_id, 'checkouts')
    active_checkouts = len(list(checkouts_ref.where('status', '==', 'active').stream()))
    
    # Pending maintenance
    maintenance_ref = db.collection('organizations', org_id, 'maintenance')
    pending_maintenance = len(list(maintenance_ref.where('status', '==', 'pending').stream()))
    
    return {
        "totalEquipment": total,
        "byStatus": dict(by_status),
        "byCategory": dict(by_category),
        "activeCheckouts": active_checkouts,
        "pendingMaintenance": pending_maintenance
    }


@router.get("/utilization")
async def get_utilization_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get equipment utilization report"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    
    # Default to last 30 days
    end = datetime.datetime.now(datetime.timezone.utc)
    start = end - datetime.timedelta(days=30)
    
    if start_date:
        start = datetime.datetime.fromisoformat(start_date.replace('Z', '+00:00'))
    if end_date:
        end = datetime.datetime.fromisoformat(end_date.replace('Z', '+00:00'))
    
    # Get all completed checkouts in period
    checkouts_ref = db.collection('organizations', org_id, 'checkouts')
    query = checkouts_ref.where('status', '==', 'completed') \
        .where('checkedOutAt', '>=', start) \
        .where('checkedOutAt', '<=', end)
    
    utilization_data = defaultdict(lambda: {
        "checkoutCount": 0,
        "totalHours": 0,
        "assetName": "",
        "category": ""
    })
    
    for doc in query.stream():
        data = doc.to_dict()
        asset_id = data.get("assetId")
        
        # Calculate duration
        checkout_time = data.get("checkedOutAt")
        checkin_time = data.get("checkedInAt")
        
        if checkout_time and checkin_time:
            if hasattr(checkout_time, 'timestamp'):
                checkout_time = datetime.datetime.fromtimestamp(checkout_time.timestamp(), tz=datetime.timezone.utc)
            if hasattr(checkin_time, 'timestamp'):
                checkin_time = datetime.datetime.fromtimestamp(checkin_time.timestamp(), tz=datetime.timezone.utc)
            
            duration = (checkin_time - checkout_time).total_seconds() / 3600
            
            utilization_data[asset_id]["checkoutCount"] += 1
            utilization_data[asset_id]["totalHours"] += duration
            utilization_data[asset_id]["assetName"] = data.get("assetName", "")
    
    # Get equipment details
    equipment_ref = db.collection('organizations', org_id, 'equipment')
    for doc in equipment_ref.stream():
        data = doc.to_dict()
        asset_id = doc.id
        if asset_id in utilization_data:
            utilization_data[asset_id]["category"] = data.get("category", "")
    
    # Filter by category if specified
    result = []
    for asset_id, stats in utilization_data.items():
        if category and stats.get("category") != category:
            continue
        result.append({
            "assetId": asset_id,
            **stats,
            "avgHoursPerCheckout": stats["totalHours"] / stats["checkoutCount"] if stats["checkoutCount"] > 0 else 0
        })
    
    # Sort by checkout count
    result.sort(key=lambda x: x["checkoutCount"], reverse=True)
    
    return {
        "period": {
            "start": start.isoformat(),
            "end": end.isoformat()
        },
        "utilization": result
    }


@router.get("/crew-responsibility")
async def get_crew_responsibility_scores(current_user: dict = Depends(get_current_user)):
    """Get crew responsibility scores based on equipment handling"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    
    # Get all checkouts in last 90 days
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=90)
    
    checkouts_ref = db.collection('organizations', org_id, 'checkouts')
    query = checkouts_ref.where('checkedOutAt', '>=', cutoff)
    
    crew_stats = defaultdict(lambda: {
        "totalCheckouts": 0,
        "onTimeReturns": 0,
        "lateReturns": 0,
        "damageReports": 0,
        "userName": ""
    })
    
    for doc in query.stream():
        data = doc.to_dict()
        user_id = data.get("checkedOutBy")
        
        if not user_id:
            continue
        
        crew_stats[user_id]["totalCheckouts"] += 1
        crew_stats[user_id]["userName"] = data.get("checkedOutByName", "")
        
        if data.get("status") == "completed":
            expected = data.get("expectedReturnDate")
            actual = data.get("checkedInAt")
            
            if expected and actual:
                if hasattr(actual, 'timestamp'):
                    actual = datetime.datetime.fromtimestamp(actual.timestamp(), tz=datetime.timezone.utc)
                expected_dt = datetime.datetime.fromisoformat(expected.replace('Z', '+00:00'))
                
                if actual <= expected_dt:
                    crew_stats[user_id]["onTimeReturns"] += 1
                else:
                    crew_stats[user_id]["lateReturns"] += 1
            
            if data.get("hasIssue"):
                crew_stats[user_id]["damageReports"] += 1
    
    # Calculate responsibility scores
    result = []
    for user_id, stats in crew_stats.items():
        total = stats["totalCheckouts"]
        if total == 0:
            continue
        
        # Score: 100 base, -10 per late return, -20 per damage report
        score = 100
        score -= (stats["lateReturns"] / total) * 30
        score -= (stats["damageReports"] / total) * 50
        score = max(0, min(100, score))
        
        result.append({
            "userId": user_id,
            "userName": stats["userName"],
            "score": round(score, 1),
            "totalCheckouts": total,
            "onTimeRate": round((stats["onTimeReturns"] / total) * 100, 1) if total > 0 else 0,
            "damageRate": round((stats["damageReports"] / total) * 100, 1) if total > 0 else 0
        })
    
    result.sort(key=lambda x: x["score"], reverse=True)
    
    return {"crewScores": result}


@router.get("/maintenance-history")
async def get_maintenance_history(
    asset_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get maintenance history and costs"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    
    maintenance_ref = db.collection('organizations', org_id, 'maintenance')
    query = maintenance_ref.where('status', '==', 'completed')
    
    if asset_id:
        query = query.where('assetId', '==', asset_id)
    
    history = []
    total_cost = 0
    
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        history.append(data)
        
        if data.get("actualCost"):
            total_cost += data["actualCost"]
    
    return {
        "history": history,
        "count": len(history),
        "totalCost": total_cost
    }
