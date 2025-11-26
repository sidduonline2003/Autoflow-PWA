#!/bin/bash
cd /Users/siddudev/Development/AUTOSTUDIOFLOW/backend
export VIRTUAL_ENV=/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/venv
export PATH="/Users/siddudev/Development/AUTOSTUDIOFLOW/backend/venv/bin:$PATH"
python3.10 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
