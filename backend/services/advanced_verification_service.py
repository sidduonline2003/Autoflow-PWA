"""
Advanced Image Verification Service
This module provides comprehensive receipt fraud detection with:
- Multiple perceptual hashing algorithms
- Error Level Analysis (ELA) for manipulation detection
- JPEG Ghost analysis
- Noise pattern analysis
- Content-aware duplicate detection
"""

import logging
import hashlib
import io
import json
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timezone, timedelta
from PIL import Image, ImageChops, ImageEnhance, ImageFilter

try:
    import numpy as np
    import cv2
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    
try:
    import imagehash
    IMAGEHASH_AVAILABLE = True
except ImportError:
    IMAGEHASH_AVAILABLE = False

from collections import defaultdict

logger = logging.getLogger(__name__)

class AdvancedReceiptVerificationService:
    """Enhanced service for comprehensive receipt verification and fraud detection"""
    
    def __init__(self):
        self.risk_thresholds = {
            "LOW_RISK": 25,
            "MEDIUM_RISK": 55,
            "HIGH_RISK": 80
        }
        
        # ELA thresholds
        self.ela_thresholds = {
            "LOW_MANIPULATION": 20,
            "MEDIUM_MANIPULATION": 45,
            "HIGH_MANIPULATION": 70
        }
        
        # Perceptual hash similarity thresholds
        self.hash_similarity_thresholds = {
            "EXACT_DUPLICATE": 2,      # Hamming distance <= 2
            "NEAR_DUPLICATE": 8,       # Hamming distance <= 8
            "SIMILAR": 15              # Hamming distance <= 15
        }

    def preprocess_image(self, image_bytes: bytes) -> Tuple[Image.Image, bytes]:
        """Standardize image for consistent analysis"""
        try:
            # Load image
            image = Image.open(io.BytesIO(image_bytes))
            
            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Auto-rotate based on EXIF orientation
            try:
                from PIL.ExifTags import ORIENTATION
                exif = image._getexif()
                if exif and ORIENTATION in exif:
                    orientation = exif[ORIENTATION]
                    if orientation == 3:
                        image = image.rotate(180, expand=True)
                    elif orientation == 6:
                        image = image.rotate(270, expand=True)
                    elif orientation == 8:
                        image = image.rotate(90, expand=True)
            except:
                pass  # Skip if EXIF data unavailable
            
            # Standardize size (maintain aspect ratio)
            max_size = 1200
            if max(image.size) > max_size:
                ratio = max_size / max(image.size)
                new_size = tuple(int(dim * ratio) for dim in image.size)
                image = image.resize(new_size, Image.LANCZOS)
            
            # Convert to JPEG format for ELA consistency
            buffer = io.BytesIO()
            image.save(buffer, format='JPEG', quality=90, optimize=True)
            standardized_bytes = buffer.getvalue()
            
            return image, standardized_bytes
            
        except Exception as e:
            logger.error(f"Error preprocessing image: {e}")
            raise ValueError(f"Failed to preprocess image: {str(e)}")

    def calculate_multiple_hashes(self, image: Image.Image) -> Dict[str, str]:
        """Calculate multiple perceptual hashes for comprehensive similarity detection"""
        try:
            if not IMAGEHASH_AVAILABLE:
                logger.warning("imagehash library not available, using fallback hash")
                # Use basic PIL-based hash as fallback
                hash_image = image.resize((64, 64), Image.LANCZOS)
                return {
                    "phash": str(hash(tuple(hash_image.getdata()))),
                    "dhash": "",
                    "ahash": "",
                    "whash": "",
                    "colorhash": "",
                    "crop_resistant": ""
                }
            
            # Resize for consistent hashing
            hash_image = image.resize((64, 64), Image.LANCZOS)
            
            hashes = {
                # Perceptual hash - robust to scaling, rotation, brightness
                "phash": str(imagehash.phash(hash_image, hash_size=16)),
                
                # Difference hash - good for detecting crops and minor edits
                "dhash": str(imagehash.dhash(hash_image, hash_size=16)),
                
                # Average hash - fast but less robust
                "ahash": str(imagehash.average_hash(hash_image, hash_size=16)),
                
                # Wavelet hash - good for frequency domain changes
                "whash": str(imagehash.whash(hash_image, hash_size=16)),
                
                # Color hash - sensitive to color changes
                "colorhash": str(imagehash.colorhash(hash_image)),
                
                # Crop-resistant hash
                "crop_resistant": str(imagehash.crop_resistant_hash(hash_image))
            }
            
            return hashes
            
        except Exception as e:
            logger.error(f"Error calculating perceptual hashes: {e}")
            # Return empty hashes as fallback
            return {key: "" for key in ["phash", "dhash", "ahash", "whash", "colorhash", "crop_resistant"]}

    def calculate_cryptographic_hash(self, image_bytes: bytes) -> str:
        """Calculate SHA-256 hash for exact duplicate detection"""
        try:
            return hashlib.sha256(image_bytes).hexdigest()
        except Exception as e:
            logger.error(f"Error calculating cryptographic hash: {e}")
            return ""

    def perform_ela_analysis(self, image: Image.Image, quality: int = 90) -> Dict[str, Any]:
        """Perform Error Level Analysis to detect image manipulation"""
        try:
            # Save image with specified quality
            temp_buffer = io.BytesIO()
            image.save(temp_buffer, format='JPEG', quality=quality)
            temp_buffer.seek(0)
            
            # Reload the compressed image
            compressed_image = Image.open(temp_buffer)
            
            # Calculate ELA by finding differences
            ela_image = ImageChops.difference(image, compressed_image)
            
            # Enhance the differences
            extrema = ela_image.getextrema()
            max_diff = max([ex[1] for ex in extrema])
            
            if max_diff == 0:
                max_diff = 1
            
            scale_factor = 255.0 / max_diff
            ela_image = ImageEnhance.Brightness(ela_image).enhance(scale_factor)
            
            # Convert to numpy for analysis
            ela_array = np.array(ela_image)
            
            # Calculate manipulation metrics
            mean_ela = np.mean(ela_array)
            std_ela = np.std(ela_array)
            max_ela = np.max(ela_array)
            
            # Calculate manipulation score (0-100)
            manipulation_score = min(100, (std_ela / 255.0) * 100 + (max_ela / 255.0) * 50)
            
            # Determine manipulation level
            if manipulation_score >= self.ela_thresholds["HIGH_MANIPULATION"]:
                manipulation_level = "HIGH_MANIPULATION"
            elif manipulation_score >= self.ela_thresholds["MEDIUM_MANIPULATION"]:
                manipulation_level = "MEDIUM_MANIPULATION"
            elif manipulation_score >= self.ela_thresholds["LOW_MANIPULATION"]:
                manipulation_level = "LOW_MANIPULATION"
            else:
                manipulation_level = "NO_MANIPULATION"
            
            # Find regions with high ELA (potential manipulation areas)
            threshold = np.percentile(ela_array, 95)  # Top 5% of differences
            high_ela_regions = np.where(ela_array > threshold)
            
            # Convert ELA image to base64 for storage/display
            ela_buffer = io.BytesIO()
            ela_image.save(ela_buffer, format='PNG')
            ela_base64 = ela_buffer.getvalue()
            
            return {
                "manipulation_score": float(manipulation_score),
                "manipulation_level": manipulation_level,
                "ela_statistics": {
                    "mean": float(mean_ela),
                    "std": float(std_ela),
                    "max": float(max_ela)
                },
                "high_ela_regions_count": int(len(high_ela_regions[0])),
                "ela_image_data": ela_base64,  # Store for admin review
                "analysis_quality": int(quality)
            }
            
        except Exception as e:
            logger.error(f"Error performing ELA analysis: {e}")
            return {
                "manipulation_score": 0.0,
                "manipulation_level": "ANALYSIS_ERROR",
                "ela_statistics": {"mean": 0.0, "std": 0.0, "max": 0.0},
                "high_ela_regions_count": 0,
                "ela_image_data": None,
                "analysis_quality": quality,
                "error": str(e)
            }

    def detect_jpeg_ghosts(self, image: Image.Image) -> Dict[str, Any]:
        """Detect JPEG ghosts indicating potential re-compression/editing"""
        try:
            ghost_scores = []
            test_qualities = [100, 95, 90, 85, 80, 75, 70, 65, 60]
            
            for quality in test_qualities:
                # Re-compress at different quality levels
                buffer = io.BytesIO()
                image.save(buffer, format='JPEG', quality=quality)
                buffer.seek(0)
                
                recompressed = Image.open(buffer)
                
                # Calculate difference
                diff = ImageChops.difference(image, recompressed)
                diff_array = np.array(diff)
                
                # Calculate ghost score
                ghost_score = np.mean(diff_array)
                ghost_scores.append(ghost_score)
            
            # Analyze ghost pattern
            ghost_scores = np.array(ghost_scores)
            
            # Look for unexpected patterns in compression differences
            # Authentic images should show smooth degradation
            # Manipulated images often show irregular patterns
            
            score_diff = np.diff(ghost_scores)
            irregularity = np.std(score_diff)
            
            # Calculate ghost detection score
            ghost_detection_score = min(100, irregularity * 2)
            
            # Determine if ghosts detected
            ghost_detected = bool(ghost_detection_score > 30)
            
            return {
                "ghost_detected": ghost_detected,
                "ghost_score": float(ghost_detection_score),
                "quality_scores": [float(x) for x in ghost_scores.tolist()],
                "irregularity_measure": float(irregularity),
                "analysis_qualities": test_qualities
            }
            
        except Exception as e:
            logger.error(f"Error detecting JPEG ghosts: {e}")
            return {
                "ghost_detected": False,
                "ghost_score": 0.0,
                "quality_scores": [],
                "irregularity_measure": 0.0,
                "analysis_qualities": [],
                "error": str(e)
            }

    def analyze_noise_patterns(self, image: Image.Image) -> Dict[str, Any]:
        """Analyze noise patterns to detect inconsistencies indicating manipulation"""
        try:
            # Convert to grayscale for noise analysis
            gray_image = image.convert('L')
            gray_array = np.array(gray_image)
            
            # Apply high-pass filter to extract noise
            kernel = np.array([[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]])
            noise_map = cv2.filter2D(gray_array, -1, kernel)
            
            # Divide image into blocks for local noise analysis
            block_size = 32
            h, w = gray_array.shape
            noise_variations = []
            
            for i in range(0, h - block_size, block_size):
                for j in range(0, w - block_size, block_size):
                    block = noise_map[i:i+block_size, j:j+block_size]
                    noise_std = np.std(block)
                    noise_variations.append(noise_std)
            
            # Calculate noise consistency
            if noise_variations:
                overall_noise_std = np.std(noise_variations)
                mean_noise = np.mean(noise_variations)
                
                # Inconsistent noise suggests manipulation
                noise_inconsistency = (overall_noise_std / (mean_noise + 1)) * 100
                
                # Calculate suspicion score
                noise_suspicion_score = min(100, noise_inconsistency * 2)
                
                return {
                    "noise_inconsistency": float(noise_inconsistency),
                    "noise_suspicion_score": float(noise_suspicion_score),
                    "noise_blocks_analyzed": int(len(noise_variations)),
                    "mean_noise_level": float(mean_noise),
                    "noise_std": float(overall_noise_std),
                    "suspicious_noise": bool(noise_suspicion_score > 40)
                }
            else:
                return {
                    "noise_inconsistency": 0.0,
                    "noise_suspicion_score": 0.0,
                    "noise_blocks_analyzed": 0,
                    "mean_noise_level": 0.0,
                    "noise_std": 0.0,
                    "suspicious_noise": False
                }
                
        except Exception as e:
            logger.error(f"Error analyzing noise patterns: {e}")
            return {
                "noise_inconsistency": 0.0,
                "noise_suspicion_score": 0.0,
                "noise_blocks_analyzed": 0,
                "mean_noise_level": 0.0,
                "noise_std": 0.0,
                "suspicious_noise": False,
                "error": str(e)
            }

    def compare_perceptual_hashes(self, hash1_dict: Dict[str, str], hash2_dict: Dict[str, str]) -> Dict[str, Any]:
        """Compare perceptual hashes and determine similarity"""
        try:
            similarities = {}
            min_distance = float('inf')
            best_hash_type = None
            
            for hash_type in hash1_dict.keys():
                if hash_type in hash2_dict and hash1_dict[hash_type] and hash2_dict[hash_type]:
                    try:
                        if hash_type == "colorhash":
                            # Handle colorhash specially due to potential array issues
                            hash1_val = hash1_dict[hash_type]
                            hash2_val = hash2_dict[hash_type]
                            
                            # Convert to string if it's not already
                            if not isinstance(hash1_val, str):
                                hash1_val = str(hash1_val)
                            if not isinstance(hash2_val, str):
                                hash2_val = str(hash2_val)
                            
                            # Simple string comparison for colorhash
                            distance = 0 if hash1_val == hash2_val else 50
                        else:
                            # Calculate Hamming distance for other hash types
                            hash1 = imagehash.hex_to_hash(hash1_dict[hash_type])
                            hash2 = imagehash.hex_to_hash(hash2_dict[hash_type])
                            distance = hash1 - hash2
                        
                        similarities[hash_type] = {
                            "distance": int(distance),
                            "similarity_percentage": float(max(0, 100 - (distance * 2)))
                        }
                        
                        if distance < min_distance:
                            min_distance = distance
                            best_hash_type = hash_type
                    except Exception as e:
                        logger.warning(f"Error comparing {hash_type} hashes: {e}")
                        similarities[hash_type] = {"distance": 999, "similarity_percentage": 0.0}
            
            # Determine overall similarity level
            if min_distance <= self.hash_similarity_thresholds["EXACT_DUPLICATE"]:
                similarity_level = "EXACT_DUPLICATE"
                confidence = 95
            elif min_distance <= self.hash_similarity_thresholds["NEAR_DUPLICATE"]:
                similarity_level = "NEAR_DUPLICATE"
                confidence = 85
            elif min_distance <= self.hash_similarity_thresholds["SIMILAR"]:
                similarity_level = "SIMILAR"
                confidence = 70
            else:
                similarity_level = "DIFFERENT"
                confidence = max(0, 100 - min_distance * 3)
            
            return {
                "similarity_level": similarity_level,
                "confidence": int(confidence),
                "min_distance": int(min_distance),
                "best_hash_type": best_hash_type,
                "hash_comparisons": similarities
            }
            
        except Exception as e:
            logger.error(f"Error comparing perceptual hashes: {e}")
            return {
                "similarity_level": "COMPARISON_ERROR",
                "confidence": 0,
                "min_distance": 999,
                "best_hash_type": None,
                "hash_comparisons": {},
                "error": str(e)
            }

    def comprehensive_image_analysis(self, image_bytes: bytes) -> Dict[str, Any]:
        """Perform comprehensive image analysis including all verification methods"""
        try:
            # Step 1: Preprocess image
            image, standardized_bytes = self.preprocess_image(image_bytes)
            
            # Step 2: Calculate all hash types
            perceptual_hashes = self.calculate_multiple_hashes(image)
            crypto_hash = self.calculate_cryptographic_hash(standardized_bytes)
            
            # Step 3: Perform manipulation detection
            ela_results = self.perform_ela_analysis(image)
            ghost_results = self.detect_jpeg_ghosts(image)
            noise_results = self.analyze_noise_patterns(image)
            
            # Step 4: Calculate overall manipulation score
            manipulation_scores = [
                ela_results.get("manipulation_score", 0),
                ghost_results.get("ghost_score", 0),
                noise_results.get("noise_suspicion_score", 0)
            ]
            
            overall_manipulation_score = float(np.mean(manipulation_scores))
            
            # Determine if image is likely manipulated
            is_manipulated = bool(
                ela_results.get("manipulation_level") in ["HIGH_MANIPULATION", "MEDIUM_MANIPULATION"] or
                ghost_results.get("ghost_detected", False) or
                noise_results.get("suspicious_noise", False) or
                overall_manipulation_score > 50
            )
            
            result = {
                "perceptual_hashes": perceptual_hashes,
                "cryptographic_hash": crypto_hash,
                "ela_analysis": ela_results,
                "ghost_analysis": ghost_results,
                "noise_analysis": noise_results,
                "manipulation_summary": {
                    "is_manipulated": is_manipulated,
                    "overall_score": float(overall_manipulation_score),
                    "individual_scores": [float(x) for x in manipulation_scores],
                    "confidence": int(min(95, max(60, overall_manipulation_score)))
                },
                "image_metadata": {
                    "original_size": int(len(image_bytes)),
                    "processed_size": int(len(standardized_bytes)),
                    "dimensions": list(image.size),
                    "format": "JPEG",
                    "analysis_timestamp": datetime.now(timezone.utc).isoformat()
                }
            }
            
            # Convert any remaining numpy types to native Python types
            return self._convert_numpy_types_to_python(result)
            
        except Exception as e:
            logger.error(f"Error in comprehensive image analysis: {e}")
            return {
                "perceptual_hashes": {},
                "cryptographic_hash": "",
                "ela_analysis": {"manipulation_level": "ANALYSIS_ERROR"},
                "ghost_analysis": {"ghost_detected": False},
                "noise_analysis": {"suspicious_noise": False},
                "manipulation_summary": {
                    "is_manipulated": False,
                    "overall_score": 0.0,
                    "individual_scores": [0, 0, 0],
                    "confidence": 0
                },
                "image_metadata": {},
                "error": str(e)
            }

    def find_duplicate_receipts(self, current_hashes: Dict[str, str], existing_receipts: List[Dict]) -> List[Dict[str, Any]]:
        """Find duplicate receipts using comprehensive hash comparison"""
        duplicates = []
        
        try:
            for existing in existing_receipts:
                existing_hashes = existing.get("image_fingerprints", {}).get("perceptual_hashes", {})
                
                if not existing_hashes:
                    continue
                
                # Compare hashes
                comparison = self.compare_perceptual_hashes(current_hashes, existing_hashes)
                
                # Check if it's a significant similarity
                if comparison["similarity_level"] in ["EXACT_DUPLICATE", "NEAR_DUPLICATE", "SIMILAR"]:
                    duplicates.append({
                        "receipt_id": existing.get("id"),
                        "submitted_by": existing.get("submittedByName"),
                        "submitted_at": existing.get("createdAt"),
                        "similarity_level": comparison["similarity_level"],
                        "confidence": int(comparison["confidence"]),
                        "min_distance": int(comparison["min_distance"]),
                        "best_hash_type": comparison["best_hash_type"],
                        "comparison_details": comparison["hash_comparisons"]
                    })
            
            # Sort by confidence (highest first)
            duplicates.sort(key=lambda x: x["confidence"], reverse=True)
            
        except Exception as e:
            logger.error(f"Error finding duplicate receipts: {e}")
        
        return duplicates

    def calculate_comprehensive_risk_score(
        self, 
        image_analysis: Dict[str, Any],
        ocr_data: Dict[str, Any],
        duplicate_check: List[Dict[str, Any]],
        event_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Calculate comprehensive risk score using all available data"""
        
        risk_score = 0
        issues = []
        recommendations = []
        risk_factors = {}
        
        try:
            # 1. Image manipulation detection (40% weight)
            manipulation_summary = image_analysis.get("manipulation_summary", {})
            if manipulation_summary.get("is_manipulated", False):
                manipulation_score = manipulation_summary.get("overall_score", 0)
                risk_contribution = min(40, manipulation_score * 0.4)
                risk_score += risk_contribution
                
                issues.append(f"Image manipulation detected (score: {manipulation_score:.1f})")
                recommendations.append("Detailed forensic analysis required")
                
                risk_factors["image_manipulation"] = {
                    "detected": True,
                    "score": manipulation_score,
                    "risk_contribution": risk_contribution,
                    "details": manipulation_summary
                }
            
            # 2. Duplicate detection (35% weight) - EXACT duplicates force HIGH_RISK
            if duplicate_check:
                highest_confidence_duplicate = max(duplicate_check, key=lambda x: x["confidence"])
                
                if highest_confidence_duplicate["similarity_level"] == "EXACT_DUPLICATE":
                    # Exact duplicates are always high risk - force minimum risk score to HIGH_RISK threshold
                    risk_score += 35
                    issues.append(f"Exact duplicate found (submitted by {highest_confidence_duplicate['submitted_by']})")
                    recommendations.append("REJECT - Investigate potential fraud")
                    
                    # Ensure this receipt is classified as HIGH_RISK by setting minimum score
                    risk_score = max(risk_score, self.risk_thresholds["HIGH_RISK"])
                    
                elif highest_confidence_duplicate["similarity_level"] == "NEAR_DUPLICATE":
                    risk_score += 25
                    issues.append(f"Near duplicate found (confidence: {highest_confidence_duplicate['confidence']}%)")
                    recommendations.append("Review for potential duplicate submission")
                elif highest_confidence_duplicate["similarity_level"] == "SIMILAR":
                    risk_score += 15
                    issues.append(f"Similar image found (confidence: {highest_confidence_duplicate['confidence']}%)")
                    recommendations.append("Compare with existing submission")
                
                risk_factors["duplicates"] = {
                    "found": True,
                    "count": len(duplicate_check),
                    "highest_confidence": highest_confidence_duplicate,
                    "all_duplicates": duplicate_check,
                    "forced_high_risk": highest_confidence_duplicate["similarity_level"] == "EXACT_DUPLICATE"
                }
            
            # 3. OCR data quality (15% weight)
            extracted_data = ocr_data.get("data", {})
            
            # Ride ID is optional - only penalize if provider typically has ride IDs but none found
            provider = extracted_data.get("provider", "").lower()
            has_ride_id = bool(extracted_data.get("rideId"))
            
            # Uber and Ola typically have ride IDs, others might not
            if provider in ["uber", "ola"] and not has_ride_id:
                risk_score += 5  # Reduced penalty since it's not always required
                issues.append(f"No ride ID detected for {provider}")
                recommendations.append("Verify receipt authenticity manually")
            
            if not extracted_data.get("amount"):
                risk_score += 10  # Amount is more critical than ride ID
                issues.append("Amount not clearly visible")
                recommendations.append("Request clearer image")
            
            # Check for basic trip information
            locations = extracted_data.get("locations", {})
            if not locations.get("pickup") and not locations.get("dropoff"):
                risk_score += 6
                issues.append("No location information detected")
                recommendations.append("Verify trip details manually")
            
            risk_factors["ocr_quality"] = {
                "ride_id_detected": has_ride_id,
                "ride_id_expected": provider in ["uber", "ola"],
                "amount_detected": bool(extracted_data.get("amount")),
                "provider_detected": bool(extracted_data.get("provider")),
                "timestamp_detected": bool(extracted_data.get("timestamp")),
                "locations_detected": bool(locations.get("pickup") or locations.get("dropoff"))
            }
            
            # 4. Temporal validation (10% weight)
            if event_data and extracted_data.get("timestamp"):
                # Add timestamp validation logic here
                # For now, assume valid
                pass
            
            # Cap risk score at 100
            risk_score = min(risk_score, 100)
            
            # Determine risk level - Exact duplicates are ALWAYS high risk
            has_exact_duplicate = (duplicate_check and 
                                 any(d["similarity_level"] == "EXACT_DUPLICATE" for d in duplicate_check))
            
            if has_exact_duplicate or risk_score >= self.risk_thresholds["HIGH_RISK"]:
                risk_level = "HIGH_RISK"
                decision = "REJECT"
            elif risk_score >= self.risk_thresholds["MEDIUM_RISK"]:
                risk_level = "MEDIUM_RISK"
                decision = "MANUAL_REVIEW"
            elif risk_score >= self.risk_thresholds["LOW_RISK"]:
                risk_level = "LOW_RISK"
                decision = "MANUAL_REVIEW"
            else:
                risk_level = "VERY_LOW_RISK"
                decision = "AUTO_APPROVE"
            
            result = {
                "risk_score": int(risk_score),
                "risk_level": risk_level,
                "decision": decision,
                "issues": issues,
                "recommendations": recommendations,
                "risk_factors": risk_factors,
                "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
                "confidence": int(min(95, max(60, 100 - risk_score))),
                "exact_duplicate_detected": has_exact_duplicate
            }
            
            # Convert any remaining numpy types to native Python types
            return self._convert_numpy_types_to_python(result)
            
        except Exception as e:
            logger.error(f"Error calculating comprehensive risk score: {e}")
            return {
                "risk_score": 100,
                "risk_level": "HIGH_RISK",
                "decision": "MANUAL_REVIEW",
                "issues": [f"Risk calculation error: {str(e)}"],
                "recommendations": ["Manual review required due to system error"],
                "risk_factors": {},
                "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
                "confidence": 0,
                "error": str(e),
                "exact_duplicate_detected": False
            }
    
    def _convert_numpy_types_to_python(self, obj):
        """Recursively convert numpy types to native Python types"""
        if not NUMPY_AVAILABLE:
            return obj
        
        try:
            # Handle None values
            if obj is None:
                return None
            
            # Handle bytes (binary data like images)
            if isinstance(obj, bytes):
                return None  # Don't include raw bytes in JSON response
            
            # Handle numpy types using safer checking
            if hasattr(obj, 'dtype'):
                # Use numpy's type checking functions
                if np.issubdtype(obj.dtype, np.bool_):
                    return bool(obj)
                elif np.issubdtype(obj.dtype, np.integer):
                    return int(obj)
                elif np.issubdtype(obj.dtype, np.floating):
                    return float(obj)
                elif isinstance(obj, np.ndarray):
                    return obj.tolist()
                else:
                    return obj.item() if hasattr(obj, 'item') else obj
            
            # Handle string representations of numpy types
            obj_type_str = str(type(obj))
            if 'numpy' in obj_type_str:
                if 'bool' in obj_type_str:
                    return bool(obj)
                elif 'int' in obj_type_str:
                    return int(obj)
                elif 'float' in obj_type_str:
                    return float(obj)
                elif 'ndarray' in obj_type_str:
                    return obj.tolist()
            
            # Handle collections recursively
            if isinstance(obj, dict):
                return {key: self._convert_numpy_types_to_python(value) for key, value in obj.items()}
            elif isinstance(obj, list):
                return [self._convert_numpy_types_to_python(item) for item in obj]
            elif isinstance(obj, tuple):
                return tuple(self._convert_numpy_types_to_python(item) for item in obj)
            else:
                return obj
        except Exception as e:
            logger.warning(f"Error converting numpy types: {e}")
            return obj

# Global advanced verification service instance
advanced_verification_service = AdvancedReceiptVerificationService()
