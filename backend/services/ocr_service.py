"""
OCR Service for receipt text extraction
This module handles optical character recognition for cab receipts
"""
import logging
import re
from typing import Dict, Optional, Any
from datetime import datetime

logger = logging.getLogger(__name__)

class ReceiptOCRService:
    """Service for extracting text and data from receipt images"""
    
    def __init__(self):
        self.provider_patterns = self._initialize_patterns()
    
    def _initialize_patterns(self) -> Dict[str, Dict[str, re.Pattern]]:
        """Initialize regex patterns for different cab service providers"""
        return {
            "uber": {
                "ride_id": re.compile(r"(?:Trip|Ride)\s*(?:ID|#)?\s*:?\s*([A-Z0-9\-]{8,})", re.IGNORECASE),
                "amount": re.compile(r"(?:₹|INR|Rs\.?)\s*(\d+(?:\.\d{2})?)", re.IGNORECASE),
                "date": re.compile(r"(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|([A-Z][a-z]{2}\s+\d{1,2})", re.IGNORECASE),
                "time": re.compile(r"(\d{1,2}:\d{2}\s*(?:[AP]M)?)", re.IGNORECASE),
                "pickup": re.compile(r"(?:From|Pickup)[\s:]*([^\n\r]+?)(?:To|Drop|$)", re.IGNORECASE | re.DOTALL),
                "dropoff": re.compile(r"(?:To|Drop|Destination)[\s:]*([^\n\r]+?)(?:$|\n)", re.IGNORECASE | re.DOTALL)
            },
            "ola": {
                "ride_id": re.compile(r"CRN\s*:?\s*(\d+)", re.IGNORECASE),
                "amount": re.compile(r"₹\s*(\d+(?:\.\d{2})?)", re.IGNORECASE),
                "date": re.compile(r"([A-Z][a-z]{2},\s*[A-Z][a-z]{2}\s+\d{1,2})", re.IGNORECASE),
                "time": re.compile(r"(\d{1,2}:\d{2}\s*[AP]M)", re.IGNORECASE),
                "pickup": re.compile(r"(?:From|Start)[\s:]*([^\n\r]+?)(?:To|End|$)", re.IGNORECASE | re.DOTALL),
                "dropoff": re.compile(r"(?:To|End|Destination)[\s:]*([^\n\r]+?)(?:$|\n)", re.IGNORECASE | re.DOTALL)
            },
            "rapido": {
                "ride_id": re.compile(r"RN(\d+)", re.IGNORECASE),
                "amount": re.compile(r"₹(\d+(?:\.\d+)?)", re.IGNORECASE),
                "date": re.compile(r"(\d{1,2}\s+[A-Z][a-z]{2}\s+\d{4})", re.IGNORECASE),
                "time": re.compile(r"(\d{1,2}:\d{2}\s*[AP]M)", re.IGNORECASE),
                "pickup": re.compile(r"(?:From|Origin)[\s:]*([^\n\r]+?)(?:To|Destination|$)", re.IGNORECASE | re.DOTALL),
                "dropoff": re.compile(r"(?:To|Destination)[\s:]*([^\n\r]+?)(?:$|\n)", re.IGNORECASE | re.DOTALL)
            }
        }
    
    def extract_text_from_image(self, image_bytes: bytes) -> str:
        """
        Extract text from receipt image using OCR
        In production, this would use Google Vision API, Azure Computer Vision, or similar
        """
        try:
            # Placeholder implementation
            # In production, integrate with actual OCR service:
            # - Google Cloud Vision API
            # - Azure Computer Vision
            # - AWS Textract
            # - Tesseract OCR
            
            logger.info("OCR text extraction requested")
            
            # Return placeholder text for now
            return """
            Uber Trip Receipt
            Trip ID: UB2023091512345
            Date: Sep 15, 2023
            Time: 2:30 PM
            From: Gachibowli, Hyderabad
            To: Hitec City, Hyderabad
            Fare: ₹245.50
            Driver: Rajesh Kumar
            """
            
        except Exception as e:
            logger.error(f"Error in OCR text extraction: {e}")
            return ""
    
    def detect_provider(self, text: str) -> str:
        """Detect cab service provider from extracted text"""
        text_lower = text.lower()
        
        if "uber" in text_lower:
            return "uber"
        elif "ola" in text_lower or "crn" in text_lower:
            return "ola"
        elif "rapido" in text_lower or "rn" in text_lower:
            return "rapido"
        else:
            return "other"
    
    def extract_structured_data(self, text: str, provider: str) -> Dict[str, Any]:
        """Extract structured data from receipt text based on provider"""
        try:
            if provider not in self.provider_patterns:
                provider = "uber"  # Default fallback
            
            patterns = self.provider_patterns[provider]
            extracted_data = {}
            
            # Extract ride ID
            ride_id_match = patterns["ride_id"].search(text)
            extracted_data["rideId"] = ride_id_match.group(1) if ride_id_match else None
            
            # Extract amount
            amount_match = patterns["amount"].search(text)
            if amount_match:
                try:
                    extracted_data["amount"] = float(amount_match.group(1))
                except ValueError:
                    extracted_data["amount"] = None
            else:
                extracted_data["amount"] = None
            
            # Extract date
            date_match = patterns["date"].search(text)
            extracted_data["date"] = date_match.group(0) if date_match else None
            
            # Extract time
            time_match = patterns["time"].search(text)
            extracted_data["time"] = time_match.group(0) if time_match else None
            
            # Combine date and time into timestamp
            if extracted_data["date"] and extracted_data["time"]:
                extracted_data["timestamp"] = f"{extracted_data['date']} {extracted_data['time']}"
            else:
                extracted_data["timestamp"] = None
            
            # Extract locations
            pickup_match = patterns["pickup"].search(text)
            dropoff_match = patterns["dropoff"].search(text)
            
            extracted_data["locations"] = {
                "pickup": pickup_match.group(1).strip() if pickup_match else None,
                "dropoff": dropoff_match.group(1).strip() if dropoff_match else None
            }
            
            logger.info(f"Extracted data for {provider}: {extracted_data}")
            return extracted_data
            
        except Exception as e:
            logger.error(f"Error extracting structured data: {e}")
            return {
                "rideId": None,
                "amount": None,
                "timestamp": None,
                "locations": {"pickup": None, "dropoff": None}
            }
    
    def process_receipt(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Complete receipt processing pipeline:
        1. Extract text via OCR
        2. Detect provider
        3. Extract structured data
        """
        try:
            # Step 1: Extract text
            extracted_text = self.extract_text_from_image(image_bytes)
            
            if not extracted_text:
                return {
                    "success": False,
                    "error": "Failed to extract text from image",
                    "extractedText": "",
                    "provider": "unknown",
                    "data": {}
                }
            
            # Step 2: Detect provider
            provider = self.detect_provider(extracted_text)
            
            # Step 3: Extract structured data
            structured_data = self.extract_structured_data(extracted_text, provider)
            
            return {
                "success": True,
                "extractedText": extracted_text,
                "provider": provider,
                "data": structured_data
            }
            
        except Exception as e:
            logger.error(f"Error in receipt processing pipeline: {e}")
            return {
                "success": False,
                "error": str(e),
                "extractedText": "",
                "provider": "unknown",
                "data": {}
            }

# Global OCR service instance
ocr_service = ReceiptOCRService()
