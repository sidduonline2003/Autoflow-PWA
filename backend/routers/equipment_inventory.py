"""
Equipment Inventory Management Router
QR-based asset tracking with offline-first support

Features:
- Equipment CRUD with QR generation
- Checkout/Check-in workflows
- Maintenance tracking
- External rentals
- Analytics and reporting
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from firebase_admin import firestore, storage
from datetime import datetime, timedelta, timezone
from typing import List, Optional
import qrcode
import io
import base64
from nanoid import generate as nanoid
import logging

from backend.dependencies import get_current_user
from backend.schemas.equipment_schemas import (
    # Request models
    CreateEquipmentRequest,
    UpdateEquipmentRequest,
    CheckoutEquipmentRequest,
    CheckinEquipmentRequest,
    CreateMaintenanceRequest,
    CompleteMaintenanceRequest,
    CreateExternalRentalRequest,
    CreateLocationRequest,
    BulkPrintQRRequest,
    EquipmentFilterRequest,
    
    # Response models
    EquipmentResponse,
    CheckoutResponse,
    MaintenanceResponse,
    AnalyticsSummaryResponse,
    QRCodeGenerationResponse,
    AvailabilityResponse,
    CrewResponsibilityScore,
    UtilizationDataPoint,
    SuccessResponse,
    ErrorResponse,
    
    # Enums
    EquipmentStatus,
    CheckoutType,
    MaintenanceStatus,
    Condition,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/equipment",
    tags=["Equipment Inventory Management"],
)

# ============= UTILITY FUNCTIONS =============

def generate_asset_id() -> str:
    """Generate unique asset ID using NanoID"""
    return f"ASSET_{nanoid(size=18)}"


def generate_checkout_id() -> str:
    """Generate unique checkout ID"""
    return f"CHK_{nanoid(size=18)}"


def generate_maintenance_id() -> str:
    """Generate unique maintenance ID"""
    return f"MNT_{nanoid(size=18)}"


def generate_rental_id() -> str:
    """Generate unique rental ID"""
    return f"RNT_{nanoid(size=18)}"


def generate_location_id(name: str) -> str:
    """Generate location ID from name"""
    clean_name = name.upper().replace(" ", "_")
    return f"LOC_{clean_name}"


def ensure_timezone_aware(dt: datetime) -> datetime:
    """Ensure datetime is timezone-aware (UTC if naive)"""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


async def generate_qr_code(data: str, org_id: str) -> tuple[str, str]:
    """
    Generate QR code and upload to Firebase Storage
    Returns: (storage_url, base64_data)
    
    NOTE: If Firebase Storage is not enabled, it will return base64 URL only
    """
    try:
        # Generate QR code
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(data)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to bytes
        img_byte_arr = io.BytesIO()
        img.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)
        
        # Generate base64 for immediate use
        base64_data = base64.b64encode(img_byte_arr.getvalue()).decode()
        img_byte_arr.seek(0)
        
        # Try to upload to Firebase Storage (optional - will use base64 if fails)
        storage_url = None
        try:
            bucket = storage.bucket()
            blob_path = f"organizations/{org_id}/qr_codes/{data}.png"
            blob = bucket.blob(blob_path)
            blob.upload_from_file(img_byte_arr, content_type='image/png')
            blob.make_public()
            storage_url = blob.public_url
            logger.info(f"QR code uploaded to Firebase Storage: {storage_url}")
        except Exception as storage_error:
            logger.warning(f"Firebase Storage upload failed (using base64 fallback): {str(storage_error)}")
            # Use base64 data URL as fallback
            storage_url = f"data:image/png;base64,{base64_data}"
        
        return storage_url, base64_data
    
    except Exception as e:
        logger.error(f"QR generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate QR code: {str(e)}")


def calculate_utilization_rate(total_days_used: int, purchase_date: datetime) -> float:
    """Calculate equipment utilization rate"""
    # Ensure purchase_date is timezone-aware
    purchase_date = ensure_timezone_aware(purchase_date)
    
    days_since_purchase = (datetime.now(timezone.utc) - purchase_date).days
    if days_since_purchase == 0:
        return 0.0
    return round((total_days_used / days_since_purchase) * 100, 2)


def calculate_book_value(purchase_price: float, purchase_date: datetime, depreciation_rate: float = 10) -> float:
    """Calculate depreciated book value"""
    # Ensure purchase_date is timezone-aware
    purchase_date = ensure_timezone_aware(purchase_date)
    
    years_owned = (datetime.now(timezone.utc) - purchase_date).days / 365.25
    depreciation_factor = (1 - depreciation_rate / 100) ** years_owned
    return round(purchase_price * depreciation_factor, 2)


# ============= EQUIPMENT CRUD =============

@router.post("/", response_model=SuccessResponse)
async def create_equipment(
    req: CreateEquipmentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Create new equipment with QR code generation
    Admin only
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Generate asset ID
        asset_id = generate_asset_id()
        
        # Generate QR code
        qr_url, qr_base64 = await generate_qr_code(asset_id, org_id)
        
        # Ensure purchaseDate is timezone-aware
        purchase_date = ensure_timezone_aware(req.purchaseDate)
        
        # Calculate initial values
        book_value = calculate_book_value(req.purchasePrice, purchase_date)
        
        # Prepare equipment document
        equipment_data = {
            "assetId": asset_id,
            "qrCodeUrl": qr_url,
            "name": req.name,
            "category": req.category.value,
            "model": req.model,
            "serialNumber": req.serialNumber,
            "manufacturer": req.manufacturer,
            "description": req.description,
            
            "purchaseDate": purchase_date,
            "purchasePrice": req.purchasePrice,
            "bookValue": book_value,
            "depreciationRate": 10,  # Default 10% per year
            "dailyRentalRate": req.dailyRentalRate,
            
            "status": EquipmentStatus.AVAILABLE.value,
            "currentHolder": None,
            
            "homeLocation": req.homeLocation,
            "currentLocation": req.homeLocation,
            "lastKnownGPS": None,
            
            "photos": [p.model_dump() for p in req.photos] if req.photos else [],
            
            "maintenanceSchedule": {
                "intervalDays": req.maintenanceIntervalDays,
                "lastMaintenanceDate": None,
                "nextDueDate": datetime.now(timezone.utc) + timedelta(days=req.maintenanceIntervalDays),
                "alertThresholdDays": 7
            },
            
            "consumableData": req.consumableData.model_dump() if req.consumableData else None,
            "vendorData": req.vendorData.model_dump() if req.vendorData else None,
            "insurance": req.insurance.model_dump() if req.insurance else None,
            "warranty": req.warranty.model_dump() if req.warranty else None,
            
            # Analytics fields
            "totalDaysUsed": 0,
            "totalCheckouts": 0,
            "totalDaysInMaintenance": 0,
            "utilizationRate": 0.0,
            "lastCheckoutDate": None,
            "lastCheckinDate": None,
            "averageCheckoutDuration": 0.0,
            
            "totalExternalRentalRevenue": 0,
            "externalRentalCount": 0,
            "totalMaintenanceCost": 0,
            
            "conditionScore": 100,
            "damageIncidents": 0,
            "lastConditionCheck": None,
            
            "createdAt": datetime.now(timezone.utc),
            "updatedAt": datetime.now(timezone.utc),
            "createdBy": current_user.get("uid"),
            "lastModifiedBy": current_user.get("uid"),
            
            "isRetired": False,
            "isHighValue": req.purchasePrice >= 100000,
            "requiresApproval": req.requiresApproval,
            "tags": req.tags
        }
        
        # Save to Firestore
        equipment_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        equipment_ref.set(equipment_data)
        
        logger.info(f"Equipment created: {asset_id} by {current_user.get('uid')}")
        
        return SuccessResponse(
            message="Equipment created successfully",
            data={
                "assetId": asset_id,
                "qrCodeUrl": qr_url,
                "qrCodeBase64": f"data:image/png;base64,{qr_base64}"
            }
        )
    
    except Exception as e:
        logger.error(f"Equipment creation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/", response_model=List[EquipmentResponse])
async def list_equipment(
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, le=1000),
    current_user: dict = Depends(get_current_user)
):
    """
    List all equipment with optional filters
    """
    org_id = current_user.get("orgId")
    
    try:
        db = firestore.client()
        query = db.collection("organizations").document(org_id).collection("equipment")
        
        # Apply filters
        if category:
            query = query.where("category", "==", category)
        if status:
            query = query.where("status", "==", status)
        if location:
            query = query.where("homeLocation", "==", location)
        
        # Order by updated date
        query = query.order_by("updatedAt", direction=firestore.Query.DESCENDING)
        query = query.limit(limit)
        
        docs = query.stream()
        
        equipment_list = []
        for doc in docs:
            data = doc.to_dict()
            
            # Apply search filter if provided (client-side for flexibility)
            if search:
                search_lower = search.lower()
                if not (search_lower in data.get("name", "").lower() or 
                       search_lower in data.get("model", "").lower() or
                       search_lower in data.get("serialNumber", "").lower()):
                    continue
            
            equipment_list.append(EquipmentResponse(
                assetId=data["assetId"],
                qrCodeUrl=data["qrCodeUrl"],
                name=data["name"],
                category=data["category"],
                model=data["model"],
                status=data["status"],
                serialNumber=data.get("serialNumber"),
                currentHolder=data.get("currentHolder"),
                dailyRentalRate=data.get("dailyRentalRate"),
                utilizationRate=data.get("utilizationRate"),
                totalDaysUsed=data.get("totalDaysUsed"),
                photos=data.get("photos"),
                createdAt=data["createdAt"],
                updatedAt=data["updatedAt"]
            ))
        
        return equipment_list
    
    except Exception as e:
        logger.error(f"List equipment error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{asset_id}", response_model=dict)
async def get_equipment_details(
    asset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get detailed equipment information
    """
    org_id = current_user.get("orgId")
    
    try:
        db = firestore.client()
        doc_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        doc = doc_ref.get()
        
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Equipment not found")
        
        return doc.to_dict()
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get equipment error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{asset_id}", response_model=SuccessResponse)
async def update_equipment(
    asset_id: str,
    req: UpdateEquipmentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Update equipment details (partial update)
    Admin only
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        doc_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        
        # Check if exists
        if not doc_ref.get().exists:
            raise HTTPException(status_code=404, detail="Equipment not found")
        
        # Build update dict (only non-None fields)
        update_data = {
            "updatedAt": datetime.now(timezone.utc),
            "lastModifiedBy": current_user.get("uid")
        }
        
        for field, value in req.model_dump(exclude_none=True).items():
            if hasattr(value, 'value'):  # Enum
                update_data[field] = value.value
            elif isinstance(value, list) and value and hasattr(value[0], 'model_dump'):
                update_data[field] = [item.model_dump() for item in value]
            else:
                update_data[field] = value
        
        doc_ref.update(update_data)
        
        logger.info(f"Equipment updated: {asset_id} by {current_user.get('uid')}")
        
        return SuccessResponse(message="Equipment updated successfully")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update equipment error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{asset_id}", response_model=SuccessResponse)
async def retire_equipment(
    asset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Retire equipment (soft delete)
    Admin only
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        doc_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        
        doc = doc_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Equipment not found")
        
        data = doc.to_dict()
        if data.get("status") == EquipmentStatus.CHECKED_OUT.value:
            raise HTTPException(status_code=400, detail="Cannot retire checked-out equipment")
        
        doc_ref.update({
            "status": EquipmentStatus.RETIRED.value,
            "isRetired": True,
            "updatedAt": datetime.now(timezone.utc),
            "lastModifiedBy": current_user.get("uid")
        })
        
        logger.info(f"Equipment retired: {asset_id} by {current_user.get('uid')}")
        
        return SuccessResponse(message="Equipment retired successfully")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Retire equipment error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============= CHECKOUT/CHECKIN WORKFLOWS =============

@router.post("/checkout", response_model=SuccessResponse)
async def checkout_equipment(
    req: CheckoutEquipmentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Checkout equipment (mobile PWA + admin)
    Creates checkout record and updates equipment status
    """
    org_id = current_user.get("orgId")
    
    try:
        db = firestore.client()
        
        # Get equipment
        equipment_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(req.assetId)
        equipment_doc = equipment_ref.get()
        
        if not equipment_doc.exists:
            raise HTTPException(status_code=404, detail="Equipment not found")
        
        equipment_data = equipment_doc.to_dict()
        
        # Validate status
        if equipment_data["status"] != EquipmentStatus.AVAILABLE.value:
            raise HTTPException(
                status_code=400,
                detail=f"Equipment not available. Current status: {equipment_data['status']}"
            )
        
        # Get user details
        user_name = current_user.get("name", "Unknown")
        user_email = current_user.get("email", "")
        
        # Generate checkout ID
        checkout_id = generate_checkout_id()
        
        # Ensure expectedReturnDate is timezone-aware
        expected_return_date = ensure_timezone_aware(req.expectedReturnDate)
        
        # Prepare checkout document
        checkout_data = {
            "checkoutId": checkout_id,
            "assetId": req.assetId,
            "assetName": equipment_data["name"],
            
            "uid": req.uid,
            "userName": user_name,
            "userRole": current_user.get("role", "teammate"),
            "userEmail": user_email,
            
            "checkoutType": req.checkoutType.value,
            "eventId": req.eventId,
            "eventName": None,  # TODO: Fetch from events collection
            "eventDate": None,
            
            "rentalClientInfo": req.rentalClientInfo.model_dump() if req.rentalClientInfo else None,
            
            "checkedOutAt": datetime.now(timezone.utc),
            "checkedOutBy": current_user.get("uid"),
            "expectedReturnDate": expected_return_date,
            "actualReturnDate": None,
            "daysUsed": 0,
            "isOverdue": False,
            "daysOverdue": 0,
            
            "checkoutLocation": req.checkoutLocation.model_dump() if req.checkoutLocation else None,
            "checkinLocation": None,
            
            "checkoutCondition": req.checkoutCondition.value,
            "checkoutNotes": req.checkoutNotes,
            "checkoutPhotos": [],
            
            "returnCondition": None,
            "returnNotes": None,
            "returnPhotos": [],
            
            "damageReport": None,
            
            "rentalRevenue": 0,
            "securityDeposit": req.securityDeposit or 0,
            "depositRefunded": False,
            "depositRefundDate": None,
            "depositDeductions": 0,
            "paymentStatus": "pending" if req.checkoutType == CheckoutType.EXTERNAL_RENTAL else "paid",
            "invoiceId": None,
            
            "overdueAlertsSent": [],
            
            "accessories": [a.model_dump() for a in req.accessories] if req.accessories else [],
            
            "requiresApproval": equipment_data.get("requiresApproval", False),
            "approvalStatus": "approved",  # Auto-approve for now
            "approvedBy": current_user.get("uid"),
            "approvedAt": datetime.now(timezone.utc),
            "rejectionReason": None,
            
            "createdAt": datetime.now(timezone.utc),
            "updatedAt": datetime.now(timezone.utc),
            "syncedToDevice": True,
            "offlineCheckout": False
        }
        
        # Save checkout record
        checkout_ref = equipment_ref.collection("checkouts").document(checkout_id)
        checkout_ref.set(checkout_data)
        
        # Update equipment status
        rental_type = "external" if req.checkoutType == CheckoutType.EXTERNAL_RENTAL else "internal"
        equipment_ref.update({
            "status": EquipmentStatus.CHECKED_OUT.value,
            "currentHolder": {
                "uid": req.uid,
                "name": user_name,
                "email": user_email,
                "eventId": req.eventId,
                "rentalType": rental_type
            },
            "lastCheckoutDate": datetime.now(timezone.utc),
            "totalCheckouts": firestore.Increment(1),
            "updatedAt": datetime.now(timezone.utc)
        })
        
        # Create external rental record if applicable
        if req.checkoutType == CheckoutType.EXTERNAL_RENTAL and req.rentalClientInfo:
            rental_id = generate_rental_id()
            days_rented = (expected_return_date - datetime.now(timezone.utc)).days or 1
            daily_rate = req.dailyRate or equipment_data.get("dailyRentalRate", 0)
            
            rental_data = {
                "rentalId": rental_id,
                "assetId": req.assetId,
                "assetName": equipment_data["name"],
                
                "clientName": req.rentalClientInfo.name,
                "clientContact": req.rentalClientInfo.contact,
                "clientEmail": req.rentalClientInfo.email,
                "clientType": req.rentalClientInfo.clientType.value,
                "panNumber": req.rentalClientInfo.panNumber,
                "gstNumber": req.rentalClientInfo.gstNumber,
                
                "rentalStartDate": datetime.now(timezone.utc),
                "rentalEndDate": expected_return_date,
                "actualReturnDate": None,
                "daysRented": days_rented,
                
                "dailyRate": daily_rate,
                "totalRevenue": daily_rate * days_rented,
                "discountPercent": 0,
                "discountAmount": 0,
                "finalAmount": daily_rate * days_rented,
                "gstAmount": (daily_rate * days_rented) * 0.18,
                "totalWithGst": (daily_rate * days_rented) * 1.18,
                
                "securityDeposit": req.securityDeposit or 0,
                "depositStatus": "held",
                "depositRefundDate": None,
                "depositDeductions": 0,
                "deductionReason": "",
                
                "paymentStatus": "pending",
                "agreementUrl": req.rentalClientInfo.agreementUrl,
                "agreementSigned": bool(req.rentalClientInfo.agreementUrl),
                
                "checkoutId": checkout_id,
                
                "status": "active",
                
                "createdAt": datetime.now(timezone.utc),
                "createdBy": current_user.get("uid"),
                "updatedAt": datetime.now(timezone.utc)
            }
            
            rental_ref = equipment_ref.collection("externalRentals").document(rental_id)
            rental_ref.set(rental_data)
        
        logger.info(f"Equipment checked out: {req.assetId} by {req.uid}")
        
        return SuccessResponse(
            message=f"Equipment '{equipment_data['name']}' checked out successfully",
            data={"checkoutId": checkout_id}
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Checkout error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/checkin", response_model=SuccessResponse)
async def checkin_equipment(
    req: CheckinEquipmentRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Check-in equipment
    Updates checkout record, equipment status, calculates metrics
    """
    org_id = current_user.get("orgId")
    
    try:
        db = firestore.client()
        
        # Get equipment
        equipment_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(req.assetId)
        equipment_doc = equipment_ref.get()
        
        if not equipment_doc.exists:
            raise HTTPException(status_code=404, detail="Equipment not found")
        
        equipment_data = equipment_doc.to_dict()
        
        # Get checkout record
        checkout_ref = equipment_ref.collection("checkouts").document(req.checkoutId)
        checkout_doc = checkout_ref.get()
        
        if not checkout_doc.exists:
            raise HTTPException(status_code=404, detail="Checkout record not found")
        
        checkout_data = checkout_doc.to_dict()
        
        if checkout_data.get("actualReturnDate"):
            raise HTTPException(status_code=400, detail="Equipment already checked in")
        
        # Calculate days used
        checked_out_at = ensure_timezone_aware(checkout_data["checkedOutAt"])
        now = datetime.now(timezone.utc)
        days_used = max(1, (now - checked_out_at).days)
        
        # Check if overdue
        expected_return = ensure_timezone_aware(checkout_data["expectedReturnDate"])
        is_overdue = now > expected_return
        days_overdue = max(0, (now - expected_return).days) if is_overdue else 0
        
        # Update checkout record
        checkout_updates = {
            "actualReturnDate": now,
            "daysUsed": days_used,
            "isOverdue": is_overdue,
            "daysOverdue": days_overdue,
            "returnCondition": req.returnCondition.value,
            "returnNotes": req.returnNotes,
            "returnPhotos": [p.model_dump() for p in req.returnPhotos] if req.returnPhotos else [],
            "checkinLocation": req.checkinLocation.model_dump() if req.checkinLocation else None,
            "damageReport": req.damageReport.model_dump() if req.damageReport else None,
            "accessories": [a.model_dump() for a in req.accessories] if req.accessories else checkout_data.get("accessories", []),
            "updatedAt": now
        }
        
        checkout_ref.update(checkout_updates)
        
        # Determine new equipment status
        new_status = EquipmentStatus.AVAILABLE.value
        if req.damageReport and req.damageReport.hasDamage:
            new_status = EquipmentStatus.MAINTENANCE.value
            
            # Create maintenance record for repair
            maintenance_id = generate_maintenance_id()
            maintenance_data = {
                "maintenanceId": maintenance_id,
                "assetId": req.assetId,
                "assetName": equipment_data["name"],
                
                "type": "repair",
                "priority": req.damageReport.severity or "medium",
                "category": "damage_related",
                
                "issue": req.damageReport.description,
                "symptoms": req.damageReport.description,
                "rootCause": "Damage during checkout",
                
                "scheduledDate": now,
                "startDate": None,
                "completionDate": None,
                "estimatedDuration": 0,
                "actualDuration": 0,
                
                "technicianId": None,
                "technicianName": None,
                "vendorName": None,
                "vendorContact": None,
                "internalTechnician": False,
                
                "workPerformed": [],
                "partsReplaced": [],
                "laborCost": 0,
                "partsTotal": 0,
                "totalCost": req.damageReport.estimatedRepairCost,
                
                "notes": f"Damage reported during check-in. Reported by: {checkout_data['userName']}",
                "photos": [p.model_dump() for p in req.damageReport.photos] if req.damageReport.photos else [],
                "serviceReportUrl": None,
                
                "status": MaintenanceStatus.SCHEDULED.value,
                "completionNotes": None,
                
                "followUpRequired": False,
                
                "linkedCheckoutId": req.checkoutId,
                "linkedDamageReportId": None,
                
                "coveredByWarranty": False,
                "warrantyClaimNumber": None,
                
                "downtimeDays": 0,
                "impactedEvents": [],
                
                "createdAt": now,
                "createdBy": current_user.get("uid"),
                "updatedAt": now,
                "lastModifiedBy": current_user.get("uid")
            }
            
            maintenance_ref = equipment_ref.collection("maintenance").document(maintenance_id)
            maintenance_ref.set(maintenance_data)
        
        # Calculate condition score impact
        condition_score_map = {
            Condition.EXCELLENT: 0,
            Condition.GOOD: -2,
            Condition.MINOR_WEAR: -5,
            Condition.NEEDS_CLEANING: -3,
            Condition.DAMAGED: -15
        }
        condition_score_delta = condition_score_map.get(req.returnCondition, 0)
        
        # Update equipment
        equipment_updates = {
            "status": new_status,
            "currentHolder": None,
            "lastCheckinDate": now,
            "totalDaysUsed": firestore.Increment(days_used),
            "conditionScore": max(0, equipment_data.get("conditionScore", 100) + condition_score_delta),
            "lastConditionCheck": {
                "condition": req.returnCondition.value,
                "checkedAt": now,
                "checkedBy": current_user.get("uid"),
                "notes": req.returnNotes
            },
            "updatedAt": now
        }
        
        if req.damageReport and req.damageReport.hasDamage:
            equipment_updates["damageIncidents"] = firestore.Increment(1)
        
        # Calculate new utilization rate
        purchase_date = equipment_data.get("purchaseDate")
        if purchase_date:
            new_total_days = equipment_data.get("totalDaysUsed", 0) + days_used
            equipment_updates["utilizationRate"] = calculate_utilization_rate(new_total_days, purchase_date)
        
        equipment_ref.update(equipment_updates)
        
        # Calculate revenue if external rental
        if checkout_data.get("checkoutType") == CheckoutType.EXTERNAL_RENTAL.value:
            daily_rate = equipment_data.get("dailyRentalRate", 0)
            revenue = daily_rate * days_used
            
            equipment_ref.update({
                "totalExternalRentalRevenue": firestore.Increment(revenue),
                "externalRentalCount": firestore.Increment(1)
            })
            
            checkout_ref.update({"rentalRevenue": revenue})
        
        logger.info(f"Equipment checked in: {req.assetId} by {current_user.get('uid')}")
        
        return SuccessResponse(
            message=f"Equipment '{equipment_data['name']}' checked in successfully. Status: {new_status}",
            data={
                "daysUsed": days_used,
                "isOverdue": is_overdue,
                "newStatus": new_status
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Checkin error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/my-checkouts", response_model=List[dict])
async def get_my_active_checkouts(
    current_user: dict = Depends(get_current_user)
):
    """
    Get all active checkouts for the current user (teammate view)
    """
    org_id = current_user.get("orgId")
    user_uid = current_user.get("uid")
    
    try:
        db = firestore.client()
        
        # Get all equipment
        equipment_query = db.collection("organizations").document(org_id)\
            .collection("equipment").where("status", "==", EquipmentStatus.CHECKED_OUT.value)\
            .where("currentHolder.uid", "==", user_uid)
        
        equipment_docs = equipment_query.stream()
        
        checkouts_list = []
        
        for equipment_doc in equipment_docs:
            equipment_data = equipment_doc.to_dict()
            
            # Get the active checkout
            checkouts_query = equipment_doc.reference.collection("checkouts")\
                .where("uid", "==", user_uid)\
                .where("actualReturnDate", "==", None)\
                .order_by("checkedOutAt", direction=firestore.Query.DESCENDING)\
                .limit(1)
            
            checkout_docs = list(checkouts_query.stream())
            
            if checkout_docs:
                checkout_data = checkout_docs[0].to_dict()
                
                checkouts_list.append({
                    "checkoutId": checkout_data["checkoutId"],
                    "assetId": equipment_data["assetId"],
                    "equipmentName": equipment_data["name"],
                    "category": equipment_data["category"],
                    "model": equipment_data.get("model"),
                    "eventId": checkout_data.get("eventId"),
                    "eventName": checkout_data.get("eventName"),
                    "checkedOutAt": checkout_data["checkedOutAt"],
                    "expectedReturnDate": checkout_data["expectedReturnDate"],
                    "checkoutCondition": checkout_data["checkoutCondition"],
                    "checkoutNotes": checkout_data.get("checkoutNotes"),
                    "isOverdue": checkout_data.get("isOverdue", False),
                    "daysOverdue": checkout_data.get("daysOverdue", 0),
                })
        
        return checkouts_list
    
    except Exception as e:
        logger.error(f"Get my checkouts error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============= Due to length, I'll continue in next file =============
# This file is getting long. Let me create a continuation file for the remaining endpoints.
