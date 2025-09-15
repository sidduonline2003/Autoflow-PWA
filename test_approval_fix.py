#!/usr/bin/env python3

import asyncio
import aiohttp
import json

async def test_approval_functionality():
    """Test the batch approval with storage metadata"""
    
    # You'll need to replace this with a real JWT token
    jwt_token = "Bearer your_jwt_token_here"
    
    base_url = "http://localhost:8000"
    
    async with aiohttp.ClientSession() as session:
        print("🧪 Testing batch approval functionality...")
        
        # 1. Get pending approvals
        print("\n1️⃣ Getting pending approvals...")
        async with session.get(
            f"{base_url}/api/data-submissions/dm/pending-approvals",
            headers={"Authorization": jwt_token}
        ) as response:
            if response.status == 200:
                approvals_data = await response.json()
                print(f"✅ Found {len(approvals_data.get('batches', []))} pending batches")
                
                if approvals_data.get('batches'):
                    batch = approvals_data['batches'][0]
                    print(f"📦 First batch ID: {batch.get('id')}")
                else:
                    print("❌ No pending batches found to test approval")
                    return
            else:
                print(f"❌ Failed to get pending approvals: {response.status}")
                return
        
        # 2. Get available storage media
        print("\n2️⃣ Getting available storage media...")
        async with session.get(
            f"{base_url}/api/data-submissions/dm/storage-media",
            headers={"Authorization": jwt_token}
        ) as response:
            if response.status == 200:
                storage_data = await response.json()
                available_storage = [s for s in storage_data.get('storageMedia', []) if s.get('status') == 'available']
                print(f"✅ Found {len(available_storage)} available storage media")
                
                if available_storage:
                    storage = available_storage[0]
                    print(f"💾 Using storage: {storage.get('type')} - Room {storage.get('room')}, Shelf {storage.get('shelf')}, Bin {storage.get('bin')}")
                else:
                    print("❌ No available storage media found")
                    return
            else:
                print(f"❌ Failed to get storage media: {response.status}")
                return
        
        # 3. Test approval with proper storage metadata
        print("\n3️⃣ Testing batch approval with storage metadata...")
        approval_payload = {
            "batchId": batch['id'],
            "action": "approve",
            "storageMediumId": storage['id'],
            "storageLocation": {
                "room": storage['room'],
                "shelf": storage['shelf'],
                "bin": storage['bin']
            },
            "notes": "Approved via test script"
        }
        
        print(f"📤 Sending approval payload:")
        print(json.dumps(approval_payload, indent=2))
        
        async with session.post(
            f"{base_url}/api/data-submissions/dm/approve-batch",
            headers={
                "Authorization": jwt_token,
                "Content-Type": "application/json"
            },
            json=approval_payload
        ) as response:
            response_text = await response.text()
            print(f"\n📥 Response status: {response.status}")
            print(f"📄 Response body: {response_text}")
            
            if response.status == 200:
                print("🎉 ✅ APPROVAL SUCCESSFUL!")
            else:
                print(f"❌ APPROVAL FAILED: {response.status}")
                try:
                    error_data = json.loads(response_text)
                    print(f"🔍 Error details: {error_data.get('detail', 'Unknown error')}")
                except:
                    print(f"🔍 Raw error: {response_text}")

if __name__ == "__main__":
    print("🚀 Starting approval test...")
    print("⚠️  Note: You need to update the JWT token in this script to run the test")
    print("💡 Or you can test manually in the browser at http://localhost:3000/data-manager")
    # asyncio.run(test_approval_functionality())
