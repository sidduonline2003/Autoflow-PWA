"""
Test Script for Unified Gatekeeper Logic.
This script simulates the entire verification pipeline without needing the frontend.
"""
import sys
import os
import io
import json
import logging
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont

# Add parent directory to path to import backend services
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import services
from services.ocr_service import ocr_service
from services.advanced_verification_service import advanced_verification_service

# Setup Logger
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

def create_dummy_receipt(text="UBER RIDE\nCRN123456789\nTotal: 500"):
    """Creates a generated image to simulate a receipt"""
    img = Image.new('RGB', (400, 600), color='white')
    d = ImageDraw.Draw(img)
    # Basic text
    d.text((50, 50), text, fill='black')
    # Add some noise/lines so hashing isn't empty
    d.line((0, 0) + img.size, fill=128)
    d.line((0, img.size[1], img.size[0], 0), fill=128)
    
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    return buf.getvalue()

def test_unified_pipeline():
    print("\n" + "="*50)
    print("🧪 STARTING UNIFIED GATEKEEPER TEST")
    print("="*50 + "\n")

    # ---------------------------------------------------------
    # STEP 1: SIMULATE UPLOAD
    # ---------------------------------------------------------
    logger.info("Step 1: Creating dummy receipt image...")
    image_bytes = create_dummy_receipt()
    
    # ---------------------------------------------------------
    # STEP 2: RUN AI OCR (Mocked for consistency, or Real if configured)
    # ---------------------------------------------------------
    logger.info("Step 2: Running OCR Extraction...")
    
    # NOTE: For this test, we mock the successful AI response to test the LOGIC.
    # If you have an API key and want to test real AI, comment out the mock lines.
    ocr_result = {
        "success": True,
        "data": {
            "rideId": "CRN88888888",  # The ID we are tracking
            "amount": 450.00,
            "provider": "Uber"
        }
    }
    
    # Uncomment to run REAL AI (Requires OPENROUTER_API_KEY in env)
    # ocr_result = ocr_service.process_receipt(image_bytes)
    
    extracted_id = ocr_result.get("data", {}).get("rideId")
    print(f"   -> Extracted Ride ID: {extracted_id}")

    # ---------------------------------------------------------
    # STEP 3: RUN VISUAL ANALYSIS
    # ---------------------------------------------------------
    logger.info("Step 3: Generating Visual Fingerprints...")
    image_analysis = advanced_verification_service.comprehensive_image_analysis(image_bytes)
    current_hashes = image_analysis.get("perceptual_hashes", {})
    print(f"   -> Generated pHash: {current_hashes.get('phash')}")

    # ---------------------------------------------------------
    # STEP 4: TEST GATEKEEPER LOGIC
    # ---------------------------------------------------------
    
    # --- SCENARIO A: DATA DUPLICATE (Fraudster takes NEW photo of OLD receipt) ---
    print("\n🔹 TEST A: Same Ride ID, Different Image")
    existing_receipts_data_match = [
        {
            "id": "old_receipt_001",
            "submittedByName": "Alice",
            "createdAt": "2023-10-01T10:00:00Z",
            "extractedData": {
                "rideId": "CRN88888888"  # MATCHES EXTRACTED ID
            },
            "image_fingerprints": {
                "perceptual_hashes": {"phash": "0000000000000000"} # Totally different image
            }
        }
    ]
    
    matches_a = advanced_verification_service.find_duplicate_receipts(
        current_hashes, extracted_id, existing_receipts_data_match
    )
    
    if matches_a and matches_a[0]['match_type'] == 'RIDE_ID_MATCH':
        print("   ✅ SUCCESS: Detected Data Duplicate (Ride ID Match)")
    else:
        print("   ❌ FAILED: Did not detect Ride ID match")

    # --- SCENARIO B: VISUAL DUPLICATE (Fraudster re-uploads SAME file) ---
    print("\n🔹 TEST B: Different Ride ID, Same Image")
    existing_receipts_visual_match = [
        {
            "id": "old_receipt_002",
            "submittedByName": "Bob",
            "createdAt": "2023-10-02T12:00:00Z",
            "extractedData": {
                "rideId": "DIFFERENT_ID_999"  # ID DOES NOT MATCH
            },
            "image_fingerprints": {
                "perceptual_hashes": current_hashes # EXACT HASH MATCH
            }
        }
    ]
    
    matches_b = advanced_verification_service.find_duplicate_receipts(
        current_hashes, extracted_id, existing_receipts_visual_match
    )
    
    if matches_b and matches_b[0]['match_type'] == 'VISUAL_MATCH':
        print("   ✅ SUCCESS: Detected Visual Duplicate (Hash Match)")
    else:
        print("   ❌ FAILED: Did not detect Visual Hash match")

    # --- SCENARIO C: CLEAN UPLOAD ---
    print("\n🔹 TEST C: Clean Upload")
    existing_receipts_clean = []
    matches_c = advanced_verification_service.find_duplicate_receipts(
        current_hashes, extracted_id, existing_receipts_clean
    )
    
    if not matches_c:
        print("   ✅ SUCCESS: No false positives")
    else:
        print("   ❌ FAILED: False positive detected")

    print("\n" + "="*50)
    print("TEST COMPLETE")
    print("="*50)

if __name__ == "__main__":
    test_unified_pipeline()