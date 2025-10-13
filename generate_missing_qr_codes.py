"""
Script to generate QR codes for all existing equipment that doesn't have them
Run this once to backfill QR codes for equipment created before background task implementation
"""

import requests
import json
import time

# Configuration
API_BASE_URL = "http://localhost:8000/api"
ADMIN_TOKEN = "YOUR_FIREBASE_AUTH_TOKEN_HERE"  # Replace with your actual token

def get_all_equipment():
    """Fetch all equipment from the API"""
    headers = {"Authorization": f"Bearer {ADMIN_TOKEN}"}
    response = requests.get(f"{API_BASE_URL}/equipment/?limit=1000", headers=headers)
    
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Error fetching equipment: {response.status_code}")
        print(response.text)
        return []

def find_equipment_without_qr(equipment_list):
    """Find equipment that doesn't have QR codes"""
    missing_qr = []
    
    for equipment in equipment_list:
        if not equipment.get('qrCodeUrl') or equipment.get('qrCodeGenerated') == False:
            missing_qr.append({
                'assetId': equipment['assetId'],
                'name': equipment['name'],
                'category': equipment['category']
            })
    
    return missing_qr

def batch_generate_qr_codes(asset_ids, batch_size=100):
    """Generate QR codes in batches"""
    headers = {
        "Authorization": f"Bearer {ADMIN_TOKEN}",
        "Content-Type": "application/json"
    }
    
    total_generated = 0
    total_batches = (len(asset_ids) + batch_size - 1) // batch_size
    
    for i in range(0, len(asset_ids), batch_size):
        batch = asset_ids[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        
        print(f"\n📦 Processing batch {batch_num}/{total_batches} ({len(batch)} items)...")
        
        response = requests.post(
            f"{API_BASE_URL}/equipment/batch-generate-qr",
            headers=headers,
            json=batch
        )
        
        if response.status_code == 200:
            result = response.json()
            queued = result.get('queued_count', 0)
            total_generated += queued
            print(f"✅ Batch {batch_num} queued: {queued} QR codes")
            
            if result.get('not_found'):
                print(f"⚠️  Not found: {result.get('not_found_count', 0)} assets")
        else:
            print(f"❌ Batch {batch_num} failed: {response.status_code}")
            print(response.text)
        
        # Small delay between batches to avoid overwhelming the server
        if i + batch_size < len(asset_ids):
            time.sleep(2)
    
    return total_generated

def main():
    print("=" * 60)
    print("🔧 QR Code Backfill Script")
    print("=" * 60)
    
    # Step 1: Fetch all equipment
    print("\n📋 Step 1: Fetching all equipment...")
    equipment_list = get_all_equipment()
    print(f"✅ Found {len(equipment_list)} total equipment items")
    
    # Step 2: Find equipment without QR codes
    print("\n🔍 Step 2: Finding equipment without QR codes...")
    missing_qr = find_equipment_without_qr(equipment_list)
    print(f"✅ Found {len(missing_qr)} items missing QR codes")
    
    if not missing_qr:
        print("\n🎉 All equipment already has QR codes! Nothing to do.")
        return
    
    # Display sample
    print("\n📄 Sample items without QR codes:")
    for item in missing_qr[:5]:
        print(f"   - {item['assetId']}: {item['name']} ({item['category']})")
    if len(missing_qr) > 5:
        print(f"   ... and {len(missing_qr) - 5} more")
    
    # Step 3: Generate QR codes
    asset_ids = [item['assetId'] for item in missing_qr]
    
    print(f"\n🚀 Step 3: Generating QR codes for {len(asset_ids)} items...")
    print("⏳ This will run in the background. Check backend logs for progress.")
    
    confirm = input("\n❓ Continue? (yes/no): ").strip().lower()
    if confirm != 'yes':
        print("❌ Cancelled by user")
        return
    
    total_generated = batch_generate_qr_codes(asset_ids, batch_size=100)
    
    # Summary
    print("\n" + "=" * 60)
    print("✅ QR Code Generation Complete!")
    print("=" * 60)
    print(f"📊 Total queued for generation: {total_generated}")
    print(f"⏱️  Expected completion time: {total_generated * 0.2:.0f} seconds")
    print("\n💡 Tips:")
    print("   - QR codes generate in the background")
    print("   - Check backend logs for progress")
    print("   - Refresh Equipment Dashboard after 1-2 minutes")
    print("   - Failed items can be regenerated individually")
    print("\n🔍 Monitor backend logs:")
    print("   Look for: '✅ QR code generated successfully for...'")
    print("=" * 60)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n❌ Interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
