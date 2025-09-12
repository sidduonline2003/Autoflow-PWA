from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request
from firebase_admin import firestore, storage
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone, timedelta
from uuid import uuid4
import logging
import json

from ..dependencies import get_current_user
from ..services.ocr_service import ocr_service
from ..services.verification_service import verification_service
from ..services.advanced_verification_service import advanced_verification_service
from ..schemas.receipt_schema import (
    ReceiptRecord, 
    VerificationStatus, 
    AdminDecision,
    create_receipt_record_from_analysis
)

# Set up logging
logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/receipts",
    tags=["Receipt Management"],
)

# --- Pydantic Models ---
class ReceiptUploadRequest(BaseModel):
    eventId: str
    teamMembers: Optional[List[str]] = []  # List of team member IDs who shared the ride
    notes: Optional[str] = None

class ReceiptBase(BaseModel):
    eventId: str
    submittedBy: str
    submittedByName: str
    amount: Optional[float] = None
    provider: Optional[str] = None  # uber, ola, rapido, other
    rideId: Optional[str] = None
    timestamp: Optional[str] = None
    locations: Optional[Dict[str, str]] = None  # pickup, dropoff
    teamMembers: Optional[List[str]] = []
    notes: Optional[str] = None
    imageUrl: Optional[str] = None
    imageHash: Optional[str] = None

class ReceiptCreate(ReceiptBase):
    pass

class ReceiptUpdate(BaseModel):
    status: str  # PENDING, VERIFIED, REJECTED, SUSPICIOUS
    verificationNotes: Optional[str] = None
    verifiedBy: Optional[str] = None

class ReceiptVerificationResult(BaseModel):
    receiptId: str
    riskScore: int  # 0-100
    status: str  # LOW_RISK, MEDIUM_RISK, HIGH_RISK
    issues: List[str]
    extractedData: Dict[str, Any]
    recommendations: List[str]

class ReceiptFilter(BaseModel):
    eventId: Optional[str] = None
    status: Optional[str] = None
    submittedBy: Optional[str] = None
    startDate: Optional[str] = None
    endDate: Optional[str] = None

# --- Helper Functions ---
def convert_numpy_types(obj):
    """Recursively convert numpy types to native Python types for Firestore compatibility"""
    # Handle None and bytes first
    if obj is None:
        return None
    if isinstance(obj, bytes):
        # Don't include raw bytes in JSON response
        return None
    
    # Handle numpy types through string checking since numpy might not be available
    obj_type_str = str(type(obj))
    
    # Handle numpy boolean types
    if 'numpy.bool' in obj_type_str:
        return bool(obj)
    elif hasattr(obj, 'dtype'):  # numpy array or scalar
        if hasattr(obj.dtype, 'name') and 'bool' in obj.dtype.name:
            return bool(obj)
        elif hasattr(obj.dtype, 'name') and any(int_type in obj.dtype.name for int_type in ['int8', 'int16', 'int32', 'int64', 'uint8', 'uint16', 'uint32', 'uint64']):
            return int(obj)
        elif hasattr(obj.dtype, 'name') and any(float_type in obj.dtype.name for float_type in ['float16', 'float32', 'float64']):
            return float(obj)
        else:
            return obj.item() if hasattr(obj, 'item') else obj
    elif isinstance(obj, dict):
        return {key: convert_numpy_types(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_types(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(convert_numpy_types(item) for item in obj)
    elif obj_type_str.startswith("<class 'numpy."):
        # Handle numpy types that might not have dtype
        if hasattr(obj, 'item'):
            return obj.item()
        else:
            return obj
    else:
        return obj

def is_authorized_for_receipts(current_user: dict) -> bool:
    """Check if user can access receipt verification (admin, accountant, or assigned team member)"""
    role = current_user.get("role", "")
    return role in ["admin", "accountant", "crew", "editor", "data-manager"]

def is_admin_or_accountant(current_user: dict) -> bool:
    """Check if user is admin or accountant"""
    role = current_user.get("role", "")
    return role in ["admin", "accountant"]

# --- Receipt Management Endpoints ---

@router.post("/upload")
async def upload_receipt(
    request: Request,
    file: UploadFile = File(...),
    eventId: str = Query(...),
    teamMembers: str = Query("[]"),  # JSON string of team member IDs
    notes: str = Query(""),
    current_user: dict = Depends(get_current_user)
):
    """Upload and process a cab receipt with comprehensive verification"""
    logger.info(f"Receipt upload - User: {current_user.get('uid')}, Event: {eventId}")
    
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not is_authorized_for_receipts(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for receipt operations")
    
    # Validate file type
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        # Read file content
        file_content = await file.read()
        file_size = len(file_content)
        
        # Validate file size (max 10MB)
        if file_size > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File size too large (max 10MB)")
        
        db = firestore.client()
        
        # Parse team members
        try:
            team_members_list = json.loads(teamMembers) if teamMembers else []
        except json.JSONDecodeError:
            team_members_list = []
        
        # STEP 1: Comprehensive Image Analysis
        logger.info("Starting comprehensive image analysis...")
        image_analysis = advanced_verification_service.comprehensive_image_analysis(file_content)
        
        if "error" in image_analysis:
            logger.warning(f"Image analysis had issues: {image_analysis['error']}")
        
        # STEP 2: OCR Processing
        logger.info("Processing OCR...")
        ocr_result = ocr_service.process_receipt(file_content)
        
        if not ocr_result["success"]:
            raise HTTPException(status_code=400, detail=f"Failed to process receipt: {ocr_result.get('error', 'Unknown error')}")
        
        # STEP 3: Duplicate Detection
        logger.info("Checking for duplicates...")
        existing_receipts_query = db.collection('organizations', org_id, 'receipts').get()
        existing_receipts = []
        
        for doc in existing_receipts_query:
            receipt_data = doc.to_dict()
            existing_receipts.append(receipt_data)
        
        # Find duplicates using advanced perceptual hashing
        perceptual_hashes = image_analysis.get("perceptual_hashes", {})
        duplicate_matches = advanced_verification_service.find_duplicate_receipts(
            perceptual_hashes, 
            existing_receipts
        )
        
        # STEP 4: Comprehensive Risk Assessment
        logger.info("Calculating comprehensive risk score...")
        risk_assessment = advanced_verification_service.calculate_comprehensive_risk_score(
            image_analysis,
            ocr_result,
            duplicate_matches,
            None  # Event data would be fetched here in production
        )
        
        # STEP 5: Create Receipt Record
        receipt_ref = db.collection('organizations', org_id, 'receipts').document()
        receipt_id = receipt_ref.id
        
        # Prepare upload metadata
        upload_data = {
            "id": receipt_id,
            "uploader_id": user_id,
            "uploader_name": current_user.get("name", current_user.get("email", "")),
            "event_id": eventId,
            "team_members": team_members_list,
            "filename": file.filename,
            "file_size": file_size,
            "dimensions": image_analysis.get("image_metadata", {}).get("dimensions", (0, 0)),
            "device_info": {
                "user_agent": request.headers.get("user-agent", ""),
                "accept": request.headers.get("accept", ""),
            },
            "ip_address": request.client.host if request.client else "",
            "user_agent": request.headers.get("user-agent", "")
        }
        
        # Create comprehensive receipt record
        receipt_record = create_receipt_record_from_analysis(
            upload_data,
            image_analysis,
            ocr_result,
            duplicate_matches,
            risk_assessment
        )
        
        # STEP 6: Store in Database
        receipt_dict = receipt_record.to_dict()
        
        # Convert any numpy types to native Python types for Firestore compatibility
        receipt_dict = convert_numpy_types(receipt_dict)
        
        # Add legacy fields for backward compatibility
        receipt_dict.update({
            "eventId": eventId,
            "submittedBy": user_id,
            "submittedByName": current_user.get("name", current_user.get("email", "")),
            "teamMembers": team_members_list,
            "notes": notes,
            "imageUrl": f"receipts/{receipt_id}/{file.filename}",
            "imageHash": image_analysis.get("cryptographic_hash", ""),
            "extractedText": ocr_result.get("extractedText", ""),
            "provider": ocr_result.get("provider", ""),
            "extractedData": ocr_result.get("data", {}),
            "riskAssessment": convert_numpy_types(risk_assessment),
            "status": receipt_record.status.value,
            "createdAt": receipt_record.created_at,
            "updatedAt": receipt_record.updated_at
        })
        
        receipt_ref.set(receipt_dict)
        
        # Enhanced logging for exact duplicates
        exact_duplicate_detected = risk_assessment.get('exact_duplicate_detected', False)
        risk_level = risk_assessment.get('risk_level')
        risk_score = risk_assessment.get('risk_score')
        
        if exact_duplicate_detected:
            logger.warning(f"EXACT DUPLICATE DETECTED: Receipt {receipt_id} (Risk: {risk_level}, Score: {risk_score}) - REJECTED")
        else:
            logger.info(f"Receipt uploaded successfully: {receipt_id} (Risk: {risk_level}, Score: {risk_score})")
        
        # STEP 7: Return Results
        return {
            "status": "success",
            "receiptId": receipt_id,
            "verification": {
                "riskScore": risk_assessment.get("risk_score", 0),
                "riskLevel": risk_assessment.get("risk_level", "MEDIUM_RISK"),
                "decision": risk_assessment.get("decision", "MANUAL_REVIEW"),
                "issues": risk_assessment.get("issues", []),
                "extractedData": ocr_result.get("data", {}),
                "recommendations": risk_assessment.get("recommendations", []),
                "manipulationDetected": image_analysis.get("manipulation_summary", {}).get("is_manipulated", False),
                "duplicatesFound": len(duplicate_matches) > 0,
                "duplicateCount": len(duplicate_matches)
            },
            "analysis_details": {
                "image_analysis_success": "error" not in image_analysis,
                "ocr_success": ocr_result["success"],
                "duplicates_checked": len(existing_receipts),
                "processing_timestamp": datetime.now(timezone.utc).isoformat()
            }
        }
        
    except Exception as e:
        logger.error(f"Error uploading receipt: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload receipt: {str(e)}")

# --- Admin Verification Endpoints ---

@router.get("/admin/pending")
async def get_pending_receipts(
    limit: int = Query(50, le=100),
    current_user: dict = Depends(get_current_user)
):
    """Get receipts pending admin review"""
    logger.info(f"Getting pending receipts - User: {current_user.get('uid')}")
    
    if not is_admin_or_accountant(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    org_id = current_user.get("orgId")
    db = firestore.client()
    
    # Get receipts that need manual review
    query = db.collection('organizations', org_id, 'receipts').where(
        "status", "in", ["PENDING", "MANUAL_REVIEW"]
    ).order_by("createdAt", direction=firestore.Query.DESCENDING).limit(limit)
    
    receipts_docs = query.get()
    receipts = []
    
    for receipt_doc in receipts_docs:
        receipt_data = receipt_doc.to_dict()
        
        # Add admin-specific information
        receipt_data["admin_view"] = {
            "risk_summary": receipt_data.get("verification_results", {}).get("risk_factors", {}),
            "manipulation_detected": receipt_data.get("image_fingerprints", {}).get("manipulation_summary", {}).get("is_manipulated", False),
            "duplicate_count": len(receipt_data.get("duplicate_matches", [])),
            "ela_score": receipt_data.get("image_fingerprints", {}).get("ela_analysis", {}).get("manipulation_score", 0)
        }
        
        receipts.append(receipt_data)
    
    return {
        "receipts": receipts,
        "count": len(receipts),
        "has_more": len(receipts) == limit
    }

@router.post("/{receipt_id}/admin/decision")
async def make_admin_decision(
    receipt_id: str,
    decision: str = Query(...),  # APPROVE, REJECT, REQUEST_MORE_INFO
    notes: str = Query(""),
    current_user: dict = Depends(get_current_user)
):
    """Admin decision on receipt verification"""
    logger.info(f"Admin decision on receipt {receipt_id} - User: {current_user.get('uid')}")
    
    if not is_admin_or_accountant(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    org_id = current_user.get("orgId")
    db = firestore.client()
    
    # Validate decision
    valid_decisions = ["APPROVE", "REJECT", "REQUEST_MORE_INFO"]
    if decision not in valid_decisions:
        raise HTTPException(status_code=400, detail=f"Invalid decision. Must be one of: {valid_decisions}")
    
    # Get receipt
    receipt_ref = db.collection('organizations', org_id, 'receipts').document(receipt_id)
    receipt_doc = receipt_ref.get()
    
    if not receipt_doc.exists:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    # Create admin decision
    admin_decision = AdminDecision(
        reviewer_id=current_user.get("uid"),
        reviewer_name=current_user.get("name", current_user.get("email", "")),
        decision=VerificationStatus.APPROVED if decision == "APPROVE" else VerificationStatus.REJECTED,
        decision_notes=notes
    )
    
    # Update receipt status
    new_status = VerificationStatus.APPROVED if decision == "APPROVE" else VerificationStatus.REJECTED
    if decision == "REQUEST_MORE_INFO":
        new_status = VerificationStatus.PENDING
    
    update_data = {
        "status": new_status.value,
        "admin_decision": admin_decision.__dict__,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "version": receipt_doc.to_dict().get("version", 1) + 1
    }
    
    receipt_ref.update(update_data)
    
    logger.info(f"Receipt {receipt_id} decision: {decision} by {current_user.get('name')}")
    
    return {
        "status": "success",
        "receiptId": receipt_id,
        "decision": decision,
        "newStatus": new_status.value
    }

@router.get("/{receipt_id}/admin/analysis")
async def get_detailed_analysis(
    receipt_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get detailed forensic analysis for admin review"""
    logger.info(f"Getting detailed analysis for receipt {receipt_id} - User: {current_user.get('uid')}")
    
    if not is_admin_or_accountant(current_user):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    org_id = current_user.get("orgId")
    db = firestore.client()
    
    # Get receipt
    receipt_ref = db.collection('organizations', org_id, 'receipts').document(receipt_id)
    receipt_doc = receipt_ref.get()
    
    if not receipt_doc.exists:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    receipt_data = receipt_doc.to_dict()
    
    # Extract detailed analysis
    image_fingerprints = receipt_data.get("image_fingerprints", {})
    
    analysis = {
        "receipt_id": receipt_id,
        "basic_info": {
            "submitted_by": receipt_data.get("submittedByName", ""),
            "event_id": receipt_data.get("eventId", ""),
            "upload_time": receipt_data.get("createdAt", ""),
            "file_info": {
                "filename": receipt_data.get("upload_metadata", {}).get("original_filename", ""),
                "size": receipt_data.get("upload_metadata", {}).get("file_size", 0),
                "dimensions": receipt_data.get("upload_metadata", {}).get("image_dimensions", [0, 0])
            }
        },
        "manipulation_analysis": {
            "ela_analysis": image_fingerprints.get("ela_analysis", {}),
            "ghost_analysis": image_fingerprints.get("ghost_analysis", {}),
            "noise_analysis": image_fingerprints.get("noise_analysis", {}),
            "overall_summary": image_fingerprints.get("manipulation_summary", {})
        },
        "duplicate_analysis": {
            "matches_found": receipt_data.get("duplicate_matches", []),
            "perceptual_hashes": image_fingerprints.get("perceptual_hashes", {}),
            "crypto_hash": image_fingerprints.get("cryptographic_hash", "")
        },
        "ocr_analysis": receipt_data.get("ocr_results", {}),
        "risk_assessment": receipt_data.get("verification_results", {}),
        "admin_tools": {
            "ela_image_available": bool(image_fingerprints.get("ela_analysis", {}).get("ela_image_data")),
            "comparison_hashes": image_fingerprints.get("perceptual_hashes", {}),
            "recommended_action": receipt_data.get("verification_results", {}).get("decision", "MANUAL_REVIEW")
        }
    }
    
    return analysis

@router.get("/")
async def list_receipts(
    eventId: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, le=100),
    current_user: dict = Depends(get_current_user)
):
    """List receipts with filtering options"""
    logger.info(f"Listing receipts - User: {current_user.get('uid')}")
    
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not is_authorized_for_receipts(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for receipt operations")
    
    db = firestore.client()
    
    # Build query
    query = db.collection('organizations', org_id, 'receipts')
    
    # Apply filters
    if eventId:
        query = query.where("eventId", "==", eventId)
    
    if status:
        query = query.where("status", "==", status)
    
    # If not admin/accountant, only show user's own receipts
    if not is_admin_or_accountant(current_user):
        query = query.where("submittedBy", "==", user_id)
    
    # Order by creation date (newest first)
    query = query.order_by("createdAt", direction=firestore.Query.DESCENDING)
    
    # Apply limit
    query = query.limit(limit)
    
    receipts_docs = query.get()
    
    receipts = []
    for receipt_doc in receipts_docs:
        receipt_data = receipt_doc.to_dict()
        
        # Remove binary data before sending in JSON response
        fields_to_remove = [
            'imageData', 'originalImage', 'processedImage', 'ela_image_data',
            'image_binary', 'original_bytes', 'processed_bytes'
        ]
        for field in fields_to_remove:
            if field in receipt_data:
                del receipt_data[field]
        
        # Also remove binary data from nested structures
        if 'image_fingerprints' in receipt_data:
            fingerprints = receipt_data['image_fingerprints']
            if 'ela_analysis' in fingerprints and 'ela_image_data' in fingerprints['ela_analysis']:
                del fingerprints['ela_analysis']['ela_image_data']
        
        # Convert any numpy types
        receipt_data = convert_numpy_types(receipt_data)
        receipts.append(receipt_data)
    
    logger.info(f"Found {len(receipts)} receipts")
    return {"receipts": receipts}

@router.get("/{receipt_id}")
async def get_receipt(
    receipt_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get receipt details"""
    logger.info(f"Getting receipt: {receipt_id} - User: {current_user.get('uid')}")
    
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not is_authorized_for_receipts(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for receipt operations")
    
    db = firestore.client()
    receipt_ref = db.collection('organizations', org_id, 'receipts').document(receipt_id)
    receipt_doc = receipt_ref.get()
    
    if not receipt_doc.exists:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    receipt_data = receipt_doc.to_dict()
    
    # Check access permissions
    if not is_admin_or_accountant(current_user) and receipt_data.get("submittedBy") != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return receipt_data

@router.put("/{receipt_id}/verify")
async def verify_receipt(
    receipt_id: str,
    verification: ReceiptUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update receipt verification status (admin/accountant only)"""
    logger.info(f"Verifying receipt: {receipt_id} - User: {current_user.get('uid')}")
    
    org_id = current_user.get("orgId")
    
    if not is_admin_or_accountant(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for receipt verification")
    
    db = firestore.client()
    receipt_ref = db.collection('organizations', org_id, 'receipts').document(receipt_id)
    receipt_doc = receipt_ref.get()
    
    if not receipt_doc.exists:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    # Update receipt
    update_data = {
        "status": verification.status,
        "verificationNotes": verification.verificationNotes,
        "verifiedBy": current_user.get("uid"),
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    
    receipt_ref.update(update_data)
    
    logger.info(f"Receipt {receipt_id} verified with status: {verification.status}")
    
    return {"status": "success", "message": "Receipt verification updated"}

@router.get("/event/{event_id}")
async def get_event_receipts(
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all receipts for a specific event"""
    logger.info(f"Getting receipts for event: {event_id} - User: {current_user.get('uid')}")
    
    org_id = current_user.get("orgId")
    
    if not is_authorized_for_receipts(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for receipt operations")
    
    try:
        db = firestore.client()
        
        # Get receipts for the event
        receipts_query = db.collection('organizations', org_id, 'receipts').where("eventId", "==", event_id)
        receipts_docs = receipts_query.get()
        
        receipts = []
        for receipt_doc in receipts_docs:
            receipt_data = receipt_doc.to_dict()
            
            # Remove binary data before sending in JSON response
            fields_to_remove = [
                'imageData', 'originalImage', 'processedImage', 'ela_image_data',
                'image_binary', 'original_bytes', 'processed_bytes'
            ]
            for field in fields_to_remove:
                if field in receipt_data:
                    del receipt_data[field]
            
            # Also remove binary data from nested structures
            if 'image_fingerprints' in receipt_data:
                fingerprints = receipt_data['image_fingerprints']
                if 'ela_analysis' in fingerprints and 'ela_image_data' in fingerprints['ela_analysis']:
                    del fingerprints['ela_analysis']['ela_image_data']
            
            # Convert any numpy types
            receipt_data = convert_numpy_types(receipt_data)
            receipts.append(receipt_data)
        
        # Calculate summary statistics
        total_receipts = len(receipts)
        pending_count = len([r for r in receipts if r.get("status") == "PENDING"])
        verified_count = len([r for r in receipts if r.get("status") == "VERIFIED"])
        rejected_count = len([r for r in receipts if r.get("status") == "REJECTED"])
        total_amount = sum([r.get("extractedData", {}).get("amount", 0) or 0 for r in receipts])
        
        summary = {
            "totalReceipts": total_receipts,
            "pendingCount": pending_count,
            "verifiedCount": verified_count,
            "rejectedCount": rejected_count,
            "totalAmount": total_amount
        }
        
        return {
            "receipts": receipts,
            "summary": summary
        }
    except Exception as e:
        logger.error(f"Error getting receipts for event {event_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get receipts: {str(e)}")

@router.delete("/{receipt_id}")
async def delete_receipt(
    receipt_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a receipt (admin only or receipt owner if still pending)"""
    logger.info(f"Deleting receipt: {receipt_id} - User: {current_user.get('uid')}")
    
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not is_authorized_for_receipts(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for receipt operations")
    
    db = firestore.client()
    receipt_ref = db.collection('organizations', org_id, 'receipts').document(receipt_id)
    receipt_doc = receipt_ref.get()
    
    if not receipt_doc.exists:
        raise HTTPException(status_code=404, detail="Receipt not found")
    
    receipt_data = receipt_doc.to_dict()
    
    # Check permissions
    is_admin = is_admin_or_accountant(current_user)
    is_owner = receipt_data.get("submittedBy") == user_id
    is_pending = receipt_data.get("status") == "PENDING"
    
    if not (is_admin or (is_owner and is_pending)):
        raise HTTPException(status_code=403, detail="Cannot delete this receipt")
    
    # Delete the receipt
    receipt_ref.delete()
    
    logger.info(f"Receipt {receipt_id} deleted successfully")
    
    return {"status": "success", "message": "Receipt deleted"}

@router.get("/dashboard/summary")
async def get_dashboard_summary(
    current_user: dict = Depends(get_current_user)
):
    """Get receipt dashboard summary for admins"""
    logger.info(f"Getting dashboard summary - User: {current_user.get('uid')}")
    
    org_id = current_user.get("orgId")
    
    if not is_admin_or_accountant(current_user):
        raise HTTPException(status_code=403, detail="Not authorized for dashboard access")
    
    db = firestore.client()
    
    # Get all receipts
    receipts_query = db.collection('organizations', org_id, 'receipts')
    receipts_docs = receipts_query.get()
    
    receipts = [doc.to_dict() for doc in receipts_docs]
    
    # Calculate statistics
    total_receipts = len(receipts)
    pending_verification = len([r for r in receipts if r.get("status") == "PENDING"])
    high_risk_count = len([r for r in receipts if r.get("riskAssessment", {}).get("status") == "HIGH_RISK"])
    total_amount = sum([r.get("extractedData", {}).get("amount", 0) or 0 for r in receipts])
    
    # Recent submissions (last 7 days)
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    recent_receipts = [
        r for r in receipts 
        if datetime.fromisoformat(r.get("createdAt", "").replace("Z", "+00:00")) > seven_days_ago
    ]
    
    summary = {
        "totalReceipts": total_receipts,
        "pendingVerification": pending_verification,
        "highRiskCount": high_risk_count,
        "totalAmount": total_amount,
        "recentSubmissions": len(recent_receipts),
        "recentReceipts": recent_receipts[:10]  # Last 10 recent receipts
    }
    
    return summary
