"""
Equipment Inventory Router - CRUD operations, QR code generation
"""

import datetime
import io
import base64
import logging
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from firebase_admin import firestore, storage
from pydantic import BaseModel
from enum import Enum

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from shared.auth import get_current_user
from shared.firebase_client import get_db
from shared.utils.helpers import nanoid_generate, ensure_timezone_aware

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/equipment", tags=["Equipment Inventory"])


# --- Enums ---
class EquipmentStatus(str, Enum):
    AVAILABLE = "available"
    CHECKED_OUT = "checked_out"
    MAINTENANCE = "maintenance"
    RETIRED = "retired"


class Condition(str, Enum):
    EXCELLENT = "excellent"
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


# --- Pydantic Models ---
class CreateEquipmentRequest(BaseModel):
    name: str
    category: str
    brand: Optional[str] = None
    model: Optional[str] = None
    serialNumber: Optional[str] = None
    purchaseDate: Optional[str] = None
    purchasePrice: Optional[float] = None
    condition: Condition = Condition.GOOD
    location: Optional[str] = None
    notes: Optional[str] = None
    specifications: Optional[dict] = None


class UpdateEquipmentRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    condition: Optional[Condition] = None
    location: Optional[str] = None
    notes: Optional[str] = None
    specifications: Optional[dict] = None
    status: Optional[EquipmentStatus] = None


class BulkPrintQRRequest(BaseModel):
    assetIds: List[str]


# --- Helper Functions ---
def generate_asset_id() -> str:
    return f"ASSET_{nanoid_generate(18)}"


async def generate_qr_code(data: str, org_id: str) -> tuple:
    """Generate QR code and return storage URL + base64"""
    try:
        import qrcode
        
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(data)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        
        base64_data = base64.b64encode(img_byte_arr.getvalue()).decode()
        img_byte_arr.seek(0)
        
        # Try Firebase Storage upload
        storage_url = None
        try:
            bucket = storage.bucket()
            blob_path = f"organizations/{org_id}/qr_codes/{data}.png"
            blob = bucket.blob(blob_path)
            blob.upload_from_file(img_byte_arr, content_type='image/png')
            blob.make_public()
            storage_url = blob.public_url
        except Exception as e:
            logger.warning(f"Firebase Storage upload failed: {e}")
            storage_url = f"data:image/png;base64,{base64_data}"
        
        return storage_url, base64_data
        
    except ImportError:
        logger.error("qrcode package not installed")
        return None, None
    except Exception as e:
        logger.error(f"QR generation error: {e}")
        return None, None


# --- CRUD Endpoints ---
@router.post("/")
async def create_equipment(
    req: CreateEquipmentRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """Create new equipment with auto-generated QR code"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    asset_id = generate_asset_id()
    
    # Generate QR code
    qr_url, qr_base64 = await generate_qr_code(asset_id, org_id)
    
    equipment_data = {
        "assetId": asset_id,
        "name": req.name,
        "category": req.category,
        "brand": req.brand,
        "model": req.model,
        "serialNumber": req.serialNumber,
        "purchaseDate": req.purchaseDate,
        "purchasePrice": req.purchasePrice,
        "condition": req.condition.value,
        "location": req.location,
        "notes": req.notes,
        "specifications": req.specifications,
        "status": EquipmentStatus.AVAILABLE.value,
        "qrCodeUrl": qr_url,
        "createdBy": current_user.get("uid"),
        "createdAt": datetime.datetime.now(datetime.timezone.utc),
        "updatedAt": datetime.datetime.now(datetime.timezone.utc),
    }
    
    equipment_ref = db.collection('organizations', org_id, 'equipment').document(asset_id)
    equipment_ref.set(equipment_data)
    
    return {
        "status": "success",
        "assetId": asset_id,
        "qrCodeUrl": qr_url,
        "qrCodeBase64": qr_base64
    }


@router.get("/")
async def list_equipment(
    status: Optional[str] = None,
    category: Optional[str] = None,
    location: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """List all equipment with optional filters"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    query = db.collection('organizations', org_id, 'equipment')
    
    if status:
        query = query.where('status', '==', status)
    if category:
        query = query.where('category', '==', category)
    if location:
        query = query.where('location', '==', location)
    
    equipment_list = []
    for doc in query.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        equipment_list.append(data)
    
    return equipment_list


@router.get("/{asset_id}")
async def get_equipment(asset_id: str, current_user: dict = Depends(get_current_user)):
    """Get equipment details by asset ID"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    equipment_ref = db.collection('organizations', org_id, 'equipment').document(asset_id)
    equipment_doc = equipment_ref.get()
    
    if not equipment_doc.exists:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    data = equipment_doc.to_dict()
    data['id'] = equipment_doc.id
    
    return data


@router.put("/{asset_id}")
async def update_equipment(
    asset_id: str,
    req: UpdateEquipmentRequest,
    current_user: dict = Depends(get_current_user)
):
    """Update equipment details"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    equipment_ref = db.collection('organizations', org_id, 'equipment').document(asset_id)
    equipment_doc = equipment_ref.get()
    
    if not equipment_doc.exists:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    update_data = {k: v.value if isinstance(v, Enum) else v for k, v in req.dict().items() if v is not None}
    update_data["updatedAt"] = datetime.datetime.now(datetime.timezone.utc)
    update_data["updatedBy"] = current_user.get("uid")
    
    equipment_ref.update(update_data)
    
    return {"status": "success"}


@router.delete("/{asset_id}")
async def retire_equipment(asset_id: str, current_user: dict = Depends(get_current_user)):
    """Retire (soft delete) equipment"""
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    
    db = get_db()
    equipment_ref = db.collection('organizations', org_id, 'equipment').document(asset_id)
    equipment_doc = equipment_ref.get()
    
    if not equipment_doc.exists:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    equipment_ref.update({
        "status": EquipmentStatus.RETIRED.value,
        "retiredAt": datetime.datetime.now(datetime.timezone.utc),
        "retiredBy": current_user.get("uid")
    })
    
    return {"status": "success"}


# --- QR Code Endpoints ---
@router.get("/{asset_id}/qr-code")
async def get_qr_code(asset_id: str, current_user: dict = Depends(get_current_user)):
    """Get QR code for equipment"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    equipment_ref = db.collection('organizations', org_id, 'equipment').document(asset_id)
    equipment_doc = equipment_ref.get()
    
    if not equipment_doc.exists:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    data = equipment_doc.to_dict()
    
    # Generate fresh QR if not exists
    if not data.get("qrCodeUrl"):
        qr_url, qr_base64 = await generate_qr_code(asset_id, org_id)
        equipment_ref.update({"qrCodeUrl": qr_url})
    else:
        # Generate base64 for response
        _, qr_base64 = await generate_qr_code(asset_id, org_id)
    
    return {
        "assetId": asset_id,
        "qrCodeUrl": data.get("qrCodeUrl"),
        "qrCodeBase64": qr_base64
    }


@router.post("/bulk-print-qr")
async def bulk_print_qr(req: BulkPrintQRRequest, current_user: dict = Depends(get_current_user)):
    """Generate QR codes for multiple assets"""
    org_id = current_user.get("orgId")
    
    qr_codes = []
    for asset_id in req.assetIds:
        qr_url, qr_base64 = await generate_qr_code(asset_id, org_id)
        qr_codes.append({
            "assetId": asset_id,
            "qrCodeUrl": qr_url,
            "qrCodeBase64": qr_base64
        })
    
    return {"status": "success", "qrCodes": qr_codes}


@router.get("/scan/{asset_id}")
async def scan_qr_code(asset_id: str, current_user: dict = Depends(get_current_user)):
    """Handle QR code scan - returns equipment details and current status"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    equipment_ref = db.collection('organizations', org_id, 'equipment').document(asset_id)
    equipment_doc = equipment_ref.get()
    
    if not equipment_doc.exists:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    data = equipment_doc.to_dict()
    
    # Get active checkout if any
    active_checkout = None
    if data.get("status") == EquipmentStatus.CHECKED_OUT.value:
        checkouts_ref = db.collection('organizations', org_id, 'checkouts')
        checkouts = checkouts_ref.where('assetId', '==', asset_id).where('status', '==', 'active').limit(1).stream()
        for checkout in checkouts:
            active_checkout = checkout.to_dict()
            active_checkout['id'] = checkout.id
            break
    
    return {
        "equipment": data,
        "activeCheckout": active_checkout,
        "actions": {
            "canCheckout": data.get("status") == EquipmentStatus.AVAILABLE.value,
            "canCheckin": data.get("status") == EquipmentStatus.CHECKED_OUT.value,
            "canReportIssue": True
        }
    }


# --- Categories & Locations ---
@router.get("/categories/list")
async def list_categories(current_user: dict = Depends(get_current_user)):
    """Get distinct equipment categories"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    equipment_ref = db.collection('organizations', org_id, 'equipment')
    
    categories = set()
    for doc in equipment_ref.stream():
        category = doc.to_dict().get("category")
        if category:
            categories.add(category)
    
    return {"categories": sorted(list(categories))}


@router.get("/locations/list")
async def list_locations(current_user: dict = Depends(get_current_user)):
    """Get storage locations"""
    org_id = current_user.get("orgId")
    
    db = get_db()
    locations_ref = db.collection('organizations', org_id, 'storageLocations')
    
    locations = []
    for doc in locations_ref.stream():
        data = doc.to_dict()
        data['id'] = doc.id
        locations.append(data)
    
    return {"locations": locations}
