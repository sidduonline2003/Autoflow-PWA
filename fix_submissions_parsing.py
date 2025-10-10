#!/usr/bin/env python3
"""
Fix the submissions parsing error
"""

file_path = "/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/routers/postprod.py"

with open(file_path, 'r') as f:
    lines = f.readlines()

# Find the line with "for sub in submissions:"
for i, line in enumerate(lines):
    if 'for sub in submissions:' in line and i > 200:
        print(f"Found 'for sub in submissions' at line {i+1}")
        # Replace the approval filtering logic
        # Find the end of this for loop block
        indent_level = len(line) - len(line.lstrip())
        
        # Replace from "for sub in submissions:" to "print(f"DEBUG: Found {len(approved)}"
        new_code = f'''{' ' * indent_level}# Filter approved submissions
{' ' * indent_level}approved = []
{' ' * indent_level}print(f"DEBUG: Submissions type: {{type(submissions)}}", file=sys.stderr, flush=True)
{' ' * indent_level}print(f"DEBUG: First submission type: {{type(submissions[0]) if submissions else 'empty'}}", file=sys.stderr, flush=True)
{' ' * indent_level}if submissions:
{' ' * indent_level}    print(f"DEBUG: First submission sample: {{submissions[0]}}", file=sys.stderr, flush=True)
{' ' * indent_level}
{' ' * indent_level}for idx, sub in enumerate(submissions):
{' ' * indent_level}    try:
{' ' * indent_level}        if isinstance(sub, dict):
{' ' * indent_level}            status = sub.get('status', '')
{' ' * indent_level}            if status in ['APPROVED', 'approved', 'READY', 'ready']:
{' ' * indent_level}                approved.append(sub)
{' ' * indent_level}        elif isinstance(sub, str):
{' ' * indent_level}            print(f"DEBUG: Submission {{idx}} is a string: {{sub[:100]}}", file=sys.stderr, flush=True)
{' ' * indent_level}        else:
{' ' * indent_level}            print(f"DEBUG: Submission {{idx}} is type: {{type(sub)}}", file=sys.stderr, flush=True)
{' ' * indent_level}    except Exception as e:
{' ' * indent_level}        print(f"DEBUG: Error processing submission {{idx}}: {{e}}", file=sys.stderr, flush=True)
'''
        
        # Insert before the for loop
        lines[i] = new_code
        
        # Remove the old for loop and approval logic (next few lines)
        # Find where to stop removing
        j = i + 1
        while j < len(lines) and (lines[j].startswith(' ' * (indent_level + 4)) or lines[j].strip() == ''):
            if 'print(f"DEBUG: Found {len(approved)} approved' in lines[j]:
                break
            j += 1
        
        # Remove the old lines
        del lines[i+1:j]
        
        print(f"Replaced lines {i+1} to {j}")
        break

with open(file_path, 'w') as f:
    f.writelines(lines)

print("✅ Fixed submission parsing with better error handling!")
