"""
Maintenance Router - Equipment maintenance tracking
"""

import datetime
from typing import Optional
from enum import Enum

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore
from pydantic import BaseModel

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user, require_role
from shared.firebase_client import get_db
from shared.utils.helpers import nanoid_generate

router = APIRouter(prefix="/equipment/maintenance", tags=["Maintenance"])


class MaintenanceStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class CreateMaintenanceRequest(BaseModel):
    assetId: str
    type: str  # "scheduled", "repair", "calibration", "cleaning", "issue_report"
    description: str
    priority: str = "normal"  # "low", "normal", "high", "urgent"
    scheduledDate: Optional[str] = None
    estimatedCost: Optional[float] = None


class CompleteMaintenanceRequest(BaseModel):
    resolution: str
    actualCost: Optional[float] = None
    partsReplaced: Optional[list] = None
    condition: str  # New condition after maintenance


def generate_maintenance_id() -> str:
    return f"MNT_{nanoid_generate(18)}"


@router.post("/")
async def create_maintenance(req: CreateMaintenanceRequest, current_user: dict = Depends(get_current_user)):
    """Create a maintenance request"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    
    # Verify equipment exists
    equipment_ref = db.collection('organizations', org_id, 'equipment').document(req.assetId)
    equipment_doc = equipment_ref.get()
    
    if not equipment_doc.exists:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    equipment_data = equipment_doc.to_dict()
    maintenance_id = generate_maintenance_id()
    now = datetime.datetime.now(datetime.timezone.utc)
    
    maintenance_data = {
        "maintenanceId": maintenance_id,
        "assetId": req.assetId,
        "assetName": equipment_data.get("name"),
        "type": req.type,
        "description": req.description,
        "priority": req.priority,
        "scheduledDate": req.scheduledDate,
        "estimatedCost": req.estimatedCost,
        "status": MaintenanceStatus.PENDING.value,
        "createdBy": current_user.get("uid"),
        "createdAt": now,
        "updatedAt": now
    }
    
    maintenance_ref = db.collection('organizations', org_id, 'maintenance').document(maintenance_id)
    maintenance_ref.set(maintenance_data)
    
    # Update equipment status if needed
    if req.type in ["repair", "issue_report"] and equipment_data.get("status") == "available":
        equipment_ref.update({
            "status": "maintenance",
            "currentMaintenanceId": maintenance_id,
            "updatedAt": now
        })
    
    return {"status": "success", "maintenanceId": maintenance_id}


@router.get("/")
async def list_maintenance(
    status: Optional[str] = None,
    asset_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List maintenance records"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'maintenance')
    
    if status:
        query = query.where('status', '==', status)
    if asset_id:
        query = query.where('assetId', '==', asset_id)
    
    records = []
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        records.append(data)
    
    return {"records": records, "count": len(records)}


@router.get("/{maintenance_id}")
async def get_maintenance(maintenance_id: str, current_user: dict = Depends(get_current_user)):
    """Get maintenance details"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    maintenance_ref = db.collection('organizations', org_id, 'maintenance').document(maintenance_id)
    maintenance_doc = maintenance_ref.get()
    
    if not maintenance_doc.exists:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    
    data = maintenance_doc.to_dict()
    data['id'] = maintenance_id
    
    return data


@router.patch("/{maintenance_id}/start")
async def start_maintenance(maintenance_id: str, current_user: dict = Depends(get_current_user)):
    """Start maintenance work"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    maintenance_ref = db.collection('organizations', org_id, 'maintenance').document(maintenance_id)
    maintenance_doc = maintenance_ref.get()
    
    if not maintenance_doc.exists:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    
    now = datetime.datetime.now(datetime.timezone.utc)
    
    maintenance_ref.update({
        "status": MaintenanceStatus.IN_PROGRESS.value,
        "startedAt": now,
        "startedBy": current_user.get("uid"),
        "updatedAt": now
    })
    
    return {"status": "success", "message": "Maintenance started"}


@router.post("/{maintenance_id}/complete")
async def complete_maintenance(
    maintenance_id: str,
    req: CompleteMaintenanceRequest,
    current_user: dict = Depends(get_current_user)
):
    """Complete maintenance and update equipment"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    maintenance_ref = db.collection('organizations', org_id, 'maintenance').document(maintenance_id)
    maintenance_doc = maintenance_ref.get()
    
    if not maintenance_doc.exists:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    
    maintenance_data = maintenance_doc.to_dict()
    asset_id = maintenance_data.get("assetId")
    now = datetime.datetime.now(datetime.timezone.utc)
    
    # Update maintenance record
    maintenance_ref.update({
        "status": MaintenanceStatus.COMPLETED.value,
        "resolution": req.resolution,
        "actualCost": req.actualCost,
        "partsReplaced": req.partsReplaced,
        "completedAt": now,
        "completedBy": current_user.get("uid"),
        "updatedAt": now
    })
    
    # Update equipment
    equipment_ref = db.collection('organizations', org_id, 'equipment').document(asset_id)
    equipment_ref.update({
        "status": "available",
        "condition": req.condition,
        "currentMaintenanceId": None,
        "lastMaintenanceDate": now,
        "lastMaintenanceId": maintenance_id,
        "updatedAt": now
    })
    
    return {"status": "success", "message": "Maintenance completed", "equipmentStatus": "available"}


@router.patch("/{maintenance_id}/cancel")
async def cancel_maintenance(
    maintenance_id: str,
    reason: str = None,
    current_user: dict = Depends(require_role(["admin", "manager"]))
):
    """Cancel a maintenance request"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    maintenance_ref = db.collection('organizations', org_id, 'maintenance').document(maintenance_id)
    maintenance_doc = maintenance_ref.get()
    
    if not maintenance_doc.exists:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    
    maintenance_data = maintenance_doc.to_dict()
    
    if maintenance_data.get("status") == MaintenanceStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Cannot cancel completed maintenance")
    
    now = datetime.datetime.now(datetime.timezone.utc)
    
    maintenance_ref.update({
        "status": MaintenanceStatus.CANCELLED.value,
        "cancelReason": reason,
        "cancelledAt": now,
        "cancelledBy": current_user.get("uid"),
        "updatedAt": now
    })
    
    # Restore equipment status if it was in maintenance
    asset_id = maintenance_data.get("assetId")
    equipment_ref = db.collection('organizations', org_id, 'equipment').document(asset_id)
    equipment_doc = equipment_ref.get()
    
    if equipment_doc.exists and equipment_doc.to_dict().get("currentMaintenanceId") == maintenance_id:
        equipment_ref.update({
            "status": "available",
            "currentMaintenanceId": None,
            "updatedAt": now
        })
    
    return {"status": "success", "message": "Maintenance cancelled"}
