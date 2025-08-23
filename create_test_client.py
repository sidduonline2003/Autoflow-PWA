#!/usr/bin/env python3
"""
Create a test client for testing the invoice portal
"""
import requests
import json

def create_test_client():
    """Create a test client via API"""
    base_url = "http://localhost:8000"
    
    print("=== Creating Test Client ===")
    print("NOTE: You need to provide an admin user's Firebase ID token")
    print("This script is for demonstration - you should create the client through the web interface")
    
    # Example client data
    client_data = {
        "name": "Test Client Company",
        "email": "testclient@example.com",
        "phone": "123-456-7890",
        "address": "123 Test Street, Test City",
        "businessType": "Technology"
    }
    
    print(f"\nClient data to create:")
    print(json.dumps(client_data, indent=2))
    
    print(f"\nTo create this client:")
    print(f"1. Log in as admin at http://localhost:3000")
    print(f"2. Go to Clients page")
    print(f"3. Click 'Add Client'")
    print(f"4. Fill in the form with the data above")
    print(f"5. Note the temporary password shown in the success dialog")
    print(f"6. Log out and log in with:")
    print(f"   Email: {client_data['email']}")
    print(f"   Password: [temporary password from step 5]")
    print(f"7. Click 'My Invoices' button in the client dashboard")

if __name__ == "__main__":
    create_test_client()
