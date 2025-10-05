#!/usr/bin/env python3
"""
Quick fix: Add orgCode field to your organizations.
This enables the teammate code assignment feature.
"""
import os
import sys
from firebase_admin import credentials, initialize_app, firestore

# Initialize Firebase
cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "backend/app1bysiddu-95459-firebase-adminsdk-fbsvc-efb2c7c181.json")
cred = credentials.Certificate(cred_path)
initialize_app(cred)
db = firestore.client()

# Mapping of org names to suggested codes
ORG_CODE_SUGGESTIONS = {
    "OrgA": "ORGA",
    "ORGB": "ORGB",
    "organization1": "ORG1",
    "admin@gmail.com": "ADMIN",
}

print("🔧 Adding orgCode fields to organizations...\n")

orgs = db.collection('organizations').stream()
updated = 0

for org_doc in orgs:
    org_id = org_doc.id
    data = org_doc.to_dict()
    org_name = data.get('name', 'Unknown')
    
    # Skip if already has orgCode
    if data.get('orgCode'):
        print(f"⏭️  {org_name} ({org_id}) - already has orgCode: {data['orgCode']}")
        continue
    
    # Suggest a code
    suggested = ORG_CODE_SUGGESTIONS.get(org_name)
    if not suggested:
        # Generate from name
        suggested = ''.join(c.upper() for c in org_name if c.isalnum())[:8] or "ORG"
    
    print(f"✅ {org_name} ({org_id})")
    print(f"   Setting orgCode: {suggested}")
    
    # Update document
    db.collection('organizations').document(org_id).update({
        'orgCode': suggested
    })
    updated += 1

print(f"\n✨ Updated {updated} organization(s)")
print("\n💡 Now try the 'Assign Codes' button again in the frontend!")
