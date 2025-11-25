from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request
from firebase_admin import firestore, auth as firebase_auth
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone
import logging
import json
import hashlib
from dataclasses import asdict

from ..dependencies import get_current_user
from ..services.ocr_service import ocr_service
from ..services.advanced_verification_service import advanced_verification_service
from ..schemas.receipt_schema import create_receipt_record_from_analysis, AdminDecision, VerificationStatus

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/receipts", tags=["Receipt Management"])


def get_user_display_name(db, org_id: str, user_id: str, cache: dict) -> str:
    """Helper to get user's display name from team doc or Firebase Auth"""
    if user_id in cache:
        return cache[user_id]
    
    try:
        # First try team document
        team_doc = db.collection('organizations', org_id, 'team').document(user_id).get()
        if team_doc.exists:
            team_data = team_doc.to_dict()
            name = team_data.get('name', '') or team_data.get('displayName', '') or team_data.get('email', '')
            if name:
                cache[user_id] = name
                return name
        
        # Fallback to Firebase Auth
        try:
            firebase_user = firebase_auth.get_user(user_id)
            name = firebase_user.display_name or firebase_user.email or 'Unknown User'
            cache[user_id] = name
            return name
        except Exception:
            cache[user_id] = 'Unknown User'
            return 'Unknown User'
    except Exception:
        cache[user_id] = 'Unknown User'
        return 'Unknown User'


# --- PYDANTIC MODELS (Restored) ---

class ReceiptUpdate(BaseModel):
    status: str
    verificationNotes: Optional[str] = None

class ReviewAction(BaseModel):
    action: str  # "APPROVE", "REJECT", "FLAG_SUSPICIOUS"
    notes: Optional[str] = ""

# --- ENDPOINTS ---

@router.post("/upload")
async def upload_receipt(
    request: Request,
    file: UploadFile = File(...),
    eventId: str = Query(...),
    teamMembers: str = Query("[]"),
    current_user: dict = Depends(get_current_user)
):
    org_id = current_user.get("orgId")
    user_id = current_user.get("uid")
    
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    
    try:
        file_content = await file.read()
        
        # --- LAYER 0: SHA-256 DIGITAL DNA CHECK (ZERO COST) ---
        file_hash = hashlib.sha256(file_content).hexdigest()
        db = firestore.client()
        receipts_ref = db.collection('organizations', org_id, 'receipts')
        
        # Get user's name using the helper function
        user_cache = {}
        user_name = current_user.get("name", "")
        if not user_name:
            user_name = get_user_display_name(db, org_id, user_id, user_cache)
        logger.info(f"User name resolved to: '{user_name}' for user_id: {user_id}")
        
        # Check if exact file exists
        existing_file = receipts_ref.where('fileHash', '==', file_hash).limit(1).stream()
        match = next(existing_file, None)
        
        if match:
            prev_data = match.to_dict()
            # If previously rejected, allow retry. If approved/pending, save as flagged duplicate
            if prev_data.get("status") not in ["REJECTED"]:
                # SAVE the duplicate receipt as flagged so it appears in history
                new_ref = receipts_ref.document()
                receipt_id = new_ref.id
                
                duplicate_receipt = {
                    "id": receipt_id,
                    "eventId": eventId,
                    "fileHash": file_hash,
                    "submittedBy": user_id,
                    "submittedByName": user_name,
                    "imageUrl": f"receipts/{receipt_id}/{file.filename}",
                    "extractedData": {},
                    "riskScore": 100,
                    "status": "REJECT",
                    "issues": [f"Exact file duplicate of Receipt {match.id}"],
                    "duplicateOf": {
                        "type": "EXACT_FILE_MATCH",
                        "match_type": "EXACT_FILE_MATCH",
                        "receipt_id": match.id,
                        "submitted_by": prev_data.get("submittedByName", "Unknown"),
                        "submitted_at": prev_data.get("createdAt", ""),
                        "confidence": 100,
                        "details": "Exact file hash match (SHA-256)"
                    },
                    "createdAt": datetime.utcnow().isoformat(),
                    "teamMembers": json.loads(teamMembers) if teamMembers else []
                }
                new_ref.set(duplicate_receipt)
                
                return {
                    "status": "duplicate",
                    "receiptId": receipt_id,
                    "verification": {
                        "riskScore": 100,
                        "decision": "REJECT",
                        "issues": [f"Exact file duplicate of Receipt {match.id}"],
                        "isDuplicate": True,
                        "duplicateOf": duplicate_receipt["duplicateOf"]
                    }
                }
        
        # --- LAYER 1 & 3: VISUALS & FORENSICS (CPU BOUND) ---
        image_analysis = advanced_verification_service.comprehensive_image_analysis(file_content)
        
        # --- LAYER 2: AI OCR (API COST) ---
        # Only runs if Layer 0 passed
        ocr_result = ocr_service.process_receipt(file_content)
        if not ocr_result["success"]:
             raise HTTPException(status_code=502, detail=f"OCR Failed: {ocr_result.get('error', 'Unknown error')}")
             
        # --- UNIFIED VERIFICATION ---
        # Optimization: In production, use a more specific query if possible, but for now stream is okay
        existing_docs = receipts_ref.stream()
        existing_receipts = []
        for doc in existing_docs:
            data = doc.to_dict()
            data['id'] = doc.id  # Include document ID for duplicate reference
            existing_receipts.append(data)
        
        duplicate_matches = advanced_verification_service.find_duplicate_receipts(
            image_analysis["perceptual_hashes"],
            ocr_result["data"].get("rideId"),
            existing_receipts
        )
        
        risk = advanced_verification_service.calculate_comprehensive_risk_score(
            image_analysis,
            ocr_result,
            duplicate_matches,
            None
        )
        
        # --- SAVE TO DB ---
        new_ref = receipts_ref.document()
        receipt_id = new_ref.id
        
        # Create Record Object using the Schema Factory
        team_members_list = json.loads(teamMembers) if teamMembers else []
        
        upload_metadata = {
            "id": receipt_id,
            "uploader_id": user_id,
            "uploader_name": current_user.get("name", ""),
            "event_id": eventId,
            "team_members": team_members_list,
            "filename": file.filename,
            "file_size": len(file_content)
        }

        receipt_record = create_receipt_record_from_analysis(
            upload_metadata,
            image_analysis,
            ocr_result,
            duplicate_matches,
            risk
        )
        
        # Convert to dict for Firestore
        receipt_dict = receipt_record.to_dict()
        
        # Add Legacy/Frontend compatibility fields explicitly
        receipt_dict.update({
            "eventId": eventId,
            "fileHash": file_hash, # Saving DNA for future Layer 0 checks
            "submittedBy": user_id,
            "submittedByName": user_name,
            "imageUrl": f"receipts/{receipt_id}/{file.filename}", # Placeholder
            "extractedData": ocr_result.get("data", {}),
            "riskScore": risk["risk_score"],
            "status": "VERIFIED" if risk["decision"] == "AUTO_APPROVE" else risk["decision"],
            "issues": risk["issues"],
            "duplicateOf": duplicate_matches[0] if duplicate_matches else None  # Reference to original receipt
        })
        
        new_ref.set(receipt_dict)
        
        # Build extracted data with proper field mapping for frontend
        extracted_data = ocr_result.get("data", {})
        # Map date + time to timestamp if both exist
        if extracted_data.get("date") and extracted_data.get("time"):
            extracted_data["timestamp"] = f"{extracted_data['date']} {extracted_data['time']}"
        elif extracted_data.get("date"):
            extracted_data["timestamp"] = extracted_data["date"]
        
        # Map pickup/dropoff to locations object for frontend
        if extracted_data.get("pickup") or extracted_data.get("dropoff"):
            extracted_data["locations"] = {
                "pickup": extracted_data.get("pickup"),
                "dropoff": extracted_data.get("dropoff")
            }
        
        return {
            "status": "success",
            "receiptId": receipt_id,
            "verification": {
                **risk,
                "riskLevel": "LOW_RISK" if risk["risk_score"] < 30 else ("MEDIUM_RISK" if risk["risk_score"] < 60 else "HIGH_RISK"),
                "extractedData": extracted_data,
                "duplicateOf": duplicate_matches[0] if duplicate_matches else None,
                "isDuplicate": len(duplicate_matches) > 0
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
        
        # Enrich receipts that don't have submittedByName
        user_cache = {}
        for receipt in receipts:
            if not receipt.get('submittedByName') and receipt.get('submittedBy'):
                receipt['submittedByName'] = get_user_display_name(db, org_id, receipt['submittedBy'], user_cache)
            
        receipts.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        return {"receipts": receipts}
        
    except Exception as e:
        logger.error(f"Error fetching event receipts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def get_all_receipts(current_user: dict = Depends(get_current_user)):
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
        
        # Enrich receipts that don't have submittedByName
        user_cache = {}
        for receipt in receipts:
            if not receipt.get('submittedByName') and receipt.get('submittedBy'):
                receipt['submittedByName'] = get_user_display_name(db, org_id, receipt['submittedBy'], user_cache)
            
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
        status_counts = {"pending": 0, "verified": 0, "rejected": 0, "needs_review": 0}
        
        for doc in docs:
            data = doc.to_dict()
            total_receipts += 1
            
            try:
                amount_val = data.get('extractedData', {}).get('amount', 0)
                if not amount_val:
                    amount_val = data.get('extractedData', {}).get('totalAmount', 0)
                
                if isinstance(amount_val, str):
                    amount_val = amount_val.replace('$', '').replace(',', '')
                amount = float(amount_val)
                total_amount += amount
            except (ValueError, TypeError):
                pass
            
            # Normalizing Status
            status = data.get('status', 'PENDING')
            if status == 'VERIFIED' or status == 'AUTO_APPROVED' or status == 'APPROVED':
                status_counts['verified'] += 1
            elif status == 'REJECTED' or status == 'HIGH_RISK':
                status_counts['rejected'] += 1
            elif status == 'MANUAL_REVIEW' or status == 'MEDIUM_RISK' or status == 'FLAGGED':
                status_counts['needs_review'] += 1
            else:
                status_counts['pending'] += 1
                    
        return {
            "totalReceipts": total_receipts,
            "totalAmount": round(total_amount, 2),
            "statusCounts": status_counts
        }
        
    except Exception as e:
        logger.error(f"Error fetching dashboard summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{receipt_id}/review")
async def review_receipt(
    receipt_id: str,
    review_data: ReviewAction,
    current_user: dict = Depends(get_current_user)
):
    """Handles Admin decisions (Approve/Reject) with Audit Trail"""
    try:
        db = firestore.client()
        org_id = current_user.get("orgId")
        receipt_ref = db.collection('organizations', org_id, 'receipts').document(receipt_id)
        
        doc = receipt_ref.get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Receipt not found")
            
        new_status = VerificationStatus.PENDING
        if review_data.action == "APPROVE":
            new_status = VerificationStatus.APPROVED
        elif review_data.action == "REJECT":
            new_status = VerificationStatus.REJECTED
        elif review_data.action == "FLAG_SUSPICIOUS":
            new_status = VerificationStatus.SUSPICIOUS

        admin_decision = AdminDecision(
            reviewer_id=current_user.get("uid"),
            reviewer_name=current_user.get("name", "Admin"),
            decision=new_status,
            decision_notes=review_data.notes,
            decision_timestamp=datetime.now(timezone.utc).isoformat()
        )

        update_data = {
            "status": new_status,
            "adminDecision": asdict(admin_decision),
            "updatedAt": datetime.now(timezone.utc).isoformat()
        }
        
        receipt_ref.update(update_data)
        return {"status": "success", "new_state": new_status}

    except Exception as e:
        logger.error(f"Review failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/{receipt_id}")
async def update_receipt_status(
    receipt_id: str,
    update_data: ReceiptUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Simple status update (Legacy Support)"""
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
        if not receipt_ref.get().exists:
            raise HTTPException(status_code=404, detail="Receipt not found")
            
        receipt_ref.delete()
        return {"status": "success", "message": "Receipt deleted successfully"}
        
    except Exception as e:
        logger.error(f"Error deleting receipt: {e}")
        raise HTTPException(status_code=500, detail=str(e))