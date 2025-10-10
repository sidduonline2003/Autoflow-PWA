#!/usr/bin/env python3
"""
Add intakeSummary computation logic to get_job function
"""
import sys

file_path = "/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/routers/postprod.py"

with open(file_path, 'r') as f:
    content = f.read()

# Find the get_job function and replace it with enhanced version
old_get_job = '''async def get_job(event_id: str, current_user: dict = Depends(get_current_user)):
    import sys
    print("\\n" + "="*80, file=sys.stderr, flush=True)
    print(f"DEBUG: get_job called for event: {event_id}", file=sys.stderr, flush=True)
    print("="*80 + "\\n", file=sys.stderr, flush=True)
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_document = _job_ref(db, org_id, event_id)
    job_doc = job_document.get()
    if not job_doc.exists:
        # Lazy-initialize the job on first access to avoid 404s on the client
        now = datetime.utcnow()
        payload = {
            'eventId': event_id,
            'status': 'PENDING',
            'createdAt': now,
            'updatedAt': now,
            'photo': {'state': ASSIGNED_MAP['photo'], 'version': 0},
            'video': {'state': ASSIGNED_MAP['video'], 'version': 0}
        }
        job_document.set(payload)
        _activity_ref(db, org_id, event_id).document().set({
            'at': now,
            'actorUid': current_user.get('uid'),
            'kind': 'INIT',
            'summary': 'Post-production job initialized'
        })
        return payload
    data = job_doc.to_dict()
    return data'''

new_get_job = '''async def get_job(event_id: str, current_user: dict = Depends(get_current_user)):
    import sys
    print("\\n" + "="*80, file=sys.stderr, flush=True)
    print(f"DEBUG: get_job called for event: {event_id}", file=sys.stderr, flush=True)
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_document = _job_ref(db, org_id, event_id)
    job_doc = job_document.get()
    if not job_doc.exists:
        # Lazy-initialize the job on first access to avoid 404s on the client
        now = datetime.utcnow()
        payload = {
            'eventId': event_id,
            'status': 'PENDING',
            'createdAt': now,
            'updatedAt': now,
            'photo': {'state': ASSIGNED_MAP['photo'], 'version': 0},
            'video': {'state': ASSIGNED_MAP['video'], 'version': 0}
        }
        job_document.set(payload)
        _activity_ref(db, org_id, event_id).document().set({
            'at': now,
            'actorUid': current_user.get('uid'),
            'kind': 'INIT',
            'summary': 'Post-production job initialized'
        })
        return payload
    
    data = job_doc.to_dict()
    print(f"DEBUG: Job keys: {list(data.keys())}", file=sys.stderr, flush=True)
    print(f"DEBUG: Has intakeSummary: {'intakeSummary' in data}", file=sys.stderr, flush=True)
    
    # Compute intakeSummary if missing
    if 'intakeSummary' not in data and 'intake_summary' not in data:
        print("DEBUG: intakeSummary missing, computing from event data...", file=sys.stderr, flush=True)
        try:
            # Fetch event document
            event_ref = db.collection('organizations', org_id, 'events').document(event_id)
            event_doc = event_ref.get()
            if event_doc.exists:
                event_data = event_doc.to_dict()
                data_intake = event_data.get('dataIntake', {})
                submissions = data_intake.get('submissions', [])
                print(f"DEBUG: Found {len(submissions)} submissions in event", file=sys.stderr, flush=True)
                
                # Filter approved submissions
                approved = []
                for sub in submissions:
                    status = sub.get('status', '')
                    if status in ['APPROVED', 'approved', 'READY', 'ready']:
                        approved.append(sub)
                
                print(f"DEBUG: Found {len(approved)} approved submissions", file=sys.stderr, flush=True)
                
                if approved:
                    # Build intakeSummary
                    intake_summary = {
                        'approvedCount': len(approved),
                        'approvedSubmissions': approved,
                        'totalDevices': sum(len(s.get('devices', [])) for s in approved),
                        'estimatedDataSizes': {}
                    }
                    data['intakeSummary'] = intake_summary
                    
                    # Save back to Firestore
                    job_document.update({'intakeSummary': intake_summary, 'updatedAt': datetime.utcnow()})
                    print(f"DEBUG: ✅ Added intakeSummary with {len(approved)} submissions", file=sys.stderr, flush=True)
                else:
                    print("DEBUG: No approved submissions found", file=sys.stderr, flush=True)
            else:
                print("DEBUG: Event document not found", file=sys.stderr, flush=True)
        except Exception as e:
            print(f"DEBUG: Error computing intakeSummary: {e}", file=sys.stderr, flush=True)
    
    print(f"DEBUG: FINAL - Returning job with intakeSummary: {'intakeSummary' in data}", file=sys.stderr, flush=True)
    print("="*80 + "\\n", file=sys.stderr, flush=True)
    return data'''

if old_get_job in content:
    content = content.replace(old_get_job, new_get_job)
    with open(file_path, 'w') as f:
        f.write(content)
    print("✅ Successfully enhanced get_job function with intakeSummary computation!")
else:
    print("❌ Could not find exact match for old get_job function")
    print("Will need manual editing")
