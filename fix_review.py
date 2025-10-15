#!/usr/bin/env python3
import re

# Read the file
with open('/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/routers/postprod.py', 'r') as f:
    content = f.read()

# Find and replace the review function
old_code = '''@router.post('/{event_id}/postprod/{stream}/review')
async def review_version(event_id: str, stream: StreamType, req: ReviewIn, current_user: dict = Depends(get_current_user)):
    raise HTTPException(status_code=418, detail="NEW CODE IS ACTIVE - TEST ERROR")
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_ref = _job_ref(db, org_id, event_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not initialized')
    job = job_doc.to_dict()
    stream_state = job.get(stream) or {}
    current_version = stream_state.get('version') or 0
    if current_version == 0:
        raise HTTPException(status_code=400, detail='Nothing submitted')'''

new_code = '''@router.post('/{event_id}/postprod/{stream}/review')
async def review_version(event_id: str, stream: StreamType, req: ReviewIn, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail='Admin only')
    org_id = current_user.get('orgId')
    db = firestore.client()
    job_ref = _job_ref(db, org_id, event_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail='Job not initialized')
    job = job_doc.to_dict()
    stream_state = job.get(stream) or {}
    
    # Check if state is REVIEW - this is the PRIMARY indicator of submission
    current_state = stream_state.get('state', '')
    expected_review_state = 'PHOTO_REVIEW' if stream == 'photo' else 'VIDEO_REVIEW'
    
    # If state is REVIEW, allow immediately (state transition proves submission occurred)
    if current_state == expected_review_state:
        print(f"[REVIEW] State is {expected_review_state}, allowing review")
    else:
        # Only check other indicators if state is NOT in review
        current_version = stream_state.get('version') or 0
        has_deliverables = stream_state.get('hasDeliverables', 0) > 0
        has_timestamp = bool(stream_state.get('lastSubmissionAt'))
        
        # Check if there's ANY indication of submission
        if current_version == 0 and not has_deliverables and not has_timestamp:
            print(f"[REVIEW ERROR] No submission found: version={current_version}, deliverables={has_deliverables}, timestamp={has_timestamp}")
            raise HTTPException(status_code=400, detail='Nothing submitted')
        
        print(f"[REVIEW] Fallback check passed: version={current_version}, deliverables={has_deliverables}, timestamp={has_timestamp}")'''

# Replace
content = content.replace(old_code, new_code)

# Write back
with open('/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/routers/postprod.py', 'w') as f:
    f.write(content)

print("✅ Fixed review function!")
