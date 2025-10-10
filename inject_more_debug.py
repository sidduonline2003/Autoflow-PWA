#!/usr/bin/env python3
import sys

file_path = "/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/routers/postprod.py"

with open(file_path, 'r') as f:
    lines = f.readlines()

# Find the line with "job = job_doc.to_dict()"
for i, line in enumerate(lines):
    if 'job = job_doc.to_dict()' in line and i > 160:  # After get_job function
        print(f"Found job = job_doc.to_dict() at line {i+1}")
        # Insert debug code after this line
        debug_code = [
            '    print(f"DEBUG: Job document exists: {job_doc.exists}", file=sys.stderr, flush=True)\n',
            '    print(f"DEBUG: Job keys: {list(job.keys())}", file=sys.stderr, flush=True)\n',
            "    print(f\"DEBUG: Has intakeSummary: {'intakeSummary' in job}\", file=sys.stderr, flush=True)\n",
            "    print(f\"DEBUG: Has intake_summary: {'intake_summary' in job}\", file=sys.stderr, flush=True)\n",
        ]
        lines[i+1:i+1] = debug_code
        print(f"Added debug at line {i+2}")
        break

# Also add debug before return statement
for i, line in enumerate(lines):
    if 'return job' in line and 'def get_job' in ''.join(lines[max(0,i-50):i]):
        print(f"Found return job at line {i+1}")
        # Insert debug code before return
        debug_code = [
            '    print(f"DEBUG: FINAL - Job keys being returned: {list(job.keys())}", file=sys.stderr, flush=True)\n',
            "    print(f\"DEBUG: FINAL - Has intakeSummary: {'intakeSummary' in job}\", file=sys.stderr, flush=True)\n",
            '    print("="*80 + "\\n", file=sys.stderr, flush=True)\n',
        ]
        lines[i:i] = debug_code
        print(f"Added debug before return at line {i+1}")
        break

with open(file_path, 'w') as f:
    f.writelines(lines)
    
print("✅ Additional debug code injected!")
