from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request
from firebase_admin import firestore
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
import logging
import json

# Services
from ..dependencies import get_current_user
from ..services.ocr_service import ocr_service
from ..services.advanced_verification_service import advanced_verification_service
from ..schemas.receipt_schema import create_receipt_record_from_analysis

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/receipts", tags=["Receipt Management"])

# Basic Pydantic Models for Documentation
class ReceiptUpdate(BaseModel):
    status: str
    verificationNotes: Optional[str] = None

def convert_numpy_types(obj):
    """Helper to make data firestore-safe"""
    if isinstance(obj, (dict, list, tuple)):
        return obj # Simplified for brevity, assuming optimized input
    return obj

@router.post("/upload")
async def upload_receipt(
    request: Request,
    file: UploadFile = File(...),
    eventId: str = Query(...),
    teamMembers: str = Query("[]"),
    notes: str = Query(""),
    current_user: dict = Depends(get_current_user)
):
    """
    Optimized Upload Pipeline:
    1. Image Analysis (Forensics)
    2. AI OCR (Extraction)
    3. Unified Duplicate Check (Ride ID + Hash)
    4. Risk Scoring & Storage
    """
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        # 0. Read File (Async I/O)
        file_content = await file.read()
        if len(file_content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="File size too large (max 10MB)")

        db = firestore.client()
        team_members_list = json.loads(teamMembers) if teamMembers else []

        # 1. Forensics (CPU Bound)
        logger.info("Running forensics...")
        image_analysis = advanced_verification_service.comprehensive_image_analysis(file_content)

        # 2. AI OCR (I/O Bound)
        logger.info("Running AI OCR...")
        ocr_result = ocr_service.process_receipt(file_content)
        
        # STRICT CHECK: If AI fails, abort the entire process
        if not ocr_result["success"]:
            error_msg = ocr_result.get("error", "AI OCR extraction failed")
            logger.error(f"AI OCR Failed: {error_msg}")
            raise HTTPException(status_code=502, detail=f"AI Extraction Failed: {error_msg}. Please try again.")

        extracted_ride_id = ocr_result.get("data", {}).get("rideId")
        
        # 3. Unified Duplicate Check (DB Bound)
        logger.info("Checking duplicates...")
        # Optimization: Only fetch required fields (id, extractedData, image_fingerprints)
        # Note: Firestore doesn't support projection efficiently in Python client for simple dicts, 
        # but we keep the fetch simple.
        receipts_ref = db.collection('organizations', org_id, 'receipts')
        existing_docs = receipts_ref.stream()
        existing_receipts = [doc.to_dict() for doc in existing_docs]

        duplicate_matches = advanced_verification_service.find_duplicate_receipts(
            image_analysis.get("perceptual_hashes", {}),
            extracted_ride_id, # <--- Unified Gatekeeper Parameter
            existing_receipts
        )

        # 4. Risk Assessment
        risk_assessment = advanced_verification_service.calculate_comprehensive_risk_score(
            image_analysis,
            ocr_result,
            duplicate_matches,
            None
        )

        # 5. Save to Database
        receipt_ref = receipts_ref.document()
        receipt_id = receipt_ref.id
        
        # Construct Upload Data
        upload_metadata = {
            "id": receipt_id,
            "uploader_id": user_id,
            "uploader_name": current_user.get("name", ""),
            "event_id": eventId,
            "team_members": team_members_list,
            "filename": file.filename,
            "file_size": len(file_content)
        }

        # Create Record
        receipt_record = create_receipt_record_from_analysis(
            upload_metadata,
            image_analysis,
            ocr_result,
            duplicate_matches,
            risk_assessment
        )
        
        # Prepare final dict for Firestore
        receipt_dict = receipt_record.to_dict()
        # Legacy fields for frontend compatibility
        receipt_dict.update({
            "eventId": eventId,
            "submittedBy": user_id,
            "submittedByName": current_user.get("name", ""),
            "imageUrl": f"receipts/{receipt_id}/{file.filename}", # Placeholder for Storage URL
            "extractedData": ocr_result.get("data", {}),
            "status": risk_assessment["decision"] if risk_assessment["decision"] != "AUTO_APPROVE" else "VERIFIED",
            "riskScore": risk_assessment["risk_score"]
        })

        receipt_ref.set(receipt_dict)
        
        logger.info(f"Upload complete. Risk Score: {risk_assessment['risk_score']}")

        return {
            "status": "success",
            "receiptId": receipt_id,
            "verification": {
                "riskScore": risk_assessment["risk_score"],
                "riskLevel": risk_assessment["risk_level"],
                "decision": risk_assessment["decision"],
                "issues": risk_assessment["issues"],
                "duplicatesFound": len(duplicate_matches) > 0,
                "extractedData": ocr_result.get("data", {})
            }
        }

    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/event/{event_id}")
async def get_event_receipts(
    event_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all receipts for a specific event"""
    try:
        org_id = current_user.get("orgId")
        db = firestore.client()
        
        receipts_ref = db.collection('organizations', org_id, 'receipts')
        query = receipts_ref.where('eventId', '==', event_id)
        
        docs = query.stream()
        receipts = []
        
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            receipts.append(data)
            
        # Sort by creation time (newest first)
        receipts.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        
        return {"receipts": receipts}
        
    except Exception as e:
        logger.error(f"Error fetching event receipts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def get_all_receipts(
    current_user: dict = Depends(get_current_user)
):
    """Get all receipts for the organization"""
    try:
        org_id = current_user.get("orgId")
        db = firestore.client()
        
        receipts_ref = db.collection('organizations', org_id, 'receipts')
        docs = receipts_ref.stream()
        
        receipts = []
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            receipts.append(data)
            
        # Sort by creation time (newest first)
        receipts.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        
        return {"receipts": receipts}
        
    except Exception as e:
        logger.error(f"Error fetching all receipts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dashboard/summary")
async def get_dashboard_summary(current_user: dict = Depends(get_current_user)):
    """Get summary statistics for the dashboard"""
    try:
        org_id = current_user.get("orgId")
        db = firestore.client()
        
        receipts_ref = db.collection('organizations', org_id, 'receipts')
        docs = receipts_ref.stream()
        
        total_receipts = 0
        total_amount = 0.0
        status_counts = {
            "pending": 0,
            "verified": 0,
            "rejected": 0,
            "needs_review": 0
        }
        
        for doc in docs:
            data = doc.to_dict()
            total_receipts += 1
            
            # Calculate total amount
            try:
                amount_val = data.get('extractedData', {}).get('totalAmount', 0)
                # Handle string amounts like "$10.00"
                if isinstance(amount_val, str):
                    amount_val = amount_val.replace('$', '').replace(',', '')
                amount = float(amount_val)
                total_amount += amount
            except (ValueError, TypeError):
                pass
            
            # Count statuses
            status = data.get('status', 'pending').lower()
            if status in status_counts:
                status_counts[status] += 1
            else:
                # Map other statuses to closest bucket
                if status == 'auto_approve':
                    status_counts['verified'] += 1
                elif status == 'flagged':
                    status_counts['needs_review'] += 1
                else:
                    # Default to pending for unknown statuses
                    status_counts['pending'] += 1
                    
        return {
            "totalReceipts": total_receipts,
            "totalAmount": round(total_amount, 2),
            "statusCounts": status_counts
        }
        
    except Exception as e:
        logger.error(f"Error fetching dashboard summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{receipt_id}")
async def update_receipt_status(
    receipt_id: str,
    update_data: ReceiptUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update receipt status and notes"""
    try:
        org_id = current_user.get("orgId")
        db = firestore.client()
        
        receipt_ref = db.collection('organizations', org_id, 'receipts').document(receipt_id)
        doc = receipt_ref.get()
        
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Receipt not found")
            
        update_dict = {
            "status": update_data.status,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            "updatedBy": current_user.get("uid")
        }
        
        if update_data.verificationNotes is not None:
            update_dict["verificationNotes"] = update_data.verificationNotes
            
        receipt_ref.update(update_dict)
        
        return {"status": "success", "message": "Receipt updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating receipt: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{receipt_id}")
async def delete_receipt(
    receipt_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a receipt"""
    try:
        org_id = current_user.get("orgId")
        db = firestore.client()
        
        receipt_ref = db.collection('organizations', org_id, 'receipts').document(receipt_id)
        doc = receipt_ref.get()
        
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Receipt not found")
            
        receipt_ref.delete()
        
        return {"status": "success", "message": "Receipt deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting receipt: {e}")
        raise HTTPException(status_code=500, detail=str(e))