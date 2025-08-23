#!/usr/bin/env python3
"""
Test script to verify client portal endpoints work
"""
import requests
import json

def test_client_endpoints():
    """Test client AR endpoints"""
    base_url = "http://localhost:8000"
    
    print("=== Testing Client AR Portal Endpoints ===")
    
    # Test endpoints without auth (should return 401/403)
    endpoints = [
        "/api/ar/invoices",
        "/api/ar/quotes", 
        "/api/ar/payments",
        "/api/ar/summary"
    ]
    
    for endpoint in endpoints:
        print(f"\n📍 Testing {endpoint}")
        try:
            response = requests.get(f"{base_url}{endpoint}")
            print(f"   Status: {response.status_code}")
            if response.status_code != 401:
                print(f"   Response: {response.text[:200]}")
            else:
                print("   ✅ Correctly requires authentication")
        except Exception as e:
            print(f"   ❌ Error: {e}")
    
    print("\n" + "="*50)
    print("NEXT STEPS TO TEST CLIENT PORTAL:")
    print("1. Open http://localhost:3000")
    print("2. Log in as admin")
    print("3. Go to Clients page → Add Client")
    print("4. Create client with:")
    print("   - Name: Test Client")
    print("   - Email: test@client.com") 
    print("   - Phone: 123-456-7890")
    print("5. Copy the temporary password shown")
    print("6. Log out and log in with:")
    print("   - Email: test@client.com")
    print("   - Password: [temp password]")
    print("7. Click 'My Invoices' button")
    print("8. Check browser console for logs starting with [ClientARPortal]")

if __name__ == "__main__":
    test_client_endpoints()
