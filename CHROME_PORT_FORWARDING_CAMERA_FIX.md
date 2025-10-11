# Chrome Port Forwarding Camera Black Screen Fix

## 🔍 Issue: Black Screen with Chrome Port Forwarding

When using Chrome DevTools with USB debugging and port forwarding, the camera shows a **black screen** even though:
- Camera permission is granted ✅
- Stream is active ✅
- Video element receives stream ✅
- But video feed doesn't display ❌

---

## 🎯 Root Causes for Port Forwarding

### 1. **Video Resolution Too High**
Chrome on mobile with port forwarding has trouble with high resolutions:
```javascript
// ❌ BAD - May cause black screen
{ video: { width: 1920, height: 1080 } }

// ✅ GOOD - Works reliably
{ video: { width: 1280, height: 720 } }
```

### 2. **Missing Video Properties**
Port forwarding requires explicit property setting:
```javascript
// Both attributes AND properties needed
videoRef.current.setAttribute('muted', 'true');
videoRef.current.muted = true; // Also set property!
```

### 3. **Stream Not Fully Ready**
Video dimensions might be 0x0 initially:
```javascript
// Wait for proper dimensions
console.log('Dimensions:', video.videoWidth, video.videoHeight);
// Should be > 0 when working
```

### 4. **Play Promise Not Properly Handled**
Port forwarding adds latency:
```javascript
// Need multiple event handlers
video.onloadedmetadata = () => { /* ... */ };
video.oncanplay = () => { /* ... */ };

// Plus fallback timeout
setTimeout(() => video.play(), 1000);
```

---

## ✅ Applied Fixes

### Fix 1: Lower Resolution Constraints
```javascript
const constraints = {
  video: {
    facingMode: 'environment',
    width: { ideal: 1280 },  // Lowered from 1920
    height: { ideal: 720 }   // Lowered from 1080
  },
  audio: false
};
```

### Fix 2: Enhanced Logging
```javascript
console.log('Requesting camera with constraints:', constraints);
console.log('Camera stream obtained:', {
  active: stream.active,
  tracks: stream.getVideoTracks().length,
  settings: stream.getVideoTracks()[0]?.getSettings()
});
console.log('Video dimensions:', {
  videoWidth: videoRef.current.videoWidth,
  videoHeight: videoRef.current.videoHeight,
  readyState: videoRef.current.readyState
});
```

### Fix 3: Clear Video State
```javascript
// Clear any existing source
videoRef.current.srcObject = null;

// Wait a frame for clean state
await new Promise(resolve => requestAnimationFrame(resolve));

// Now set the stream
videoRef.current.srcObject = stream;
```

### Fix 4: Set Both Attributes AND Properties
```javascript
videoRef.current.setAttribute('playsinline', 'true');
videoRef.current.setAttribute('autoplay', 'true');
videoRef.current.setAttribute('muted', 'true');

// ALSO set as properties
videoRef.current.muted = true;
videoRef.current.playsInline = true;
videoRef.current.autoplay = true;
```

### Fix 5: Multiple Event Handlers
```javascript
videoRef.current.onloadedmetadata = () => {
  console.log('Metadata loaded');
};

videoRef.current.oncanplay = async () => {
  console.log('Video can play, attempting to start...');
  await videoRef.current.play();
  console.log('Video dimensions:', {
    videoWidth: videoRef.current.videoWidth,
    videoHeight: videoRef.current.videoHeight
  });
};

// Fallback timeout
setTimeout(() => {
  if (videoRef.current?.paused) {
    console.log('Forcing video play...');
    videoRef.current.play();
  }
}, 1000);
```

### Fix 6: Background Color Indicator
```javascript
<video
  style={{
    backgroundColor: '#000'  // Shows black if video not rendering
  }}
/>
```

---

## 🛠️ Debugging Steps

### Step 1: Check Console Logs
Open Chrome DevTools and look for these logs:
```
✅ "Requesting camera with constraints: ..."
✅ "Camera stream obtained: { active: true, tracks: 1, ... }"
✅ "Video element configured, waiting for metadata..."
✅ "Metadata loaded"
✅ "Video can play, attempting to start..."
✅ "Video playing successfully"
✅ "Video dimensions: { videoWidth: 1280, videoHeight: 720 }"
```

### Step 2: Run Debug Utility
```javascript
// In browser console
import { debugCamera, testCameraDisplay } from '/src/utils/cameraDebug.js';

// Full diagnostic
await debugCamera();

// Visual test
testCameraDisplay();
```

Or add to URL:
```
http://localhost:3000/equipment/checkin?debug-camera=true
```

### Step 3: Check Video Dimensions
```javascript
// In console while on scanner page
const video = document.querySelector('video');
console.log({
  videoWidth: video.videoWidth,
  videoHeight: video.videoHeight,
  readyState: video.readyState,
  paused: video.paused,
  muted: video.muted,
  srcObject: video.srcObject,
  tracks: video.srcObject?.getTracks().map(t => ({
    kind: t.kind,
    enabled: t.enabled,
    readyState: t.readyState
  }))
});
```

**Expected output:**
```javascript
{
  videoWidth: 1280,      // Should be > 0
  videoHeight: 720,      // Should be > 0
  readyState: 4,         // HAVE_ENOUGH_DATA
  paused: false,         // Should be playing
  muted: true,
  srcObject: MediaStream,
  tracks: [{
    kind: "video",
    enabled: true,
    readyState: "live"
  }]
}
```

**If videoWidth/videoHeight are 0**, the stream is active but not rendering!

---

## 🔧 Chrome Port Forwarding Setup

### Correct Setup:
1. **Enable USB Debugging** on Android:
   - Settings → About Phone → Tap Build Number 7 times
   - Settings → Developer Options → USB Debugging ✅

2. **Connect via USB** to computer

3. **Chrome DevTools**:
   - Open `chrome://inspect#devices`
   - Check "Discover USB devices"
   - See your device listed

4. **Port Forwarding**:
   - Click "Port forwarding..." button
   - Add rule: `3000` → `localhost:3000`
   - Check "Enable port forwarding" ✅

5. **Access on Phone**:
   - Open Chrome on phone
   - Navigate to: `localhost:3000`
   - **NOT**: `http://192.168.x.x:3000` (won't work!)

6. **Important**:
   - Use `localhost:3000` on phone (through port forwarding)
   - This counts as "secure context" for camera access
   - Direct IP access may not work

---

## 🐛 Common Issues

### Issue 1: "Video dimensions are 0x0"
**Symptoms**: Stream active, but video shows black
**Cause**: Video element not properly initialized
**Fix**: 
```javascript
// Wait for oncanplay event, not just onloadedmetadata
video.oncanplay = () => {
  console.log('Dimensions:', video.videoWidth, video.videoHeight);
  // Should be > 0 here
};
```

### Issue 2: "NotReadableError"
**Symptoms**: Camera in use error
**Cause**: Another app/tab using camera
**Fix**: 
- Close other camera apps
- Close other tabs using camera
- Restart Chrome

### Issue 3: "Black screen but no errors"
**Symptoms**: Everything looks good in console, but black screen
**Cause**: Video constraints too high for port forwarding
**Fix**:
```javascript
// Try lowest resolution first
{ video: { width: 640, height: 480 } }
```

### Issue 4: "Works on WiFi but not port forwarding"
**Symptoms**: Camera works with IP access, black with port forwarding
**Cause**: Port forwarding adds latency
**Fix**:
- Increase timeout delays
- Add more event handlers
- Lower resolution

---

## 📊 Comparison: WiFi vs Port Forwarding

| Aspect | WiFi (IP Access) | Port Forwarding |
|--------|------------------|-----------------|
| Latency | Low (10-50ms) | Medium (50-200ms) |
| Camera init | Fast (1-2s) | Slower (2-5s) |
| Max resolution | 1920x1080 ✅ | 1280x720 ⚠️ |
| Stability | High | Medium |
| Setup | Network required | USB required |

---

## 🎯 Testing Checklist

### Before Testing:
- [ ] USB debugging enabled on phone
- [ ] Port forwarding configured in Chrome
- [ ] Accessing via `localhost:3000` (not IP)
- [ ] Camera permission granted
- [ ] No other apps using camera

### Test with Debug Mode:
1. Open: `localhost:3000/equipment/checkin?debug-camera=true`
2. Open Chrome DevTools → Console
3. Run: `testCameraDisplay()`
4. Should see video feed in overlay
5. Check console for errors

### Expected Console Output:
```
Requesting camera with constraints: { video: {...} }
Camera stream obtained: { active: true, ... }
Video element configured, waiting for metadata...
Metadata loaded
Video can play, attempting to start...
Video playing successfully
Video dimensions: { videoWidth: 1280, videoHeight: 720, readyState: 4 }
```

### If Still Black Screen:
1. Check video dimensions in console
2. Try lower resolution (640x480)
3. Try WiFi/IP access instead
4. Check for hardware acceleration issues:
   - Chrome → Settings → System → Hardware acceleration

---

## 💡 Quick Fixes to Try

### Fix A: Force Lowest Resolution
```javascript
const constraints = {
  video: {
    width: { exact: 640 },
    height: { exact: 480 }
  }
};
```

### Fix B: Add Video Inspector
```javascript
// Add to QRScanner component
useEffect(() => {
  const interval = setInterval(() => {
    if (videoRef.current) {
      console.log('Video check:', {
        w: videoRef.current.videoWidth,
        h: videoRef.current.videoHeight,
        paused: videoRef.current.paused,
        readyState: videoRef.current.readyState
      });
    }
  }, 1000);
  return () => clearInterval(interval);
}, []);
```

### Fix C: Force WiFi Access
Instead of port forwarding, use WiFi:
```bash
# On development machine
# Get your local IP
ifconfig | grep "inet "

# Should show something like: 192.168.1.100
# On phone, access: http://192.168.1.100:3000
```

---

## 📱 Alternative: Use WiFi Instead

If port forwarding continues to have issues:

1. **Connect both devices to same WiFi**
2. **Find your computer's IP**:
   ```bash
   # macOS/Linux
   ifconfig | grep "inet "
   
   # Or
   ipconfig getifaddr en0
   ```

3. **On phone, access**:
   ```
   http://192.168.1.100:3000  # Replace with your IP
   ```

4. **Update .env** for network access:
   ```env
   REACT_APP_API_URL=http://192.168.1.100:8000
   ```

5. **Restart dev server** with network binding:
   ```bash
   npm start -- --host 0.0.0.0
   ```

---

## 🔍 Final Diagnosis Command

Run this in browser console to get full diagnostic:

```javascript
(async () => {
  const video = document.querySelector('video');
  const stream = video?.srcObject;
  
  console.log('=== CAMERA DIAGNOSTIC ===');
  console.log('Video element:', {
    exists: !!video,
    videoWidth: video?.videoWidth,
    videoHeight: video?.videoHeight,
    readyState: video?.readyState,
    paused: video?.paused,
    muted: video?.muted,
    autoplay: video?.autoplay,
    playsInline: video?.playsInline,
    srcObject: !!video?.srcObject
  });
  
  console.log('Stream:', {
    exists: !!stream,
    active: stream?.active,
    id: stream?.id,
    tracks: stream?.getTracks().map(t => ({
      kind: t.kind,
      label: t.label,
      enabled: t.enabled,
      muted: t.muted,
      readyState: t.readyState,
      settings: t.getSettings(),
      constraints: t.getConstraints()
    }))
  });
  
  console.log('Environment:', {
    protocol: location.protocol,
    hostname: location.hostname,
    port: location.port,
    isSecure: window.isSecureContext,
    userAgent: navigator.userAgent
  });
})();
```

Copy output and share if issue persists!

---

## ✅ Success Criteria

Camera working correctly when:
- ✅ Console shows "Video playing successfully"
- ✅ `videoWidth` and `videoHeight` are > 0
- ✅ `readyState` is 4 (HAVE_ENOUGH_DATA)
- ✅ Video feed visible (not black)
- ✅ QR codes scan successfully
- ✅ No console errors

---

**Need more help?** Run the debug utility and share the console output!
