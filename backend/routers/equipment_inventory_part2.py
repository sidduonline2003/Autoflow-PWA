"""
Equipment Inventory Management Router - Part 2
Additional endpoints: Maintenance, Analytics, QR Generation, Locations
"""

# ============= MAINTENANCE ENDPOINTS =============

from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore
from datetime import datetime, timedelta, timezone
from typing import List, Optional
import logging

from backend.dependencies import get_current_user
from backend.schemas.equipment_schemas import (
    CreateMaintenanceRequest,
    CompleteMaintenanceRequest,
    MaintenanceResponse,
    SuccessResponse,
    MaintenanceStatus,
)

logger = logging.getLogger(__name__)

# Helper function imports (these would be imported from equipment_inventory.py in practice)
def generate_maintenance_id() -> str:
    """Generate unique maintenance ID"""
    from nanoid import generate as nanoid
    return f"MNT_{nanoid(size=18)}"


@router.post("/{asset_id}/maintenance", response_model=SuccessResponse)
async def create_maintenance(
    asset_id: str,
    req: CreateMaintenanceRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Schedule maintenance for equipment
    Admin only
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Get equipment
        equipment_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        equipment_doc = equipment_ref.get()
        
        if not equipment_doc.exists:
            raise HTTPException(status_code=404, detail="Equipment not found")
        
        equipment_data = equipment_doc.to_dict()
        
        # Generate maintenance ID
        maintenance_id = generate_maintenance_id()
        
        # Prepare maintenance document
        maintenance_data = {
            "maintenanceId": maintenance_id,
            "assetId": asset_id,
            "assetName": equipment_data["name"],
            
            "type": req.type.value,
            "priority": req.priority,
            "category": "scheduled",
            
            "issue": req.issue,
            "symptoms": req.issue,
            "rootCause": "",
            
            "scheduledDate": req.scheduledDate,
            "startDate": None,
            "completionDate": None,
            "estimatedDuration": req.estimatedDuration or 0,
            "actualDuration": 0,
            
            "technicianId": None,
            "technicianName": req.technicianName,
            "vendorName": req.vendorName,
            "vendorContact": req.vendorContact,
            "internalTechnician": not req.vendorName,
            
            "workPerformed": [],
            "partsReplaced": [],
            "laborCost": 0,
            "partsTotal": 0,
            "totalCost": req.estimatedCost or 0,
            
            "notes": req.notes,
            "photos": [],
            "serviceReportUrl": None,
            
            "status": MaintenanceStatus.SCHEDULED.value,
            "completionNotes": None,
            
            "followUpRequired": False,
            "followUpDate": None,
            "followUpNotes": "",
            
            "linkedCheckoutId": None,
            "linkedDamageReportId": None,
            
            "coveredByWarranty": False,
            "warrantyClaimNumber": None,
            
            "downtimeDays": 0,
            "impactedEvents": [],
            
            "createdAt": datetime.now(timezone.utc),
            "createdBy": current_user.get("uid"),
            "updatedAt": datetime.now(timezone.utc),
            "lastModifiedBy": current_user.get("uid")
        }
        
        # Save maintenance record
        maintenance_ref = equipment_ref.collection("maintenance").document(maintenance_id)
        maintenance_ref.set(maintenance_data)
        
        # Update equipment status to MAINTENANCE if not already
        if equipment_data.get("status") != "MAINTENANCE":
            equipment_ref.update({
                "status": "MAINTENANCE",
                "updatedAt": datetime.now(timezone.utc)
            })
        
        logger.info(f"Maintenance scheduled: {maintenance_id} for {asset_id}")
        
        return SuccessResponse(
            message="Maintenance scheduled successfully",
            data={"maintenanceId": maintenance_id}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create maintenance error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{asset_id}/maintenance/{maintenance_id}/complete", response_model=SuccessResponse)
async def complete_maintenance(
    asset_id: str,
    maintenance_id: str,
    req: CompleteMaintenanceRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Complete maintenance work
    Admin only
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Get equipment
        equipment_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        equipment_doc = equipment_ref.get()
        
        if not equipment_doc.exists:
            raise HTTPException(status_code=404, detail="Equipment not found")
        
        equipment_data = equipment_doc.to_dict()
        
        # Get maintenance record
        maintenance_ref = equipment_ref.collection("maintenance").document(maintenance_id)
        maintenance_doc = maintenance_ref.get()
        
        if not maintenance_doc.exists:
            raise HTTPException(status_code=404, detail="Maintenance record not found")
        
        maintenance_data = maintenance_doc.to_dict()
        
        # Calculate total cost
        parts_total = sum(part.totalCost for part in req.partsReplaced)
        total_cost = parts_total + req.laborCost
        
        # Calculate downtime
        scheduled_date = maintenance_data.get("scheduledDate")
        completion_date = req.completionDate
        downtime_days = 0
        if scheduled_date:
            downtime_days = max(1, (completion_date - scheduled_date).days)
        
        # Update maintenance record
        maintenance_updates = {
            "completionDate": completion_date,
            "actualDuration": req.actualDuration,
            
            "workPerformed": req.workPerformed,
            "partsReplaced": [p.model_dump() for p in req.partsReplaced] if req.partsReplaced else [],
            "laborCost": req.laborCost,
            "partsTotal": parts_total,
            "totalCost": total_cost,
            
            "completionNotes": req.completionNotes,
            "photos": [p.model_dump() for p in req.photos] if req.photos else [],
            "serviceReportUrl": req.serviceReportUrl,
            
            "status": MaintenanceStatus.COMPLETED.value,
            
            "coveredByWarranty": req.coveredByWarranty,
            "warrantyClaimNumber": req.warrantyClaimNumber,
            
            "downtimeDays": downtime_days,
            
            "updatedAt": datetime.now(timezone.utc),
            "lastModifiedBy": current_user.get("uid")
        }
        
        maintenance_ref.update(maintenance_updates)
        
        # Update equipment
        next_maintenance_date = None
        if equipment_data.get("maintenanceSchedule"):
            interval_days = equipment_data["maintenanceSchedule"].get("intervalDays", 30)
            next_maintenance_date = completion_date + timedelta(days=interval_days)
        
        equipment_updates = {
            "status": "AVAILABLE",
            "totalMaintenanceCost": firestore.Increment(total_cost),
            "totalDaysInMaintenance": firestore.Increment(downtime_days),
            "updatedAt": datetime.now(timezone.utc)
        }
        
        if next_maintenance_date:
            equipment_updates["maintenanceSchedule.lastMaintenanceDate"] = completion_date
            equipment_updates["maintenanceSchedule.nextDueDate"] = next_maintenance_date
        
        equipment_ref.update(equipment_updates)
        
        logger.info(f"Maintenance completed: {maintenance_id} for {asset_id}")
        
        return SuccessResponse(
            message="Maintenance completed successfully",
            data={
                "totalCost": total_cost,
                "downtimeDays": downtime_days,
                "nextMaintenanceDate": next_maintenance_date.isoformat() if next_maintenance_date else None
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Complete maintenance error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{asset_id}/maintenance", response_model=List[MaintenanceResponse])
async def list_maintenance(
    asset_id: str,
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user)
):
    """
    List maintenance records for equipment
    """
    org_id = current_user.get("orgId")
    
    try:
        db = firestore.client()
        
        # Verify equipment exists
        equipment_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        if not equipment_ref.get().exists:
            raise HTTPException(status_code=404, detail="Equipment not found")
        
        # Query maintenance records
        query = equipment_ref.collection("maintenance")
        
        if status:
            query = query.where("status", "==", status)
        
        query = query.order_by("scheduledDate", direction=firestore.Query.DESCENDING)
        query = query.limit(limit)
        
        docs = query.stream()
        
        maintenance_list = []
        for doc in docs:
            data = doc.to_dict()
            maintenance_list.append(MaintenanceResponse(
                maintenanceId=data["maintenanceId"],
                assetId=data["assetId"],
                assetName=data["assetName"],
                type=data["type"],
                status=data["status"],
                scheduledDate=data["scheduledDate"],
                completionDate=data.get("completionDate"),
                totalCost=data.get("totalCost"),
                createdAt=data["createdAt"]
            ))
        
        return maintenance_list
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"List maintenance error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============= ANALYTICS ENDPOINTS =============

@router.get("/analytics/summary", response_model=dict)
async def get_analytics_summary(
    current_user: dict = Depends(get_current_user)
):
    """
    Get aggregated equipment analytics
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Check if summary document exists
        summary_ref = db.collection("organizations").document(org_id)\
            .collection("equipmentAnalytics").document("summary")
        summary_doc = summary_ref.get()
        
        if summary_doc.exists:
            return summary_doc.to_dict()
        
        # If not exists, calculate on-the-fly (should be generated by Cloud Function)
        equipment_query = db.collection("organizations").document(org_id)\
            .collection("equipment")
        
        all_equipment = list(equipment_query.stream())
        
        # Calculate basic metrics
        total_assets = len(all_equipment)
        total_value = 0
        status_counts = {
            "AVAILABLE": 0,
            "CHECKED_OUT": 0,
            "MAINTENANCE": 0,
            "MISSING": 0,
            "RETIRED": 0
        }
        category_breakdown = {}
        
        for doc in all_equipment:
            data = doc.to_dict()
            total_value += data.get("bookValue", 0)
            
            status = data.get("status", "AVAILABLE")
            status_counts[status] = status_counts.get(status, 0) + 1
            
            category = data.get("category", "misc")
            category_breakdown[category] = category_breakdown.get(category, 0) + 1
        
        summary = {
            "totalAssets": total_assets,
            "totalValue": total_value,
            "availableCount": status_counts["AVAILABLE"],
            "checkedOutCount": status_counts["CHECKED_OUT"],
            "maintenanceCount": status_counts["MAINTENANCE"],
            "missingCount": status_counts["MISSING"],
            "retiredCount": status_counts["RETIRED"],
            
            "categoryBreakdown": category_breakdown,
            
            "overallUtilizationRate": 0,  # Needs calculation
            "avgUtilizationPerAsset": 0,
            
            "monthlyMaintenanceCost": 0,
            "monthlyExternalRentalRevenue": 0,
            
            "overdueCount": 0,
            
            "updatedAt": datetime.now(timezone.utc)
        }
        
        # Save for future queries
        summary_ref.set(summary)
        
        return summary
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analytics summary error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/crew-scores", response_model=List[dict])
async def get_crew_responsibility_scores(
    limit: int = Query(20, le=100),
    current_user: dict = Depends(get_current_user)
):
    """
    Get crew member equipment responsibility scores
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Aggregate checkout data by user
        # This is a simplified version - production would use Cloud Functions
        equipment_query = db.collection("organizations").document(org_id)\
            .collection("equipment")
        
        user_stats = {}
        
        for equipment_doc in equipment_query.stream():
            checkouts_query = equipment_doc.reference.collection("checkouts")
            
            for checkout_doc in checkouts_query.stream():
                data = checkout_doc.to_dict()
                uid = data.get("uid")
                
                if not uid:
                    continue
                
                if uid not in user_stats:
                    user_stats[uid] = {
                        "uid": uid,
                        "name": data.get("userName", "Unknown"),
                        "totalCheckouts": 0,
                        "onTimeReturns": 0,
                        "totalReturns": 0,
                        "goodConditionReturns": 0,
                        "damageIncidents": 0
                    }
                
                user_stats[uid]["totalCheckouts"] += 1
                
                if data.get("actualReturnDate"):
                    user_stats[uid]["totalReturns"] += 1
                    
                    if not data.get("isOverdue", False):
                        user_stats[uid]["onTimeReturns"] += 1
                    
                    if data.get("returnCondition") in ["excellent", "good"]:
                        user_stats[uid]["goodConditionReturns"] += 1
                    
                    if data.get("damageReport", {}).get("hasDamage", False):
                        user_stats[uid]["damageIncidents"] += 1
        
        # Calculate scores
        crew_scores = []
        for uid, stats in user_stats.items():
            total_returns = stats["totalReturns"] or 1
            
            on_time_rate = (stats["onTimeReturns"] / total_returns) * 100
            condition_rate = (stats["goodConditionReturns"] / total_returns) * 100
            
            # Score formula: (onTimeRate * 0.5) + (conditionRate * 0.3) + (20 - damageIncidents * 5)
            damage_penalty = min(20, stats["damageIncidents"] * 5)
            responsibility_score = min(100, max(0, 
                (on_time_rate * 0.5) + (condition_rate * 0.3) + (20 - damage_penalty)
            ))
            
            avg_condition_score = 5 if condition_rate >= 90 else \
                                 4 if condition_rate >= 70 else \
                                 3 if condition_rate >= 50 else 2
            
            crew_scores.append({
                "uid": uid,
                "name": stats["name"],
                "totalCheckouts": stats["totalCheckouts"],
                "onTimeReturnRate": round(on_time_rate, 2),
                "averageConditionScore": avg_condition_score,
                "damageIncidents": stats["damageIncidents"],
                "responsibilityScore": round(responsibility_score, 0)
            })
        
        # Sort by score descending
        crew_scores.sort(key=lambda x: x["responsibilityScore"], reverse=True)
        
        return crew_scores[:limit]
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Crew scores error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analytics/utilization-trend", response_model=List[dict])
async def get_utilization_trend(
    days: int = Query(30, le=90),
    current_user: dict = Depends(get_current_user)
):
    """
    Get utilization rate trend over time
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # This would typically be pre-aggregated by Cloud Functions
        # For now, return simplified data
        
        trend_data = []
        now = datetime.now(timezone.utc)
        
        for i in range(days, 0, -7):  # Weekly data points
            date = now - timedelta(days=i)
            
            trend_data.append({
                "date": date.strftime("%Y-%m-%d"),
                "utilizationRate": 0,  # Would be calculated from checkouts
                "assetsInUse": 0
            })
        
        return trend_data
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Utilization trend error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============= QR CODE & PRINTING ENDPOINTS =============

@router.get("/{asset_id}/qr", response_class=StreamingResponse)
async def get_equipment_qr_code(
    asset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get QR code image for equipment
    """
    org_id = current_user.get("orgId")
    
    try:
        db = firestore.client()
        doc_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Equipment not found")
        
        data = doc.to_dict()
        qr_url = data.get("qrCodeUrl")
        
        if not qr_url:
            raise HTTPException(status_code=404, detail="QR code not found")
        
        # Redirect to storage URL
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=qr_url)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get QR code error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/availability", response_model=List[dict])
async def check_availability(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    category: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Check equipment availability on specific date
    """
    org_id = current_user.get("orgId")
    
    try:
        # Parse date
        target_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        
        db = firestore.client()
        query = db.collection("organizations").document(org_id).collection("equipment")
        
        if category:
            query = query.where("category", "==", category)
        
        equipment_list = []
        
        for doc in query.stream():
            data = doc.to_dict()
            asset_id = data["assetId"]
            
            # Check if available on target date
            available = True
            reason = None
            
            # Check current status
            if data["status"] == "RETIRED":
                available = False
                reason = "Equipment retired"
            elif data["status"] == "MISSING":
                available = False
                reason = "Equipment missing"
            else:
                # Check checkouts on that date
                checkouts_ref = doc.reference.collection("checkouts")
                checkouts_query = checkouts_ref\
                    .where("checkedOutAt", "<=", target_date)\
                    .where("actualReturnDate", "==", None)
                
                for checkout_doc in checkouts_query.stream():
                    checkout_data = checkout_doc.to_dict()
                    expected_return = checkout_data.get("expectedReturnDate")
                    
                    if expected_return and expected_return >= target_date:
                        available = False
                        reason = f"Checked out (return due: {expected_return.strftime('%Y-%m-%d')})"
                        break
            
            equipment_list.append({
                "assetId": asset_id,
                "name": data["name"],
                "category": data["category"],
                "available": available,
                "reason": reason
            })
        
        return equipment_list
    
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Availability check error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# Export router
router = APIRouter()
