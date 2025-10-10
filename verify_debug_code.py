#!/usr/bin/env python3
"""
Quick test to verify the get_job endpoint has our debug code
"""
import sys

file_path = "/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/routers/postprod.py"

with open(file_path, 'r') as f:
    content = f.read()
    
if '🔥🔥🔥 [OVERVIEW ENDPOINT CALLED]' in content:
    print("✅ DEBUG CODE IS PRESENT in postprod.py")
    print(f"   Found at character position: {content.find('🔥🔥🔥')}")
else:
    print("❌ DEBUG CODE IS MISSING from postprod.py")
    sys.exit(1)

if 'sys.stderr' in content and 'flush=True' in content:
    print("✅ sys.stderr and flush=True are present")
else:
    print("⚠️  sys.stderr or flush=True might be missing")
    
# Check for the specific line
lines = content.split('\n')
for i, line in enumerate(lines, 1):
    if 'OVERVIEW ENDPOINT CALLED' in line:
        print(f"✅ Found on line {i}: {line.strip()[:80]}")
        # Show context
        print(f"   Line {i-1}: {lines[i-2].strip()[:80]}")
        print(f"   Line {i+1}: {lines[i].strip()[:80]}")
        break
