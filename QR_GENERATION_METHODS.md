# Quick QR Code Generation - API Examples

## Method 1: Using curl (Terminal)

### Step 1: Get your Firebase Auth Token
```bash
# Login to your app in browser, open DevTools Console and run:
# localStorage.getItem('firebaseAuthToken')
# Copy the token
```

### Step 2: Get all equipment without QR codes
```bash
curl -X GET "http://localhost:8000/api/equipment/?limit=1000" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  | jq '.[] | select(.qrCodeUrl == null) | .assetId'
```

### Step 3: Generate QR codes for specific assets
```bash
curl -X POST "http://localhost:8000/api/equipment/batch-generate-qr" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '[
    "CAMERA_XBWIBCjC",
    "LENS_DlwGTC-t",
    "AUDIO_Lv_xEcb6",
    "STORAGE_3gN2_eCL"
  ]'
```

### Single Asset Generation
```bash
curl -X POST "http://localhost:8000/api/equipment/CAMERA_XBWIBCjC/generate-qr" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Method 2: Using Browser Console

### Step 1: Open Equipment Dashboard in browser
### Step 2: Open DevTools Console (F12)
### Step 3: Paste and run this JavaScript:

```javascript
// Get all equipment without QR codes and generate them
async function generateMissingQRCodes() {
    // Get auth token
    const token = localStorage.getItem('firebaseAuthToken');
    if (!token) {
        console.error('❌ Not logged in! Please login first.');
        return;
    }
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
    
    // Step 1: Fetch all equipment
    console.log('📋 Fetching all equipment...');
    const response = await fetch('/api/equipment/?limit=1000', { headers });
    const equipment = await response.json();
    console.log(`✅ Found ${equipment.length} total items`);
    
    // Step 2: Filter equipment without QR codes
    const missingQR = equipment.filter(item => !item.qrCodeUrl);
    console.log(`🔍 Found ${missingQR.length} items without QR codes`);
    
    if (missingQR.length === 0) {
        console.log('🎉 All equipment has QR codes!');
        return;
    }
    
    // Step 3: Batch generate (100 at a time)
    const assetIds = missingQR.map(item => item.assetId);
    const batchSize = 100;
    let totalGenerated = 0;
    
    for (let i = 0; i < assetIds.length; i += batchSize) {
        const batch = assetIds.slice(i, i + batchSize);
        console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(assetIds.length/batchSize)}...`);
        
        const batchResponse = await fetch('/api/equipment/batch-generate-qr', {
            method: 'POST',
            headers,
            body: JSON.stringify(batch)
        });
        
        const result = await batchResponse.json();
        totalGenerated += result.queued_count;
        console.log(`✅ Queued ${result.queued_count} QR codes`);
        
        // Wait 2 seconds between batches
        if (i + batchSize < assetIds.length) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('═══════════════════════════════════════');
    console.log(`✅ Total queued: ${totalGenerated} QR codes`);
    console.log(`⏱️  Expected time: ~${Math.ceil(totalGenerated * 0.2)} seconds`);
    console.log('💡 Refresh page in 1-2 minutes to see QR codes');
    console.log('═══════════════════════════════════════');
}

// Run it!
generateMissingQRCodes();
```

---

## Method 3: Using Postman/Thunder Client

### Endpoint 1: Batch Generate QR Codes
```
POST http://localhost:8000/api/equipment/batch-generate-qr
Headers:
  Authorization: Bearer YOUR_TOKEN
  Content-Type: application/json
Body (JSON):
[
  "CAMERA_XBWIBCjC",
  "LENS_DlwGTC-t",
  "AUDIO_Lv_xEcb6",
  "STORAGE_3gN2_eCL",
  ... up to 500 asset IDs
]
```

### Endpoint 2: Single Asset QR Generation
```
POST http://localhost:8000/api/equipment/{asset_id}/generate-qr
Headers:
  Authorization: Bearer YOUR_TOKEN
```

---

## Method 4: Python Script (Automated)

See `generate_missing_qr_codes.py` for a complete automated solution.

```bash
# 1. Edit the script and add your Firebase token
# 2. Run it:
python generate_missing_qr_codes.py

# Output:
# 📋 Found 274 items missing QR codes
# 🚀 Generating QR codes...
# ✅ Total queued: 274 QR codes
# ⏱️  Expected completion: 55 seconds
```

---

## 🔍 How to Get Your Firebase Auth Token

### Option A: From Browser Console
```javascript
localStorage.getItem('firebaseAuthToken')
// Copy the output
```

### Option B: From Network Tab
1. Open DevTools → Network tab
2. Make any API request in your app
3. Look at the request headers
4. Find `Authorization: Bearer <token>`
5. Copy the token part

### Option C: From Application Tab
1. Open DevTools → Application tab
2. Expand Local Storage
3. Find `firebaseAuthToken`
4. Copy the value

---

## 📊 Expected Results

After running any method above:

```
✅ Batch 1 queued: 100 QR codes
✅ Batch 2 queued: 100 QR codes
✅ Batch 3 queued: 74 QR codes
══════════════════════════════════
✅ Total queued: 274 QR codes
⏱️  Expected time: ~55 seconds
══════════════════════════════════
```

Then in backend logs:
```
INFO: Background QR generation started for CAMERA_XBWIBCjC
INFO: ✅ QR code generated successfully for CAMERA_XBWIBCjC (Sony A7III)
INFO: Background QR generation started for LENS_DlwGTC-t
INFO: ✅ QR code generated successfully for LENS_DlwGTC-t (Canon 50mm)
... (274 times)
```

---

## ✅ Verification

After QR generation completes (1-2 minutes):

1. Refresh Equipment Dashboard
2. Click on any equipment item
3. Check if `qrCodeUrl` is populated
4. QR code should be visible in details view

---

## 🐛 Troubleshooting

### Issue: "403 Forbidden"
**Solution:** Make sure you're logged in as admin and using correct token

### Issue: "404 Not Found on some assets"
**Solution:** Those assets might have been deleted. The response will tell you which ones.

### Issue: Some QR codes still missing after 5 minutes
**Solution:** Check backend logs for errors. Retry failed ones:
```bash
curl -X POST "http://localhost:8000/api/equipment/FAILED_ASSET_ID/generate-qr" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🎯 Recommended Approach

**For 274 items:** Use the **Python script** (`generate_missing_qr_codes.py`)
- ✅ Automated
- ✅ Shows progress
- ✅ Handles errors gracefully
- ✅ Can be run multiple times safely

**For quick testing:** Use **Browser Console method**
- ✅ No extra tools needed
- ✅ Visual feedback
- ✅ Works instantly

**For manual control:** Use **Postman/curl**
- ✅ Full control
- ✅ Can target specific assets
- ✅ Good for debugging
