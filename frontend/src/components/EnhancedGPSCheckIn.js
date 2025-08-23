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
    Tooltip,
    Switch,
    FormControlLabel
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
    const mapRef = useRef(null);
    const [attendanceStatus, setAttendanceStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [venueLocation, setVenueLocation] = useState(null);
    const [locationError, setLocationError] = useState('');
    const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
    const [checkOutNotes, setCheckOutNotes] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [distanceDetails, setDistanceDetails] = useState(null);
    const [permissionStatus, setPermissionStatus] = useState('prompt');
    const [showManualLocation, setShowManualLocation] = useState(false);
    const [manualLatitude, setManualLatitude] = useState('');
    const [manualLongitude, setManualLongitude] = useState('');
    const [debugInfo, setDebugInfo] = useState(null);
    const [showDebugInfo, setShowDebugInfo] = useState(false);

    // Location tracking interval
    const locationIntervalRef = useRef(null);

    // Wrapped functions in useCallback
    const fetchAttendanceStatus = useCallback(async () => {
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
        }
    }, [event.id, onStatusUpdate]);

    const initializeLocation = useCallback(async () => {
        try {
            const location = await getCurrentLocation();
            setCurrentLocation(location);
        } catch (error) {
            console.error('Failed to get initial location:', error);
        }
    }, [getCurrentLocation]);

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
    }, [event?.venue]);

    const getCurrentLocation = useCallback(async () => {
        setLocationLoading(true);
        setLocationError('');

        try {
            // First check if geolocation is supported and permissions
            await checkGeolocationSupport();

            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const location = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude,
                            accuracy: position.coords.accuracy,
                            timestamp: new Date(position.timestamp),
                        };
                        setCurrentLocation(location);
                        resolve(location);
                    },
                    (error) => {
                        setLocationError('Failed to get location');
                        reject(error);
                    }
                );
            });
        } catch (error) {
            setLocationError(error.message);
            throw error;
        } finally {
            setLocationLoading(false);
        }
    }, []);

    useEffect(() => {
        if (event?.id) {
            fetchAttendanceStatus();
            initializeLocation();
            loadVenueCoordinates();
        }

        return () => {
            if (locationIntervalRef.current) {
                clearInterval(locationIntervalRef.current);
            }
        };
    }, [event, fetchAttendanceStatus, initializeLocation, loadVenueCoordinates]);

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

    useEffect(() => {
        // Auto-refresh location if enabled
        if (autoRefresh && attendanceStatus?.status === 'checked_in') {
            locationIntervalRef.current = setInterval(() => {
                getCurrentLocation().catch(console.error);
            }, 30000); // Update every 30 seconds
        } else if (locationIntervalRef.current) {
            clearInterval(locationIntervalRef.current);
        }
    }, [autoRefresh, attendanceStatus, getCurrentLocation]);

    // Initialize location services
    const initializeLocation = async () => {
        try {
            const location = await getCurrentLocation();
            setCurrentLocation(location);
        } catch (error) {
            console.error('Failed to get initial location:', error);
        }
    };

    // Load venue coordinates using Ola Maps geocoding
    const loadVenueCoordinates = async () => {
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
    };

    // Parse coordinates from venue string
    const parseVenueCoordinates = (venue) => {
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
    };

    // Check if geolocation is available and permissions
    const checkGeolocationSupport = async () => {
        if (!navigator.geolocation) {
            throw new Error('Geolocation is not supported by this browser');
        }

        // Check if we're in a secure context (HTTPS or localhost)
        if ((window.location.protocol === 'http:' && !window.location.hostname.includes('localhost')) ||
            (window.location.protocol !== 'http:' && window.location.hostname !== '127.0.0.1')) {
            console.warn('Geolocation may not work properly over HTTP. Consider using HTTPS.');
        }

        // Check permissions if available
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
    };

    // Get current location with enhanced fallback and debugging
    const getCurrentLocation = async () => {
        setLocationLoading(true);
        setLocationError('');

        try {
            // First check if geolocation is supported and permissions
            await checkGeolocationSupport();

            // Debug: Log browser and connection info
            const debugData = {
                userAgent: navigator.userAgent,
                onLine: navigator.onLine,
                connection: navigator.connection?.effectiveType || 'unknown',
                platform: navigator.platform,
                cookieEnabled: navigator.cookieEnabled,
                geolocationSupported: !!navigator.geolocation,
                isSecureContext: window.isSecureContext,
                protocol: window.location.protocol,
                hostname: window.location.hostname,
                permissionStatus: permissionStatus
            };

            console.log('Browser info:', debugData);
            setDebugInfo(debugData);

            return new Promise((resolve, reject) => {
                let attemptCount = 0;
                const maxAttempts = 4;

                // Helper function to process location result
                const processLocationResult = (position, method = 'unknown') => {
                    setLocationLoading(false);
                    const location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date(position.timestamp),
                        method: method,
                        isHighAccuracy: method === 'gps'
                    };

                    console.log(`Location obtained via ${method}:`, location);
                    setCurrentLocation(location);

                    // Show success message with method used
                    if (method !== 'gps') {
                        toast.success(`Location found via ${method} (±${Math.round(location.accuracy)}m accuracy)`);
                    } else {
                        toast.success(`GPS location found (±${Math.round(location.accuracy)}m accuracy)`);
                    }

                    // Calculate distance to venue if venue location is available
                    if (venueLocation) {
                        const distance = calculateDistance(
                            location.latitude,
                            location.longitude,
                            venueLocation.lat,
                            venueLocation.lng
                        );

                        setDistanceDetails({
                            distance: Math.round(distance),
                            isWithinRange: distance <= 100,
                            direction: calculateDirection(
                                location.latitude,
                                location.longitude,
                                venueLocation.lat,
                                venueLocation.lng
                            )
                        });
                    }

                    return location;
                };

                // Function to try getting location with different strategies
                const tryGetLocation = (options, method, onSuccess, onError) => {
                    attemptCount++;
                    console.log(`Location attempt ${attemptCount}/${maxAttempts} using ${method}:`, options);

                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            console.log(`${method} location success:`, position);
                            const location = processLocationResult(position, method);
                            resolve(location);
                        },
                        (error) => {
                            console.error(`${method} location failed:`, error);
                            onError(error);
                        },
                        options
                    );
                };

                // Strategy 1: High accuracy GPS (best case)
                tryGetLocation(
                    {
                        enableHighAccuracy: true,
                        timeout: 15000,
                        maximumAge: 30000 // Allow 30 second cache
                    },
                    'gps',
                    null,
                    (error) => {
                        // Strategy 2: Network-based location
                        tryGetLocation(
                            {
                                enableHighAccuracy: false,
                                timeout: 10000,
                                maximumAge: 120000 // Allow 2 minute cache
                            },
                            'network',
                            null,
                            (error2) => {
                                // Strategy 3: Very permissive with long cache
                                tryGetLocation(
                                    {
                                        enableHighAccuracy: false,
                                        timeout: 8000,
                                        maximumAge: 600000 // Allow 10 minute cache
                                    },
                                    'cached',
                                    null,
                                    (error3) => {
                                        // Strategy 4: Use IP-based geolocation as final fallback
                                        tryIPBasedLocation()
                                            .then((location) => {
                                                const finalLocation = processLocationResult(location, 'ip-based');
                                                resolve(finalLocation);
                                            })
                                            .catch(() => {
                                                // All strategies failed
                                                setLocationLoading(false);
                                                let errorMessage = 'Unable to determine your location using any method. ';

                                                const errors = [error, error2, error3];
                                                const hasPermissionDenied = errors.some(e => e.code === 1);
                                                const hasUnavailable = errors.some(e => e.code === 2);
                                                const hasTimeout = errors.some(e => e.code === 3);

                                                if (hasPermissionDenied) {
                                                    errorMessage += 'Location access was denied. Please enable location services and refresh the page.';
                                                } else if (hasUnavailable) {
                                                    errorMessage += 'Your device location services appear to be unavailable. This could be due to:\n• GPS being disabled\n• Poor signal/connectivity\n• Browser security settings\n• Device location settings';
                                                } else if (hasTimeout) {
                                                    errorMessage += 'Location requests timed out. Please check your connection and try again.';
                                                } else {
                                                    errorMessage += 'Multiple location detection methods failed.';
                                                }

                                                errorMessage += '\n\nYou can:\n• Try the "Enter Manually" option\n• Enable GPS and refresh\n• Move to an area with better signal\n• Check browser location permissions';

                                                setLocationError(errorMessage);
                                                reject(new Error(errorMessage));
                                            });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        } catch (error) {
            setLocationLoading(false);
            setLocationError(error.message);
            throw error;
        }
    };

    // IP-based location fallback using a free service
    const tryIPBasedLocation = async () => {
        try {
            console.log('Attempting IP-based location as final fallback...');
            const response = await fetch('https://ipapi.co/json/', {
                timeout: 5000
            });

            if (response.ok) {
                const data = await response.json();
                if (data.latitude && data.longitude) {
                    console.log('IP-based location found:', data);
                    return {
                        latitude: data.latitude,
                        longitude: data.longitude,
                        city: data.city,
                        country: data.country_name
                    };
                }
            }
            throw new Error('IP-based location unavailable');
        } catch (error) {
            console.error('IP-based location failed:', error);
            throw error;
        }
    };

    // Calculate distance using Haversine formula
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371000; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    };

    // Calculate direction to venue
    const calculateDirection = (lat1, lon1, lat2, lon2) => {
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;

        const y = Math.sin(dLon) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
                  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

        const bearing = Math.atan2(y, x) * 180 / Math.PI;
        const normalizedBearing = (bearing + 360) % 360;

        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(normalizedBearing / 45) % 8;

        return directions[index];
    };

    // Handle check-in
    const handleCheckIn = async () => {
        setLoading(true);
        try {
            const location = await getCurrentLocation();

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

                if (data.distance) {
                    toast.info(`Distance from venue: ${data.venueDistance}`);
                }
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
            const location = await getCurrentLocation();

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
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={autoRefresh}
                                    onChange={(e) => setAutoRefresh(e.target.checked)}
                                    size="small"
                                />
                            }
                            label="Auto-refresh"
                            sx={{ m: 0 }}
                        />
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
                            disabled={loading || locationLoading || !currentLocation}
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
