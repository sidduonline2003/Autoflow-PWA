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

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks
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


# ============= BACKGROUND TASKS =============

async def generate_qr_code_background_task(asset_id: str, org_id: str, asset_name: str):
    """
    Background task to generate QR code after equipment creation
    This runs asynchronously without blocking the API response
    """
    try:
        logger.info(f"Background QR generation started for {asset_id} in org {org_id}")
        
        # Generate QR code
        qr_url, qr_base64 = await generate_qr_code(asset_id, org_id)
        
        # Update Firestore with QR URL
        db = firestore.client()
        equipment_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        
        equipment_ref.update({
            "qrCodeUrl": qr_url,
            "qrCodeGenerated": True,
            "qrCodeGeneratedAt": datetime.now(timezone.utc),
            "updatedAt": datetime.now(timezone.utc)
        })
        
        logger.info(f"✅ QR code generated successfully for {asset_id} ({asset_name})")
        
    except Exception as e:
        logger.error(f"❌ QR generation failed for {asset_id} ({asset_name}): {str(e)}")
        # Don't raise exception - this is a background task
        # The equipment is already created, QR can be regenerated later


# ============= EQUIPMENT CRUD =============

@router.post("/", response_model=SuccessResponse)
async def create_equipment(
    req: CreateEquipmentRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    Create new equipment with QR code generation in background
    Admin only
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Generate asset ID
        asset_id = generate_asset_id()
        
        # Ensure purchaseDate is timezone-aware
        purchase_date = ensure_timezone_aware(req.purchaseDate)
        
        # Calculate initial values
        book_value = calculate_book_value(req.purchasePrice, purchase_date)
        
        # Prepare equipment document (without QR code initially)
        equipment_data = {
            "assetId": asset_id,
            "qrCodeUrl": None,  # Will be generated in background
            "qrCodeGenerated": False,
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
        
        # Queue QR code generation in background (non-blocking)
        background_tasks.add_task(
            generate_qr_code_background_task,
            asset_id=asset_id,
            org_id=org_id,
            asset_name=req.name
        )
        
        logger.info(f"Equipment created: {asset_id} by {current_user.get('uid')}. QR generation queued.")
        
        return SuccessResponse(
            message="Equipment created successfully. QR code will be generated shortly.",
            data={
                "assetId": asset_id,
                "qrCodeUrl": None,  # Will be available after background task completes
                "qrCodeGenerating": True
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


@router.get("/my-checkouts", response_model=List[dict])
async def get_my_active_checkouts(
    current_user: dict = Depends(get_current_user)
):
    """
    Get all active checkouts for the current user (teammate view)
    IMPORTANT: This route must come BEFORE /{asset_id} to avoid being caught by it
    """
    org_id = current_user.get("orgId")
    user_uid = current_user.get("uid")
    
    try:
        db = firestore.client()
        
        # Get all equipment that is checked out
        equipment_query = db.collection("organizations").document(org_id)\
            .collection("equipment").where("status", "==", EquipmentStatus.CHECKED_OUT.value)
        
        equipment_docs = equipment_query.stream()
        
        checkouts_list = []
        
        for equipment_doc in equipment_docs:
            equipment_data = equipment_doc.to_dict()
            
            # Check if current holder matches the user
            current_holder = equipment_data.get("currentHolder", {})
            if current_holder.get("uid") != user_uid:
                continue
            
            # Get the active checkout for this user (without complex query)
            checkouts_query = equipment_doc.reference.collection("checkouts")\
                .where("uid", "==", user_uid)\
                .where("actualReturnDate", "==", None)\
                .limit(10)  # Get last 10 to find the most recent
            
            checkout_docs = list(checkouts_query.stream())
            
            if checkout_docs:
                # Sort by checkedOutAt in Python to avoid index requirement
                checkout_docs.sort(key=lambda x: x.to_dict().get("checkedOutAt", datetime.min), reverse=True)
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
        
        logger.info(f"Found {len(checkouts_list)} checkouts for user {user_uid}")
        return checkouts_list
    
    except Exception as e:
        logger.error(f"Get my checkouts error: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/checkouts/{checkout_id}", response_model=dict)
async def get_checkout_details(
    checkout_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Get checkout details by checkout ID
    Used for check-in flow
    """
    org_id = current_user.get("orgId")
    
    try:
        db = firestore.client()
        
        # Search across all equipment for this checkout
        equipment_query = db.collection("organizations").document(org_id).collection("equipment")
        equipment_docs = equipment_query.stream()
        
        for equipment_doc in equipment_docs:
            # Check if this equipment has the checkout
            checkout_ref = equipment_doc.reference.collection("checkouts").document(checkout_id)
            checkout_doc = checkout_ref.get()
            
            if checkout_doc.exists:
                checkout_data = checkout_doc.to_dict()
                equipment_data = equipment_doc.to_dict()
                
                return {
                    **checkout_data,
                    "equipment": equipment_data
                }
        
        raise HTTPException(status_code=404, detail="Checkout not found")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get checkout details error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/checkouts", response_model=List[dict])
async def get_checkouts(
    assetId: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """
    Get checkouts with optional filters
    Used for finding active checkouts for an asset
    """
    org_id = current_user.get("orgId")
    
    try:
        db = firestore.client()
        
        if assetId:
            # Get checkouts for a specific asset
            equipment_ref = db.collection("organizations").document(org_id)\
                .collection("equipment").document(assetId)
            equipment_doc = equipment_ref.get()
            
            if not equipment_doc.exists:
                raise HTTPException(status_code=404, detail="Equipment not found")
            
            checkouts_query = equipment_ref.collection("checkouts")
            
            # Filter by status
            if status == 'active':
                checkouts_query = checkouts_query.where("actualReturnDate", "==", None)
            
            checkout_docs = checkouts_query.stream()
            checkouts_list = []
            
            equipment_data = equipment_doc.to_dict()
            
            for checkout_doc in checkout_docs:
                checkout_data = checkout_doc.to_dict()
                checkouts_list.append({
                    **checkout_data,
                    "equipment": equipment_data
                })
            
            return checkouts_list
        else:
            # Return empty list if no assetId specified
            return []
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get checkouts error: {str(e)}")
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
            logger.info("Analytics summary: Using cached summary")
            return summary_doc.to_dict()
        
        # If not exists, calculate on-the-fly
        logger.info("Analytics summary: Calculating fresh summary")
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
        
        logger.info(f"Analytics summary calculated: {total_assets} assets, ${total_value:.2f} total value")
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
        equipment_query = db.collection("organizations").document(org_id)\
            .collection("equipment")
        
        user_stats = {}
        
        for equipment_doc in equipment_query.stream():
            try:
                checkouts_query = equipment_doc.reference.collection("checkouts")
                
                for checkout_doc in checkouts_query.stream():
                    try:
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
                            
                            # Safely check damage report
                            damage_report = data.get("damageReport")
                            if damage_report and isinstance(damage_report, dict):
                                if damage_report.get("hasDamage", False):
                                    user_stats[uid]["damageIncidents"] += 1
                    except Exception as e:
                        logger.warning(f"Error processing checkout {checkout_doc.id}: {str(e)}")
                        continue
            except Exception as e:
                logger.warning(f"Error processing equipment {equipment_doc.id}: {str(e)}")
                continue
        
        # If no crew data, return empty list
        if not user_stats:
            logger.info("No crew checkout data found")
            return []
        
        # Calculate scores
        crew_scores = []
        for uid, stats in user_stats.items():
            try:
                total_returns = stats["totalReturns"] if stats["totalReturns"] > 0 else 1
                
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
            except Exception as e:
                logger.warning(f"Error calculating score for user {uid}: {str(e)}")
                continue
        
        # Sort by score descending
        crew_scores.sort(key=lambda x: x["responsibilityScore"], reverse=True)
        
        logger.info(f"Crew scores calculated: {len(crew_scores)} crew members")
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
    Get utilization rate trend over time (for heatmap/chart)
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # This would typically be pre-aggregated by Cloud Functions
        # For now, calculate simplified weekly data points
        
        trend_data = []
        now = datetime.now(timezone.utc)
        
        # Get all equipment for utilization calculation
        equipment_query = db.collection("organizations").document(org_id)\
            .collection("equipment")
        all_equipment = list(equipment_query.stream())
        total_assets = len(all_equipment)
        
        # If no equipment, return empty trend
        if total_assets == 0:
            logger.info("No equipment found for utilization trend")
            return []
        
        # Generate weekly data points
        for i in range(days, 0, -7):  # Weekly intervals
            date = now - timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")
            
            # Count assets in use on this date (simplified)
            assets_in_use = 0
            for equipment_doc in all_equipment:
                try:
                    checkouts_query = equipment_doc.reference.collection("checkouts")\
                        .limit(50)  # Get recent checkouts
                    
                    for checkout_doc in checkouts_query.stream():
                        try:
                            checkout_data = checkout_doc.to_dict()
                            checkout_date = checkout_data.get("checkoutDate")
                            return_date = checkout_data.get("actualReturnDate") or checkout_data.get("expectedReturnDate")
                            
                            # Convert to datetime if needed
                            if checkout_date and not isinstance(checkout_date, datetime):
                                continue
                            if return_date and not isinstance(return_date, datetime):
                                return_date = None
                            
                            # Check if checkout was active on the date
                            if checkout_date and checkout_date <= date:
                                if not return_date or return_date >= date:
                                    assets_in_use += 1
                                    break  # This equipment was in use, count it once
                        except Exception as e:
                            logger.warning(f"Error processing checkout {checkout_doc.id}: {str(e)}")
                            continue
                except Exception as e:
                    logger.warning(f"Error processing equipment {equipment_doc.id}: {str(e)}")
                    continue
            
            utilization_rate = (assets_in_use / total_assets * 100) if total_assets > 0 else 0
            
            trend_data.append({
                "date": date_str,
                "utilizationRate": round(utilization_rate, 2),
                "assetsInUse": assets_in_use,
                "totalAssets": total_assets
            })
        
        logger.info(f"Utilization trend calculated: {len(trend_data)} data points over {days} days")
        return trend_data
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Utilization trend error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============= HISTORY ENDPOINTS =============

@router.get("/{asset_id}/history", response_model=List[dict])
async def get_equipment_history(
    asset_id: str,
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user)
):
    """
    Get complete transaction history for a specific equipment
    Includes: checkouts, check-ins, maintenance, status changes
    """
    org_id = current_user.get("orgId")
    
    try:
        db = firestore.client()
        
        # Verify equipment exists
        equipment_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        equipment_doc = equipment_ref.get()
        
        if not equipment_doc.exists:
            raise HTTPException(status_code=404, detail="Equipment not found")
        
        equipment_data = equipment_doc.to_dict()
        
        # Collect all history events
        history_events = []
        
        # 1. Get checkout/checkin history
        checkouts_query = equipment_ref.collection("checkouts")\
            .order_by("checkoutDate", direction=firestore.Query.DESCENDING)\
            .limit(limit)
        
        for checkout_doc in checkouts_query.stream():
            checkout_data = checkout_doc.to_dict()
            
            # Checkout event
            history_events.append({
                "id": f"checkout_{checkout_doc.id}",
                "type": "checkout",
                "timestamp": checkout_data.get("checkoutDate"),
                "user": {
                    "uid": checkout_data.get("uid"),
                    "name": checkout_data.get("userName"),
                    "email": checkout_data.get("userEmail")
                },
                "details": {
                    "checkoutId": checkout_doc.id,
                    "checkoutType": checkout_data.get("checkoutType"),
                    "eventId": checkout_data.get("eventId"),
                    "eventName": checkout_data.get("eventName"),
                    "expectedReturnDate": checkout_data.get("expectedReturnDate"),
                    "notes": checkout_data.get("notes")
                },
                "status": "completed"
            })
            
            # Check-in event (if returned)
            if checkout_data.get("actualReturnDate"):
                history_events.append({
                    "id": f"checkin_{checkout_doc.id}",
                    "type": "checkin",
                    "timestamp": checkout_data.get("actualReturnDate"),
                    "user": {
                        "uid": checkout_data.get("uid"),
                        "name": checkout_data.get("userName"),
                        "email": checkout_data.get("userEmail")
                    },
                    "details": {
                        "checkoutId": checkout_doc.id,
                        "returnCondition": checkout_data.get("returnCondition"),
                        "isOverdue": checkout_data.get("isOverdue", False),
                        "returnNotes": checkout_data.get("returnNotes"),
                        "hasDamage": checkout_data.get("damageReport", {}).get("hasDamage", False),
                        "damageDescription": checkout_data.get("damageReport", {}).get("description")
                    },
                    "status": "completed"
                })
        
        # 2. Get maintenance history
        try:
            maintenance_query = equipment_ref.collection("maintenance")\
                .order_by("scheduledDate", direction=firestore.Query.DESCENDING)\
                .limit(limit)
            
            for maintenance_doc in maintenance_query.stream():
                maintenance_data = maintenance_doc.to_dict()
                
                # Maintenance scheduled event
                history_events.append({
                    "id": f"maintenance_scheduled_{maintenance_doc.id}",
                    "type": "maintenance_scheduled",
                    "timestamp": maintenance_data.get("scheduledDate"),
                    "user": {
                        "uid": maintenance_data.get("createdBy"),
                        "name": maintenance_data.get("createdByName", "System")
                    },
                    "details": {
                        "maintenanceId": maintenance_doc.id,
                        "issueType": maintenance_data.get("issueType"),
                        "description": maintenance_data.get("description"),
                        "priority": maintenance_data.get("priority"),
                        "estimatedCost": maintenance_data.get("estimatedCost")
                    },
                    "status": maintenance_data.get("status", "scheduled")
                })
                
                # Maintenance completed event
                if maintenance_data.get("completedDate"):
                    history_events.append({
                        "id": f"maintenance_completed_{maintenance_doc.id}",
                        "type": "maintenance_completed",
                        "timestamp": maintenance_data.get("completedDate"),
                        "user": {
                            "name": maintenance_data.get("technicianName", "Unknown")
                        },
                        "details": {
                            "maintenanceId": maintenance_doc.id,
                            "totalCost": maintenance_data.get("totalCost"),
                            "workPerformed": maintenance_data.get("workPerformed"),
                            "partsReplaced": maintenance_data.get("partsReplaced"),
                            "completionNotes": maintenance_data.get("completionNotes")
                        },
                        "status": "completed"
                    })
        except Exception as e:
            logger.warning(f"Error fetching maintenance history: {str(e)}")
        
        # 3. Add creation event
        if equipment_data.get("createdAt"):
            history_events.append({
                "id": f"created_{asset_id}",
                "type": "created",
                "timestamp": equipment_data.get("createdAt"),
                "user": {
                    "uid": equipment_data.get("createdBy"),
                    "name": equipment_data.get("createdByName", "System")
                },
                "details": {
                    "assetId": asset_id,
                    "name": equipment_data.get("name"),
                    "category": equipment_data.get("category"),
                    "purchasePrice": equipment_data.get("purchasePrice"),
                    "purchaseDate": equipment_data.get("purchaseDate")
                },
                "status": "completed"
            })
        
        # Sort all events by timestamp (most recent first)
        history_events.sort(key=lambda x: x.get("timestamp") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        
        logger.info(f"Equipment history retrieved: {len(history_events)} events for {asset_id}")
        return history_events[:limit]
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get equipment history error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/user/{user_id}", response_model=List[dict])
async def get_user_equipment_history(
    user_id: str,
    limit: int = Query(50, le=200),
    current_user: dict = Depends(get_current_user)
):
    """
    Get equipment history for a specific user (teammate view)
    Shows all equipment they've checked out (past and present)
    """
    org_id = current_user.get("orgId")
    
    # Users can only see their own history unless they're admin
    if current_user.get("role") != "admin" and current_user.get("uid") != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    try:
        db = firestore.client()
        
        # Get all equipment
        equipment_query = db.collection("organizations").document(org_id)\
            .collection("equipment")
        
        user_history = []
        
        for equipment_doc in equipment_query.stream():
            equipment_data = equipment_doc.to_dict()
            
            # Get checkouts for this user
            checkouts_query = equipment_doc.reference.collection("checkouts")\
                .where("uid", "==", user_id)\
                .order_by("checkoutDate", direction=firestore.Query.DESCENDING)\
                .limit(limit)
            
            for checkout_doc in checkouts_query.stream():
                checkout_data = checkout_doc.to_dict()
                
                user_history.append({
                    "id": checkout_doc.id,
                    "checkoutId": checkout_doc.id,
                    "equipment": {
                        "assetId": equipment_data.get("assetId"),
                        "name": equipment_data.get("name"),
                        "category": equipment_data.get("category"),
                        "imageUrl": equipment_data.get("imageUrl"),
                        "qrCodeUrl": equipment_data.get("qrCodeUrl")
                    },
                    "checkoutDate": checkout_data.get("checkoutDate"),
                    "expectedReturnDate": checkout_data.get("expectedReturnDate"),
                    "actualReturnDate": checkout_data.get("actualReturnDate"),
                    "checkoutType": checkout_data.get("checkoutType"),
                    "eventName": checkout_data.get("eventName"),
                    "notes": checkout_data.get("notes"),
                    "returnCondition": checkout_data.get("returnCondition"),
                    "returnNotes": checkout_data.get("returnNotes"),
                    "isOverdue": checkout_data.get("isOverdue", False),
                    "hasDamage": checkout_data.get("damageReport", {}).get("hasDamage", False),
                    "damageDescription": checkout_data.get("damageReport", {}).get("description"),
                    "status": "returned" if checkout_data.get("actualReturnDate") else "active"
                })
        
        # Sort by checkout date (most recent first)
        user_history.sort(key=lambda x: x.get("checkoutDate") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        
        logger.info(f"User history retrieved: {len(user_history)} transactions for user {user_id}")
        return user_history[:limit]
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user history error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== BULK UPLOAD ENDPOINTS ====================

@router.get("/bulk-upload/template")
async def download_bulk_upload_template(
    current_user = Depends(get_current_user)
):
    """
    Download CSV template for bulk equipment upload
    
    Returns a sample CSV file with proper headers and example data
    """
    try:
        # Verify admin access
        if current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # CSV template with headers and example rows
        csv_content = """name,category,description,manufacturer,model,serialNumber,purchaseDate,purchasePrice,location,condition,notes
Canon EOS R5,camera,Full-frame mirrorless camera,Canon,EOS R5,12345ABC,2024-01-15,3499.99,Studio A,excellent,Primary event camera
Sony A7 III,camera,Professional mirrorless camera,Sony,Alpha 7 III,SONY67890,2023-06-20,1999.99,Studio B,good,Backup camera with extra battery
Manfrotto MT055XPRO3,tripod,Aluminum tripod with ball head,Manfrotto,MT055XPRO3,MF12345,2023-03-10,299.99,Equipment Room,excellent,Heavy-duty tripod
Rode VideoMic Pro,audio,Shotgun microphone,Rode,VideoMic Pro,RODE789,2024-02-01,229.99,Audio Cabinet,excellent,Comes with deadcat windscreen
Godox AD600Pro,lighting,Portable strobe light,Godox,AD600Pro,GX456789,2023-11-15,899.99,Lighting Room,good,Includes battery and charger"""
        
        # Create response with proper headers for file download
        from fastapi.responses import Response
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=equipment_bulk_upload_template.csv"
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Template download error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate template: {str(e)}")


@router.post("/bulk-upload")
async def bulk_upload_equipment(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_user = Depends(get_current_user)
):
    """
    Bulk upload equipment from CSV file
    
    QR codes are generated asynchronously in the background for better performance.
    
    CSV Format:
    - Required columns: name, category
    - Optional columns: description, manufacturer, model, serialNumber, purchaseDate, 
                       purchasePrice, location, condition, notes
    
    Returns:
    - success_count: Number of equipment successfully created
    - failed_count: Number of equipment that failed
    - errors: List of errors with row numbers
    - created_assets: List of created asset IDs
    """
    try:
        # Get org_id from current user
        org_id = current_user.get("orgId")
        if not org_id:
            raise HTTPException(status_code=400, detail="Organization ID not found in user profile")
        
        # Verify admin access
        if current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Validate file type
        if not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="File must be a CSV")
        
        # Read and parse CSV
        import csv
        from io import StringIO
        
        content = await file.read()
        decoded_content = content.decode('utf-8')
        csv_file = StringIO(decoded_content)
        csv_reader = csv.DictReader(csv_file)
        
        # Validate required columns
        required_columns = {'name', 'category'}
        csv_columns = set(csv_reader.fieldnames or [])
        
        if not required_columns.issubset(csv_columns):
            missing = required_columns - csv_columns
            raise HTTPException(
                status_code=400, 
                detail=f"Missing required columns: {', '.join(missing)}"
            )
        
        db = firestore.client()
        
        logger.info(f"Bulk upload started for org: {org_id} by user: {current_user.get('uid')}")
        
        success_count = 0
        failed_count = 0
        errors = []
        created_assets = []
        
        # Valid categories and conditions
        valid_categories = {
            'camera', 'lens', 'lighting', 'audio', 'tripod', 
            'gimbal', 'drone', 'monitor', 'storage', 'other'
        }
        valid_conditions = {'excellent', 'good', 'fair', 'poor', 'needs_repair'}
        
        # Process each row
        for row_num, row in enumerate(csv_reader, start=2):  # Start at 2 (header is row 1)
            try:
                # Validate required fields
                name = row.get('name', '').strip()
                category = row.get('category', '').strip().lower()
                
                if not name:
                    errors.append(f"Row {row_num}: Name is required")
                    failed_count += 1
                    continue
                
                if not category:
                    errors.append(f"Row {row_num}: Category is required")
                    failed_count += 1
                    continue
                
                if category not in valid_categories:
                    errors.append(f"Row {row_num}: Invalid category '{category}'. Must be one of: {', '.join(valid_categories)}")
                    failed_count += 1
                    continue
                
                # Validate condition if provided
                condition = row.get('condition', 'good').strip().lower()
                if condition and condition not in valid_conditions:
                    errors.append(f"Row {row_num}: Invalid condition '{condition}'. Must be one of: {', '.join(valid_conditions)}")
                    failed_count += 1
                    continue
                
                # Generate unique asset ID
                asset_id = f"{category.upper()}_{nanoid(size=8)}"
                
                # Parse purchase price
                purchase_price = None
                if row.get('purchasePrice'):
                    try:
                        purchase_price = float(row['purchasePrice'].strip())
                    except ValueError:
                        errors.append(f"Row {row_num}: Invalid purchase price '{row['purchasePrice']}'")
                        failed_count += 1
                        continue
                
                # Parse purchase date
                purchase_date = None
                if row.get('purchaseDate'):
                    try:
                        # Support multiple date formats
                        date_str = row['purchaseDate'].strip()
                        for fmt in ['%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%Y/%m/%d']:
                            try:
                                purchase_date = datetime.strptime(date_str, fmt)
                                break
                            except ValueError:
                                continue
                        if not purchase_date:
                            raise ValueError(f"Unsupported date format: {date_str}")
                    except Exception as date_error:
                        errors.append(f"Row {row_num}: Invalid purchase date '{row['purchaseDate']}'. Use format: YYYY-MM-DD")
                        failed_count += 1
                        continue
                
                # Create equipment document
                equipment_data = {
                    "assetId": asset_id,
                    "name": name,
                    "category": category,
                    "description": row.get('description', '').strip() or None,
                    "manufacturer": row.get('manufacturer', '').strip() or None,
                    "model": row.get('model', '').strip() or None,
                    "serialNumber": row.get('serialNumber', '').strip() or None,
                    "purchaseDate": purchase_date,
                    "purchasePrice": purchase_price,
                    "location": row.get('location', '').strip() or "Equipment Room",
                    "status": EquipmentStatus.AVAILABLE.value,
                    "condition": condition if condition else "good",
                    "notes": row.get('notes', '').strip() or None,
                    "createdAt": datetime.now(timezone.utc),
                    "updatedAt": datetime.now(timezone.utc),
                    "createdBy": current_user.get("uid"),
                    "currentCheckoutId": None,
                    "checkoutHistory": [],
                    "maintenanceHistory": [],
                    "damageHistory": [],
                    # Skip QR generation during bulk upload for performance
                    "qrCodeUrl": None,
                    "qrCodeGenerated": False
                }
                
                # Save to Firestore with proper org path
                equipment_ref = db.collection("organizations").document(org_id)\
                    .collection("equipment").document(asset_id)
                equipment_ref.set(equipment_data)
                
                # Queue QR code generation in background (non-blocking)
                background_tasks.add_task(
                    generate_qr_code_background_task,
                    asset_id=asset_id,
                    org_id=org_id,
                    asset_name=name
                )
                
                success_count += 1
                created_assets.append(asset_id)
                
                logger.info(f"Bulk upload: Created equipment {asset_id} from row {row_num} in org {org_id}")
                
            except Exception as row_error:
                errors.append(f"Row {row_num}: {str(row_error)}")
                failed_count += 1
                logger.error(f"Bulk upload row {row_num} error: {str(row_error)}")
        
        result = {
            "success": True,
            "message": f"Bulk upload completed: {success_count} created, {failed_count} failed. QR codes are being generated in the background.",
            "success_count": success_count,
            "failed_count": failed_count,
            "total_rows": success_count + failed_count,
            # Only return first 10 asset IDs to minimize response size
            "created_assets": created_assets[:10],
            "total_created": len(created_assets),
            # Only return first 10 errors to minimize response size  
            "errors": errors[:10],
            "total_errors": len(errors),
            "has_more_assets": len(created_assets) > 10,
            "has_more_errors": len(errors) > 10
        }
        
        logger.info(f"Bulk upload completed: {success_count} success, {failed_count} failed. {success_count} QR generation tasks queued.")
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bulk upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Bulk upload failed: {str(e)}")


# ============= QR CODE GENERATION ENDPOINTS =============

@router.post("/{asset_id}/generate-qr")
async def generate_qr_for_asset(
    asset_id: str,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    Manually trigger QR code generation for a single asset
    Useful for:
    - Regenerating failed QR codes
    - Generating QR codes for bulk-uploaded items
    - Updating QR codes after URL changes
    
    Admin only
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Check if equipment exists
        equipment_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        equipment_doc = equipment_ref.get()
        
        if not equipment_doc.exists:
            raise HTTPException(status_code=404, detail=f"Equipment {asset_id} not found")
        
        equipment_data = equipment_doc.to_dict()
        asset_name = equipment_data.get("name", "Unknown")
        
        # Queue QR generation in background
        background_tasks.add_task(
            generate_qr_code_background_task,
            asset_id=asset_id,
            org_id=org_id,
            asset_name=asset_name
        )
        
        logger.info(f"QR generation queued for {asset_id} by {current_user.get('uid')}")
        
        return {
            "success": True,
            "message": f"QR code generation queued for {asset_name}",
            "assetId": asset_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"QR generation request error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch-generate-qr")
async def batch_generate_qr_codes(
    asset_ids: List[str],
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    Batch generate QR codes for multiple assets
    Useful for generating QR codes for all equipment missing them
    
    Admin only
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if len(asset_ids) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 assets per batch")
    
    try:
        db = firestore.client()
        queued_count = 0
        not_found = []
        
        for asset_id in asset_ids:
            equipment_ref = db.collection("organizations").document(org_id)\
                .collection("equipment").document(asset_id)
            equipment_doc = equipment_ref.get()
            
            if not equipment_doc.exists:
                not_found.append(asset_id)
                continue
            
            equipment_data = equipment_doc.to_dict()
            asset_name = equipment_data.get("name", "Unknown")
            
            # Queue QR generation in background
            background_tasks.add_task(
                generate_qr_code_background_task,
                asset_id=asset_id,
                org_id=org_id,
                asset_name=asset_name
            )
            queued_count += 1
        
        logger.info(f"Batch QR generation: {queued_count} queued, {len(not_found)} not found")
        
        return {
            "success": True,
            "message": f"QR generation queued for {queued_count} assets",
            "queued_count": queued_count,
            "not_found_count": len(not_found),
            "not_found": not_found[:10]  # Return first 10 not found
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch QR generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============= DELETE ENDPOINTS =============

@router.delete("/{asset_id}")
async def delete_equipment(
    asset_id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Delete a single equipment item
    Admin only
    
    Deletes:
    - Equipment document
    - All checkout history
    - All maintenance records
    - QR code from storage (if exists)
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    try:
        db = firestore.client()
        
        # Check if equipment exists
        equipment_ref = db.collection("organizations").document(org_id)\
            .collection("equipment").document(asset_id)
        equipment_doc = equipment_ref.get()
        
        if not equipment_doc.exists:
            raise HTTPException(status_code=404, detail=f"Equipment {asset_id} not found")
        
        equipment_data = equipment_doc.to_dict()
        equipment_name = equipment_data.get("name", "Unknown")
        
        # Check if equipment is currently checked out
        if equipment_data.get("status") == EquipmentStatus.CHECKED_OUT.value:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete {equipment_name}. Equipment is currently checked out. Please check it in first."
            )
        
        # Delete subcollections (checkouts, maintenance, etc.)
        try:
            # Delete checkouts
            checkouts = equipment_ref.collection("checkouts").limit(100).stream()
            for checkout_doc in checkouts:
                checkout_doc.reference.delete()
            
            # Delete maintenance records
            maintenance = equipment_ref.collection("maintenance").limit(100).stream()
            for maint_doc in maintenance:
                maint_doc.reference.delete()
        except Exception as subcoll_error:
            logger.warning(f"Error deleting subcollections for {asset_id}: {str(subcoll_error)}")
        
        # Delete QR code from Firebase Storage (optional, won't fail if it doesn't exist)
        try:
            qr_code_url = equipment_data.get("qrCodeUrl")
            if qr_code_url and not qr_code_url.startswith("data:"):
                bucket = storage.bucket()
                blob_path = f"organizations/{org_id}/qr_codes/{asset_id}.png"
                blob = bucket.blob(blob_path)
                if blob.exists():
                    blob.delete()
                    logger.info(f"Deleted QR code from storage for {asset_id}")
        except Exception as storage_error:
            logger.warning(f"Could not delete QR code from storage: {str(storage_error)}")
        
        # Delete the equipment document
        equipment_ref.delete()
        
        logger.info(f"Equipment deleted: {asset_id} ({equipment_name}) by {current_user.get('uid')}")
        
        return {
            "success": True,
            "message": f"Equipment {equipment_name} deleted successfully",
            "assetId": asset_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete equipment error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk-delete")
async def bulk_delete_equipment(
    asset_ids: List[str],
    current_user: dict = Depends(get_current_user)
):
    """
    Delete multiple equipment items
    Admin only
    
    Returns:
    - deleted_count: Number of equipment successfully deleted
    - failed_count: Number of equipment that failed to delete
    - errors: List of errors with asset IDs
    """
    org_id = current_user.get("orgId")
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    if not asset_ids:
        raise HTTPException(status_code=400, detail="No asset IDs provided")
    
    if len(asset_ids) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 assets can be deleted at once")
    
    try:
        db = firestore.client()
        
        deleted_count = 0
        failed_count = 0
        errors = []
        deleted_assets = []
        
        logger.info(f"Bulk delete started: {len(asset_ids)} items by user {current_user.get('uid')}")
        
        for asset_id in asset_ids:
            try:
                equipment_ref = db.collection("organizations").document(org_id)\
                    .collection("equipment").document(asset_id)
                equipment_doc = equipment_ref.get()
                
                if not equipment_doc.exists:
                    errors.append(f"{asset_id}: Not found")
                    failed_count += 1
                    continue
                
                equipment_data = equipment_doc.to_dict()
                equipment_name = equipment_data.get("name", "Unknown")
                
                # Check if equipment is checked out
                if equipment_data.get("status") == EquipmentStatus.CHECKED_OUT.value:
                    errors.append(f"{asset_id} ({equipment_name}): Currently checked out")
                    failed_count += 1
                    continue
                
                # Delete subcollections
                try:
                    checkouts = equipment_ref.collection("checkouts").limit(100).stream()
                    for checkout_doc in checkouts:
                        checkout_doc.reference.delete()
                    
                    maintenance = equipment_ref.collection("maintenance").limit(100).stream()
                    for maint_doc in maintenance:
                        maint_doc.reference.delete()
                except Exception as subcoll_error:
                    logger.warning(f"Error deleting subcollections for {asset_id}: {str(subcoll_error)}")
                
                # Delete QR code from storage
                try:
                    qr_code_url = equipment_data.get("qrCodeUrl")
                    if qr_code_url and not qr_code_url.startswith("data:"):
                        bucket = storage.bucket()
                        blob_path = f"organizations/{org_id}/qr_codes/{asset_id}.png"
                        blob = bucket.blob(blob_path)
                        if blob.exists():
                            blob.delete()
                except Exception as storage_error:
                    logger.warning(f"Could not delete QR code from storage for {asset_id}: {str(storage_error)}")
                
                # Delete equipment document
                equipment_ref.delete()
                
                deleted_count += 1
                deleted_assets.append({
                    "assetId": asset_id,
                    "name": equipment_name
                })
                
                logger.info(f"Bulk delete: Deleted {asset_id} ({equipment_name})")
                
            except Exception as item_error:
                errors.append(f"{asset_id}: {str(item_error)}")
                failed_count += 1
                logger.error(f"Bulk delete error for {asset_id}: {str(item_error)}")
        
        result = {
            "success": True,
            "message": f"Bulk delete completed: {deleted_count} deleted, {failed_count} failed",
            "deleted_count": deleted_count,
            "failed_count": failed_count,
            "total_requested": len(asset_ids),
            "deleted_assets": deleted_assets[:10],  # Return first 10
            "errors": errors[:10],  # Return first 10 errors
            "has_more_deleted": len(deleted_assets) > 10,
            "has_more_errors": len(errors) > 10
        }
        
        logger.info(f"Bulk delete completed: {deleted_count} deleted, {failed_count} failed")
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bulk delete error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Bulk delete failed: {str(e)}")



