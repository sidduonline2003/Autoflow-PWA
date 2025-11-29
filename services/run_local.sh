#!/bin/bash

# AutoStudioFlow - Local Development Runner
# This script runs all microservices locally without Docker

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AutoStudioFlow Microservices Runner  ${NC}"
echo -e "${BLUE}========================================${NC}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
pip install --quiet fastapi uvicorn httpx python-multipart firebase-admin google-cloud-firestore redis aiohttp python-dotenv google-generativeai

# Function to start a service
start_service() {
    local name=$1
    local port=$2
    local dir=$3
    
    echo -e "${GREEN}Starting $name on port $port...${NC}"
    cd "$SCRIPT_DIR/$dir"
    uvicorn main:app --host 0.0.0.0 --port $port --reload &
    sleep 1
}

# Kill any existing services on these ports
echo -e "${YELLOW}Cleaning up existing processes...${NC}"
for port in 8000 8001 8002 8003 8004 8005; do
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
done

# Add shared module to Python path
export PYTHONPATH="$SCRIPT_DIR:$PYTHONPATH"

# Start all services
echo -e "${BLUE}Starting microservices...${NC}"

start_service "Gateway" 8000 "gateway"
start_service "Core Service" 8001 "core"
start_service "Equipment Service" 8002 "equipment"
start_service "PostProd Service" 8003 "postprod"
start_service "Financial Service" 8004 "financial"
start_service "AI Service" 8005 "ai"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  All services started!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Gateway:    ${BLUE}http://localhost:8000${NC}"
echo -e "  Core:       ${BLUE}http://localhost:8001${NC}"
echo -e "  Equipment:  ${BLUE}http://localhost:8002${NC}"
echo -e "  PostProd:   ${BLUE}http://localhost:8003${NC}"
echo -e "  Financial:  ${BLUE}http://localhost:8004${NC}"
echo -e "  AI:         ${BLUE}http://localhost:8005${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for Ctrl+C
trap 'echo -e "\n${RED}Stopping all services...${NC}"; kill $(jobs -p) 2>/dev/null; exit 0' INT
wait
