#!/usr/bin/env python3
"""
Fix event postProduction.stage for events stuck in DATA_COLLECTION
even though all submissions are approved.
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from firebase_admin import credentials, firestore
import firebase_admin
from dotenv import load_dotenv

load_dotenv()

# Initialize Firebase
try:
    firebase_admin.get_app()
except ValueError:
    cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    storage_bucket = os.getenv("FIREBASE_STORAGE_BUCKET", "app1bysiddu-95459.appspot.com")
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred, {'storageBucket': storage_bucket})

db = firestore.client()

def fix_event_stage(org_id, event_id):
    """Fix the postProduction.stage for an event."""
    
    print(f"\n{'='*60}")
    print(f"Fixing Event: {event_id}")
    print(f"{'='*60}\n")
    
    # Get event from root collection
    root_event_ref = db.collection('organizations', org_id, 'events').document(event_id)
    root_event_doc = root_event_ref.get()
    
    if not root_event_doc.exists:
        print(f"❌ Event {event_id} not found in root events collection")
        return False
    
    event_data = root_event_doc.to_dict()
    
    # Check current state
    post_prod = event_data.get('postProduction', {})
    data_intake = event_data.get('dataIntake', {})
    submissions = data_intake.get('submissions', {})
    
    current_stage = post_prod.get('stage', 'NOT_SET')
    data_status = data_intake.get('status', 'NOT_SET')
    
    approved_count = sum(1 for s in submissions.values() if s.get('status', '').upper() == 'APPROVED')
    total_submissions = len(submissions)
    
    print(f"Current State:")
    print(f"  postProduction.stage: {current_stage}")
    print(f"  dataIntake.status: {data_status}")
    print(f"  Submissions: {approved_count}/{total_submissions} approved")
    
    # Check if fix is needed
    if current_stage == 'READY_FOR_JOB':
        print(f"\n✅ Event is already in READY_FOR_JOB stage. No fix needed.")
        return True
    
    if data_status != 'READY_FOR_POST_PROD':
        print(f"\n⚠️  Data intake status is '{data_status}', not 'READY_FOR_POST_PROD'")
        print(f"   Event may not be ready for post-production yet.")
        response = input(f"\nStill set stage to READY_FOR_JOB? (yes/no): ")
        if response.lower() != 'yes':
            print("Aborted.")
            return False
    
    if approved_count < total_submissions:
        print(f"\n⚠️  Only {approved_count}/{total_submissions} submissions approved")
        response = input(f"\nStill set stage to READY_FOR_JOB? (yes/no): ")
        if response.lower() != 'yes':
            print("Aborted.")
            return False
    
    # Apply fix
    print(f"\n🔧 Applying fix...")
    
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    
    update_data = {
        'postProduction.stage': 'READY_FOR_JOB',
        'postProduction.readyAt': now,
        'postProduction.manuallyFixed': True,
        'postProduction.fixedAt': now,
        'updatedAt': now
    }
    
    root_event_ref.update(update_data)
    
    print(f"✅ Successfully updated event!")
    print(f"   postProduction.stage: {current_stage} → READY_FOR_JOB")
    print(f"   postProduction.readyAt: {now}")
    
    # Verify
    updated_doc = root_event_ref.get()
    updated_data = updated_doc.to_dict()
    new_stage = updated_data.get('postProduction', {}).get('stage')
    
    if new_stage == 'READY_FOR_JOB':
        print(f"\n✅ Verification successful! Event is now READY_FOR_JOB")
        print(f"\n💡 You can now initialize post-production for this event.")
        return True
    else:
        print(f"\n❌ Verification failed. Stage is still: {new_stage}")
        return False

if __name__ == '__main__':
    ORG_ID = 'autoflow'  # Change if needed
    
    if len(sys.argv) > 1:
        event_id = sys.argv[1]
    else:
        event_id = 'GLF7OfG85TVPpGfFSbd8'  # Default from your error
    
    print(f"Organization: {ORG_ID}")
    print(f"Event ID: {event_id}")
    
    success = fix_event_stage(ORG_ID, event_id)
    
    sys.exit(0 if success else 1)
