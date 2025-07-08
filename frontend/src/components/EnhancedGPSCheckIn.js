import React, { useState, useEffect, useRef } from 'react';
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
    Divider,
    Avatar,
    LinearProgress,
    IconButton,
    Tooltip,
    Switch,
    FormControlLabel
} from '@mui/material';
import {
    LocationOn as LocationOnIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Error as ErrorIcon,
    Schedule as ScheduleIcon,
    Timer as TimerIcon,
    ExitToApp as ExitToAppIcon,
    Navigation as NavigationIcon,
    Map as MapIcon,
    Refresh as RefreshIcon,
    MyLocation as MyLocationIcon,
    Place as PlaceIcon,
    DirectionsWalk as DirectionsWalkIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import toast from 'react-hot-toast';

// Ola Maps API configuration
const OLA_MAPS_API_KEY = process.env.REACT_APP_OLA_MAPS_API_KEY || 'your_ola_maps_api_key';
const OLA_MAPS_BASE_URL = 'https://api.olamaps.io/places/v1';

const EnhancedGPSCheckIn = ({ event, onStatusUpdate, showMap = true }) => {
    const { user } = useAuth();
    const mapRef = useRef(null);
    
    // State management
    const [attendanceStatus, setAttendanceStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [venueLocation, setVenueLocation] = useState(null);
    const [locationError, setLocationError] = useState('');
    const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
    const [checkOutNotes, setCheckOutNotes] = useState('');
    const [mapLoaded, setMapLoaded] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [distanceDetails, setDistanceDetails] = useState(null);
    const [permissionStatus, setPermissionStatus] = useState('prompt');

    // Location tracking interval
    const locationIntervalRef = useRef(null);

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
    }, [event]);

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
    }, [autoRefresh, attendanceStatus]);

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

    // Get current location with high accuracy
    const getCurrentLocation = () => {
        setLocationLoading(true);
        setLocationError('');

        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                const error = new Error('Geolocation is not supported by this browser');
                setLocationError(error.message);
                setLocationLoading(false);
                reject(error);
                return;
            }

            const options = {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 0
            };

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocationLoading(false);
                    const location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        timestamp: new Date(position.timestamp)
                    };
                    
                    setCurrentLocation(location);
                    
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
                    
                    resolve(location);
                },
                (error) => {
                    setLocationLoading(false);
                    let errorMessage = 'Unable to get your location. ';
                    
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage += 'Location access denied. Please enable location services.';
                            break;
                        case error.POSITION_UNAVAILABLE:
                            errorMessage += 'Location information is unavailable.';
                            break;
                        case error.TIMEOUT:
                            errorMessage += 'Location request timed out.';
                            break;
                        default:
                            errorMessage += 'An unknown error occurred.';
                            break;
                    }
                    
                    setLocationError(errorMessage);
                    reject(new Error(errorMessage));
                },
                options
            );
        });
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

    // Fetch attendance status
    const fetchAttendanceStatus = async () => {
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

    // Open directions in maps app
    const openDirections = () => {
        if (!currentLocation || !venueLocation) {
            toast.error('Location data not available');
            return;
        }

        const url = `https://www.google.com/maps/dir/${currentLocation.latitude},${currentLocation.longitude}/${venueLocation.lat},${venueLocation.lng}`;
        window.open(url, '_blank');
    };

    return (
        <Card sx={{ mb: 2, position: 'relative' }}>
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
