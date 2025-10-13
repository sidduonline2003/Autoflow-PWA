#!/bin/bash

# Quick Start Script for AutoStudioFlow
# This script ensures the backend is running before starting frontend

echo "🚀 AutoStudioFlow Quick Start"
echo "================================"

# Check if backend is running
echo "Checking backend status..."
BACKEND_RUNNING=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/health 2>/dev/null || echo "000")

if [ "$BACKEND_RUNNING" != "200" ]; then
    echo "⚠️  Backend is not running on port 8000"
    echo ""
    echo "Starting backend in a new terminal..."
    echo "Run this in another terminal:"
    echo "  cd /Users/siddudev/Development/AUTOSTUDIOFLOW/backend"
    echo "  python manage.py runserver"
    echo ""
    read -p "Press Enter when backend is ready..."
fi

echo "✅ Backend is ready"
echo ""
echo "🎨 Starting frontend..."
cd /Users/siddudev/Development/AUTOSTUDIOFLOW/frontend

# Clear any stale processes
echo "Cleaning up old processes..."
pkill -f "react-scripts start" 2>/dev/null || true

# Clear service worker cache
echo "Clearing service worker cache..."
rm -rf node_modules/.cache 2>/dev/null || true

echo ""
echo "Starting development server..."
echo "This will open at http://localhost:3000"
echo ""

npm start
