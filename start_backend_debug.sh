#!/bin/bash
cd /Users/siddudev/Development/AUTOSTUDIOFLOW
source backend/venv/bin/activate
export PYTHONUNBUFFERED=1
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
