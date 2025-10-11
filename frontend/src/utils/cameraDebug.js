/**
 * Camera Debug Utility
 * 
 * Use this to diagnose camera issues, especially with port forwarding
 * 
 * Usage in browser console:
 * import { debugCamera } from './utils/cameraDebug';
 * await debugCamera();
 */

export async function debugCamera() {
  console.log('=== Camera Debug Info ===');
  
  // 1. Check if APIs are available
  console.log('Navigator available:', typeof navigator !== 'undefined');
  console.log('getUserMedia available:', !!navigator?.mediaDevices?.getUserMedia);
  console.log('BarcodeDetector available:', 'BarcodeDetector' in window);
  
  // 2. List available devices
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === 'videoinput');
    console.log('Video devices found:', videoDevices.length);
    videoDevices.forEach((device, idx) => {
      console.log(`  Device ${idx + 1}:`, {
        label: device.label || 'Unknown',
        deviceId: device.deviceId,
        groupId: device.groupId
      });
    });
  } catch (err) {
    console.error('Failed to enumerate devices:', err);
  }
  
  // 3. Test camera access with different constraints
  const testConstraints = [
    {
      name: 'Environment (rear) camera',
      constraints: {
        video: { facingMode: 'environment' },
        audio: false
      }
    },
    {
      name: 'Any camera',
      constraints: {
        video: true,
        audio: false
      }
    },
    {
      name: 'Low resolution',
      constraints: {
        video: { width: 640, height: 480 },
        audio: false
      }
    }
  ];
  
  for (const test of testConstraints) {
    console.log(`\nTesting: ${test.name}`);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(test.constraints);
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const capabilities = track.getCapabilities();
      
      console.log('✅ Success!', {
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        settings: {
          width: settings.width,
          height: settings.height,
          aspectRatio: settings.aspectRatio,
          frameRate: settings.frameRate,
          facingMode: settings.facingMode
        },
        capabilities: {
          width: capabilities.width,
          height: capabilities.height,
          torch: !!capabilities.torch
        }
      });
      
      // Clean up
      stream.getTracks().forEach(track => track.stop());
    } catch (err) {
      console.error('❌ Failed:', err.name, err.message);
    }
  }
  
  // 4. Test video element
  console.log('\n=== Testing Video Element ===');
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  
  console.log('Video properties:', {
    autoplay: video.autoplay,
    muted: video.muted,
    playsInline: video.playsInline,
    paused: video.paused,
    readyState: video.readyState
  });
  
  // 5. Check for port forwarding indicators
  console.log('\n=== Environment Info ===');
  console.log('User Agent:', navigator.userAgent);
  console.log('Protocol:', window.location.protocol);
  console.log('Hostname:', window.location.hostname);
  console.log('Port:', window.location.port);
  console.log('Is HTTPS:', window.isSecureContext);
  console.log('Is localhost:', window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  
  // 6. Check permissions
  try {
    const result = await navigator.permissions.query({ name: 'camera' });
    console.log('\nCamera permission:', result.state);
  } catch (err) {
    console.log('Cannot query camera permission:', err.message);
  }
  
  console.log('\n=== Debug Complete ===');
}

/**
 * Simple camera test - creates a video element and tries to display stream
 */
export async function testCameraDisplay(containerId = 'camera-test') {
  console.log('Starting camera display test...');
  
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    container.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 80%;
      max-width: 500px;
      background: black;
      border: 2px solid red;
      z-index: 99999;
      padding: 20px;
    `;
    document.body.appendChild(container);
  }
  
  container.innerHTML = `
    <div style="color: white; margin-bottom: 10px;">
      Camera Test - Check if you see video feed below:
    </div>
    <video 
      id="test-video"
      autoplay
      playsinline
      muted
      style="width: 100%; background: #333;"
    ></video>
    <div id="test-status" style="color: white; margin-top: 10px;">
      Initializing...
    </div>
    <button onclick="this.parentElement.remove()" style="margin-top: 10px;">
      Close Test
    </button>
  `;
  
  const video = document.getElementById('test-video');
  const status = document.getElementById('test-status');
  
  try {
    status.textContent = 'Requesting camera access...';
    
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    
    status.textContent = 'Stream obtained, setting up video...';
    console.log('Stream active:', stream.active);
    console.log('Tracks:', stream.getTracks().map(t => ({
      kind: t.kind,
      label: t.label,
      enabled: t.enabled,
      readyState: t.readyState
    })));
    
    video.srcObject = stream;
    
    video.onloadedmetadata = () => {
      console.log('Metadata loaded');
      status.textContent = 'Metadata loaded, attempting to play...';
      
      video.play()
        .then(() => {
          console.log('Video playing!');
          status.textContent = `✅ SUCCESS! Video playing (${video.videoWidth}x${video.videoHeight})`;
          status.style.color = 'lime';
        })
        .catch(err => {
          console.error('Play failed:', err);
          status.textContent = `❌ Play failed: ${err.message}`;
          status.style.color = 'red';
        });
    };
    
    video.onerror = (err) => {
      console.error('Video error:', err);
      status.textContent = `❌ Video error: ${err}`;
      status.style.color = 'red';
    };
    
    // Force play after delay
    setTimeout(() => {
      if (video.paused) {
        console.log('Forcing play...');
        video.play().catch(err => console.error('Force play failed:', err));
      }
    }, 500);
    
  } catch (err) {
    console.error('Camera test failed:', err);
    status.textContent = `❌ Failed: ${err.name} - ${err.message}`;
    status.style.color = 'red';
  }
}

// Auto-run debug on import in development
if (process.env.NODE_ENV === 'development' && window.location.search.includes('debug-camera')) {
  console.log('Camera debug mode enabled. Run testCameraDisplay() or debugCamera()');
  window.debugCamera = debugCamera;
  window.testCameraDisplay = testCameraDisplay;
}
