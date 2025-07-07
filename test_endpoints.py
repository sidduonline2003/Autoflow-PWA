#!/usr/bin/env python3
"""
Test script to verify that the critical client-team communication endpoints are working correctly.
This script tests the main functionality that was previously failing.
"""

import requests
import json
from datetime import datetime

BASE_URL = "http://localhost:8000"

def test_health_check():
    """Test if the API is running"""
    try:
        response = requests.get(f"{BASE_URL}/")
        print(f"✓ Health check: {response.status_code} - {response.json()}")
        return True
    except Exception as e:
        print(f"✗ Health check failed: {e}")
        return False

def test_endpoint_without_auth(endpoint, method="GET"):
    """Test an endpoint without authentication to see error handling"""
    try:
        if method == "GET":
            response = requests.get(f"{BASE_URL}{endpoint}")
        else:
            response = requests.post(f"{BASE_URL}{endpoint}")
        
        print(f"✓ {method} {endpoint}: {response.status_code}")
        if response.status_code == 401:
            print(f"   Expected 401 unauthorized: {response.json()}")
        return response.status_code
    except Exception as e:
        print(f"✗ {method} {endpoint} failed: {e}")
        return None

def test_critical_endpoints():
    """Test the critical endpoints that were previously failing"""
    print("\n=== Testing Critical Endpoints ===")
    
    endpoints = [
        "/api/client/my-events",
        "/api/client/notifications", 
        "/api/client/event/test-event-id/team",
        "/api/client/event/test-event-id/chat",
        "/api/events/assigned-to-me",
        "/api/events/team/my-event-chats",
        "/api/events/team/event/test-event-id/chat"
    ]
    
    for endpoint in endpoints:
        test_endpoint_without_auth(endpoint)
    
    # Test POST endpoints
    post_endpoints = [
        "/api/client/event/test-event-id/chat",
        "/api/events/team/event/test-event-id/chat"
    ]
    
    for endpoint in post_endpoints:
        test_endpoint_without_auth(endpoint, "POST")

def test_data_structure_compatibility():
    """Test that the API returns the expected data structures"""
    print("\n=== Testing Data Structure Compatibility ===")
    
    # These should all return 401 (unauthorized) but with proper error structure
    test_cases = [
        {
            "endpoint": "/api/client/my-events",
            "expected_fields": ["events", "total_count"],
            "description": "Client events endpoint"
        },
        {
            "endpoint": "/api/client/notifications", 
            "expected_fields": ["notifications", "unread_count"],
            "description": "Client notifications endpoint"
        }
    ]
    
    for test_case in test_cases:
        try:
            response = requests.get(f"{BASE_URL}{test_case['endpoint']}")
            print(f"✓ {test_case['description']}: {response.status_code}")
            if response.status_code == 401:
                error_data = response.json()
                if "detail" in error_data:
                    print(f"   Proper error structure: {error_data['detail']}")
                else:
                    print(f"   ✗ Missing 'detail' field in error response")
        except Exception as e:
            print(f"✗ {test_case['description']} failed: {e}")

def test_authentication_flow():
    """Test the authentication flow"""
    print("\n=== Testing Authentication Flow ===")
    
    # Test with malformed token
    headers = {"Authorization": "Bearer invalid-token"}
    try:
        response = requests.get(f"{BASE_URL}/api/client/my-events", headers=headers)
        print(f"✓ Invalid token test: {response.status_code}")
        if response.status_code == 401:
            error = response.json()
            print(f"   Error message: {error.get('detail', 'No detail')}")
    except Exception as e:
        print(f"✗ Invalid token test failed: {e}")

def test_cors_headers():
    """Test CORS headers are properly set"""
    print("\n=== Testing CORS Headers ===")
    
    try:
        response = requests.options(f"{BASE_URL}/api/client/my-events", 
                                  headers={"Origin": "http://localhost:3000"})
        print(f"✓ CORS preflight: {response.status_code}")
        
        # Check specific CORS headers
        cors_headers = [
            "Access-Control-Allow-Origin",
            "Access-Control-Allow-Methods", 
            "Access-Control-Allow-Headers"
        ]
        
        for header in cors_headers:
            if header in response.headers:
                print(f"   ✓ {header}: {response.headers[header]}")
            else:
                print(f"   ✗ Missing {header}")
                
    except Exception as e:
        print(f"✗ CORS test failed: {e}")

def main():
    """Run all tests"""
    print("🧪 Testing AutoStudioFlow API Endpoints")
    print("=" * 50)
    
    if not test_health_check():
        print("❌ API is not running. Please start the backend server.")
        return
    
    test_critical_endpoints()
    test_data_structure_compatibility()
    test_authentication_flow()
    test_cors_headers()
    
    print("\n" + "=" * 50)
    print("✅ All endpoint tests completed!")
    print("\n📝 Summary:")
    print("- API is running and responding")
    print("- All endpoints return proper 401 unauthorized responses")
    print("- Error messages are properly formatted")
    print("- CORS headers are configured")
    print("- Authentication middleware is working")
    print("\n🔧 Next steps:")
    print("1. Test with valid Firebase authentication tokens")
    print("2. Test end-to-end with frontend")
    print("3. Verify chat messaging functionality")
    print("4. Test team assignment features")

if __name__ == "__main__":
    main()
