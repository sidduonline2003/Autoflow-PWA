"""
AI-Powered OCR Service using Google Gemini 2.0 Flash via OpenRouter.
This service replaces the previous regex-based placeholder with an intelligent agent
that extracts structured JSON data from receipt images.
"""
import logging
import os
import json
import base64
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from typing import Dict, Any, Optional

# Configure logging
logger = logging.getLogger(__name__)

class ReceiptOCRService:
    """Service for extracting text and data from receipt images using AI"""
    
    def __init__(self):
        # Configuration - Load from environment variables for security
        self.api_key = os.getenv("OPENROUTER_API_KEY")
        self.api_url = "https://openrouter.ai/api/v1/chat/completions"
        self.site_url = os.getenv("SITE_URL", "http://localhost:3000")
        self.site_name = os.getenv("SITE_NAME", "AutoFlow")
        
        # Model Configuration
        # Primary: Gemini 2.0 Flash (Fast, Accurate, Free)
        self.model = "google/gemini-2.0-flash-exp:free"
        
        # Fallbacks: Removed invalid experimental models
        self.fallback_models = []
        
        # Setup robust session with retries
        # Added 429 (Rate Limit) to force retries on the SAME model before switching
        self.session = requests.Session()
        retry_strategy = Retry(
            total=5, # Increased retries since we have no fallbacks
            backoff_factor=2, # Wait 2s, 4s, 8s, 16s, 32s
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["POST"]
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount("https://", adapter)
        self.session.mount("http://", adapter)

    def _encode_image(self, image_bytes: bytes) -> str:
        """Convert raw bytes to base64 string efficiently"""
        try:
            if not image_bytes:
                return ""
            return base64.b64encode(image_bytes).decode('utf-8')
        except Exception as e:
            logger.error(f"Image encoding failed: {e}")
            return ""

    def process_receipt(self, image_bytes: bytes) -> Dict[str, Any]:
        """
        Send image to Gemini 2.0 Flash and get structured JSON back.
        Returns a standardized dictionary with extraction status and data.
        """
        # Reload API key to ensure it's current
        self.api_key = os.getenv("OPENROUTER_API_KEY") or self.api_key
        
        if not self.api_key:
            logger.error("OpenRouter API Key missing in environment variables.")
            return self._get_error_response("Server configuration error: Missing API Key")

        if not image_bytes:
            logger.error("Received empty image bytes for OCR")
            return self._get_error_response("Empty image file provided")

        logger.info(f"OCR Service: Starting processing for {len(image_bytes)} bytes")

        # 1. Prepare the extraction prompt
        base64_image = self._encode_image(image_bytes)
        if not base64_image:
            return self._get_error_response("Failed to encode image")
        
        prompt = """
        Analyze this cab receipt image and extract the following information in strictly valid JSON format.
        
        Required JSON Structure:
        {
            "provider": "Uber, Ola, Rapido, or Other",
            "rideId": "The unique booking ID, CRN number, or Trip ID (e.g., CRN123456, UB-123-456). If not visible, use null.",
            "amount": 0.00 (number only, no currency symbols),
            "date": "YYYY-MM-DD (ISO format if possible)",
            "time": "HH:MM (24hr format)",
            "locations": {
                "pickup": "Pickup location text",
                "dropoff": "Dropoff location text"
            },
            "driver": "Driver name if visible"
        }
        
        Rules:
        1. Only return the JSON object. Do not wrap in markdown code blocks.
        2. If a field is ambiguous or missing, use null. Do not guess.
        3. For 'rideId', look for labels like 'CRN', 'Booking ID', 'Trip ID', 'Order #'.
        4. Ignore unrelated text or ads.
        """

        # 2. Configure Headers
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": self.site_url,
            "X-Title": self.site_name,
            "Content-Type": "application/json"
        }

        # List of models to try: primary + fallbacks
        models_to_try = [self.model] + self.fallback_models
        
        last_error = None

        for model in models_to_try:
            try:
                # Construct payload
                payload = {
                    "model": model,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/jpeg;base64,{base64_image}"
                                    }
                                }
                            ]
                        }
                    ],
                    "temperature": 0.1
                }

                # Only add response_format for Gemini models which support it reliably
                if "gemini" in model.lower():
                    payload["response_format"] = {"type": "json_object"}

                # 3. Execute Request using robust session
                logger.info(f"Sending receipt to {model} via OpenRouter...")
                
                # The session handles 429 retries automatically now due to status_forcelist
                response = self.session.post(self.api_url, headers=headers, json=payload, timeout=45)
                
                # If we get here and it's still 429, it means retries were exhausted
                if response.status_code == 429:
                    logger.warning(f"Rate limit exhausted for {model}. Switching to next model...")
                    last_error = "Rate limit exceeded (retries exhausted)"
                    continue
                
                response.raise_for_status()
                
                # 4. Parse and Validate Response
                result = response.json()
                
                if 'choices' not in result or not result['choices']:
                     logger.warning(f"Empty choices from {model}")
                     last_error = "Invalid or empty response from AI provider"
                     continue

                ai_content = result['choices'][0]['message']['content']
                
                # Sanitize: Remove markdown formatting if the model includes it
                cleaned_json = ai_content.replace("```json", "").replace("```", "").strip()
                
                try:
                    extracted_data = json.loads(cleaned_json)
                except json.JSONDecodeError:
                    logger.error(f"JSON Decode Error with {model}. Raw content: {cleaned_json}")
                    last_error = "Failed to parse AI response"
                    continue
                
                logger.info(f"AI Extraction Success with {model}: Provider={extracted_data.get('provider')}, RideID={extracted_data.get('rideId')}")

                # 5. Return Success Result
                return {
                    "success": True,
                    "extractedText": json.dumps(extracted_data),
                    "provider": extracted_data.get("provider", "unknown"),
                    "data": extracted_data
                }

            except requests.exceptions.RequestException as e:
                logger.error(f"Network Error with {model}: {str(e)}")
                if hasattr(e, 'response') and e.response is not None:
                     logger.error(f"Response content: {e.response.text}")
                last_error = f"Network error: {str(e)}"
                continue
            except Exception as e:
                logger.error(f"Unexpected Error with {model}: {str(e)}")
                last_error = str(e)
                continue

        # If we get here, all models failed
        logger.error(f"All OCR models failed. Last error: {last_error}")
        return self._get_error_response(f"All AI models failed. Last error: {last_error}")

    def _get_error_response(self, error_msg: str) -> Dict[str, Any]:
        """Return a standardized error object to prevent crashes"""
        return {
            "success": False,
            "error": error_msg,
            "extractedText": "",
            "provider": "unknown",
            "data": {
                "rideId": None,
                "amount": None,
                "timestamp": None,
                "locations": {"pickup": None, "dropoff": None}
            }
        }

# Global instance
ocr_service = ReceiptOCRService()