#!/bin/bash

# Simple script to generate QR codes for all existing equipment without them
# Usage: ./generate_qr_codes.sh YOUR_FIREBASE_TOKEN

TOKEN="$1"

if [ -z "$TOKEN" ]; then
    echo "❌ Error: Firebase token required"
    echo "Usage: ./generate_qr_codes.sh YOUR_FIREBASE_TOKEN"
    echo ""
    echo "To get your token:"
    echo "1. Open Equipment Dashboard in browser"
    echo "2. Open DevTools Console (F12)"
    echo "3. Run: localStorage.getItem('firebaseAuthToken')"
    echo "4. Copy the token and run: ./generate_qr_codes.sh <token>"
    exit 1
fi

API_URL="http://localhost:8000/api"

echo "════════════════════════════════════════════════════════"
echo "🔧 QR Code Generation Script"
echo "════════════════════════════════════════════════════════"

# Fetch all equipment and filter those without QR codes
echo ""
echo "📋 Step 1: Fetching equipment without QR codes..."

ASSET_IDS=$(curl -s -X GET "$API_URL/equipment/?limit=1000" \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r '.[] | select(.qrCodeUrl == null) | .assetId')

COUNT=$(echo "$ASSET_IDS" | grep -v '^$' | wc -l | tr -d ' ')

if [ "$COUNT" -eq 0 ]; then
    echo "🎉 All equipment already has QR codes!"
    exit 0
fi

echo "✅ Found $COUNT equipment items without QR codes"
echo ""

# Convert to JSON array
JSON_ARRAY=$(echo "$ASSET_IDS" | jq -R -s -c 'split("\n") | map(select(length > 0))')

echo "🚀 Step 2: Generating QR codes..."
echo "⏳ This will run in the background (check backend logs)"
echo ""

# Call batch generate endpoint
RESPONSE=$(curl -s -X POST "$API_URL/equipment/batch-generate-qr" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$JSON_ARRAY")

# Parse response
QUEUED=$(echo "$RESPONSE" | jq -r '.queued_count // 0')
NOT_FOUND=$(echo "$RESPONSE" | jq -r '.not_found_count // 0')

echo "════════════════════════════════════════════════════════"
echo "✅ QR Code Generation Queued!"
echo "════════════════════════════════════════════════════════"
echo "📊 Queued for generation: $QUEUED"
echo "⚠️  Not found: $NOT_FOUND"
echo "⏱️  Expected completion: $(($QUEUED / 5)) seconds"
echo ""
echo "💡 Next steps:"
echo "   1. Check backend logs for progress"
echo "   2. Wait 1-2 minutes"
echo "   3. Refresh Equipment Dashboard"
echo "   4. QR codes should be visible"
echo ""
echo "🔍 Backend logs should show:"
echo "   INFO: ✅ QR code generated successfully for..."
echo "════════════════════════════════════════════════════════"
