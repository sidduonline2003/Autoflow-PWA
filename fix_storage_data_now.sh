#!/bin/bash

# 🔧 Storage Data Fix - Automated Script
# This script will restart the backend server to apply code changes

echo "🔍 Storage Data Fix - Starting..."
echo ""

# Step 1: Kill existing backend process
echo "Step 1: Stopping existing backend server..."
pkill -f "uvicorn backend.main:app"
sleep 2

# Step 2: Navigate to project directory
cd /Users/siddudev/Development/AUTOSTUDIOFLOW

# Step 3: Start backend server
echo "Step 2: Starting backend server with updated code..."
cd backend
source venv/bin/activate
nohup uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000 > ../backend.log 2>&1 &
echo "Backend server started (PID: $!)"

# Step 4: Wait for server to start
echo "Step 3: Waiting for server to start..."
sleep 5

# Step 5: Test the endpoint
echo "Step 4: Testing /postprod/overview endpoint..."
echo ""
echo "Please manually test by:"
echo "1. Opening the frontend"
echo "2. Opening the Assign Editors modal"
echo "3. Checking console logs for intakeSummary"
echo ""
echo "✅ Backend server restarted with updated code!"
echo ""
echo "📋 Check backend logs: tail -f /Users/siddudev/Development/AUTOSTUDIOFLOW/backend.log"
