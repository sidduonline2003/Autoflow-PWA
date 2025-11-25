import os
import io
import sys
import json
from PIL import Image
from fastapi.testclient import TestClient
from dotenv import load_dotenv

# --- 1. SETUP ENVIRONMENT (CRITICAL FIX) ---
# Get the absolute path to the 'backend' folder
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, 'backend')
ENV_PATH = os.path.join(BACKEND_DIR, '.env')

print(f"🔧 Setting up environment from: {ENV_PATH}")

# 1. Load the .env file explicitly
if os.path.exists(ENV_PATH):
    load_dotenv(ENV_PATH)
else:
    print("⚠️  WARNING: backend/.env file not found!")

# 2. Fix Google Credentials Path
# If the path in .env is relative (e.g., "serviceAccountKey.json"), 
# we must make it absolute so Firebase can find it from the root folder.
cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
if cred_path and not os.path.isabs(cred_path):
    # Assume the file is inside the backend folder
    abs_cred_path = os.path.join(BACKEND_DIR, cred_path)
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = abs_cred_path
    print(f"🔑 Updated Credentials Path: {abs_cred_path}")

# 3. Setup Import Paths so we can import backend modules
sys.path.append(BASE_DIR)

# --- NOW IMPORT THE APP ---
try:
    from backend.main import app
    from backend.dependencies import get_current_user
except ImportError as e:
    print(f"❌ Import Error: {e}")
    print("Make sure you are running this from the 'AUTOSTUDIOFLOW' root directory.")
    sys.exit(1)

# --- MOCK AUTHENTICATION ---
def mock_get_current_user():
    return {
        "uid": "TEST_ADMIN_001",
        "name": "System Verifier",
        "email": "admin@autoflow.com",
        "orgId": "TEST_ORG_XY"
    }

app.dependency_overrides[get_current_user] = mock_get_current_user
client = TestClient(app)

# --- HELPER FUNCTIONS ---
def create_dummy_receipt():
    """Generates a small white image in memory"""
    img = Image.new('RGB', (500, 800), color='white')
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)
    return img_byte_arr

def run_test():
    print("\n🚀 Starting Backend Verification...")
    
    # --- TEST 1: UPLOAD RECEIPT ---
    print("\n1️⃣  Testing POST /api/receipts/upload ...")
    
    img_data = create_dummy_receipt()
    files = {'file': ('test_receipt.jpg', img_data, 'image/jpeg')}
    params = {'eventId': 'EVT_TEST_123', 'teamMembers': '[]'}

    try:
        response = client.post("/api/receipts/upload", files=files, params=params)
        
        if response.status_code == 200:
            data = response.json()
            receipt_id = data.get("receiptId")
            print(f"✅ Upload Success! ID: {receipt_id}")
            print(f"   Risk Score: {data['verification']['riskScore']}")
            print(f"   Status: {data.get('status', 'Unknown')}")
            
            # If it's a duplicate, we might get a different status structure
            if data.get('status') == 'duplicate':
                 print("   (Note: This was flagged as a duplicate file, which is expected behavior for re-runs)")
                 
        elif response.status_code == 500:
             print(f"❌ Server Error (500). Check your Firebase Credentials path.")
             print(response.json())
             return
        else:
            print(f"❌ Upload Failed: {response.status_code}")
            print(response.json())
            return

    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return

    # --- TEST 2: REVIEW ENDPOINT (APPROVE) ---
    if 'receipt_id' in locals() and receipt_id:
        print(f"\n2️⃣  Testing PATCH /api/receipts/{receipt_id}/review ...")
        
        payload = {
            "action": "APPROVE",
            "notes": "Verified by automated test script."
        }
        
        response = client.patch(f"/api/receipts/{receipt_id}/review", json=payload)
        
        if response.status_code == 200:
            print(f"✅ Review Success! New State: {response.json().get('new_state')}")
        else:
            print(f"❌ Review Failed: {response.status_code}")
            print(response.json())

if __name__ == "__main__":
    run_test()