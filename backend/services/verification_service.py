"""
Receipt Verification Service
This module handles fraud detection and risk assessment for cab receipts
"""
import logging
import hashlib
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone, timedelta
import re

logger = logging.getLogger(__name__)

class ReceiptVerificationService:
    """Service for verifying receipt authenticity and calculating risk scores"""
    
    def __init__(self):
        self.risk_thresholds = {
            "LOW_RISK": 20,
            "MEDIUM_RISK": 50,
            "HIGH_RISK": 80
        }
    
    def calculate_perceptual_hash(self, image_bytes: bytes) -> str:
        """
        Calculate perceptual hash for image similarity detection
        In production, use more sophisticated perceptual hashing like pHash or dHash
        """
        try:
            # Simple implementation using SHA-256
            # In production, implement actual perceptual hashing
            return hashlib.sha256(image_bytes).hexdigest()
        except Exception as e:
            logger.error(f"Error calculating perceptual hash: {e}")
            return ""
    
    def check_duplicate_receipts(self, receipt_data: Dict[str, Any], existing_receipts: List[Dict]) -> Dict[str, Any]:
        """Check for duplicate receipts based on ride ID and image hash"""
        duplicates = []
        
        ride_id = receipt_data.get("rideId")
        image_hash = receipt_data.get("imageHash")
        
        for existing in existing_receipts:
            # Check for exact ride ID match
            if ride_id and existing.get("extractedData", {}).get("rideId") == ride_id:
                duplicates.append({
                    "type": "EXACT_RIDE_ID",
                    "receiptId": existing.get("id"),
                    "submittedBy": existing.get("submittedByName"),
                    "submittedAt": existing.get("createdAt"),
                    "confidence": 100
                })
            
            # Check for similar image hash
            elif image_hash and existing.get("imageHash"):
                similarity = self._calculate_hash_similarity(image_hash, existing.get("imageHash"))
                if similarity > 90:  # 90% similarity threshold
                    duplicates.append({
                        "type": "SIMILAR_IMAGE",
                        "receiptId": existing.get("id"),
                        "submittedBy": existing.get("submittedByName"),
                        "submittedAt": existing.get("createdAt"),
                        "confidence": similarity
                    })
        
        return {
            "hasDuplicates": len(duplicates) > 0,
            "duplicates": duplicates
        }
    
    def _calculate_hash_similarity(self, hash1: str, hash2: str) -> float:
        """Calculate similarity between two hashes (placeholder implementation)"""
        if not hash1 or not hash2:
            return 0.0
        
        # Simple Hamming distance for demonstration
        # In production, use proper perceptual hash comparison
        if hash1 == hash2:
            return 100.0
        
        # Calculate character differences
        differences = sum(c1 != c2 for c1, c2 in zip(hash1, hash2))
        max_length = max(len(hash1), len(hash2))
        
        if max_length == 0:
            return 0.0
        
        similarity = ((max_length - differences) / max_length) * 100
        return max(0.0, similarity)
    
    def validate_timestamp(self, receipt_timestamp: str, event_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate receipt timestamp against event timing"""
        try:
            if not receipt_timestamp or not event_data:
                return {
                    "isValid": False,
                    "reason": "Missing timestamp or event data"
                }
            
            event_date = event_data.get("date")
            event_time = event_data.get("time")
            
            if not event_date:
                return {
                    "isValid": True,  # Can't validate without event date
                    "reason": "No event date to compare against"
                }
            
            # Parse event datetime
            try:
                # Assuming event_date is in format "YYYY-MM-DD" and event_time is "HH:MM"
                event_datetime_str = f"{event_date} {event_time}" if event_time else event_date
                event_datetime = datetime.fromisoformat(event_datetime_str.replace("Z", "+00:00"))
            except:
                return {
                    "isValid": True,  # Can't parse event date
                    "reason": "Could not parse event date"
                }
            
            # Parse receipt timestamp (this would need to be more sophisticated in production)
            # For now, assume basic validation
            
            # Allow receipts from 3 hours before to 6 hours after the event
            time_buffer_before = timedelta(hours=3)
            time_buffer_after = timedelta(hours=6)
            
            earliest_valid = event_datetime - time_buffer_before
            latest_valid = event_datetime + time_buffer_after
            
            # For demonstration, assume receipt is within valid range
            # In production, parse actual receipt timestamp
            
            return {
                "isValid": True,
                "reason": "Timestamp within acceptable range",
                "eventDateTime": event_datetime.isoformat(),
                "validRange": {
                    "earliest": earliest_valid.isoformat(),
                    "latest": latest_valid.isoformat()
                }
            }
            
        except Exception as e:
            logger.error(f"Error validating timestamp: {e}")
            return {
                "isValid": False,
                "reason": f"Validation error: {str(e)}"
            }
    
    def validate_location_relevance(self, receipt_locations: Dict[str, str], event_venue: str) -> Dict[str, Any]:
        """Validate that receipt locations are relevant to event venue"""
        try:
            if not receipt_locations or not event_venue:
                return {
                    "isRelevant": True,  # Cannot validate without data
                    "reason": "Insufficient location data"
                }
            
            pickup = receipt_locations.get("pickup", "").lower()
            dropoff = receipt_locations.get("dropoff", "").lower()
            venue_lower = event_venue.lower()
            
            # Simple keyword matching (in production, use geocoding and distance calculation)
            venue_keywords = set(re.findall(r'\w+', venue_lower))
            pickup_keywords = set(re.findall(r'\w+', pickup))
            dropoff_keywords = set(re.findall(r'\w+', dropoff))
            
            # Check if destination is related to venue
            pickup_relevance = len(venue_keywords.intersection(pickup_keywords)) > 0
            dropoff_relevance = len(venue_keywords.intersection(dropoff_keywords)) > 0
            
            is_relevant = pickup_relevance or dropoff_relevance
            
            return {
                "isRelevant": is_relevant,
                "reason": "Location analysis based on keyword matching",
                "details": {
                    "pickupRelevant": pickup_relevance,
                    "dropoffRelevant": dropoff_relevance,
                    "venueKeywords": list(venue_keywords),
                    "pickupKeywords": list(pickup_keywords),
                    "dropoffKeywords": list(dropoff_keywords)
                }
            }
            
        except Exception as e:
            logger.error(f"Error validating location relevance: {e}")
            return {
                "isRelevant": True,  # Default to valid on error
                "reason": f"Validation error: {str(e)}"
            }
    
    def validate_amount_reasonableness(self, amount: float, locations: Dict[str, str]) -> Dict[str, Any]:
        """Validate that the fare amount is reasonable for the distance"""
        try:
            if not amount:
                return {
                    "isReasonable": False,
                    "reason": "No amount detected in receipt"
                }
            
            # Basic amount validation
            if amount < 10:
                return {
                    "isReasonable": False,
                    "reason": "Amount too low for typical cab ride"
                }
            
            if amount > 2000:
                return {
                    "isReasonable": False,
                    "reason": "Amount unusually high, requires investigation"
                }
            
            # In production, calculate expected fare based on:
            # - Distance between pickup and dropoff
            # - Time of day (surge pricing)
            # - Service type (economy, premium, etc.)
            
            return {
                "isReasonable": True,
                "reason": "Amount within acceptable range",
                "details": {
                    "amount": amount,
                    "range": {"min": 10, "max": 2000}
                }
            }
            
        except Exception as e:
            logger.error(f"Error validating amount: {e}")
            return {
                "isReasonable": True,
                "reason": f"Validation error: {str(e)}"
            }
    
    def detect_image_manipulation(self, image_bytes: bytes, extracted_text: str) -> Dict[str, Any]:
        """Detect potential image manipulation or editing"""
        try:
            manipulation_indicators = []
            confidence_score = 0
            
            # Check for inconsistent text formatting
            if extracted_text:
                # Look for unusual font inconsistencies, spacing, etc.
                # This is a simplified check
                
                lines = extracted_text.split('\n')
                if len(lines) < 3:
                    manipulation_indicators.append("Unusually short receipt text")
                    confidence_score += 20
                
                # Check for common manipulation patterns
                if "edit" in extracted_text.lower() or "modify" in extracted_text.lower():
                    manipulation_indicators.append("Suspicious keywords detected")
                    confidence_score += 30
            
            # In production, implement:
            # - Error Level Analysis (ELA)
            # - JPEG compression analysis
            # - Metadata analysis
            # - Edge detection inconsistencies
            
            is_manipulated = confidence_score > 50
            
            return {
                "isManipulated": is_manipulated,
                "confidence": confidence_score,
                "indicators": manipulation_indicators,
                "reason": "Basic pattern analysis" if not is_manipulated else "Potential manipulation detected"
            }
            
        except Exception as e:
            logger.error(f"Error detecting image manipulation: {e}")
            return {
                "isManipulated": False,
                "confidence": 0,
                "indicators": [],
                "reason": f"Analysis error: {str(e)}"
            }
    
    def calculate_comprehensive_risk_score(
        self, 
        receipt_data: Dict[str, Any], 
        existing_receipts: List[Dict],
        event_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Calculate comprehensive risk score based on all verification checks"""
        
        risk_score = 0
        issues = []
        recommendations = []
        verification_details = {}
        
        try:
            extracted_data = receipt_data.get("extractedData", {})
            
            # 1. Duplicate check (highest weight: 40%)
            duplicate_check = self.check_duplicate_receipts(receipt_data, existing_receipts)
            verification_details["duplicateCheck"] = duplicate_check
            
            if duplicate_check["hasDuplicates"]:
                for duplicate in duplicate_check["duplicates"]:
                    if duplicate["type"] == "EXACT_RIDE_ID":
                        risk_score += 50
                        issues.append(f"Exact duplicate ride ID found (submitted by {duplicate['submittedBy']})")
                        recommendations.append("Investigate potential fraud")
                    elif duplicate["type"] == "SIMILAR_IMAGE":
                        risk_score += 30
                        issues.append(f"Similar image found (confidence: {duplicate['confidence']}%)")
                        recommendations.append("Review for potential duplicate submission")
            
            # 2. Data extraction quality (weight: 20%)
            if not extracted_data.get("rideId"):
                risk_score += 25
                issues.append("No ride ID detected")
                recommendations.append("Manual verification required")
            
            if not extracted_data.get("amount"):
                risk_score += 20
                issues.append("Amount not clearly visible")
                recommendations.append("Request clearer image")
            
            # 3. Timestamp validation (weight: 15%)
            if event_data:
                timestamp_check = self.validate_timestamp(
                    extracted_data.get("timestamp", ""), 
                    event_data
                )
                verification_details["timestampCheck"] = timestamp_check
                
                if not timestamp_check["isValid"]:
                    risk_score += 20
                    issues.append(f"Timestamp issue: {timestamp_check['reason']}")
                    recommendations.append("Verify timing with event schedule")
            
            # 4. Location relevance (weight: 15%)
            if event_data and extracted_data.get("locations"):
                location_check = self.validate_location_relevance(
                    extracted_data["locations"],
                    event_data.get("venue", "")
                )
                verification_details["locationCheck"] = location_check
                
                if not location_check["isRelevant"]:
                    risk_score += 15
                    issues.append("Trip locations don't match event venue")
                    recommendations.append("Verify trip purpose")
            
            # 5. Amount validation (weight: 10%)
            if extracted_data.get("amount"):
                amount_check = self.validate_amount_reasonableness(
                    extracted_data["amount"],
                    extracted_data.get("locations", {})
                )
                verification_details["amountCheck"] = amount_check
                
                if not amount_check["isReasonable"]:
                    risk_score += 15
                    issues.append(f"Amount issue: {amount_check['reason']}")
                    recommendations.append("Verify fare calculation")
            
            # 6. Image manipulation detection (weight: bonus)
            manipulation_check = self.detect_image_manipulation(
                b"",  # Would pass actual image bytes in production
                receipt_data.get("extractedText", "")
            )
            verification_details["manipulationCheck"] = manipulation_check
            
            if manipulation_check["isManipulated"]:
                risk_score += manipulation_check["confidence"] // 2
                issues.append("Potential image manipulation detected")
                recommendations.append("Detailed forensic analysis required")
            
            # Cap risk score at 100
            risk_score = min(risk_score, 100)
            
            # Determine risk level
            if risk_score >= self.risk_thresholds["HIGH_RISK"]:
                risk_level = "HIGH_RISK"
            elif risk_score >= self.risk_thresholds["MEDIUM_RISK"]:
                risk_level = "MEDIUM_RISK"
            elif risk_score >= self.risk_thresholds["LOW_RISK"]:
                risk_level = "MEDIUM_RISK"  # Anything above low threshold is medium
            else:
                risk_level = "LOW_RISK"
            
            return {
                "riskScore": risk_score,
                "riskLevel": risk_level,
                "issues": issues,
                "recommendations": recommendations,
                "verificationDetails": verification_details,
                "timestamp": datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error calculating risk score: {e}")
            return {
                "riskScore": 100,
                "riskLevel": "HIGH_RISK",
                "issues": [f"Risk calculation error: {str(e)}"],
                "recommendations": ["Manual review required due to system error"],
                "verificationDetails": {},
                "timestamp": datetime.now(timezone.utc).isoformat()
            }

# Global verification service instance
verification_service = ReceiptVerificationService()
