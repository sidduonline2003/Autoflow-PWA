from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
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
    file: UploadFile = File(...),
    eventId: str = Query(...),
    teamMembers: str = Query("[]"),  # JSON string of team member IDs
    notes: str = Query(""),
    current_user: dict = Depends(get_current_user)
):
    """Upload and process a cab receipt"""
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
        
        # Calculate image hash
        image_hash = verification_service.calculate_perceptual_hash(file_content)
        
        # Process receipt using OCR service
        ocr_result = ocr_service.process_receipt(file_content)
        
        if not ocr_result["success"]:
            raise HTTPException(status_code=400, detail=f"Failed to process receipt: {ocr_result.get('error', 'Unknown error')}")
        
        extracted_text = ocr_result["extractedText"]
        provider = ocr_result["provider"]
        extracted_data = ocr_result["data"]
        
        # Check for existing receipts to calculate risk
        existing_receipts_query = db.collection('organizations', org_id, 'receipts').get()
        existing_receipts = [doc.to_dict() for doc in existing_receipts_query]
        
        # Calculate comprehensive risk score
        risk_assessment = verification_service.calculate_comprehensive_risk_score(
            {
                "extractedData": extracted_data,
                "extractedText": extracted_text,
                "imageHash": image_hash
            },
            existing_receipts,
            None  # Event data would be fetched here in production
        )
        
        # Create receipt document
        receipt_ref = db.collection('organizations', org_id, 'receipts').document()
        receipt_id = receipt_ref.id
        
        # Store image (in production, use Firebase Storage or cloud storage)
        image_url = f"receipts/{receipt_id}/{file.filename}"
        
        # Create receipt document
        receipt_doc = {
            "id": receipt_id,
            "eventId": eventId,
            "submittedBy": user_id,
            "submittedByName": current_user.get("name", current_user.get("email", "")),
            "teamMembers": team_members_list,
            "notes": notes,
            "imageUrl": image_url,
            "imageHash": image_hash,
            "extractedText": extracted_text,
            "provider": provider,
            "extractedData": extracted_data,
            "riskAssessment": risk_assessment,
            "status": "PENDING",
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat()
        }
        
        receipt_ref.set(receipt_doc)
        
        logger.info(f"Receipt uploaded successfully: {receipt_id}")
        
        return {
            "status": "success",
            "receiptId": receipt_id,
            "verification": {
                "riskScore": risk_assessment["riskScore"],
                "riskLevel": risk_assessment["riskLevel"],
                "issues": risk_assessment["issues"],
                "extractedData": extracted_data
            }
        }
        
    except Exception as e:
        logger.error(f"Error uploading receipt: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload receipt: {str(e)}")

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
    
    db = firestore.client()
    
    # Get receipts for the event
    receipts_query = db.collection('organizations', org_id, 'receipts').where("eventId", "==", event_id)
    receipts_docs = receipts_query.get()
    
    receipts = []
    for receipt_doc in receipts_docs:
        receipt_data = receipt_doc.to_dict()
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
