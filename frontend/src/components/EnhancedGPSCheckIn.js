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
    const [debugInfo] = useState(null);
    const [showDebugInfo, setShowDebugInfo] = useState(false);

    // Location tracking interval
    const locationIntervalRef = useRef(null);
    const fetchInFlightRef = useRef(false);

    const parseVenueCoordinates = useCallback((venue) => {
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
        if (navigator.permissions) {
            try {
                const permission = await navigator.permissions.query({ name: 'geolocation' });
                console.log('Geolocation permission status:', permission.state);
                if (permission.state === 'denied') {
                    throw new Error('Location access has been denied. Please enable location services in your browser settings.');
                }
            } catch (permError) {
                console.warn('Could not check geolocation permissions:', permError);
            }
        }
    }, []);

    // Helper math: distance (meters) using Haversine
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
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
    };

    // Helper: cardinal direction from bearing
    const calculateDirection = (lat1, lon1, lat2, lon2) => {
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
    };

    // Helper: timeout wrapper for promises
    const withTimeout = useCallback((promise, ms, label = 'operation') => {
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
            promise.then(v => { clearTimeout(t); resolve(v); })
                   .catch(e => { clearTimeout(t); reject(e); });
        });
    }, []);

    // Get current GPS location with timeout and state updates
    const getCurrentLocation = useCallback(async () => {
        setLocationLoading(true);
        setLocationError('');
        try {
            await checkGeolocationSupport();
            const pos = await withTimeout(new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    (position) => resolve(position),
                    (err) => reject(err),
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
                );
            }), 12000, 'geolocation');

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
            const message = err?.message || 'Failed to get current location';
            setLocationError(message);
            throw err;
        } finally {
            setLocationLoading(false);
        }
    }, [checkGeolocationSupport, withTimeout, venueLocation]);

    // Try IP-based location as a fallback
    const tryIPBasedLocation = useCallback(async () => {
        const resp = await withTimeout(fetch('https://ipapi.co/json/'), 6000, 'ip-location');
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

    // Helper: get a safe location (reuse last known, else GPS with timeout, else IP-based)
    const getSafeLocation = useCallback(async () => {
        if (currentLocation) return currentLocation;
        try {
            const loc = await withTimeout(getCurrentLocation(), 8000, 'location');
            return loc;
        } catch (e) {
            try {
                const ip = await tryIPBasedLocation();
                const loc = {
                    latitude: ip.latitude,
                    longitude: ip.longitude,
                    accuracy: 10000,
                    timestamp: new Date(),
                    method: 'ip-location'
                };
                setCurrentLocation(loc);
                return loc;
            } catch (e2) {
                throw e; // bubble original error
            }
        }
    }, [currentLocation, getCurrentLocation, tryIPBasedLocation, withTimeout]);

    const fetchAttendanceStatus = useCallback(async () => {
        if (fetchInFlightRef.current) return;
        fetchInFlightRef.current = true;
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/attendance/event/${event.id}/status`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });

            if (response.ok) {
                const data = await response.json();
                setAttendanceStatus(data);
                onStatusUpdate?.(data);
            }
        } catch (error) {
            console.error('Error fetching attendance status:', error);
        } finally {
            fetchInFlightRef.current = false;
        }
    }, [event.id, onStatusUpdate]);

    const loadVenueCoordinates = useCallback(async () => {
        if (!event?.venue) return;

        try {
            // Try to extract coordinates from venue string first
            const coords = parseVenueCoordinates(event.venue);
            if (coords) {
                setVenueLocation({ lat: coords[0], lng: coords[1] });
                return;
            }

            // If no coordinates, use Ola Maps geocoding
            const response = await fetch(
                `${OLA_MAPS_BASE_URL}/geocode?address=${encodeURIComponent(event.venue)}&api_key=${OLA_MAPS_API_KEY}`
            );

            if (response.ok) {
                const data = await response.json();
                if (data.geocodingResults && data.geocodingResults.length > 0) {
                    const location = data.geocodingResults[0].geometry.location;
                    setVenueLocation({ lat: location.lat, lng: location.lng });
                }
            }
        } catch (error) {
            console.error('Error loading venue coordinates:', error);
            // Use default coordinates if geocoding fails
            setVenueLocation({ lat: 17.4065, lng: 78.4772 }); // Hyderabad
        }
    }, [event?.venue, parseVenueCoordinates]);

    useEffect(() => {
        if (event?.id) {
            fetchAttendanceStatus();
            // Do not auto-fetch geolocation here; only on explicit actions
            loadVenueCoordinates();
        }

        return () => {
            if (locationIntervalRef.current) {
                clearInterval(locationIntervalRef.current);
            }
        };
    }, [event, fetchAttendanceStatus, loadVenueCoordinates]);

    useEffect(() => {
        // Check geolocation permission status
        if ('permissions' in navigator) {
            navigator.permissions.query({ name: 'geolocation' }).then((result) => {
                setPermissionStatus(result.state);

                result.addEventListener('change', () => {
                    setPermissionStatus(result.state);
                });
            });
        }
    }, []);

    // Handle check-in
    const handleCheckIn = async () => {
        setLoading(true);
        try {
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
                await fetchAttendanceStatus();
                if (data.distance) toast.info(`Distance from venue: ${data.venueDistance}`);
            } else {
                const errorData = await response.json();
                toast.error(errorData.detail || 'Check-in failed');
            }
        } catch (error) {
            console.error('Check-in error:', error);
            toast.error(error.message || 'Check-in failed');
        } finally {
            setLoading(false);
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
                await fetchAttendanceStatus();
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
            setLoading(false);
        }
    };

    // Get status color
    const getStatusColor = (status) => {
        switch (status) {
            case 'checked_in': return 'success';
            case 'checked_in_late': return 'warning';
            case 'checked_in_remote': return 'info';
            case 'checked_out': return 'secondary';
            default: return 'default';
        }
    };

    // Get status icon
    const getStatusIcon = (status) => {
        switch (status) {
            case 'checked_in':
            case 'checked_in_late':
            case 'checked_in_remote':
                return <CheckCircleIcon />;
            case 'checked_out':
                return <ExitToAppIcon />;
            default:
                return <ScheduleIcon />;
        }
    };

    // Format time
    const formatTime = (timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleTimeString();
        } catch (error) {
            return 'N/A';
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
            accuracy: 10000, // Set high uncertainty for manual entry
            timestamp: new Date(),
            isManual: true,
            method: 'manual'
        };

        setCurrentLocation(location);
        setLocationError('');

        // Calculate distance if venue location available
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
        toast.success('Manual location set successfully');
    };

    // Test IP-based location
    const testIPLocation = async () => {
        try {
            setLocationLoading(true);
            const location = await tryIPBasedLocation();
            setCurrentLocation({
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: 10000,
                timestamp: new Date(),
                method: 'ip-location',
                city: location.city,
                country: location.country
            });

            toast.success(`IP-based location found: ${location.city}, ${location.country}`);
            setLocationError('');
        } catch (error) {
            toast.error('IP-based location failed');
        } finally {
            setLocationLoading(false);
        }
    };

    // Open directions in maps app
    const openDirections = () => {
        if (!currentLocation || !venueLocation) {
            toast.error('Location data not available');
            return;
        }

        const url = `https://www.google.com/maps/dir/${currentLocation.latitude},${currentLocation.longitude}/${venueLocation.lat},${venueLocation.lng}`;
        window.open(url, '_blank');
    };

    // Permission Setup Dialog Component
    const PermissionDialog = () => (
        <Dialog 
            open={permissionStatus === 'prompt' || (locationError && locationError.includes('denied'))} 
            onClose={() => {}}
            maxWidth="sm" 
            fullWidth
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LocationOnIcon color="primary" />
                Location Permission Required
            </DialogTitle>
            <DialogContent>
                <Typography variant="body1" sx={{ mb: 2 }}>
                    This app needs access to your location to verify your attendance at the event venue.
                </Typography>
                
                <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                        Your location data is only used for attendance verification and is not stored permanently.
                    </Typography>
                </Alert>

                {window.location.protocol === 'http:' && !window.location.hostname.includes('localhost') && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        <Typography variant="body2">
                            For better location accuracy, consider accessing this app via HTTPS.
                        </Typography>
                    </Alert>
                )}

                <Typography variant="body2" color="text.secondary">
                    When prompted by your browser, please click "Allow" to enable location services.
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => window.location.reload()} color="secondary">
                    Refresh Page
                </Button>
                <Button
                    onClick={() => getCurrentLocation().catch(console.error)}
                    variant="contained"
                    startIcon={<LocationOnIcon />}
                >
                    Enable Location
                </Button>
            </DialogActions>
        </Dialog>
    );

    // Manual Location Dialog Component
    const ManualLocationDialog = () => (
        <Dialog 
            open={showManualLocation} 
            onClose={() => setShowManualLocation(false)}
            maxWidth="sm" 
            fullWidth
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <MyLocationIcon color="primary" />
                Enter Location Manually
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    If automatic location detection isn't working, you can enter your coordinates manually.
                </Typography>
                
                <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                        You can find your coordinates using Google Maps or any GPS app on your phone.
                    </Typography>
                </Alert>

                <Grid container spacing={2}>
                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            label="Latitude"
                            type="number"
                            value={manualLatitude}
                            onChange={(e) => setManualLatitude(e.target.value)}
                            placeholder="17.4065"
                            inputProps={{
                                step: "any",
                                min: -90,
                                max: 90
                            }}
                            helperText="Range: -90 to 90"
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            fullWidth
                            label="Longitude"
                            type="number"
                            value={manualLongitude}
                            onChange={(e) => setManualLongitude(e.target.value)}
                            placeholder="78.4772"
                            inputProps={{
                                step: "any",
                                min: -180,
                                max: 180
                            }}
                            helperText="Range: -180 to 180"
                        />
                    </Grid>
                </Grid>

                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                    Note: Manual location entry is less accurate and should only be used when automatic detection fails.
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setShowManualLocation(false)}>
                    Cancel
                </Button>
                <Button
                    onClick={handleManualLocation}
                    variant="contained"
                    disabled={!manualLatitude || !manualLongitude}
                >
                    Set Location
                </Button>
            </DialogActions>
        </Dialog>
    );

    return (
        <Card sx={{ mb: 2, position: 'relative' }}>
            <PermissionDialog />
            <ManualLocationDialog />
            
            <CardContent>
                {/* Event Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                        <Typography variant="h6" gutterBottom>
                            {event.name}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {event.date} at {event.time} • {event.venue}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <Chip
                            icon={getStatusIcon(attendanceStatus?.status)}
                            label={attendanceStatus?.status?.replace('_', ' ').toUpperCase() || 'NOT CHECKED IN'}
                            color={getStatusColor(attendanceStatus?.status)}
                            size="small"
                        />
                        <Tooltip title="Refresh Status">
                            <IconButton size="small" onClick={fetchAttendanceStatus}>
                                <RefreshIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {/* Location Status */}
                <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <MyLocationIcon fontSize="small" />
                            Location Status
                        </Typography>
                    </Box>

                    {locationLoading && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <CircularProgress size={16} />
                            <Typography variant="body2">Getting your location...</Typography>
                        </Box>
                    )}

                    {locationError && (
                        <Alert severity="error" sx={{ mb: 1 }}>
                            {locationError}
                            {permissionStatus === 'denied' && (
                                <Box sx={{ mt: 1 }}>
                                    <Typography variant="caption">
                                        To enable location access: Go to your browser settings → Privacy & Security → Site Settings → Location
                                    </Typography>
                                </Box>
                            )}
                            <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                                <Button 
                                    size="small" 
                                    variant="outlined" 
                                    onClick={() => getCurrentLocation().catch(console.error)}
                                    disabled={locationLoading}
                                    startIcon={locationLoading ? <CircularProgress size={14} /> : <RefreshIcon />}
                                >
                                    Try Again
                                </Button>
                                <Button 
                                    size="small" 
                                    variant="outlined" 
                                    onClick={() => setShowManualLocation(true)}
                                >
                                    Enter Manually
                                </Button>
                                <Button 
                                    size="small" 
                                    variant="outlined" 
                                    onClick={testIPLocation}
                                    disabled={locationLoading}
                                >
                                    Try IP Location
                                </Button>
                                <Button 
                                    size="small" 
                                    variant="text" 
                                    onClick={() => setShowDebugInfo(!showDebugInfo)}
                                >
                                    Debug Info
                                </Button>
                            </Box>
                            
                            {showDebugInfo && debugInfo && (
                                <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1, fontSize: '0.75rem' }}>
                                    <Typography variant="caption" display="block" fontWeight="bold">Debug Information:</Typography>
                                    <Typography variant="caption" display="block">Platform: {debugInfo.platform}</Typography>
                                    <Typography variant="caption" display="block">Online: {debugInfo.onLine ? 'Yes' : 'No'}</Typography>
                                    <Typography variant="caption" display="block">Connection: {debugInfo.connection}</Typography>
                                    <Typography variant="caption" display="block">Secure Context: {debugInfo.isSecureContext ? 'Yes' : 'No'}</Typography>
                                    <Typography variant="caption" display="block">Protocol: {debugInfo.protocol}</Typography>
                                    <Typography variant="caption" display="block">Geolocation: {debugInfo.geolocationSupported ? 'Supported' : 'Not Supported'}</Typography>
                                    <Typography variant="caption" display="block">Permission: {debugInfo.permissionStatus}</Typography>
                                </Box>
                            )}
                        </Alert>
                    )}

                    {currentLocation && (
                        <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                                <Typography variant="caption" display="block" color="text.secondary">
                                    Your Location
                                </Typography>
                                <Typography variant="body2">
                                    {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    Accuracy: ±{Math.round(currentLocation.accuracy)}m
                                    {currentLocation.isManual && (
                                        <Chip size="small" label="Manual" color="warning" sx={{ ml: 1, height: 16 }} />
                                    )}
                                    {currentLocation.method && currentLocation.method !== 'gps' && !currentLocation.isManual && (
                                        <Chip size="small" label={currentLocation.method} color="info" sx={{ ml: 1, height: 16 }} />
                                    )}
                                    {currentLocation.method === 'gps' && (
                                        <Chip size="small" label="GPS" color="success" sx={{ ml: 1, height: 16 }} />
                                    )}
                                </Typography>
                            </Grid>

                            {distanceDetails && (
                                <Grid item xs={12} md={6}>
                                    <Typography variant="caption" display="block" color="text.secondary">
                                        Distance to Venue
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Typography variant="body2" color={distanceDetails.isWithinRange ? 'success.main' : 'warning.main'}>
                                            {distanceDetails.distance}m {distanceDetails.direction}
                                        </Typography>
                                        {distanceDetails.isWithinRange ? (
                                            <CheckCircleIcon fontSize="small" color="success" />
                                        ) : (
                                            <WarningIcon fontSize="small" color="warning" />
                                        )}
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">
                                        {distanceDetails.isWithinRange ? 'Within check-in range' : 'Outside 100m range'}
                                    </Typography>
                                </Grid>
                            )}
                        </Grid>
                    )}

                    {currentLocation && venueLocation && (
                        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                            <Button
                                size="small"
                                startIcon={<NavigationIcon />}
                                onClick={openDirections}
                                variant="outlined"
                            >
                                Get Directions
                            </Button>
                            <Button
                                size="small"
                                startIcon={<RefreshIcon />}
                                onClick={() => getCurrentLocation()}
                                disabled={locationLoading}
                            >
                                Update Location
                            </Button>
                        </Box>
                    )}
                </Paper>

                {/* Attendance Actions */}
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    {!attendanceStatus?.checkInTime && (
                        <Button
                            variant="contained"
                            size="large"
                            startIcon={loading ? <CircularProgress size={20} /> : <LocationOnIcon />}
                            onClick={handleCheckIn}
                            disabled={loading || locationLoading}
                            sx={{ minWidth: 150 }}
                        >
                            {loading ? 'Checking In...' : 'Check In'}
                        </Button>
                    )}

                    {attendanceStatus?.checkInTime && !attendanceStatus?.checkOutTime && (
                        <Button
                            variant="contained"
                            color="secondary"
                            size="large"
                            startIcon={<ExitToAppIcon />}
                            onClick={() => setCheckOutModalOpen(true)}
                            sx={{ minWidth: 150 }}
                        >
                            Check Out
                        </Button>
                    )}

                    {attendanceStatus?.checkOutTime && (
                        <Chip
                            icon={<CheckCircleIcon />}
                            label="Work Completed"
                            color="success"
                            variant="outlined"
                            size="medium"
                        />
                    )}
                </Box>

                {/* Attendance Details */}
                {attendanceStatus && (
                    <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                        <Typography variant="subtitle2" gutterBottom>
                            Attendance Details
                        </Typography>
                        
                        {attendanceStatus.checkInTime && (
                            <Typography variant="body2" color="text.secondary">
                                Check-in: {formatTime(attendanceStatus.checkInTime)}
                                {attendanceStatus.distance && (
                                    <span> • {Math.round(attendanceStatus.distance)}m from venue</span>
                                )}
                            </Typography>
                        )}
                        
                        {attendanceStatus.checkOutTime && (
                            <Typography variant="body2" color="text.secondary">
                                Check-out: {formatTime(attendanceStatus.checkOutTime)}
                                {attendanceStatus.workDurationHours && (
                                    <span> • {attendanceStatus.workDurationHours} hours worked</span>
                                )}
                            </Typography>
                        )}
                    </Box>
                )}
            </CardContent>

            {/* Check-out Modal */}
            <Dialog open={checkOutModalOpen} onClose={() => setCheckOutModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Check Out from Event</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Please confirm your check-out and optionally add any notes about your work.
                    </Typography>
                    
                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Work Notes (Optional)"
                        value={checkOutNotes}
                        onChange={(e) => setCheckOutNotes(e.target.value)}
                        placeholder="Describe what you accomplished during this event..."
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCheckOutModalOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCheckOut}
                        variant="contained"
                        disabled={loading}
                        startIcon={loading ? <CircularProgress size={20} /> : <ExitToAppIcon />}
                    >
                        {loading ? 'Checking Out...' : 'Check Out'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Card>
    );
};

export default EnhancedGPSCheckIn;
