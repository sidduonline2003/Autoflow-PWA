#!/usr/bin/env python3
import re

# Read the file
with open('/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/routers/postprod.py', 'r') as f:
    lines = f.readlines()

# Find the review function and fix it
in_review_function = False
fixed_lines = []
i = 0

while i < len(lines):
    line = lines[i]
    
    # Detect start of review function
    if 'async def review_version' in line:
        in_review_function = True
        fixed_lines.append(line)
        i += 1
        continue
    
    # Find the problematic section and fix it
    if in_review_function and 'stream_state = job.get(stream) or {}' in line:
        # Add this line
        fixed_lines.append(line)
        i += 1
        
        # Skip the blank line and comment
        while i < len(lines) and (lines[i].strip() == '' or lines[i].strip().startswith('#')):
            fixed_lines.append(lines[i])
            i += 1
        
        # Now add the fixed logic
        fixed_lines.append('    \n')
        fixed_lines.append('    # Get current_version FIRST (needed for activity log later)\n')
        fixed_lines.append('    current_version = stream_state.get(\'version\') or 0\n')
        fixed_lines.append('    \n')
        fixed_lines.append('    # Check if state is REVIEW - this is the PRIMARY indicator of submission\n')
        fixed_lines.append('    current_state = stream_state.get(\'state\', \'\')\n')
        fixed_lines.append('    expected_review_state = \'PHOTO_REVIEW\' if stream == \'photo\' else \'VIDEO_REVIEW\'\n')
        fixed_lines.append('    \n')
        fixed_lines.append('    # If state is REVIEW, allow immediately (state transition proves submission occurred)\n')
        fixed_lines.append('    if current_state == expected_review_state:\n')
        fixed_lines.append('        print(f"[REVIEW] State is {expected_review_state}, allowing review")\n')
        fixed_lines.append('    else:\n')
        fixed_lines.append('        # Only check other indicators if state is NOT in review\n')
        fixed_lines.append('        has_deliverables = stream_state.get(\'hasDeliverables\', 0) > 0\n')
        fixed_lines.append('        has_timestamp = bool(stream_state.get(\'lastSubmissionAt\'))\n')
        fixed_lines.append('        \n')
        fixed_lines.append('        # Check if there\'s ANY indication of submission\n')
        fixed_lines.append('        if current_version == 0 and not has_deliverables and not has_timestamp:\n')
        fixed_lines.append('            print(f"[REVIEW ERROR] No submission found: version={current_version}, deliverables={has_deliverables}, timestamp={has_timestamp}")\n')
        fixed_lines.append('            raise HTTPException(status_code=400, detail=\'Nothing submitted\')\n')
        fixed_lines.append('        \n')
        fixed_lines.append('        print(f"[REVIEW] Fallback check passed: version={current_version}, deliverables={has_deliverables}, timestamp={has_timestamp}")\n')
        
        # Skip all the old logic until we hit the 'now = datetime.utcnow()' line
        while i < len(lines) and 'now = datetime.utcnow()' not in lines[i]:
            i += 1
        
        continue
    
    fixed_lines.append(line)
    i += 1

# Write back
with open('/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/routers/postprod.py', 'w') as f:
    f.writelines(fixed_lines)

print("✅ Fixed current_version scope issue!")
