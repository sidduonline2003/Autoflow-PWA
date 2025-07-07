#!/usr/bin/env python3
"""
Test script specifically for the team endpoint to verify the fix
"""
import os
import sys
import requests
import json
import firebase_admin
from firebase_admin import credentials, auth, firestore

def init_firebase():
    """Initialize Firebase Admin SDK"""
    if not firebase_admin._apps:
        cred_path = os.path.join(os.path.dirname(__file__), 'backend', 'app1bysiddu-95459-firebase-adminsdk-fbsvc-efb2c7c181.json')
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            print("Firebase initialized successfully")
        else:
            print(f"Service account key not found at {cred_path}")
            return False
    return True

def create_test_token(user_id="PLlOwvbbEmN5weY1xPDtZV9wDza2", org_id="GE8kanHLyhPlPdnDIpPR"):
    """Create a test authentication token"""
    if not init_firebase():
        return None
    
    try:
        # Create custom token with claims
        custom_claims = {
            'orgId': org_id,
            'role': 'client'
        }
        
        custom_token = auth.create_custom_token(user_id, custom_claims)
        print(f"Created custom token for user {user_id}")
        return custom_token.decode('utf-8')
    except Exception as e:
        print(f"Error creating custom token: {e}")
        return None

def test_team_endpoint():
    """Test the team endpoint with authentication"""
    print("🧪 Testing Team Endpoint with Authentication")
    print("=" * 50)
    
    # Create authentication token
    token = create_test_token()
    if not token:
        print("❌ Failed to create authentication token")
        return
    
    # Test the team endpoint
    event_id = "3HDh804Qe1AWV6aRfITZ"  # Known event with team member
    url = f"http://localhost:8000/api/client/event/{event_id}/team"
    
    headers = {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    }
    
    try:
        print(f"Testing: GET {url}")
        response = requests.get(url, headers=headers)
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("✅ SUCCESS! Team endpoint returned data:")
            print(json.dumps(data, indent=2))
            
            # Verify the data structure
            if 'team_members' in data or 'teamMembers' in data:
                team_members = data.get('team_members', data.get('teamMembers', []))
                print(f"\n📊 Team Analysis:")
                print(f"   Event: {data.get('eventName', 'Unknown')}")
                print(f"   Team Size: {len(team_members)}")
                print(f"   Team Members:")
                
                for i, member in enumerate(team_members, 1):
                    print(f"      {i}. {member.get('name', 'Unknown')} - {member.get('role', 'No role')}")
                    if member.get('email'):
                        print(f"         Email: {member.get('email')}")
                    if member.get('skills'):
                        print(f"         Skills: {', '.join(member.get('skills', []))}")
                
                if len(team_members) > 0:
                    print("\n🎉 Team endpoint is working correctly!")
                else:
                    print("\n⚠️  Team endpoint returns empty team (check data)")
            else:
                print("\n❌ Response missing team_members field")
                
        else:
            print(f"❌ Error: {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error details: {json.dumps(error_data, indent=2)}")
            except:
                print(f"Error text: {response.text}")
                
    except requests.exceptions.ConnectionError:
        print("❌ Connection Error: Backend server not running on localhost:8000")
        print("   Please start the backend server first:")
        print("   cd backend && uvicorn main:app --reload --host 0.0.0.0 --port 8000")
    except Exception as e:
        print(f"❌ Unexpected error: {e}")

if __name__ == "__main__":
    test_team_endpoint()
