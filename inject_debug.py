#!/usr/bin/env python3
import sys

file_path = "/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/routers/postprod.py"

with open(file_path, 'r') as f:
    lines = f.readlines()

# Find the line with "async def get_job"
for i, line in enumerate(lines):
    if 'async def get_job(event_id: str' in line:
        print(f"Found get_job at line {i+1}")
        # Insert debug code after this line
        debug_code = [
            "    import sys\n",
            '    print("\\n" + "="*80, file=sys.stderr, flush=True)\n',
            f'    print(f"DEBUG: get_job called for event: {{event_id}}", file=sys.stderr, flush=True)\n',
            '    print("="*80 + "\\n", file=sys.stderr, flush=True)\n',
        ]
        lines[i+1:i+1] = debug_code
        break

with open(file_path, 'w') as f:
    f.writelines(lines)
    
print("✅ Debug code injected!")
