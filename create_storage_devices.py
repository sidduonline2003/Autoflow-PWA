#!/usr/bin/env python3

import requests
import json

def create_test_storage_media():
    """Create some test storage media for testing approval functionality"""
    
    base_url = "http://localhost:8000"
    
    # Test storage media to create
    storage_devices = [
        {
            "type": "SSD",
            "capacity": "1TB",
            "room": "A1",
            "shelf": "S1", 
            "bin": "B1"
        },
        {
            "type": "HDD",
            "capacity": "2TB",
            "room": "A1",
            "shelf": "S1",
            "bin": "B2"
        },
        {
            "type": "SSD",
            "capacity": "500GB",
            "room": "A2",
            "shelf": "S2",
            "bin": "B1"
        },
        {
            "type": "USB Drive",
            "capacity": "64GB",
            "room": "A2",
            "shelf": "S2",
            "bin": "B2"
        }
    ]
    
    print("🏗️  Creating test storage media...")
    print("⚠️  Note: This will fail with 401 errors due to authentication")
    print("💡 Instead, use the frontend at http://localhost:3000/data-manager")
    print("   Go to 'Storage Media' tab and click 'Create Storage Medium'")
    print("\n📋 Here are the storage devices you should create:")
    
    for i, device in enumerate(storage_devices, 1):
        print(f"\n{i}. {device['type']} ({device['capacity']})")
        print(f"   Room: {device['room']}, Shelf: {device['shelf']}, Bin: {device['bin']}")
        
        # Try to create (will fail due to auth, but shows the format)
        try:
            response = requests.post(
                f"{base_url}/api/data-submissions/dm/storage-media",
                headers={
                    "Authorization": "Bearer test-token",
                    "Content-Type": "application/json"
                },
                json=device,
                timeout=5
            )
            print(f"   Response: {response.status_code}")
        except Exception as e:
            print(f"   Expected auth error: {str(e)}")

if __name__ == "__main__":
    create_test_storage_media()
