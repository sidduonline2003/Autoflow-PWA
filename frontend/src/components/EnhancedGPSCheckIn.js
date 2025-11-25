import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    Chip,
    Alert,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Paper,
    Grid,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    LocationOn as LocationOnIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Schedule as ScheduleIcon,
    ExitToApp as ExitToAppIcon,
    Navigation as NavigationIcon,
    Refresh as RefreshIcon,
    MyLocation as MyLocationIcon
} from '@mui/icons-material';
import { auth } from '../firebase';
import toast from 'react-hot-toast';

// Ola Maps API configuration
const OLA_MAPS_API_KEY = process.env.REACT_APP_OLA_MAPS_API_KEY || 'your_ola_maps_api_key';
const OLA_MAPS_BASE_URL = 'https://api.olamaps.io/places/v1';

const EnhancedGPSCheckIn = ({ event, onStatusUpdate, showMap = true }) => {
    const [attendanceStatus, setAttendanceStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [venueLocation, setVenueLocation] = useState(null);
    const [locationError, setLocationError] = useState('');
    const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
    const [checkOutNotes, setCheckOutNotes] = useState('');
    const [distanceDetails, setDistanceDetails] = useState(null);
    const [permissionStatus, setPermissionStatus] = useState('prompt');
    const [showManualLocation, setShowManualLocation] = useState(false);
    const [manualLatitude, setManualLatitude] = useState('');
    const [manualLongitude, setManualLongitude] = useState('');
    const [showDebugInfo, setShowDebugInfo] = useState(false);
    const [checkInAttempted, setCheckInAttempted] = useState(false);

    // Refs to prevent memory leaks and race conditions
    const isMounted = useRef(true);

    useEffect(() => {
        return () => {
            isMounted.current = false;
        };
    }, []);

    const parseVenueCoordinates = useCallback((venue) => {
        if (!venue) return null;
        try {
            if (venue.includes('(') && venue.includes(')')) {
                const coordsPart = venue.split('(')[1].split(')')[0];
                if (coordsPart.includes(',')) {
                    const [lat, lng] = coordsPart.split(',').map(Number);
                    return [lat, lng];
                }
            }
        } catch (error) {
            console.error('Error parsing venue coordinates:', error);
        }
        return null;
    }, []);

    const checkGeolocationSupport = useCallback(async () => {
        if (!navigator.geolocation) {
            throw new Error('Geolocation is not supported by this browser');
        }
        // We don't query permissions here to avoid any potential triggers on some browsers
        // until the user actually initiates the action.
    }, []);

    // Helper math: distance (meters) using Haversine
    const calculateDistance = useCallback((lat1, lon1, lat2, lon2) => {
        const toRad = (deg) => (deg * Math.PI) / 180;
        const R = 6371000; // meters
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }, []);

    // Helper: cardinal direction from bearing
    const calculateDirection = useCallback((lat1, lon1, lat2, lon2) => {
        const toRad = (deg) => (deg * Math.PI) / 180;
        const toDeg = (rad) => (rad * 180) / Math.PI;
        const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
        const x =
            Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
        let brng = toDeg(Math.atan2(y, x));
        brng = (brng + 360) % 360;
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const idx = Math.round(brng / 45) % 8;
        return dirs[idx];
    }, []);

    // Helper: timeout wrapper for promises
    const withTimeout = useCallback((promise, ms, label = 'operation') => {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
            promise.then(v => { clearTimeout(t); resolve(v); })
                   .catch(e => { clearTimeout(t); reject(e); });
        });
    }, []);

    // Get current GPS location with timeout and state updates
    // THIS IS ONLY CALLED ON USER ACTION
    const getCurrentLocation = useCallback(async () => {
        setLocationLoading(true);
        setLocationError('');
        
        try {
            await checkGeolocationSupport();
            
            const pos = await withTimeout(new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    (position) => resolve(position),
                    (err) => reject(err),
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                );
            }), 12000, 'Location request');

            if (!isMounted.current) return;

            const { latitude, longitude, accuracy } = pos.coords;
            const loc = {
                latitude,
                longitude,
                accuracy: accuracy ?? 50,
                timestamp: new Date(),
                method: 'gps'
            };
            setCurrentLocation(loc);

            if (venueLocation) {
                const dist = calculateDistance(latitude, longitude, venueLocation.lat, venueLocation.lng);
                setDistanceDetails({
                    distance: Math.round(dist),
                    isWithinRange: dist <= 100,
                    direction: calculateDirection(latitude, longitude, venueLocation.lat, venueLocation.lng)
                });
            }

            return loc;
        } catch (err) {
            if (!isMounted.current) return;
            
            let message = 'Failed to get current location';
            if (err.code === 1) { // PERMISSION_DENIED
                setPermissionStatus('denied');
                message = 'Location permission denied. Please allow access to check in.';
            } else if (err.code === 2) { // POSITION_UNAVAILABLE
                message = 'Location unavailable. Please try moving to an open area.';
            } else if (err.code === 3) { // TIMEOUT
                message = 'Location request timed out. Please try again.';
            } else if (err.message) {
                message = err.message;
            }
            
            setLocationError(message);
            throw new Error(message);
        } finally {
            if (isMounted.current) {
                setLocationLoading(false);
            }
        }
    }, [checkGeolocationSupport, withTimeout, venueLocation, calculateDistance, calculateDirection]);

    // Try IP-based location as a fallback
    const tryIPBasedLocation = useCallback(async () => {
        const resp = await withTimeout(fetch('https://ipapi.co/json/'), 6000, 'IP Location');
        const data = await resp.json();
        const latitude = data.latitude ?? data.lat;
        const longitude = data.longitude ?? data.lon;
        if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            throw new Error('IP-based location unavailable');
        }
        return {
            latitude,
            longitude,
            city: data.city,
            country: data.country_name || data.country
        };
    }, [withTimeout]);

    // Helper: get a safe location (GPS first, then IP fallback)
    const getSafeLocation = useCallback(async () => {
        try {
            // Always try high-accuracy GPS first
            return await getCurrentLocation();
        } catch (e) {
            console.warn("GPS failed, trying IP fallback:", e);
            // Fallback to IP location if GPS fails
            try {
                const ip = await tryIPBasedLocation();
                const loc = {
                    latitude: ip.latitude,
                    longitude: ip.longitude,
                    accuracy: 2000, // High uncertainty for IP
                    timestamp: new Date(),
                    method: 'ip-location'
                };
                if (isMounted.current) setCurrentLocation(loc);
                return loc;
            } catch (e2) {
                throw e; // Throw original GPS error if fallback also fails
            }
        }
    }, [getCurrentLocation, tryIPBasedLocation]);

    // OPTIMIZED: Fetch attendance status only when event ID changes
    useEffect(() => {
        if (!event?.id) return;

        const fetchStatus = async () => {
            try {
                const idToken = await auth.currentUser.getIdToken();
                const response = await fetch(`/api/attendance/event/${event.id}/status`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });

                if (response.ok && isMounted.current) {
                    const data = await response.json();
                    setAttendanceStatus(data);
                    if (onStatusUpdate) onStatusUpdate(data);
                }
            } catch (error) {
                console.error('Error fetching attendance status:', error);
            }
        };

        fetchStatus();
    }, [event?.id, onStatusUpdate]); // Only re-run if ID changes, not the whole event object

    // OPTIMIZED: Load venue coordinates only when venue string changes
    useEffect(() => {
        if (!event?.venue) return;

        const loadVenue = async () => {
            try {
                // 1. Try parsing from string
                const coords = parseVenueCoordinates(event.venue);
                if (coords && isMounted.current) {
                    setVenueLocation({ lat: coords[0], lng: coords[1] });
                    return;
                }

                // 2. Try Geocoding API
                // Using a simple mock fallback if API key is placeholder to prevent 401 errors in dev
                if (OLA_MAPS_API_KEY === 'your_ola_maps_api_key') {
                    // Default to Hyderabad for development testing if no key
                    if (isMounted.current) setVenueLocation({ lat: 17.4065, lng: 78.4772 }); 
                    return;
                }

                const response = await fetch(
                    `${OLA_MAPS_BASE_URL}/geocode?address=${encodeURIComponent(event.venue)}&api_key=${OLA_MAPS_API_KEY}`
                );

                if (response.ok && isMounted.current) {
                    const data = await response.json();
                    if (data.geocodingResults && data.geocodingResults.length > 0) {
                        const location = data.geocodingResults[0].geometry.location;
                        setVenueLocation({ lat: location.lat, lng: location.lng });
                    }
                }
            } catch (error) {
                console.error('Error loading venue coordinates:', error);
            }
        };

        loadVenue();
    }, [event?.venue, parseVenueCoordinates]);

    // Handle check-in
    const handleCheckIn = async () => {
        setLoading(true);
        setCheckInAttempted(true);
        try {
            // This is the ONLY place where we request location permission
            const location = await getSafeLocation();
            
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/attendance/check-in', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    eventId: event.id,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    accuracy: location.accuracy
                })
            });

            if (response.ok) {
                const data = await response.json();
                toast.success(data.message);
                
                // Refresh status immediately
                const statusRes = await fetch(`/api/attendance/event/${event.id}/status`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });
                if (statusRes.ok && isMounted.current) {
                    const statusData = await statusRes.json();
                    setAttendanceStatus(statusData);
                    if (onStatusUpdate) onStatusUpdate(statusData);
                }

                if (data.distance) toast(`Distance: ${data.venueDistance}`);
            } else {
                const errorData = await response.json();
                toast.error(errorData.detail || 'Check-in failed');
            }
        } catch (error) {
            console.error('Check-in error:', error);
            toast.error(error.message || 'Check-in failed. Try manual location.');
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    // Handle check-out
    const handleCheckOut = async () => {
        setLoading(true);
        try {
            const location = await getSafeLocation();
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/attendance/check-out', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    eventId: event.id,
                    latitude: location.latitude,
                    longitude: location.longitude,
                    notes: checkOutNotes
                })
            });

            if (response.ok) {
                const data = await response.json();
                toast.success(data.message);
                
                // Refresh status
                const statusRes = await fetch(`/api/attendance/event/${event.id}/status`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });
                if (statusRes.ok && isMounted.current) {
                    const statusData = await statusRes.json();
                    setAttendanceStatus(statusData);
                    if (onStatusUpdate) onStatusUpdate(statusData);
                }

                setCheckOutModalOpen(false);
                setCheckOutNotes('');
            } else {
                const errorData = await response.json();
                toast.error(errorData.detail || 'Check-out failed');
            }
        } catch (error) {
            console.error('Check-out error:', error);
            toast.error(error.message || 'Check-out failed');
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    // Manual location entry
    const handleManualLocation = () => {
        const lat = parseFloat(manualLatitude);
        const lng = parseFloat(manualLongitude);

        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            toast.error('Please enter valid coordinates');
            return;
        }

        const location = {
            latitude: lat,
            longitude: lng,
            accuracy: 1000, // Set high uncertainty for manual entry
            timestamp: new Date(),
            isManual: true,
            method: 'manual'
        };

        setCurrentLocation(location);
        setLocationError('');

        if (venueLocation) {
            const distance = calculateDistance(lat, lng, venueLocation.lat, venueLocation.lng);
            setDistanceDetails({
                distance: Math.round(distance),
                isWithinRange: distance <= 100,
                direction: calculateDirection(lat, lng, venueLocation.lat, venueLocation.lng)
            });
        }

        setShowManualLocation(false);
        setManualLatitude('');
        setManualLongitude('');
        toast.success('Manual location set. You can now Check In.');
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'checked_in': return 'success';
            case 'checked_in_late': return 'warning';
            case 'checked_in_remote': return 'info';
            case 'checked_out': return 'secondary';
            default: return 'default';
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return 'N/A';
        }
    };

    const PermissionDialog = () => (
        <Dialog 
            open={checkInAttempted && permissionStatus === 'denied'} 
            onClose={() => setCheckInAttempted(false)}
            maxWidth="sm" 
            fullWidth
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LocationOnIcon color="error" />
                Location Access Denied
            </DialogTitle>
            <DialogContent>
                <Alert severity="error" sx={{ mb: 2 }}>
                    You have denied location access. We cannot verify your attendance automatically.
                </Alert>
                <Typography variant="body2" paragraph>
                    Please enable location access in your browser settings:
                </Typography>
                <Box sx={{ bgcolor: '#f5f5f5', p: 2, borderRadius: 1, mb: 2 }}>
                    <Typography variant="caption" component="div">
                        1. Click the lock/info icon in your address bar<br/>
                        2. Find "Location" or "Permissions"<br/>
                        3. Select "Allow" or "Ask"<br/>
                        4. Refresh the page
                    </Typography>
                </Box>
                <Typography variant="body2">
                    Alternatively, you can use <strong>Manual Entry</strong> if approved by your admin.
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setCheckInAttempted(false)}>Close</Button>
                <Button onClick={() => setShowManualLocation(true)} variant="outlined">
                    Use Manual Entry
                </Button>
            </DialogActions>
        </Dialog>
    );

    const ManualLocationDialog = () => (
        <Dialog 
            open={showManualLocation} 
            onClose={() => setShowManualLocation(false)}
            maxWidth="sm" 
            fullWidth
        >
            <DialogTitle>Enter Location Manually</DialogTitle>
            <DialogContent>
                <Alert severity="warning" sx={{ mb: 2 }}>
                    Manual entry logs are flagged for admin review. Only use this if GPS is failing.
                </Alert>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            label="Latitude"
                            type="number"
                            value={manualLatitude}
                            onChange={(e) => setManualLatitude(e.target.value)}
                            placeholder="17.4..."
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            label="Longitude"
                            type="number"
                            value={manualLongitude}
                            onChange={(e) => setManualLongitude(e.target.value)}
                            placeholder="78.4..."
                        />
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setShowManualLocation(false)}>Cancel</Button>
                <Button onClick={handleManualLocation} variant="contained">Set Location</Button>
            </DialogActions>
        </Dialog>
    );

    return (
        <Card variant="outlined" sx={{ mb: 2, position: 'relative', overflow: 'visible' }}>
            <PermissionDialog />
            <ManualLocationDialog />
            
            <CardContent sx={{ pb: '16px !important' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle1" fontWeight={600}>
                                Attendance
                            </Typography>
                            <Chip
                                label={attendanceStatus?.status?.replace(/_/g, ' ').toUpperCase() || 'NOT CHECKED IN'}
                                color={getStatusColor(attendanceStatus?.status)}
                                size="small"
                                sx={{ fontWeight: 700, fontSize: '0.7rem' }}
                            />
                        </Box>
                        {attendanceStatus?.checkInTime && (
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                                In: {formatTime(attendanceStatus.checkInTime)}
                                {attendanceStatus.checkOutTime && ` • Out: ${formatTime(attendanceStatus.checkOutTime)}`}
                            </Typography>
                        )}
                    </Box>
                    
                    {venueLocation && distanceDetails && (
                        <Tooltip title={`${distanceDetails.distance}m from venue`}>
                            <Chip 
                                icon={distanceDetails.isWithinRange ? <CheckCircleIcon /> : <WarningIcon />}
                                label={distanceDetails.isWithinRange ? "On Site" : "Off Site"}
                                color={distanceDetails.isWithinRange ? "success" : "warning"}
                                variant="outlined"
                                size="small"
                            />
                        </Tooltip>
                    )}
                </Box>

                {locationError && (
                    <Alert severity="error" sx={{ mb: 2, py: 0 }}>
                        <Typography variant="caption">{locationError}</Typography>
                    </Alert>
                )}

                <Box sx={{ display: 'flex', gap: 1 }}>
                    {!attendanceStatus?.checkInTime ? (
                        <Button
                            fullWidth
                            variant="contained"
                            size="small"
                            onClick={handleCheckIn}
                            disabled={loading}
                            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <LocationOnIcon />}
                            sx={{ borderRadius: 2, textTransform: 'none' }}
                        >
                            {loading ? 'Locating...' : 'Check In Now'}
                        </Button>
                    ) : !attendanceStatus?.checkOutTime ? (
                        <Button
                            fullWidth
                            variant="outlined"
                            size="small"
                            color="secondary"
                            onClick={() => setCheckOutModalOpen(true)}
                            disabled={loading}
                            startIcon={<ExitToAppIcon />}
                            sx={{ borderRadius: 2, textTransform: 'none' }}
                        >
                            Check Out
                        </Button>
                    ) : (
                        <Button
                            fullWidth
                            disabled
                            variant="outlined"
                            size="small"
                            startIcon={<CheckCircleIcon />}
                            sx={{ borderRadius: 2, textTransform: 'none' }}
                        >
                            Shift Complete
                        </Button>
                    )}
                    
                    {/* Hidden debug/manual trigger area */}
                    <IconButton 
                        size="small" 
                        onClick={() => setShowManualLocation(!showManualLocation)} 
                        sx={{ opacity: 0.3, width: 30, height: 30 }}
                    >
                        <NavigationIcon fontSize="small" />
                    </IconButton>
                </Box>
            </CardContent>

            <Dialog open={checkOutModalOpen} onClose={() => setCheckOutModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>End Shift</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Confirming checkout for <strong>{event.name}</strong>.
                    </Typography>
                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Shift Notes"
                        placeholder="What did you accomplish today?"
                        value={checkOutNotes}
                        onChange={(e) => setCheckOutNotes(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCheckOutModalOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleCheckOut}
                        variant="contained"
                        color="primary"
                        disabled={loading}
                    >
                        {loading ? 'Processing...' : 'Confirm Check Out'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Card>
    );
};

export default EnhancedGPSCheckIn;