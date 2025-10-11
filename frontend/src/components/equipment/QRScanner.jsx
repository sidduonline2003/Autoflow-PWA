/**
 * QR Code Scanner Component - FIXED VERSION
 * Aggressive fixes for black screen on all devices
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  IconButton,
  Typography,
  Alert,
  CircularProgress,
  Button,
  Paper,
  TextField
} from '@mui/material';
import {
  Close as CloseIcon,
  FlashlightOn as FlashlightOnIcon,
  FlashlightOff as FlashlightOffIcon,
  CameraAlt as CameraIcon,
  QrCode as QrCodeIcon
} from '@mui/icons-material';

// Dynamically import jsQR for fallback
let jsQR = null;

const QRScanner = ({
  onScan,
  onClose,
  scanMode = 'asset',
  title = 'Scan QR Code'
}) => {
  const [hasPermission, setHasPermission] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [detectionMethod, setDetectionMethod] = useState('barcode');
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState({});
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [scannedCode, setScannedCode] = useState('');
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const barcodeDetectorRef = useRef(null);

  useEffect(() => {
    initializeScanner();
    return () => cleanup();
  }, []);

  const initializeScanner = async () => {
    setIsInitializing(true);
    try {
      // Check for BarcodeDetector
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes('qr_code')) {
            barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ['qr_code'] });
            setDetectionMethod('barcode');
            console.log('✓ Using BarcodeDetector API');
          } else {
            await loadJsQR();
          }
        } catch {
          await loadJsQR();
        }
      } else {
        await loadJsQR();
      }

      await startCamera();
    } catch (err) {
      console.error('Scanner init error:', err);
      setError('Failed to initialize scanner');
      setHasPermission(false);
      setIsInitializing(false);
    }
  };

  const loadJsQR = async () => {
    if (!jsQR) {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
      jsQR = window.jsQR;
    }
    setDetectionMethod('jsqr');
    console.log('✓ Using jsQR fallback');
  };

  const startCamera = async () => {
    try {
      console.log('=== CAMERA START ===');
      
      // AGGRESSIVE FIX: Use very low resolution first
      const constraints = {
        video: {
          facingMode: 'environment',
          width: 640,
          height: 480
        },
        audio: false
      };

      console.log('1. Requesting camera...');
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      const track = stream.getVideoTracks()[0];
      console.log('2. Stream active:', {
        active: stream.active,
        label: track.label,
        settings: track.getSettings()
      });

      if (!videoRef.current) {
        console.error('3. ✗ Video ref not available!');
        return;
      }

      const video = videoRef.current;
      
      console.log('3. Setting up video element...');
      
      // AGGRESSIVE FIX 1: Stop any existing stream
      if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
      }
      
      // AGGRESSIVE FIX 2: Reset video completely
      video.pause();
      video.removeAttribute('src');
      video.load();
      
      // AGGRESSIVE FIX 3: Set properties BEFORE stream
      video.muted = true;
      video.defaultMuted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.controls = false;
      
      // AGGRESSIVE FIX 4: Set inline styles
      video.style.display = 'block';
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      
      // AGGRESSIVE FIX 5: Wait for reset
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log('4. Assigning stream to video...');
      video.srcObject = stream;
      
      // AGGRESSIVE FIX 6: Force immediate play (don't wait for events)
      console.log('5. Forcing immediate play...');
      
      let playAttempts = 0;
      const maxAttempts = 10;
      
      const tryPlay = async () => {
        playAttempts++;
        console.log(`   Play attempt ${playAttempts}/${maxAttempts}...`);
        
        try {
          // Force load
          video.load();
          
          // Try to play
          const playPromise = video.play();
          
          if (playPromise) {
            await playPromise;
            console.log(`6. ✓ PLAYING! Dimensions: ${video.videoWidth}x${video.videoHeight}`);
            
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              console.log('7. ✓ VIDEO RENDERING!');
              setHasPermission(true);
              setIsScanning(true);
              setIsInitializing(false);
              startScanning();
              return true;
            } else {
              console.warn('   Video playing but dimensions are 0x0, will retry...');
              throw new Error('Zero dimensions');
            }
          }
        } catch (err) {
          console.warn(`   Attempt ${playAttempts} failed:`, err.message);
          
          if (playAttempts < maxAttempts) {
            // Wait and retry
            await new Promise(resolve => setTimeout(resolve, 500));
            return tryPlay();
          } else {
            console.error('✗ All play attempts failed!');
            setError('Camera started but video not displaying. Try refreshing.');
            setIsInitializing(false);
            return false;
          }
        }
      };
      
      await tryPlay();
      
      // Update debug info
      setDebugInfo({
        stream: { active: stream.active, tracks: stream.getTracks().length },
        video: {
          width: video.videoWidth,
          height: video.videoHeight,
          readyState: video.readyState,
          paused: video.paused
        },
        track: track.getSettings()
      });
      
    } catch (err) {
      console.error('=== CAMERA ERROR ===', err);
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied'
          : `Failed to access camera: ${err.message}`
      );
      setHasPermission(false);
      setIsInitializing(false);
    }
  };

  const startScanning = () => {
    console.log('Starting scan loop...');
    
    setTimeout(() => {
      if (detectionMethod === 'barcode' && barcodeDetectorRef.current) {
        scanIntervalRef.current = setInterval(async () => {
          if (videoRef.current?.readyState === 4) {
            try {
              const barcodes = await barcodeDetectorRef.current.detect(videoRef.current);
              if (barcodes.length > 0) {
                handleScanSuccess(barcodes[0].rawValue);
              }
            } catch (err) {
              // Silent - scanning errors are common
            }
          }
        }, 100);
      } else {
        scanIntervalRef.current = setInterval(() => scanWithJsQR(), 100);
      }
    }, 500);
  };

  const scanWithJsQR = () => {
    if (!videoRef.current || !canvasRef.current || !jsQR) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.readyState !== 4) return;
    
    try {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      
      if (code) {
        handleScanSuccess(code.data);
      }
    } catch (err) {
      // Silent
    }
  };

  const handleScanSuccess = (data) => {
    console.log('✓ QR Code scanned:', data);
    
    // Stop scanning immediately
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    setIsScanning(false);
    setScannedCode(data);
    setShowSuccessAnimation(true);
    
    // Vibrate if available
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]); // Double vibration
    }
    
    // Wait for animation to complete before calling onScan
    setTimeout(() => {
      cleanup();
      onScan(data);
    }, 1500); // Animation duration
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    
    try {
      const track = streamRef.current.getVideoTracks()[0];
      const capabilities = track.getCapabilities();
      
      if (capabilities.torch) {
        await track.applyConstraints({
          advanced: [{ torch: !torchEnabled }]
        });
        setTorchEnabled(!torchEnabled);
      }
    } catch (err) {
      console.error('Torch error:', err);
    }
  };

  const handleManualSubmit = () => {
    if (manualCode.trim()) {
      cleanup();
      onScan(manualCode.trim());
    }
  };

  const getExpectedFormat = () => {
    switch (scanMode) {
      case 'asset':
        return 'ASSET-XXXXX';
      case 'location':
        return 'LOC-XXXXX';
      default:
        return 'QR Code';
    }
  };

  const cleanup = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'black',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 2,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          zIndex: 2
        }}
      >
        <Typography variant="h6">{title}</Typography>
        <Box>
          <IconButton onClick={toggleTorch} sx={{ color: 'white', mr: 1 }}>
            {torchEnabled ? <FlashlightOnIcon /> : <FlashlightOffIcon />}
          </IconButton>
          <IconButton onClick={onClose} sx={{ color: 'white' }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Camera View */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Video */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            backgroundColor: '#000'
          }}
        />
        
        {/* Canvas for jsQR */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Loading */}
        {isInitializing && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 1
            }}
          >
            <CircularProgress size={60} sx={{ color: 'white', mb: 2 }} />
            <Typography sx={{ color: 'white' }}>Starting camera...</Typography>
            <Typography sx={{ color: '#888', fontSize: '0.8rem', mt: 1 }}>
              This may take up to 10 seconds
            </Typography>
          </Box>
        )}

        {/* Scanning overlay */}
        {hasPermission && !isInitializing && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '80%',
              maxWidth: 400,
              aspectRatio: '1',
              border: '4px solid #4CAF50',
              borderRadius: 2,
              pointerEvents: 'none',
              zIndex: 1
            }}
          >
            {isScanning && (
              <Box
                sx={{
                  width: '100%',
                  height: 4,
                  backgroundColor: '#4CAF50',
                  animation: 'scan 2s linear infinite',
                  '@keyframes scan': {
                    '0%': { transform: 'translateY(-200px)' },
                    '100%': { transform: 'translateY(200px)' }
                  }
                }}
              />
            )}
          </Box>
        )}

        {/* Instructions */}
        {hasPermission && !isInitializing && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 20,
              left: 0,
              right: 0,
              textAlign: 'center',
              color: 'white',
              zIndex: 1,
              px: 2
            }}
          >
            <Typography variant="body1" sx={{ mb: 1 }}>
              Position QR code within frame
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.7, display: 'block', mb: 2 }}>
              Expected: {getExpectedFormat()}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setManualEntry(true)}
              sx={{ color: 'white', borderColor: 'white', mr: 1 }}
            >
              Enter Manually
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setShowDebug(!showDebug)}
              sx={{ color: 'white', borderColor: 'white' }}
            >
              {showDebug ? 'Hide' : 'Show'} Debug
            </Button>
          </Box>
        )}

        {/* Debug Panel */}
        {showDebug && (
          <Box
            sx={{
              position: 'absolute',
              top: 80,
              left: 10,
              right: 10,
              backgroundColor: 'rgba(0, 0, 0, 0.9)',
              color: 'lime',
              p: 2,
              borderRadius: 1,
              fontSize: '0.7rem',
              fontFamily: 'monospace',
              maxHeight: '40vh',
              overflow: 'auto',
              zIndex: 2
            }}
          >
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {JSON.stringify({
                video: videoRef.current ? {
                  width: videoRef.current.videoWidth,
                  height: videoRef.current.videoHeight,
                  readyState: videoRef.current.readyState,
                  paused: videoRef.current.paused
                } : null,
                ...debugInfo
              }, null, 2)}
            </pre>
          </Box>
        )}

        {/* Success Animation */}
        {showSuccessAnimation && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.95)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 9999,
              animation: 'fadeIn 0.3s ease-in'
            }}
          >
            {/* Expanding circles animation (WiFi style) */}
            <Box
              sx={{
                position: 'relative',
                width: 200,
                height: 200,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center'
              }}
            >
              {/* Circle 1 */}
              <Box
                sx={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  border: '4px solid #4CAF50',
                  opacity: 0,
                  animation: 'expandCircle 1.5s ease-out forwards'
                }}
              />
              {/* Circle 2 */}
              <Box
                sx={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  border: '4px solid #4CAF50',
                  opacity: 0,
                  animation: 'expandCircle 1.5s ease-out 0.2s forwards'
                }}
              />
              {/* Circle 3 */}
              <Box
                sx={{
                  position: 'absolute',
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  border: '4px solid #4CAF50',
                  opacity: 0,
                  animation: 'expandCircle 1.5s ease-out 0.4s forwards'
                }}
              />
              
              {/* QR Code Icon in center */}
              <Box
                sx={{
                  width: 100,
                  height: 100,
                  borderRadius: 2,
                  backgroundColor: 'white',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  boxShadow: '0 8px 32px rgba(76, 175, 80, 0.4)',
                  animation: 'scaleIn 0.3s ease-out forwards',
                  zIndex: 1
                }}
              >
                <QrCodeIcon sx={{ fontSize: 60, color: '#4CAF50' }} />
              </Box>
            </Box>

            {/* Success message */}
            <Box
              sx={{
                mt: 4,
                textAlign: 'center',
                animation: 'slideUp 0.5s ease-out 0.3s forwards',
                opacity: 0
              }}
            >
              <Typography
                variant="h5"
                sx={{
                  color: '#4CAF50',
                  fontWeight: 'bold',
                  mb: 1
                }}
              >
                ✓ Scanned Successfully!
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  color: 'white',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem'
                }}
              >
                {scannedCode}
              </Typography>
            </Box>

            {/* CSS Keyframes */}
            <style>
              {`
                @keyframes fadeIn {
                  from { opacity: 0; }
                  to { opacity: 1; }
                }
                
                @keyframes expandCircle {
                  0% {
                    transform: scale(0.5);
                    opacity: 1;
                  }
                  100% {
                    transform: scale(3);
                    opacity: 0;
                  }
                }
                
                @keyframes scaleIn {
                  from {
                    transform: scale(0) rotate(-180deg);
                    opacity: 0;
                  }
                  to {
                    transform: scale(1) rotate(0deg);
                    opacity: 1;
                  }
                }
                
                @keyframes slideUp {
                  from {
                    transform: translateY(20px);
                    opacity: 0;
                  }
                  to {
                    transform: translateY(0);
                    opacity: 1;
                  }
                }
              `}
            </style>
          </Box>
        )}

        {/* Permission Denied */}
        {hasPermission === false && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90%',
              maxWidth: 400
            }}
          >
            <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
              <CameraIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Camera Access Required
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                {error || 'Please allow camera access'}
              </Typography>
              <Button
                fullWidth
                variant="contained"
                onClick={() => window.location.reload()}
                sx={{ mb: 1 }}
              >
                Retry
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => setManualEntry(true)}
              >
                Enter Code Manually
              </Button>
            </Paper>
          </Box>
        )}

        {/* Manual Entry */}
        {manualEntry && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90%',
              maxWidth: 400
            }}
          >
            <Paper elevation={3} sx={{ p: 4, textAlign: 'center' }}>
              <QrCodeIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                Enter Code Manually
              </Typography>
              <TextField
                fullWidth
                label={`${scanMode === 'asset' ? 'Asset' : 'Location'} Code`}
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder={getExpectedFormat()}
                sx={{ mb: 2 }}
                autoFocus
              />
              <Button
                fullWidth
                variant="contained"
                onClick={handleManualSubmit}
                disabled={!manualCode.trim()}
                sx={{ mb: 1 }}
              >
                Submit
              </Button>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => {
                  setManualEntry(false);
                  if (hasPermission === false) {
                    startCamera();
                  }
                }}
              >
                Use Camera Instead
              </Button>
            </Paper>
          </Box>
        )}
      </Box>

      {/* Error Alert */}
      {error && hasPermission !== false && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '90%',
            maxWidth: 500,
            zIndex: 2
          }}
        >
          {error}
        </Alert>
      )}
    </Box>
  );
};

export default QRScanner;
