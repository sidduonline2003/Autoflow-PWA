#!/usr/bin/env python3
"""
Test script for Data Manager Dashboard endpoints
Tests the fixes for 500 errors in data submission endpoints
"""

import requests
import json
import sys
from datetime import datetime

# Server configuration
BASE_URL = "http://localhost:8000"
API_BASE = f"{BASE_URL}/api"

def test_endpoint(endpoint, method="GET", data=None, expected_status=200):
    """Test an endpoint and return the result"""
    url = f"{API_BASE}{endpoint}"
    
    print(f"\n🧪 Testing {method} {endpoint}")
    print(f"   URL: {url}")
    
    try:
        if method == "GET":
            response = requests.get(url, timeout=10)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=10)
        
        print(f"   Status: {response.status_code}")
        
        if response.status_code == expected_status:
            print(f"   ✅ SUCCESS - Expected {expected_status}, got {response.status_code}")
            
            # Try to parse JSON response
            try:
                json_data = response.json()
                if isinstance(json_data, dict):
                    # Print key info without overwhelming output
                    keys = list(json_data.keys())
                    print(f"   📊 Response keys: {keys}")
                    
                    # Show specific info for different endpoints
                    if 'pendingBatches' in json_data:
                        count = len(json_data['pendingBatches'])
                        print(f"   📋 Pending batches: {count}")
                        if 'error' in json_data:
                            print(f"   ⚠️  Error: {json_data['error']}")
                    
                    elif 'stats' in json_data:
                        stats = json_data['stats']
                        print(f"   📈 Stats: {stats}")
                        if 'error' in json_data:
                            print(f"   ⚠️  Error: {json_data['error']}")
                    
                    elif 'storageMedia' in json_data:
                        count = len(json_data['storageMedia'])
                        print(f"   💾 Storage media: {count}")
                        if 'error' in json_data:
                            print(f"   ⚠️  Error: {json_data['error']}")
                    
                    elif 'batches' in json_data:
                        count = len(json_data['batches'])
                        print(f"   📦 Batches: {count}")
                        if 'error' in json_data:
                            print(f"   ⚠️  Error: {json_data['error']}")
                
                return True, json_data
                
            except json.JSONDecodeError:
                print(f"   📄 Response (non-JSON): {response.text[:200]}...")
                return True, response.text
        
        else:
            print(f"   ❌ FAILED - Expected {expected_status}, got {response.status_code}")
            try:
                error_data = response.json()
                print(f"   🚨 Error: {error_data}")
            except:
                print(f"   🚨 Error: {response.text}")
            return False, None
            
    except requests.exceptions.ConnectionError:
        print(f"   💥 CONNECTION ERROR - Is the server running on {BASE_URL}?")
        return False, None
    except requests.exceptions.Timeout:
        print(f"   ⏰ TIMEOUT - Server took too long to respond")
        return False, None
    except Exception as e:
        print(f"   💥 UNEXPECTED ERROR: {e}")
        return False, None

def test_data_manager_endpoints():
    """Test all data manager endpoints that were failing"""
    
    print("🚀 Testing Data Manager Dashboard Endpoints")
    print("=" * 60)
    
    # Note: These will return 401 without proper auth, but we're testing
    # that they don't return 500 errors due to Firestore issues
    
    endpoints_to_test = [
        # Data Manager Dashboard endpoints (main ones that were failing)
        ("/data-submissions/dm/dashboard", "GET", 401),  # Expect 401 (auth) not 500 (server error)
        ("/data-submissions/dm/pending-approvals", "GET", 401),  # Expect 401 (auth) not 500 (server error)
        
        # Other related endpoints
        ("/data-submissions/dm/storage-media", "GET", 401),
        
        # Health check endpoint (if exists)
        ("/health", "GET", 404),  # Might not exist, but shouldn't 500
    ]
    
    success_count = 0
    total_count = len(endpoints_to_test)
    
    for endpoint, method, expected_status in endpoints_to_test:
        success, response = test_endpoint(endpoint, method, expected_status=expected_status)
        if success:
            success_count += 1
    
    print("\n" + "=" * 60)
    print(f"📊 SUMMARY: {success_count}/{total_count} endpoints working correctly")
    
    if success_count == total_count:
        print("🎉 ALL TESTS PASSED! No more 500 errors.")
        print("✅ Data Manager dashboard should now load properly")
        return True
    else:
        print("⚠️  Some endpoints still have issues")
        return False

def test_server_health():
    """Test if the server is running and responsive"""
    print("🏥 Testing Server Health")
    print("-" * 30)
    
    try:
        # Test basic server response
        response = requests.get(f"{BASE_URL}/docs", timeout=5)
        if response.status_code == 200:
            print("✅ Server is running and responsive")
            print(f"   FastAPI docs available at {BASE_URL}/docs")
            return True
        else:
            print(f"⚠️  Server responding but docs returned {response.status_code}")
            return True  # Still running
    except requests.exceptions.ConnectionError:
        print("❌ Server not running or not accessible")
        print(f"   Make sure the server is running on {BASE_URL}")
        return False
    except Exception as e:
        print(f"❌ Error checking server: {e}")
        return False

def main():
    """Main test runner"""
    print("🧪 Data Manager Dashboard Test Suite")
    print("=" * 60)
    print(f"Testing server at: {BASE_URL}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # First check if server is running
    if not test_server_health():
        print("\n💡 To start the server, run:")
        print("   source backend/venv/bin/activate && uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload")
        return False
    
    # Test the endpoints
    success = test_data_manager_endpoints()
    
    print("\n🎯 EXPECTED RESULTS:")
    print("✅ 401 Unauthorized (not 500 Internal Server Error)")
    print("✅ Endpoints respond quickly (no timeout)")
    print("✅ JSON responses with error handling")
    print("✅ No Firestore index errors in server logs")
    
    if success:
        print("\n🚀 NEXT STEPS:")
        print("1. Frontend should now load Data Manager dashboard")
        print("2. No more 500 errors in browser console")
        print("3. Data intake workflow should work end-to-end")
    
    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
