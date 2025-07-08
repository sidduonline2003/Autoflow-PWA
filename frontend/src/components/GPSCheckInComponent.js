import React, { useState, useEffect } from 'react';
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
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Stepper,
    Step,
    StepLabel,
    StepContent
} from '@mui/material';
import {
    LocationOn as LocationOnIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Error as ErrorIcon,
    Schedule as ScheduleIcon,
    Timer as TimerIcon,
    ExitToApp as ExitToAppIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import toast from 'react-hot-toast';

const GPSCheckInComponent = ({ event, onStatusUpdate }) => {
    const { user } = useAuth();
    const [attendanceStatus, setAttendanceStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [locationError, setLocationError] = useState('');
    const [checkOutModalOpen, setCheckOutModalOpen] = useState(false);
    const [checkOutNotes, setCheckOutNotes] = useState('');
    const [workDuration, setWorkDuration] = useState('');

    // Check initial attendance status
    useEffect(() => {
        if (event?.id) {
            fetchAttendanceStatus();
        }
    }, [event]);

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

    const getCurrentLocation = () => {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by this browser'));
                return;
            }

            setLocationLoading(true);
            setLocationError('');

            const options = {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000 // Cache for 1 minute
            };

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setLocationLoading(false);
                    const location = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };
                    setCurrentLocation(location);
                    resolve(location);
                },
                (error) => {
                    setLocationLoading(false);
                    let errorMessage = 'Unable to get your location. ';
                    
                    switch (error.code) {
                        case error.PERMISSION_DENIED:
                            errorMessage += 'Location access denied. Please enable location services and try again.';
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

    const handleCheckIn = async () => {
        setLoading(true);
        try {
            // Get current location
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
                
                // Update attendance status
                await fetchAttendanceStatus();
                
                // Show distance information
                if (data.distance && data.venueDistance) {
                    toast.info(`You are ${data.venueDistance}`);
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

    const handleCheckOut = async () => {
        setLoading(true);
        try {
            // Get current location
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
                setWorkDuration(data.workDuration);
                
                // Update attendance status
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

    const getStatusColor = (status) => {
        switch (status) {
            case 'checked_in':
                return 'success';
            case 'checked_in_late':
                return 'warning';
            case 'checked_in_remote':
                return 'info';
            case 'checked_out':
                return 'secondary';
            default:
                return 'default';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'checked_in':
            case 'checked_out':
                return <CheckCircleIcon />;
            case 'checked_in_late':
                return <WarningIcon />;
            case 'checked_in_remote':
                return <LocationOnIcon />;
            default:
                return <ScheduleIcon />;
        }
    };

    const getStatusMessage = (status) => {
        switch (status) {
            case 'checked_in':
                return 'Checked in successfully';
            case 'checked_in_late':
                return 'Checked in (Late arrival)';
            case 'checked_in_remote':
                return 'Checked in (Outside venue range)';
            case 'checked_out':
                return 'Work completed';
            case 'not_checked_in':
            default:
                return 'Ready to check in';
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '';
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '';
        }
    };

    if (!event) {
        return (
            <Alert severity="info">
                No event selected for attendance tracking.
            </Alert>
        );
    }

    return (
        <Card sx={{ mb: 2 }}>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <LocationOnIcon sx={{ mr: 1 }} color="primary" />
                    <Typography variant="h6">
                        GPS Check-In: {event.name}
                    </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {event.date} at {event.time} • {event.venue}
                </Typography>

                {/* Current Status */}
                {attendanceStatus && (
                    <Box sx={{ mb: 2 }}>
                        <Chip
                            icon={getStatusIcon(attendanceStatus.status)}
                            label={getStatusMessage(attendanceStatus.status)}
                            color={getStatusColor(attendanceStatus.status)}
                            sx={{ mb: 1 }}
                        />
                        
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

                {/* Location Error */}
                {locationError && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {locationError}
                    </Alert>
                )}

                {/* Current Location Display */}
                {currentLocation && (
                    <Box sx={{ mb: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                        <Typography variant="caption" display="block">
                            Current Location: {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Accuracy: ±{Math.round(currentLocation.accuracy)}m
                        </Typography>
                    </Box>
                )}

                {/* Action Buttons */}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {attendanceStatus?.canCheckIn && (
                        <Button
                            variant="contained"
                            startIcon={locationLoading ? <CircularProgress size={20} /> : <LocationOnIcon />}
                            onClick={handleCheckIn}
                            disabled={loading || locationLoading}
                            size="large"
                            sx={{ minWidth: 150 }}
                        >
                            {locationLoading ? 'Getting Location...' : 'Check In'}
                        </Button>
                    )}

                    {attendanceStatus?.canCheckOut && (
                        <Button
                            variant="outlined"
                            startIcon={<ExitToAppIcon />}
                            onClick={() => setCheckOutModalOpen(true)}
                            disabled={loading}
                            size="large"
                        >
                            Complete Work
                        </Button>
                    )}

                    <Button
                        variant="text"
                        startIcon={locationLoading ? <CircularProgress size={20} /> : <LocationOnIcon />}
                        onClick={getCurrentLocation}
                        disabled={locationLoading}
                        size="small"
                    >
                        Update Location
                    </Button>
                </Box>

                {/* Location Permission Guide */}
                {!currentLocation && !locationError && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        <Typography variant="body2">
                            <strong>Location Required:</strong> This feature requires access to your device location to verify you're at the event venue.
                            Click "Check In" to grant permission and verify your location.
                        </Typography>
                    </Alert>
                )}
            </CardContent>

            {/* Check-out Modal */}
            <Dialog open={checkOutModalOpen} onClose={() => setCheckOutModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Complete Work Session</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        You're about to check out from: <strong>{event.name}</strong>
                    </Typography>
                    
                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Work Notes (Optional)"
                        placeholder="Add any notes about the work completed, issues encountered, etc."
                        value={checkOutNotes}
                        onChange={(e) => setCheckOutNotes(e.target.value)}
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
                        {loading ? 'Checking Out...' : 'Complete Work'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Card>
    );
};

export default GPSCheckInComponent;
