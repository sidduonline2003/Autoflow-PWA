#!/usr/bin/env python3
"""
Fix: Handle submissions as dict instead of list
"""

file_path = "/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/routers/postprod.py"

with open(file_path, 'r') as f:
    content = f.read()

# Find and replace the submissions extraction
old_code = '''                data_intake = event_data.get('dataIntake', {})
                submissions = data_intake.get('submissions', [])
                print(f"DEBUG: Found {len(submissions)} submissions in event", file=sys.stderr, flush=True)'''

new_code = '''                data_intake = event_data.get('dataIntake', {})
                submissions_raw = data_intake.get('submissions', {})
                
                # Handle submissions as dict or list
                if isinstance(submissions_raw, dict):
                    submissions = list(submissions_raw.values())
                    print(f"DEBUG: Found {len(submissions)} submissions (dict) in event", file=sys.stderr, flush=True)
                elif isinstance(submissions_raw, list):
                    submissions = submissions_raw
                    print(f"DEBUG: Found {len(submissions)} submissions (list) in event", file=sys.stderr, flush=True)
                else:
                    submissions = []
                    print(f"DEBUG: Unexpected submissions type: {type(submissions_raw)}", file=sys.stderr, flush=True)'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open(file_path, 'w') as f:
        f.write(content)
    print("✅ Fixed submissions dict/list handling!")
else:
    print("❌ Could not find exact match")
    print("Trying alternative...")
    
    # Try to find just the submissions line
    old_line = "submissions = data_intake.get('submissions', [])"
    new_line = '''submissions_raw = data_intake.get('submissions', {})
                
                # Handle submissions as dict or list
                if isinstance(submissions_raw, dict):
                    submissions = list(submissions_raw.values())
                elif isinstance(submissions_raw, list):
                    submissions = submissions_raw
                else:
                    submissions = []'''
    
    if old_line in content:
        content = content.replace(old_line, new_line)
        with open(file_path, 'w') as f:
            f.write(content)
        print("✅ Fixed with alternative approach!")
    else:
        print("❌ Could not apply fix automatically")
