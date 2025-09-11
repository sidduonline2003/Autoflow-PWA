#!/usr/bin/env python3
"""
Integration test for the cab receipt verification system
Tests the complete workflow from upload to admin verification
"""

import requests
import json
import time
import os
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000"
TEST_USER_TOKEN = ""  # You'll need to get this from Firebase Auth
TEST_ADMIN_TOKEN = ""  # You'll need to get this from Firebase Auth

# Sample receipt data for testing
SAMPLE_RECEIPT_DATA = {
    "eventId": "test-event-001",
    "provider": "uber",
    "teamMemberId": "test-member-001",
    "notes": "Test receipt upload via integration test"
}

def get_headers(token):
    """Get authorization headers"""
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

def test_receipt_upload():
    """Test receipt upload functionality"""
    print("🚀 Testing receipt upload...")
    
    # Create a simple test image (you would normally upload a real receipt image)
    test_image_data = {
        "filename": "test-receipt.jpg",
        "size": 12345,
        "mimeType": "image/jpeg"
    }
    
    data = {
        **SAMPLE_RECEIPT_DATA,
        "imageData": test_image_data
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/receipts/",
            headers=get_headers(TEST_USER_TOKEN),
            json=data
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Receipt uploaded successfully")
            print(f"   Receipt ID: {result.get('receiptId')}")
            print(f"   Status: {result.get('status')}")
            return result.get('receiptId')
        else:
            print(f"❌ Upload failed: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Upload error: {e}")
        return None

def test_receipt_list():
    """Test listing receipts"""
    print("\n📋 Testing receipt listing...")
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/receipts/",
            headers=get_headers(TEST_USER_TOKEN)
        )
        
        if response.status_code == 200:
            result = response.json()
            receipts = result.get('receipts', [])
            print(f"✅ Found {len(receipts)} receipts")
            
            for receipt in receipts[:3]:  # Show first 3
                print(f"   - {receipt.get('id')} | {receipt.get('status')} | {receipt.get('provider')}")
            
            return receipts
        else:
            print(f"❌ List failed: {response.status_code} - {response.text}")
            return []
            
    except Exception as e:
        print(f"❌ List error: {e}")
        return []

def test_dashboard_summary():
    """Test admin dashboard summary"""
    print("\n📊 Testing dashboard summary...")
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/receipts/dashboard/summary",
            headers=get_headers(TEST_ADMIN_TOKEN)
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Dashboard summary retrieved")
            print(f"   Total Receipts: {result.get('totalReceipts')}")
            print(f"   Pending Verification: {result.get('pendingVerification')}")
            print(f"   High Risk Count: {result.get('highRiskCount')}")
            print(f"   Total Amount: ₹{result.get('totalAmount', 0):,.2f}")
            return result
        else:
            print(f"❌ Dashboard failed: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Dashboard error: {e}")
        return None

def test_receipt_verification(receipt_id):
    """Test receipt verification by admin"""
    print(f"\n✅ Testing receipt verification for ID: {receipt_id}")
    
    verification_data = {
        "status": "VERIFIED",
        "verificationNotes": "Approved via integration test - receipt looks legitimate"
    }
    
    try:
        response = requests.put(
            f"{BASE_URL}/api/receipts/{receipt_id}/verify",
            headers=get_headers(TEST_ADMIN_TOKEN),
            json=verification_data
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Receipt verified successfully")
            print(f"   Status: {result.get('status')}")
            return True
        else:
            print(f"❌ Verification failed: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Verification error: {e}")
        return False

def test_receipt_details(receipt_id):
    """Test getting receipt details"""
    print(f"\n🔍 Testing receipt details for ID: {receipt_id}")
    
    try:
        response = requests.get(
            f"{BASE_URL}/api/receipts/{receipt_id}",
            headers=get_headers(TEST_USER_TOKEN)
        )
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Receipt details retrieved")
            print(f"   Provider: {result.get('provider')}")
            print(f"   Status: {result.get('status')}")
            print(f"   Risk Level: {result.get('riskAssessment', {}).get('riskLevel')}")
            print(f"   Risk Score: {result.get('riskAssessment', {}).get('riskScore')}")
            
            issues = result.get('riskAssessment', {}).get('issues', [])
            if issues:
                print(f"   Issues: {', '.join(issues)}")
            
            return result
        else:
            print(f"❌ Details failed: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Details error: {e}")
        return None

def run_integration_tests():
    """Run complete integration test suite"""
    print("🧪 Starting Cab Receipt Verification System Integration Tests")
    print("=" * 60)
    
    # Check if tokens are provided
    if not TEST_USER_TOKEN:
        print("❌ TEST_USER_TOKEN not provided. Please set it in the script.")
        print("   You can get this from Firebase Auth console or by logging in to your app.")
        return
    
    if not TEST_ADMIN_TOKEN:
        print("❌ TEST_ADMIN_TOKEN not provided. Please set it in the script.")
        print("   You can get this from Firebase Auth console for an admin user.")
        return
    
    # Test 1: Upload a receipt
    receipt_id = test_receipt_upload()
    
    # Test 2: List receipts
    receipts = test_receipt_list()
    
    # Test 3: Get dashboard summary
    dashboard = test_dashboard_summary()
    
    # Test 4: Get receipt details (use uploaded receipt or first from list)
    test_receipt_id = receipt_id or (receipts[0].get('id') if receipts else None)
    if test_receipt_id:
        receipt_details = test_receipt_details(test_receipt_id)
        
        # Test 5: Verify receipt (if pending)
        if receipt_details and receipt_details.get('status') == 'PENDING':
            test_receipt_verification(test_receipt_id)
    
    print("\n" + "=" * 60)
    print("🎉 Integration tests completed!")
    print("\n📝 Manual Testing Instructions:")
    print("1. Start the FastAPI backend: cd backend && python -m uvicorn main:app --reload")
    print("2. Start the React frontend: cd frontend && npm start")
    print("3. Login as a regular user and test receipt upload")
    print("4. Login as an admin and test the verification dashboard")
    print("5. Test different receipt types (Uber, Ola, Rapido)")
    print("6. Test uploading duplicate receipts to verify fraud detection")

def test_api_health():
    """Test if the API is running"""
    print("🏥 Testing API health...")
    
    try:
        response = requests.get(f"{BASE_URL}/docs")
        if response.status_code == 200:
            print("✅ API is running and accessible")
            return True
        else:
            print(f"❌ API returned status: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ API connection error: {e}")
        print("   Make sure the FastAPI backend is running on http://localhost:8000")
        return False

if __name__ == "__main__":
    print("🚀 Cab Receipt Verification System - Integration Test Suite")
    print("=" * 60)
    
    # First check if API is accessible
    if test_api_health():
        print("\n📚 Instructions for getting auth tokens:")
        print("1. Go to your Firebase Console")
        print("2. Authentication > Users")
        print("3. Get the ID token for a test user and admin user")
        print("4. Set TEST_USER_TOKEN and TEST_ADMIN_TOKEN in this script")
        print("5. Run the tests again")
        print("\nAlternatively, you can test manually using the frontend:")
        
        # Run the tests (will show token requirement message)
        run_integration_tests()
    
    print("\n🔧 System Architecture Summary:")
    print("Backend: FastAPI with Firebase Auth + Firestore")
    print("Frontend: React with Material UI")
    print("Features: OCR processing, fraud detection, admin verification")
    print("Security: Firebase ID token authentication, role-based access")
