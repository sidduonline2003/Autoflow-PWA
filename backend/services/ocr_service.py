import logging
import os
import json
import base64
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class ReceiptOCRService:
    """
    Optimized OCR Service: Uses AI strictly for extracting structured data.
    Focuses on Ride IDs and Amounts for fraud verification.
    """
    
    def __init__(self):
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        self.api_url = "https://openrouter.ai/api/v1/chat/completions"
        # Using Flash model - switch to paid if rate limited on free tier
        # Free: "google/gemini-2.0-flash-exp:free" (rate limited)
        # Paid: "google/gemini-2.0-flash-exp" (costs ~$0.0001/request)
        self.model = os.getenv("OCR_MODEL", "google/gemini-2.0-flash-exp:free")
        
        self.session = requests.Session()
        # Don't retry on 429 - it makes things worse
        retry_strategy = Retry(
            total=2,
            backoff_factor=2,
            status_forcelist=[500, 502, 503, 504],  # Removed 429
            allowed_methods=["POST"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)

    def _encode_image(self, image_bytes: bytes) -> str:
        try:
            if not image_bytes: return ""
            return base64.b64encode(image_bytes).decode('utf-8')
        except Exception as e:
            logger.error(f"Image encoding failed: {e}")
            return ""

    def process_receipt(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Sends image to AI to extract: Ride ID, Amount, Date, Time, Provider.
        """
        if not self.api_key:
            return self._error_response("Missing API Key")

        base64_image = self._encode_image(image_bytes)
        if not base64_image:
            return self._error_response("Image encoding failed")

        # --- OPTIMIZED DATA EXTRACTION PROMPT ---
        prompt = """
        Extract the following details from this cab receipt into a valid JSON object.
        
        CRITICAL FIELDS:
        - "provider": The app name (Uber, Ola, Rapido, Lyft, Bolt, etc.).
        - "rideId": The unique booking identifier (Look for 'CRN', 'Booking ID', 'Order #', 'Trip ID', 'Ride ID').
        - "amount": The total fare paid (numeric only, no currency symbols).
        - "date": The date of the ride (YYYY-MM-DD format).
        - "time": The time of the ride (HH:MM format).
        - "pickup": The pickup location/address.
        - "dropoff": The drop-off location/address.
        
        RULES:
        1. If 'rideId' is not visible, return null for that field.
        2. If 'amount' is not visible, return null for that field.
        3. Extract location names as shown on the receipt.
        4. Do not estimate or hallucinate values.
        5. Return ONLY the JSON object.
        
        Example output:
        {"provider": "Ola", "rideId": "CRN123456", "amount": 250, "date": "2025-11-25", "time": "14:30", "pickup": "Koramangala", "dropoff": "MG Road"}
        """

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": os.getenv("SITE_URL", "http://localhost:3000"),
        }

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
                    ]
                }
            ],
            "temperature": 0.1, # Low temperature for factual extraction
            "response_format": {"type": "json_object"}
        }

        try:
            logger.info(f"Sending OCR request to {self.model}...")
            response = self.session.post(self.api_url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            
            result = response.json()
            content = result['choices'][0]['message']['content']
            
            # Clean markdown if present
            if "```json" in content:
                content = content.replace("```json", "").replace("```", "")
            
            data = json.loads(content.strip())
            
            return {
                "success": True,
                "provider": data.get("provider", "Unknown"),
                "data": data
            }

        except Exception as e:
            logger.error(f"AI OCR Failed: {str(e)}")
            return self._error_response(str(e))

    def _error_response(self, msg: str) -> Dict[str, Any]:
        return {
            "success": False, 
            "error": msg, 
            "data": {"rideId": None, "amount": None}
        }

ocr_service = ReceiptOCRService()