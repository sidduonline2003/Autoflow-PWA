import logging
import hashlib
import io
import imagehash
from typing import Dict, List, Any, Optional, Tuple
from PIL import Image, ImageChops, ImageEnhance
import numpy as np

logger = logging.getLogger(__name__)

class AdvancedReceiptVerificationService:
    """
    Tri-Layer Defense Service:
    Layer 1: Visual Template Matching (pHash)
    Layer 2: Identity Verification (OCR Ride ID)
    Layer 3: Forensic Analysis (ELA)
    """
    
    def __init__(self):
        # Risk Thresholds for Score Calculation
        self.thresholds = {
            "PHASH_TEMPLATE": 12, # If distance < 12, it's the same App UI
            "DHASH_EXACT": 4,     # If distance < 4, it's the same file (suspicious)
            "ELA_HIGH": 70        # If score > 70, likely edited
        }

    def preprocess_image(self, image_bytes: bytes) -> Tuple[Image.Image, bytes]:
        """Convert bytes to PIL Image and standardize"""
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
            
            # Resize to standard width for consistent hashing
            width = 1024
            ratio = width / float(image.size[0])
            height = int((float(image.size[1]) * float(ratio)))
            image = image.resize((width, height), Image.LANCZOS)
            
            return image, image_bytes
        except Exception as e:
            logger.error(f"Preprocessing failed: {e}")
            raise

    def calculate_hashes(self, image: Image.Image) -> Dict[str, str]:
        """Calculate pHash (Structure) and dHash (Gradient)"""
        return {
            "phash": str(imagehash.phash(image)),
            "dhash": str(imagehash.dhash(image))
        }

    def perform_ela_analysis(self, image: Image.Image) -> Dict[str, Any]:
        """
        Layer 3: Error Level Analysis.
        Detects if text was 'pasted' onto the image (Photoshop detection).
        """
        try:
            # Save as temp JPEG to simulate compression
            buf = io.BytesIO()
            image.save(buf, 'JPEG', quality=90)
            buf.seek(0)
            compressed = Image.open(buf)
            
            # Calculate difference
            ela_im = ImageChops.difference(image, compressed)
            extrema = ela_im.getextrema()
            max_diff = max([ex[1] for ex in extrema])
            scale = 255.0 / (max_diff if max_diff > 0 else 1)
            ela_im = ImageEnhance.Brightness(ela_im).enhance(scale)
            
            # Statistical analysis
            stats = np.array(ela_im)
            score = (np.mean(stats) / 255.0) * 100
            
            # Heuristic: Higher variance often means manipulation
            is_manipulated = bool(score > 20) # Basic threshold, adjusted in scoring
            
            return {
                "manipulation_score": float(score),
                "is_manipulated": is_manipulated
            }
        except Exception as e:
            logger.error(f"ELA failed: {e}")
            return {"manipulation_score": 0, "is_manipulated": False}

    def comprehensive_image_analysis(self, image_bytes: bytes) -> Dict[str, Any]:
        """Run all image-based checks"""
        image, _ = self.preprocess_image(image_bytes)
        return {
            "perceptual_hashes": self.calculate_hashes(image),
            "ela_analysis": self.perform_ela_analysis(image)
        }

    def find_duplicate_receipts(self, current_hashes, current_ride_id, existing_receipts):
        """
        The Core Logic:
        - Ride ID Match = FATAL (Reject)
        - pHash Match = INFO (Template Detection)
        """
        duplicates = []
        current_ride_id_clean = str(current_ride_id).strip().lower() if current_ride_id else None

        for existing in existing_receipts:
            extracted = existing.get("extractedData", {})
            existing_id = extracted.get("rideId")
            existing_hashes = existing.get("image_fingerprints", {}).get("perceptual_hashes", {})

            # CHECK 1: DATA (Ride ID)
            if current_ride_id_clean and existing_id:
                if current_ride_id_clean == str(existing_id).strip().lower():
                    duplicates.append({
                        "type": "EXACT_ID_MATCH",
                        "match_type": "EXACT_ID_MATCH",
                        "receipt_id": existing.get("id"),
                        "submitted_by": existing.get("submittedByName", "Unknown"),
                        "submitted_at": existing.get("createdAt", ""),
                        "confidence": 100,
                        "details": "Ride IDs match exactly."
                    })
                    continue # Stop checking this receipt, we found the smoking gun

            # CHECK 2: VISUALS (pHash)
            if "phash" in current_hashes and "phash" in existing_hashes:
                h1 = imagehash.hex_to_hash(current_hashes["phash"])
                h2 = imagehash.hex_to_hash(existing_hashes["phash"])
                
                if (h1 - h2) < self.thresholds["PHASH_TEMPLATE"]:
                    # It looks like the same app. This is NOT fraud yet.
                    # We flag it as a template match.
                    duplicates.append({
                        "type": "TEMPLATE_MATCH",
                        "match_type": "TEMPLATE_MATCH",
                        "receipt_id": existing.get("id"),
                        "submitted_by": existing.get("submittedByName", "Unknown"),
                        "submitted_at": existing.get("createdAt", ""),
                        "confidence": 50, # Low confidence of fraud, high confidence of template
                        "details": "Visual layout is similar (likely same app provider)."
                    })

        # Sort: ID matches first
        duplicates.sort(key=lambda x: x["confidence"], reverse=True)
        return duplicates

    def calculate_comprehensive_risk_score(self, image_analysis, ocr_data, duplicates, event_data):
        """Calculate final score based on penalties"""
        risk_score = 0
        issues = []
        decision = "AUTO_APPROVE"

        # 1. Check Duplicates
        if duplicates:
            top_match = duplicates[0]
            if top_match["type"] == "EXACT_ID_MATCH":
                risk_score += 100
                issues.append(f"Duplicate Ride ID found (Receipt {top_match['receipt_id']})")
            elif top_match["type"] == "TEMPLATE_MATCH":
                # Do NOT penalize for looking like an Uber receipt
                pass 

        # 2. Check Forensics (ELA)
        ela = image_analysis.get("ela_analysis", {})
        if ela.get("manipulation_score", 0) > self.thresholds["ELA_HIGH"]:
            risk_score += 40
            issues.append("High likelihood of digital manipulation (Photoshop).")

        # 3. Check OCR Data Quality
        data = ocr_data.get("data", {})
        if not data.get("amount"):
            risk_score += 20
            issues.append("Amount not detected.")
        if not data.get("rideId"):
            risk_score += 15
            issues.append("Ride ID missing.")

        # Final Decision Logic
        risk_score = min(100, risk_score)
        
        if risk_score >= 80:
            decision = "REJECT"
        elif risk_score >= 40:
            decision = "MANUAL_REVIEW"
        
        return {
            "risk_score": risk_score,
            "decision": decision,
            "issues": issues
        }

advanced_verification_service = AdvancedReceiptVerificationService()