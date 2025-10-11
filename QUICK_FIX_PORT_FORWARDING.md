# 🚨 URGENT: Chrome Port Forwarding Black Screen - Quick Fix

## ⚡ Try These NOW (In Order)

### 1️⃣ FIRST: Check What You See
Open the QR scanner and click **"Show Debug Info"** button at bottom.

**Look for these values:**
```json
{
  "video": {
    "width": ???,    // ← Should be > 0
    "height": ???,   // ← Should be > 0
    "readyState": 4  // ← Should be 4
  }
}
```

---

### 2️⃣ If width/height are 0:

**Problem**: Video stream not rendering
**Quick Fix**: Refresh page and wait 5 seconds

---

### 3️⃣ If readyState < 4:

**Problem**: Video not ready
**Quick Fix**: Wait longer (up to 10 seconds)

---

### 4️⃣ If still black after 10 seconds:

**Try Lower Resolution**:
1. Open: `/frontend/src/components/equipment/QRScanner.jsx`
2. Find line ~126: `width: { ideal: 1280 }`
3. Change to: `width: { ideal: 640 }`
4. Change line ~127: `height: { ideal: 720 }` → `height: { ideal: 480 }`
5. Save and refresh

---

### 5️⃣ Still black? Check Console

Press **F12** → Console tab
Look for:
- ✅ "Video playing successfully" → Good!
- ❌ "Video play error" → Problem!
- ❌ "NotReadableError" → Camera in use by another app

---

### 6️⃣ If "NotReadableError":

**Close these**:
- Other Chrome tabs with camera
- Other apps using camera
- Instagram, Snapchat, etc.

**Then restart Chrome**

---

### 7️⃣ Nuclear Option: Use WiFi Instead

**Stop using port forwarding, use WiFi:**

1. **Get your computer's IP**:
   ```bash
   ipconfig getifaddr en0
   # Example output: 192.168.1.100
   ```

2. **Start server with network access**:
   ```bash
   cd frontend
   REACT_APP_API_URL=http://192.168.1.100:8000 npm start
   ```

3. **On your phone**, open Chrome and go to:
   ```
   http://192.168.1.100:3000/equipment/checkin
   ```
   (Replace with your actual IP)

---

## 📊 Quick Diagnostic

**Run in browser console (F12):**
```javascript
const v = document.querySelector('video');
console.log({
  dimensions: `${v.videoWidth}x${v.videoHeight}`,
  state: v.readyState,
  playing: !v.paused,
  stream: v.srcObject?.active
});
```

**Expected output:**
```javascript
{
  dimensions: "1280x720",  // ← NOT "0x0"
  state: 4,                // ← NOT 0, 1, 2, or 3
  playing: true,           // ← NOT false
  stream: true             // ← NOT false
}
```

---

## 🔧 Most Common Fixes

| Issue | Fix |
|-------|-----|
| Black screen, no errors | Lower resolution (640x480) |
| "NotReadableError" | Close other camera apps |
| "NotAllowedError" | Enable camera in Settings |
| Works on WiFi, not port | Use WiFi instead |
| Dimensions are 0x0 | Wait longer (10s), then refresh |

---

## 💡 What You Changed

The latest fixes added:
1. ✅ Lower default resolution (1280x720 instead of 1920x1080)
2. ✅ Enhanced logging for debugging
3. ✅ Multiple event handlers for reliability
4. ✅ Debug info panel in UI
5. ✅ Fallback timeout to force play
6. ✅ Clear video state before starting

---

## 🎯 Next Steps

1. **Try the scanner NOW**
2. **Click "Show Debug Info"**
3. **Take screenshot of debug info**
4. **Share if still not working**

---

## ⚠️ Important Notes

- **Port forwarding**: `localhost:3000` on phone
- **WiFi access**: `192.168.x.x:3000` on phone
- **HTTPS required**: Both count as "secure"
- **Camera permission**: Must be granted
- **No other apps**: Using camera at same time

---

## 🆘 Emergency Contact

If nothing works, tell me:
1. What do you see in Debug Info?
2. Any errors in console?
3. Android or iOS?
4. Chrome version?

**Copy this command output:**
```javascript
// Run in console
navigator.mediaDevices.enumerateDevices()
  .then(devices => console.log(
    devices.filter(d => d.kind === 'videoinput')
  ));
```
