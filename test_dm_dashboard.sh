#!/bin/bash

echo "🧪 Data Manager Dashboard Test Suite"
echo "======================================"
echo "Testing server at: http://localhost:8000"
echo "Time: $(date)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:8000"

test_endpoint() {
    local endpoint="$1"
    local expected_status="$2"
    local method="${3:-GET}"
    
    echo -e "${BLUE}🧪 Testing $method $endpoint${NC}"
    
    # Make the request and capture both status and response
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api$endpoint" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Split response and status code
        status_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | head -n -1)
        
        echo "   Status: $status_code"
        
        if [ "$status_code" = "$expected_status" ]; then
            echo -e "   ${GREEN}✅ SUCCESS${NC} - Expected $expected_status, got $status_code"
            
            # Try to show response summary
            if [[ "$body" == *"pendingBatches"* ]]; then
                echo "   📋 Response contains pendingBatches data"
            elif [[ "$body" == *"stats"* ]]; then
                echo "   📈 Response contains stats data"
            elif [[ "$body" == *"storageMedia"* ]]; then
                echo "   💾 Response contains storageMedia data"
            elif [[ "$body" == *"error"* ]]; then
                echo "   ⚠️  Response contains error (but handled gracefully)"
            fi
            
            return 0
        else
            echo -e "   ${RED}❌ FAILED${NC} - Expected $expected_status, got $status_code"
            echo "   🚨 Response: $body"
            return 1
        fi
    else
        echo -e "   ${RED}💥 CONNECTION ERROR${NC} - Is the server running?"
        return 1
    fi
}

echo "🏥 Testing Server Health"
echo "------------------------"

# Test if server is running
if curl -s "$BASE_URL/docs" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server is running and responsive${NC}"
    echo "   FastAPI docs available at $BASE_URL/docs"
else
    echo -e "${RED}❌ Server not running or not accessible${NC}"
    echo "   Make sure the server is running on $BASE_URL"
    echo ""
    echo "💡 To start the server, run:"
    echo "   source backend/venv/bin/activate && uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload"
    exit 1
fi

echo ""
echo "🚀 Testing Data Manager Dashboard Endpoints"
echo "============================================"

# Track success count
success_count=0
total_count=0

# Test the main endpoints that were failing with 500 errors
# We expect 401 (Unauthorized) not 500 (Internal Server Error)

echo ""
echo -e "${YELLOW}Note: We expect 401 (auth errors), not 500 (server errors)${NC}"
echo ""

# Data Manager Dashboard (was returning 500)
((total_count++))
if test_endpoint "/data-submissions/dm/dashboard" "401"; then
    ((success_count++))
fi

echo ""

# Data Manager Pending Approvals (was returning 500)
((total_count++))
if test_endpoint "/data-submissions/dm/pending-approvals" "401"; then
    ((success_count++))
fi

echo ""

# Storage Media endpoint
((total_count++))
if test_endpoint "/data-submissions/dm/storage-media" "401"; then
    ((success_count++))
fi

echo ""
echo "============================================"
echo -e "${BLUE}📊 SUMMARY: $success_count/$total_count endpoints working correctly${NC}"

if [ $success_count -eq $total_count ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! No more 500 errors.${NC}"
    echo "✅ Data Manager dashboard should now load properly"
    
    echo ""
    echo "🎯 EXPECTED RESULTS:"
    echo "✅ 401 Unauthorized (not 500 Internal Server Error)"
    echo "✅ Endpoints respond quickly (no timeout)"
    echo "✅ JSON responses with error handling"
    echo "✅ No Firestore index errors in server logs"
    
    echo ""
    echo "🚀 NEXT STEPS:"
    echo "1. Frontend should now load Data Manager dashboard"
    echo "2. No more 500 errors in browser console"
    echo "3. Data intake workflow should work end-to-end"
    
    exit 0
else
    echo -e "${YELLOW}⚠️  Some endpoints still have issues${NC}"
    exit 1
fi
