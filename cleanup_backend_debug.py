#!/usr/bin/env python3
"""
Remove all debug print statements from get_job function
"""
import re

file_path = "/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/routers/postprod.py"

with open(file_path, 'r') as f:
    lines = f.readlines()

# Track lines to remove
lines_to_remove = []

# Find all debug print statements
for i, line in enumerate(lines):
    # Remove lines with DEBUG: or print statements with sys.stderr
    if ('print(' in line and 'DEBUG:' in line) or \
       ('print(' in line and 'sys.stderr' in line and 'get_job' in ''.join(lines[max(0,i-50):i+1])) or \
       ('print("\\n" + "="*80' in line) or \
       ('print("="*80' in line and 'sys.stderr' in line) or \
       ('import sys' in line and i > 160 and i < 250):  # The import sys we added
        lines_to_remove.append(i)

# Also remove the entire debug sections (lines between === markers)
print(f"Removing {len(lines_to_remove)} debug lines")

# Remove lines in reverse order to maintain indices
for i in sorted(lines_to_remove, reverse=True):
    print(f"Removing line {i+1}: {lines[i].strip()[:80]}")
    del lines[i]

with open(file_path, 'w') as f:
    f.writelines(lines)

print("✅ Removed all debug statements from backend!")
