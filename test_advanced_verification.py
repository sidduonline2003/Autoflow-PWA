#!/usr/bin/env python3
"""
Comprehensive test for the advanced receipt verification system
Tests the complete pipeline including ELA analysis, duplicate detection, and risk assessment
"""

import asyncio
import json
import os
import sys
from pathlib import Path
import requests
from PIL import Image, ImageDraw, ImageFilter
import io
import base64
import time

# Add backend to path
sys.path.append(str(Path(__file__).parent / "backend"))

def create_test_images():
    """Create test images for verification testing"""
    test_dir = Path("test_images")
    test_dir.mkdir(exist_ok=True)
    
    # Create a clean receipt image
    clean_receipt = Image.new('RGB', (800, 1000), 'white')
    draw = ImageDraw.Draw(clean_receipt)
    
    # Add receipt-like content
    draw.rectangle([50, 50, 750, 950], outline='black', width=2)
    draw.text((100, 100), "TEST RECEIPT", fill='black')
    draw.text((100, 150), "Store Name: Test Store", fill='black')
    draw.text((100, 200), "Date: 2024-01-15", fill='black')
    draw.text((100, 250), "Amount: $25.99", fill='black')
    draw.text((100, 300), "Transaction ID: 123456", fill='black')
    
    clean_path = test_dir / "clean_receipt.jpg"
    clean_receipt.save(clean_path, "JPEG", quality=90)
    
    # Create a manipulated version (blur and edit)
    manipulated = clean_receipt.copy()
    draw_manip = ImageDraw.Draw(manipulated)
    
    # Simulate manipulation by changing the amount
    draw_manip.rectangle([100, 240, 300, 270], fill='white')  # Erase original amount
    draw_manip.text((100, 250), "Amount: $125.99", fill='black')  # New amount
    
    # Add some noise and compression artifacts
    manipulated = manipulated.filter(ImageFilter.GaussianBlur(radius=0.5))
    
    manip_path = test_dir / "manipulated_receipt.jpg"
    manipulated.save(manip_path, "JPEG", quality=75)  # Lower quality for artifacts
    
    # Create a duplicate with slight variations
    duplicate = clean_receipt.copy()
    draw_dup = ImageDraw.Draw(duplicate)
    draw_dup.text((100, 350), "Copy of receipt", fill='gray')
    
    dup_path = test_dir / "duplicate_receipt.jpg"
    duplicate.save(dup_path, "JPEG", quality=90)
    
    print(f"✓ Created test images in {test_dir}/")
    return clean_path, manip_path, dup_path

def upload_receipt_file(file_path, event_id="test-event-001", user_token=None):
    """Upload a receipt file to the API"""
    url = "http://localhost:8000/api/receipts/upload"
    
    # Create form data
    with open(file_path, 'rb') as f:
        files = {
            'file': (file_path.name, f, 'image/jpeg')
        }
        
        data = {
            'eventId': event_id,
            'notes': f'Test upload of {file_path.name}'
        }
        
        headers = {}
        if user_token:
            headers['Authorization'] = f'Bearer {user_token}'
        
        try:
            response = requests.post(url, files=files, data=data, headers=headers, timeout=30)
            return response
        except requests.exceptions.RequestException as e:
            print(f"Error uploading {file_path}: {e}")
            return None

def get_receipt_analysis(receipt_id, admin_token=None):
    """Get detailed analysis for a receipt"""
    url = f"http://localhost:8000/api/receipts/{receipt_id}/admin/analysis"
    
    headers = {}
    if admin_token:
        headers['Authorization'] = f'Bearer {admin_token}'
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        return response
    except requests.exceptions.RequestException as e:
        print(f"Error getting analysis for {receipt_id}: {e}")
        return None

def test_verification_pipeline():
    """Test the complete verification pipeline"""
    print("🧪 Testing Advanced Receipt Verification Pipeline")
    print("=" * 60)
    
    # Create test images
    clean_path, manip_path, dup_path = create_test_images()
    
    # Test results storage
    results = {
        "uploads": [],
        "analysis": [],
        "summary": {}
    }
    
    print("\n1. Testing Clean Receipt Upload")
    print("-" * 40)
    
    clean_response = upload_receipt_file(clean_path)
    if clean_response and clean_response.status_code == 200:
        clean_data = clean_response.json()
        results["uploads"].append({
            "type": "clean",
            "receipt_id": clean_data.get("receipt_id"),
            "status": clean_data.get("status"),
            "verification_status": clean_data.get("verification_status")
        })
        print(f"✓ Clean receipt uploaded: {clean_data.get('receipt_id')}")
        print(f"  Status: {clean_data.get('verification_status')}")
        
        # Check verification results
        if "verification_results" in clean_data:
            ver_results = clean_data["verification_results"]
            print(f"  Risk Level: {ver_results.get('risk_level', 'Unknown')}")
            print(f"  Manipulation Detected: {ver_results.get('manipulation_detected', False)}")
            print(f"  Duplicate Count: {len(ver_results.get('duplicate_matches', []))}")
    else:
        print(f"✗ Clean receipt upload failed: {clean_response.status_code if clean_response else 'No response'}")
    
    print("\n2. Testing Manipulated Receipt Upload")
    print("-" * 40)
    
    manip_response = upload_receipt_file(manip_path)
    if manip_response and manip_response.status_code == 200:
        manip_data = manip_response.json()
        results["uploads"].append({
            "type": "manipulated",
            "receipt_id": manip_data.get("receipt_id"),
            "status": manip_data.get("status"),
            "verification_status": manip_data.get("verification_status")
        })
        print(f"✓ Manipulated receipt uploaded: {manip_data.get('receipt_id')}")
        print(f"  Status: {manip_data.get('verification_status')}")
        
        # Check if manipulation was detected
        if "verification_results" in manip_data:
            ver_results = manip_data["verification_results"]
            print(f"  Risk Level: {ver_results.get('risk_level', 'Unknown')}")
            print(f"  Manipulation Detected: {ver_results.get('manipulation_detected', False)}")
            
            if ver_results.get('manipulation_detected'):
                print("  ✓ Manipulation correctly detected!")
            else:
                print("  ⚠ Manipulation not detected (may need tuning)")
    else:
        print(f"✗ Manipulated receipt upload failed: {manip_response.status_code if manip_response else 'No response'}")
    
    print("\n3. Testing Duplicate Receipt Upload")
    print("-" * 40)
    
    dup_response = upload_receipt_file(dup_path)
    if dup_response and dup_response.status_code == 200:
        dup_data = dup_response.json()
        results["uploads"].append({
            "type": "duplicate",
            "receipt_id": dup_data.get("receipt_id"),
            "status": dup_data.get("status"),
            "verification_status": dup_data.get("verification_status")
        })
        print(f"✓ Duplicate receipt uploaded: {dup_data.get('receipt_id')}")
        print(f"  Status: {dup_data.get('verification_status')}")
        
        # Check if duplicates were detected
        if "verification_results" in dup_data:
            ver_results = dup_data["verification_results"]
            duplicate_matches = ver_results.get('duplicate_matches', [])
            print(f"  Duplicate Matches: {len(duplicate_matches)}")
            
            if duplicate_matches:
                print("  ✓ Duplicate correctly detected!")
                for match in duplicate_matches[:3]:  # Show first 3 matches
                    print(f"    - Match: {match.get('similarity_level')} ({match.get('confidence')}% confidence)")
            else:
                print("  ⚠ No duplicates detected (expected for first upload)")
    else:
        print(f"✗ Duplicate receipt upload failed: {dup_response.status_code if dup_response else 'No response'}")
    
    print("\n4. System Performance Summary")
    print("-" * 40)
    
    # Calculate success rate
    successful_uploads = len([r for r in results["uploads"] if r["receipt_id"]])
    total_uploads = len(results["uploads"])
    success_rate = (successful_uploads / total_uploads) * 100 if total_uploads > 0 else 0
    
    print(f"Upload Success Rate: {success_rate:.1f}% ({successful_uploads}/{total_uploads})")
    
    # Show verification status distribution
    status_counts = {}
    for upload in results["uploads"]:
        status = upload.get("verification_status", "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
    
    print("Verification Status Distribution:")
    for status, count in status_counts.items():
        print(f"  {status}: {count}")
    
    print("\n5. Test Recommendations")
    print("-" * 40)
    
    recommendations = []
    
    # Check if manipulation detection is working
    manip_detected = any(
        "manipulation_detected" in str(upload) 
        for upload in results["uploads"] 
        if upload["type"] == "manipulated"
    )
    
    if not manip_detected:
        recommendations.append("Consider tuning ELA analysis thresholds for better manipulation detection")
    
    # Check if system is too strict
    auto_approved = len([r for r in results["uploads"] if r.get("verification_status") == "approved"])
    if auto_approved == 0:
        recommendations.append("System may be too strict - consider adjusting risk thresholds")
    
    # Check processing speed
    if len(results["uploads"]) > 0:
        recommendations.append("Monitor processing time for large batches of receipts")
    
    if recommendations:
        for i, rec in enumerate(recommendations, 1):
            print(f"  {i}. {rec}")
    else:
        print("  ✓ System appears to be functioning optimally")
    
    print("\n" + "=" * 60)
    print("🎯 Advanced Verification Pipeline Test Complete!")
    print("=" * 60)
    
    return results

def test_hash_algorithms():
    """Test the various hashing algorithms"""
    print("\n🔍 Testing Hash Algorithm Performance")
    print("-" * 40)
    
    # Test with our created images
    clean_path, manip_path, dup_path = create_test_images()
    
    # Import our verification service
    try:
        from backend.services.advanced_verification_service import calculate_multiple_hashes
        
        print("Testing hash calculation for different images...")
        
        # Calculate hashes for each image
        with open(clean_path, 'rb') as f:
            clean_image = Image.open(f)
            clean_hashes = calculate_multiple_hashes(clean_image)
        
        with open(manip_path, 'rb') as f:
            manip_image = Image.open(f)
            manip_hashes = calculate_multiple_hashes(manip_image)
        
        with open(dup_path, 'rb') as f:
            dup_image = Image.open(f)
            dup_hashes = calculate_multiple_hashes(dup_image)
        
        print("✓ Hash calculation successful")
        print(f"Hash types generated: {list(clean_hashes.keys())}")
        
        # Compare hashes between clean and manipulated
        print("\nHash comparison (Clean vs Manipulated):")
        for hash_type in clean_hashes:
            if hash_type in manip_hashes:
                print(f"  {hash_type}: {'Different' if clean_hashes[hash_type] != manip_hashes[hash_type] else 'Same'}")
        
        return True
        
    except ImportError as e:
        print(f"✗ Could not import verification service: {e}")
        return False

if __name__ == "__main__":
    print("🚀 Starting Comprehensive Receipt Verification Tests")
    print("=" * 60)
    
    # Test hash algorithms first
    hash_test_success = test_hash_algorithms()
    
    if hash_test_success:
        print("\n" + "=" * 60)
        
        # Test the full pipeline
        results = test_verification_pipeline()
        
        # Save results for analysis
        results_file = Path("test_results.json")
        with open(results_file, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        
        print(f"\n📊 Detailed results saved to {results_file}")
    else:
        print("⚠ Skipping pipeline test due to hash test failure")
    
    print("\n🏁 All tests completed!")
