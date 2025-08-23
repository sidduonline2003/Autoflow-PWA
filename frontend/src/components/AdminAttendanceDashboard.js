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
    Grid,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Avatar,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Badge,
    LinearProgress,
    Switch,
    FormControlLabel,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Tabs,
    Tab,
    Divider
} from '@mui/material';
import {
    LocationOn as LocationOnIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Schedule as ScheduleIcon,
    ExitToApp as ExitToAppIcon,
    People as PeopleIcon,
    Event as EventIcon,
    Refresh as RefreshIcon,
    Download as DownloadIcon,
    Visibility as VisibilityIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { onSnapshot, collection, query } from 'firebase/firestore';
import toast from 'react-hot-toast';

// Ola Maps configuration
const OLA_MAPS_API_KEY = process.env.REACT_APP_OLA_MAPS_API_KEY || 'your_ola_maps_api_key';

const AdminAttendanceDashboard = () => {
    const { user } = useAuth();
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    
    // State management
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [eventDetailOpen, setEventDetailOpen] = useState(false);
    const [mapVisible] = useState(true); // setMapVisible removed as unused
    const [filterStatus, setFilterStatus] = useState('all');
    const [tabValue, setTabValue] = useState(0);
    const [liveTracking, setLiveTracking] = useState(true);

    // Auto-refresh interval
    const refreshIntervalRef = useRef(null);

    const parseVenueCoordinates = useCallback((venue) => {
        try {
            if (venue.includes('(') && venue.includes(')')) {
                const coordsPart = venue.split('(')[1].split(')')[0];
                if (coordsPart.includes(',')) {
                    const [lat, lng] = coordsPart.split(',').map(Number);
                    return [lng, lat]; // OlaMaps uses [lng, lat] format
                }
            }
        } catch (error) {
            console.error('Error parsing coordinates:', error);
        }
        return null;
    }, []);

    const getEventStatusColor = useCallback((status) => {
        switch (status) {
            case 'COMPLETED': return '#4caf50';
            case 'IN_PROGRESS': return '#ff9800';
            case 'UPCOMING': return '#2196f3';
            case 'CANCELLED': return '#f44336';
            default: return '#9e9e9e';
        }
    }, []);

    const getStatusBadgeColor = useCallback((status) => {
        switch (status) {
            case 'COMPLETED': return '#4caf50';
            case 'IN_PROGRESS': return '#ff9800';
            case 'UPCOMING': return '#2196f3';
            case 'CANCELLED': return '#f44336';
            default: return '#9e9e9e';
        }
    }, []);

    const getStatusMarkerColor = useCallback((status) => {
        switch (status) {
            case 'checked_in': return '#4caf50';
            case 'checked_in_late': return '#ff9800';
            case 'checked_in_remote': return '#2196f3';
            case 'checked_out': return '#9e9e9e';
            default: return '#f44336';
        }
    }, []);

    const formatTime = useCallback((timestamp) => {
        if (!timestamp) return 'N/A';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleTimeString();
        } catch (error) {
            return 'N/A';
        }
    }, []);

    const addEventMarkers = useCallback((map, events) => {
        events.forEach((event, index) => {
            const coords = parseVenueCoordinates(event.venue);
            if (!coords) return;

            // Add venue marker
            const venueMarker = new window.OlaMaps.Marker({
                color: getEventStatusColor(event.status),
                scale: 1.2
            })
            .setLngLat(coords)
            .addTo(map);

            // Add popup with event details
            const popup = new window.OlaMaps.Popup({
                offset: 25,
                closeButton: true
            })
            .setHTML(`
                <div style="padding: 10px;">
                    <h6 style="margin: 0 0 5px 0;">${event.eventName}</h6>
                    <p style="margin: 2px 0; font-size: 12px;">Client: ${event.clientName}</p>
                    <p style="margin: 2px 0; font-size: 12px;">Time: ${event.time}</p>
                    <p style="margin: 2px 0; font-size: 12px;">Team: ${event.checkedIn}/${event.totalAssigned} present</p>
                    <div style="margin-top: 8px;">
                        <span style="background: ${getStatusBadgeColor(event.status)}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px;">
                            ${event.status}
                        </span>
                    </div>
                </div>
            `);

            venueMarker.setPopup(popup);
        });
    }, [parseVenueCoordinates, getEventStatusColor, getStatusBadgeColor]);

    const addTeamMemberMarkers = useCallback((map, events) => {
        events.forEach(event => {
            event.attendanceRecords?.forEach(record => {
                if (record.checkInLocation && record.status !== 'not_checked_in') {
                    const coords = [record.checkInLocation.longitude, record.checkInLocation.latitude];
                    
                    // Add team member marker
                    const memberMarker = new window.OlaMaps.Marker({
                        color: getStatusMarkerColor(record.status),
                        scale: 0.8
                    })
                    .setLngLat(coords)
                    .addTo(map);

                    // Add popup with member details
                    const popup = new window.OlaMaps.Popup({
                        offset: 25,
                        closeButton: true
                    })
                    .setHTML(`
                        <div style="padding: 10px;">
                            <h6 style="margin: 0 0 5px 0;">${record.name}</h6>
                            <p style="margin: 2px 0; font-size: 12px;">Role: ${record.role}</p>
                            <p style="margin: 2px 0; font-size: 12px;">Status: ${record.status.replace('_', ' ')}</p>
                            ${record.checkInTime ? `<p style="margin: 2px 0; font-size: 12px;">Check-in: ${formatTime(record.checkInTime)}</p>` : ''}
                            ${record.distance ? `<p style="margin: 2px 0; font-size: 12px;">Distance: ${Math.round(record.distance)}m from venue</p>` : ''}
                        </div>
                    `);

                    memberMarker.setPopup(popup);
                }
            });
        });
    }, [getStatusMarkerColor, formatTime]);

    const initializeMap = useCallback(() => {
        if (!mapRef.current || !dashboardData?.events?.length) return;

        try {
            // Initialize map centered on first event or default location
            const firstEvent = dashboardData.events[0];
            const center = firstEvent.venue ? parseVenueCoordinates(firstEvent.venue) : [17.4065, 78.4772];

            const map = new window.OlaMaps.Map({
                container: mapRef.current,
                center: center,
                zoom: 12,
                style: 'https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json',
                transformRequest: (url, resourceType) => {
                    if (url.startsWith('https://api.olamaps.io')) {
                        return {
                            url: `${url}?api_key=${OLA_MAPS_API_KEY}`
                        };
                    }
                    return { url };
                }
            });

            mapInstanceRef.current = map;

            map.on('load', () => {
                addEventMarkers(map, dashboardData.events);
                addTeamMemberMarkers(map, dashboardData.events);
            });

        } catch (error) {
            console.error('Error initializing map:', error);
        }
    }, [dashboardData, addEventMarkers, addTeamMemberMarkers, parseVenueCoordinates]);

    const fetchDashboardData = useCallback(async (showLoading = true) => {
        if (showLoading) setLoading(true);
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/attendance/dashboard/live', {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });

            if (response.ok) {
                const data = await response.json();
                setDashboardData(data);
            } else {
                throw new Error('Failed to fetch dashboard data');
            }
        } catch (error) {
            console.error('Error fetching dashboard:', error);
            toast.error('Failed to load attendance dashboard');
        } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDashboardData();
        
        // Set up Firebase real-time listeners for live updates
        const setupRealtimeListeners = async () => {
            if (!user?.claims?.orgId) return;
            
            try {
                // Listen to live dashboard collection for real-time updates
                const liveDashboardQuery = query(
                    collection(db, 'organizations', user.claims.orgId, 'liveDashboard')
                );
                
                const unsubscribeLive = onSnapshot(liveDashboardQuery, (snapshot) => {
                    console.log('Live dashboard update received:', snapshot.docs.length, 'events');
                    fetchDashboardData(false); // Refresh data when changes detected
                });
                
                // Listen to attendance collection for real-time attendance updates
                const attendanceQuery = query(
                    collection(db, 'organizations', user.claims.orgId, 'attendance')
                );
                
                const unsubscribeAttendance = onSnapshot(attendanceQuery, (snapshot) => {
                    console.log('Attendance update received:', snapshot.docs.length, 'records');
                    // Debounced refresh to avoid too many updates
                    setTimeout(() => fetchDashboardData(false), 1000);
                });
                
                // Return cleanup function
                return () => {
                    unsubscribeLive();
                    unsubscribeAttendance();
                };
            } catch (error) {
                console.error('Error setting up real-time listeners:', error);
            }
        };
        
        const cleanupListenersPromise = setupRealtimeListeners();
        
        // Set up auto-refresh as fallback
        if (autoRefresh) {
            refreshIntervalRef.current = setInterval(() => {
                fetchDashboardData(false);
            }, 30000); // Refresh every 30 seconds (less frequent due to real-time updates)
        }

        return () => {
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
            cleanupListenersPromise.then(cleanup => cleanup && cleanup());
        };
    }, [autoRefresh, user, fetchDashboardData]);

    useEffect(() => {
        if (dashboardData && mapVisible && window.OlaMaps) {
            initializeMap();
        }
    }, [dashboardData, mapVisible, initializeMap]);

    // Get status chip color
    const getStatusChipColor = (status) => {
        switch (status) {
            case 'checked_in': return 'success';
            case 'checked_in_late': return 'warning';
            case 'checked_in_remote': return 'info';
            case 'checked_out': return 'secondary';
            default: return 'error';
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

    // Get progress percentage (use real-time progress if available, otherwise calculate attendance rate)
    const getProgressPercentage = (event) => {
        // If we have real-time progress data, use it
        if (event.progress !== undefined && event.progress !== null) {
            return event.progress;
        }
        // Fallback to attendance rate calculation
        return event.totalAssigned > 0 ? (event.checkedIn / event.totalAssigned * 100) : 0;
    };

    // Get attendance rate for summary display
    // Filter events based on status
    const getFilteredEvents = () => {
        if (!dashboardData?.events) return [];
        
        if (filterStatus === 'all') return dashboardData.events;
        
        return dashboardData.events.filter(event => {
            switch (filterStatus) {
                case 'active':
                    return event.status === 'IN_PROGRESS' || event.status === 'UPCOMING';
                case 'completed':
                    return event.status === 'COMPLETED';
                case 'issues':
                    return event.lateArrivals > 0 || event.remoteCheckIns > 0;
                default:
                    return true;
            }
        });
    };

    // Export attendance data
    const exportAttendanceData = () => {
        if (!dashboardData) return;

        const csvData = [];
        csvData.push(['Event', 'Client', 'Team Member', 'Role', 'Status', 'Check-in Time', 'Check-out Time', 'Distance (m)', 'Work Duration (h)']);

        dashboardData.events.forEach(event => {
            event.attendanceRecords?.forEach(record => {
                csvData.push([
                    event.eventName,
                    event.clientName,
                    record.name,
                    record.role,
                    record.status,
                    record.checkInTime ? formatTime(record.checkInTime) : 'N/A',
                    record.checkOutTime ? formatTime(record.checkOutTime) : 'N/A',
                    record.distance ? Math.round(record.distance) : 'N/A',
                    record.workDurationHours || 'N/A'
                ]);
            });
        });

        const csvContent = csvData.map(row => row.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_report_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress />
                <Typography variant="h6" sx={{ ml: 2 }}>
                    Loading Live Attendance Dashboard...
                </Typography>
            </Box>
        );
    }

    if (!dashboardData) {
        return (
            <Alert severity="error">
                Failed to load attendance dashboard. Please try refreshing the page.
            </Alert>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" gutterBottom>
                        Live Attendance Dashboard
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Real-time tracking of team attendance for today's events
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <FormControlLabel
                        control={
                            <Switch
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                            />
                        }
                        label="Auto-refresh"
                    />
                    <Button
                        startIcon={<RefreshIcon />}
                        onClick={() => fetchDashboardData()}
                        variant="outlined"
                    >
                        Refresh
                    </Button>
                    <Button
                        startIcon={<DownloadIcon />}
                        onClick={exportAttendanceData}
                        variant="outlined"
                    >
                        Export
                    </Button>
                </Box>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <EventIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                                <Box>
                                    <Typography variant="h4">
                                        {dashboardData.summary.totalEvents}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Events Today
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <PeopleIcon sx={{ fontSize: 40, mr: 2, color: 'info.main' }} />
                                <Box>
                                    <Typography variant="h4">
                                        {dashboardData.summary.totalAssigned}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Team Members
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <CheckCircleIcon sx={{ fontSize: 40, mr: 2, color: 'success.main' }} />
                                <Box>
                                    <Typography variant="h4">
                                        {dashboardData.summary.checkedIn}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Checked In
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <WarningIcon sx={{ fontSize: 40, mr: 2, color: 'warning.main' }} />
                                <Box>
                                    <Typography variant="h4">
                                        {dashboardData.summary.lateArrivals}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Late Arrivals
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
                    <Tab label="Events Overview" />
                    <Tab label="Live Map" />
                    <Tab label="Detailed Reports" />
                </Tabs>
            </Box>

            {/* Tab Panels */}
            {tabValue === 0 && (
                <Box>
                    {/* Filters */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                            <InputLabel>Filter</InputLabel>
                            <Select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                label="Filter"
                            >
                                <MenuItem value="all">All Events</MenuItem>
                                <MenuItem value="active">Active Events</MenuItem>
                                <MenuItem value="completed">Completed</MenuItem>
                                <MenuItem value="issues">With Issues</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>

                    {/* Events List */}
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Today's Events ({getFilteredEvents().length})
                            </Typography>
                            
                            {getFilteredEvents().length === 0 ? (
                                <Alert severity="info">
                                    No events found for the selected filter.
                                </Alert>
                            ) : (
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Event</TableCell>
                                                <TableCell>Client</TableCell>
                                                <TableCell>Time</TableCell>
                                                <TableCell>Venue</TableCell>
                                                <TableCell align="center">Team</TableCell>
                                                <TableCell align="center">Attendance</TableCell>
                                                <TableCell align="center">Progress</TableCell>
                                                <TableCell align="right">Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {getFilteredEvents().map((event) => (
                                                <TableRow key={event.eventId} hover>
                                                    <TableCell>
                                                        <Typography variant="subtitle2">
                                                            {event.eventName}
                                                        </Typography>
                                                        <Chip 
                                                            label={event.status} 
                                                            size="small" 
                                                            color={event.status === 'COMPLETED' ? 'success' : 'primary'}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2">
                                                            {event.clientName}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2">
                                                            {event.time}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" sx={{ maxWidth: 200 }}>
                                                            {event.venue}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Typography variant="body2">
                                                            {event.totalAssigned}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                                            <Badge badgeContent={event.checkedIn} color="success">
                                                                <CheckCircleIcon color="success" />
                                                            </Badge>
                                                            {event.lateArrivals > 0 && (
                                                                <Badge badgeContent={event.lateArrivals} color="warning">
                                                                    <WarningIcon color="warning" />
                                                                </Badge>
                                                            )}
                                                            {event.remoteCheckIns > 0 && (
                                                                <Badge badgeContent={event.remoteCheckIns} color="info">
                                                                    <LocationOnIcon color="info" />
                                                                </Badge>
                                                            )}
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <LinearProgress
                                                                variant="determinate"
                                                                value={getProgressPercentage(event)}
                                                                sx={{ width: 60, mr: 1 }}
                                                            />
                                                            <Typography variant="caption">
                                                                {Math.round(getProgressPercentage(event))}%
                                                            </Typography>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Button
                                                            size="small"
                                                            onClick={() => {
                                                                setSelectedEvent(event);
                                                                setEventDetailOpen(true);
                                                            }}
                                                            startIcon={<VisibilityIcon />}
                                                        >
                                                            Details
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </CardContent>
                    </Card>
                </Box>
            )}

            {tabValue === 1 && (
                <Box>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6">
                                    Live Location Map
                                </Typography>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={liveTracking}
                                            onChange={(e) => setLiveTracking(e.target.checked)}
                                        />
                                    }
                                    label="Live tracking"
                                />
                            </Box>
                            
                            <Box
                                ref={mapRef}
                                sx={{
                                    width: '100%',
                                    height: 600,
                                    borderRadius: 1,
                                    border: '1px solid',
                                    borderColor: 'divider'
                                }}
                            />
                            
                            <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                <Chip icon={<LocationOnIcon />} label="Event Venues" color="primary" size="small" />
                                <Chip icon={<CheckCircleIcon />} label="Checked In" color="success" size="small" />
                                <Chip icon={<WarningIcon />} label="Late Arrivals" color="warning" size="small" />
                                <Chip icon={<LocationOnIcon />} label="Remote Check-ins" color="info" size="small" />
                            </Box>
                        </CardContent>
                    </Card>
                </Box>
            )}

            {tabValue === 2 && (
                <Box>
                    <Grid container spacing={3}>
                        {dashboardData.events.map((event) => (
                            <Grid item xs={12} key={event.eventId}>
                                <Card>
                                    <CardContent>
                                        <Typography variant="h6" gutterBottom>
                                            {event.eventName} - {event.clientName}
                                        </Typography>
                                        
                                        <Grid container spacing={2} sx={{ mb: 2 }}>
                                            <Grid item xs={6} md={3}>
                                                <Typography variant="caption" color="text.secondary">Total Assigned</Typography>
                                                <Typography variant="h4">{event.totalAssigned}</Typography>
                                            </Grid>
                                            <Grid item xs={6} md={3}>
                                                <Typography variant="caption" color="text.secondary">Checked In</Typography>
                                                <Typography variant="h4" color="success.main">{event.checkedIn}</Typography>
                                            </Grid>
                                            <Grid item xs={6} md={3}>
                                                <Typography variant="caption" color="text.secondary">Checked Out</Typography>
                                                <Typography variant="h4" color="secondary.main">{event.checkedOut}</Typography>
                                            </Grid>
                                            <Grid item xs={6} md={3}>
                                                <Typography variant="caption" color="text.secondary">Late Arrivals</Typography>
                                                <Typography variant="h4" color="warning.main">{event.lateArrivals}</Typography>
                                            </Grid>
                                        </Grid>

                                        <Divider sx={{ my: 2 }} />

                                        <Typography variant="subtitle1" gutterBottom>Team Member Details</Typography>
                                        <List dense>
                                            {event.attendanceRecords?.map((record, index) => (
                                                <ListItem key={index} divider>
                                                    <ListItemAvatar>
                                                        <Avatar sx={{ bgcolor: getStatusChipColor(record.status) + '.main' }}>
                                                            {getStatusIcon(record.status)}
                                                        </Avatar>
                                                    </ListItemAvatar>
                                                    <ListItemText
                                                        primary={
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <Typography variant="subtitle1">
                                                                    {record.name}
                                                                </Typography>
                                                                <Chip
                                                                    size="small"
                                                                    label={record.role}
                                                                    variant="outlined"
                                                                />
                                                            </Box>
                                                        }
                                                        secondary={
                                                            <Box>
                                                                <Typography variant="body2" color="text.secondary">
                                                                    Status: {record.status.replace('_', ' ')}
                                                                </Typography>
                                                                {record.checkInTime && (
                                                                    <Typography variant="caption" display="block">
                                                                        Check-in: {formatTime(record.checkInTime)}
                                                                        {record.distance && ` • ${Math.round(record.distance)}m from venue`}
                                                                    </Typography>
                                                                )}
                                                                {record.checkOutTime && (
                                                                    <Typography variant="caption" display="block">
                                                                        Check-out: {formatTime(record.checkOutTime)}
                                                                        {record.workDurationHours && ` • ${record.workDurationHours}h worked`}
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                        }
                                                    />
                                                    <Chip
                                                        icon={getStatusIcon(record.status)}
                                                        label={record.status.replace('_', ' ')}
                                                        color={getStatusChipColor(record.status)}
                                                        size="small"
                                                    />
                                                </ListItem>
                                            ))}
                                        </List>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            )}

            {/* Event Detail Modal */}
            <Dialog open={eventDetailOpen} onClose={() => setEventDetailOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    Event Attendance Details: {selectedEvent?.eventName}
                </DialogTitle>
                <DialogContent>
                    {selectedEvent && (
                        <Box>
                            {/* Event Info */}
                            <Box sx={{ mb: 3, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <Typography variant="body2" color="text.secondary">Client</Typography>
                                        <Typography variant="body1">{selectedEvent.clientName}</Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="body2" color="text.secondary">Time</Typography>
                                        <Typography variant="body1">{selectedEvent.time}</Typography>
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Typography variant="body2" color="text.secondary">Venue</Typography>
                                        <Typography variant="body1">{selectedEvent.venue}</Typography>
                                    </Grid>
                                </Grid>
                            </Box>

                            {/* Attendance Summary */}
                            <Box sx={{ mb: 3 }}>
                                <Typography variant="h6" gutterBottom>Attendance Summary</Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={3}>
                                        <Typography variant="h4" color="primary.main">
                                            {selectedEvent.totalAssigned}
                                        </Typography>
                                        <Typography variant="caption">Total Assigned</Typography>
                                    </Grid>
                                    <Grid item xs={3}>
                                        <Typography variant="h4" color="success.main">
                                            {selectedEvent.checkedIn}
                                        </Typography>
                                        <Typography variant="caption">Checked In</Typography>
                                    </Grid>
                                    <Grid item xs={3}>
                                        <Typography variant="h4" color="secondary.main">
                                            {selectedEvent.checkedOut}
                                        </Typography>
                                        <Typography variant="caption">Completed</Typography>
                                    </Grid>
                                    <Grid item xs={3}>
                                        <Typography variant="h4" color="warning.main">
                                            {selectedEvent.lateArrivals}
                                        </Typography>
                                        <Typography variant="caption">Late Arrivals</Typography>
                                    </Grid>
                                </Grid>
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            {/* Individual Attendance Records */}
                            <Typography variant="h6" gutterBottom>Team Member Status</Typography>
                            <List>
                                {selectedEvent.attendanceRecords?.map((record, index) => (
                                    <ListItem key={index} divider>
                                        <ListItemAvatar>
                                            <Avatar sx={{ bgcolor: getStatusChipColor(record.status) + '.main' }}>
                                                {getStatusIcon(record.status)}
                                            </Avatar>
                                        </ListItemAvatar>
                                        <ListItemText
                                            primary={
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant="subtitle1">
                                                        {record.name}
                                                    </Typography>
                                                    <Chip
                                                        size="small"
                                                        label={record.role}
                                                        variant="outlined"
                                                    />
                                                </Box>
                                            }
                                            secondary={
                                                <Box>
                                                    <Typography variant="body2" color="text.secondary">
                                                        Status: {record.status.replace('_', ' ')}
                                                    </Typography>
                                                    {record.checkInTime && (
                                                        <Typography variant="caption" display="block">
                                                            Check-in: {formatTime(record.checkInTime)}
                                                            {record.distance && ` • ${Math.round(record.distance)}m from venue`}
                                                        </Typography>
                                                    )}
                                                    {record.checkOutTime && (
                                                        <Typography variant="caption" display="block">
                                                            Check-out: {formatTime(record.checkOutTime)}
                                                            {record.workDurationHours && ` • ${record.workDurationHours}h worked`}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            }
                                        />
                                        <Chip
                                            icon={getStatusIcon(record.status)}
                                            label={record.status.replace('_', ' ')}
                                            color={getStatusChipColor(record.status)}
                                            size="small"
                                        />
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
};

export default AdminAttendanceDashboard;
