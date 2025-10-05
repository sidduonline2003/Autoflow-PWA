#!/usr/bin/env python3
"""
Diagnostic script to check org code resolution for your organization.
Run this to see what data is available for code assignment.
"""
import os
import sys
from firebase_admin import credentials, initialize_app, firestore

# Initialize Firebase
cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "backend/app1bysiddu-95459-firebase-adminsdk-fbsvc-efb2c7c181.json")
if not os.path.exists(cred_path):
    print(f"❌ Credentials file not found: {cred_path}")
    sys.exit(1)

try:
    cred = credentials.Certificate(cred_path)
    initialize_app(cred)
    print("✅ Firebase initialized")
except Exception as e:
    print(f"❌ Firebase initialization failed: {e}")
    sys.exit(1)

db = firestore.client()

# Get org ID from command line or use default
org_id = sys.argv[1] if len(sys.argv) > 1 else None

if not org_id:
    print("\n🔍 Searching for organizations...")
    orgs = db.collection('organizations').limit(10).stream()
    org_list = [(doc.id, doc.to_dict()) for doc in orgs]
    
    if not org_list:
        print("❌ No organizations found in Firestore")
        sys.exit(1)
    
    print(f"\n📋 Found {len(org_list)} organization(s):")
    for idx, (oid, data) in enumerate(org_list, 1):
        name = data.get('name', 'Unnamed')
        print(f"  {idx}. {oid} - {name}")
    
    if len(org_list) == 1:
        org_id = org_list[0][0]
        print(f"\n✅ Using organization: {org_id}")
    else:
        print("\n💡 Run this script with an org ID: python diagnose_org_code.py <org_id>")
        sys.exit(0)

print(f"\n{'='*60}")
print(f"🔬 DIAGNOSING ORG CODE FOR: {org_id}")
print(f"{'='*60}\n")

# Check 1: indexes/orgCodes/codes
print("1️⃣  Checking indexes/orgCodes/codes collection...")
try:
    codes_ref = db.collection("indexes").document("orgCodes").collection("codes")
    matches = list(codes_ref.where("orgId", "==", org_id).limit(5).stream())
    
    if matches:
        print(f"   ✅ Found {len(matches)} code mapping(s):")
        for doc in matches:
            data = doc.to_dict()
            print(f"      • Code: {doc.id} → orgId: {data.get('orgId')}")
            if data.get('backfilled'):
                print(f"        (backfilled at {data.get('backfilledAt')})")
    else:
        print("   ❌ No code mappings found in index")
except Exception as e:
    print(f"   ❌ Error querying index: {e}")

# Check 2: Organization document
print("\n2️⃣  Checking organization document...")
try:
    org_doc = db.collection("organizations").document(org_id).get()
    if org_doc.exists:
        data = org_doc.to_dict()
        print("   ✅ Organization document exists")
        
        code_fields = ["orgCode", "code", "codePrefix", "org_code", "shortCode", "short_code"]
        found_codes = {field: data.get(field) for field in code_fields if data.get(field)}
        
        if found_codes:
            print("   ✅ Found potential code fields:")
            for field, value in found_codes.items():
                print(f"      • {field}: {value}")
        else:
            print(f"   ❌ No code fields found. Checked: {', '.join(code_fields)}")
            print("   💡 Consider adding an 'orgCode' field to this document")
    else:
        print("   ❌ Organization document does not exist")
except Exception as e:
    print(f"   ❌ Error reading org document: {e}")

# Check 3: Team members with employee codes
print("\n3️⃣  Checking team members for existing employee codes...")
try:
    team_ref = db.collection('organizations', org_id, 'team')
    members = list(team_ref.limit(20).stream())
    
    if members:
        print(f"   ✅ Found {len(members)} team member(s)")
        members_with_codes = []
        
        for member in members:
            data = member.to_dict()
            employee_code = data.get('employeeCode') or data.get('profile', {}).get('employeeCode')
            if employee_code:
                members_with_codes.append((member.id, employee_code))
        
        if members_with_codes:
            print(f"   ✅ {len(members_with_codes)} member(s) have employee codes:")
            for uid, code in members_with_codes[:5]:
                prefix = code.split('-')[0] if '-' in code else code
                print(f"      • {uid}: {code} (prefix: {prefix})")
            
            if len(members_with_codes) > 5:
                print(f"      ... and {len(members_with_codes) - 5} more")
        else:
            print("   ❌ No team members have employee codes yet")
            print("   💡 Generate at least one code manually first")
    else:
        print("   ❌ No team members found")
except Exception as e:
    print(f"   ❌ Error reading team members: {e}")

# Summary
print(f"\n{'='*60}")
print("📊 SUMMARY")
print(f"{'='*60}\n")

print("To fix the 404 error, do ONE of the following:")
print("  1. Add 'orgCode' field to your organization document")
print("  2. Generate one manual code first (POST /api/team/codes)")
print("  3. Pass 'orgCode' in the bulk assign request body")
print("\nExample Firestore update (option 1):")
print(f"  organizations/{org_id}")
print("    └─ orgCode: 'ASTR'  <-- Add this field\n")
