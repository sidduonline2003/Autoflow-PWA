#!/usr/bin/env python3
"""Fix the broken postprod.py file"""

# Read the file
with open('backend/routers/postprod.py', 'r') as f:
    lines = f.readlines()

# Find and fix the broken get_job function (starts around line 160)
output = []
skip_until_next_route = False
inside_broken_get_job = False

for i, line in enumerate(lines, 1):
    # Start of the broken function
    if "@router.get('/{event_id}/postprod/overview')" in line and not inside_broken_get_job:
        inside_broken_get_job = True
        skip_until_next_route = True
        # Write the fixed function
        output.append("@router.get('/{event_id}/postprod/overview')\n")
        output.append("async def get_job(event_id: str, current_user: dict = Depends(get_current_user)):\n")
        output.append("    org_id = current_user.get('orgId')\n")
        output.append("    db = firestore.client()\n")
        output.append("    job_document = _job_ref(db, org_id, event_id)\n")
        output.append("    job_doc = job_document.get()\n")
        output.append("    if not job_doc.exists:\n")
        output.append("        # Lazy-initialize the job on first access to avoid 404s on the client\n")
        output.append("        now = datetime.utcnow()\n")
        output.append("        payload = {\n")
        output.append("            'eventId': event_id,\n")
        output.append("            'status': 'PENDING',\n")
        output.append("            'createdAt': now,\n")
        output.append("            'updatedAt': now,\n")
        output.append("            'photo': {'state': ASSIGNED_MAP['photo'], 'version': 0},\n")
        output.append("            'video': {'state': ASSIGNED_MAP['video'], 'version': 0}\n")
        output.append("        }\n")
        output.append("        job_document.set(payload)\n")
        output.append("        _activity_ref(db, org_id, event_id).document().set({\n")
        output.append("            'at': now,\n")
        output.append("            'actorUid': current_user.get('uid'),\n")
        output.append("            'kind': 'INIT',\n")
        output.append("            'summary': 'Post-production job initialized'\n")
        output.append("        })\n")
        output.append("        return payload\n")
        output.append("    \n")
        output.append("    data = job_doc.to_dict()\n")
        output.append("    \n")
        output.append("    # Compute intakeSummary if missing\n")
        output.append("    if 'intakeSummary' not in data and 'intake_summary' not in data:\n")
        output.append("        try:\n")
        output.append("            # Fetch event document\n")
        output.append("            event_ref = db.collection('organizations', org_id, 'events').document(event_id)\n")
        output.append("            event_doc = event_ref.get()\n")
        output.append("            if event_doc.exists:\n")
        output.append("                event_data = event_doc.to_dict()\n")
        output.append("                computed_summary = _compute_intake_summary(event_data)\n")
        output.append("                \n")
        output.append("                if computed_summary:\n")
        output.append("                    data['intakeSummary'] = computed_summary\n")
        output.append("                    # Save back to Firestore\n")
        output.append("                    job_document.update({'intakeSummary': computed_summary, 'updatedAt': datetime.utcnow()})\n")
        output.append("        except Exception as e:\n")
        output.append("            pass\n")
        output.append("    \n")
        output.append("    return data\n")
        output.append("\n")
        continue
    
    # Found the next route - stop skipping
    if skip_until_next_route and ("@router." in line or "async def " in line and "get_job" not in line):
        skip_until_next_route = False
        inside_broken_get_job = False
    
    # Skip lines in the broken function
    if skip_until_next_route:
        continue
    
    # Keep all other lines
    output.append(line)

# Write the fixed file
with open('backend/routers/postprod.py', 'w') as f:
    f.writelines(output)

print("✅ Fixed postprod.py")
