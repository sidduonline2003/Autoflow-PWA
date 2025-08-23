#!/usr/bin/env python3
"""
Test script to check authentication flow
"""
import requests
import json

def test_auth_endpoints():
    """Test authentication endpoints"""
    base_url = "http://localhost:8000"
    
    print("=== Testing Backend Authentication ===")
    
    # Test 1: Try accessing protected endpoint without auth
    print("\n1. Testing without authentication:")
    try:
        response = requests.get(f"{base_url}/api/financial/overview")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test 2: Try with invalid token
    print("\n2. Testing with invalid token:")
    try:
        headers = {"Authorization": "Bearer test"}
        response = requests.get(f"{base_url}/api/financial/overview", headers=headers)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:200]}")
    except Exception as e:
        print(f"Error: {e}")
    
    # Test 3: Check if server is responding
    print("\n3. Testing basic server response:")
    try:
        response = requests.get(f"{base_url}/")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text[:100]}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_auth_endpoints()
