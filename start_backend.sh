#!/bin/bash

# AutoStudioFlow Backend Startup Script
# This script kills any existing backend process and starts a fresh one

cd /Users/siddudev/Development/AUTOSTUDIOFLOW && \
lsof -ti:8000 | xargs kill -9 2>/dev/null && \
sleep 2 && \
source backend/venv/bin/activate && \
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
