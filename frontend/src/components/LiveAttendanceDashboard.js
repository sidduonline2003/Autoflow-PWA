import React, { useState, useEffect } from 'react';
import {
    Box,
    Container,
    Typography,
    Card,
    CardContent,
    Grid,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Button,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Alert,
    LinearProgress,
    Avatar,
    Divider,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    ListItemSecondaryAction,
    Tooltip,
    Badge,
    CircularProgress
} from '@mui/material';
import {
    LocationOn as LocationOnIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Error as ErrorIcon,
    Schedule as ScheduleIcon,
    Timer as TimerIcon,
    Refresh as RefreshIcon,
    Map as MapIcon,
    People as PeopleIcon,
    Event as EventIcon,
    Analytics as AnalyticsIcon,
    TrendingUp as TrendingUpIcon,
    AccessTime as AccessTimeIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import toast from 'react-hot-toast';

const LiveAttendanceDashboard = () => {
    const { user, claims } = useAuth();
    const [dashboardData, setDashboardData] = useState(null);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [eventDetailOpen, setEventDetailOpen] = useState(false);

    // Auto-refresh every 30 seconds and set up real-time listeners
    useEffect(() => {
        fetchDashboardData();
        
        // Set up Firebase real-time listeners
        const setupRealtimeListeners = async () => {
            if (!user?.claims?.orgId) return;
            
            try {
                // Listen to live dashboard collection for real-time updates
                const liveDashboardQuery = query(
                    collection(db, 'organizations', user.claims.orgId, 'liveDashboard')
                );
                
                const unsubscribeLive = onSnapshot(liveDashboardQuery, (snapshot) => {
                    console.log('Live attendance update received:', snapshot.docs.length, 'events');
                    fetchDashboardData(false); // Refresh data when changes detected
                });
                
                // Listen to attendance collection for real-time attendance updates
                const attendanceQuery = query(
                    collection(db, 'organizations', user.claims.orgId, 'attendance')
                );
                
                const unsubscribeAttendance = onSnapshot(attendanceQuery, (snapshot) => {
                    console.log('Attendance records update received:', snapshot.docs.length, 'records');
                    // Debounced refresh to avoid too many updates
                    setTimeout(() => fetchDashboardData(false), 500);
                });
                
                // Listen to notifications for real-time admin updates
                const notificationsQuery = query(
                    collection(db, 'organizations', user.claims.orgId, 'notifications'),
                    where('type', '==', 'ATTENDANCE_UPDATE')
                );
                
                const unsubscribeNotifications = onSnapshot(notificationsQuery, (snapshot) => {
                    const newNotifications = snapshot.docs.filter(doc => !doc.data().read);
                    if (newNotifications.length > 0) {
                        console.log('New attendance notifications:', newNotifications.length);
                        fetchDashboardData(false);
                    }
                });
                
                // Return cleanup function
                return () => {
                    unsubscribeLive();
                    unsubscribeAttendance();
                    unsubscribeNotifications();
                };
            } catch (error) {
                console.error('Error setting up real-time listeners:', error);
            }
        };
        
        const cleanupListeners = setupRealtimeListeners();
        
        // Auto-refresh as fallback
        const interval = setInterval(() => fetchDashboardData(false), 30000);
        
        return () => {
            clearInterval(interval);
            if (cleanupListeners) {
                cleanupListeners.then(cleanup => cleanup && cleanup());
            }
        };
    }, [user]);

    const fetchDashboardData = async (showRefreshMessage = false) => {
        try {
            if (showRefreshMessage) setRefreshing(true);
            
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/attendance/dashboard/live', {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });

            if (response.ok) {
                const data = await response.json();
                setDashboardData(data);
                if (showRefreshMessage) {
                    toast.success('Dashboard refreshed');
                }
            } else {
                throw new Error('Failed to fetch dashboard data');
            }
        } catch (error) {
            console.error('Error fetching dashboard:', error);
            if (showRefreshMessage) {
                toast.error('Failed to load attendance dashboard');
            }
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        fetchDashboardData(true);
    };

    const handleEventDetail = (event) => {
        setSelectedEvent(event);
        setEventDetailOpen(true);
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
            case 'not_checked_in':
                return 'error';
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
            case 'not_checked_in':
                return <ErrorIcon />;
            default:
                return <ScheduleIcon />;
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'checked_in':
                return 'Checked In';
            case 'checked_in_late':
                return 'Late Arrival';
            case 'checked_in_remote':
                return 'Remote Check-in';
            case 'checked_out':
                return 'Completed';
            case 'not_checked_in':
                return 'Not Checked In';
            default:
                return 'Unknown';
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return '-';
        try {
            const date = new Date(timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '-';
        }
    };

    const getProgressPercentage = (event) => {
        // If we have real-time progress data, use it
        if (event.progress !== undefined && event.progress !== null) {
            return event.progress;
        }
        // Fallback to attendance rate calculation
        return event.totalAssigned > 0 ? (event.checkedIn / event.totalAssigned * 100) : 0;
    };

    const getAttendanceRate = (event) => {
        return event.totalAssigned > 0 ? (event.checkedIn / event.totalAssigned * 100) : 0;
    };

    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4, textAlign: 'center' }}>
                <CircularProgress />
                <Typography variant="h6" sx={{ mt: 2 }}>
                    Loading Live Attendance Dashboard...
                </Typography>
            </Container>
        );
    }

    if (!dashboardData) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                <Alert severity="error">
                    Failed to load attendance dashboard. Please try refreshing the page.
                </Alert>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Box>
                    <Typography variant="h4" component="h1" gutterBottom>
                        Live Attendance Dashboard
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Real-time attendance tracking for {dashboardData.date}
                    </Typography>
                </Box>
                <Button
                    variant="outlined"
                    startIcon={refreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
                    onClick={handleRefresh}
                    disabled={refreshing}
                >
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                </Button>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
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
                                        {dashboardData.summary.totalCheckedIn}
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
                                <TrendingUpIcon sx={{ fontSize: 40, mr: 2, color: 'warning.main' }} />
                                <Box>
                                    <Typography variant="h4">
                                        {dashboardData.summary.attendanceRate}%
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Attendance Rate
                                    </Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Events List */}
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Today's Events
                    </Typography>
                    
                    {dashboardData.events.length === 0 ? (
                        <Alert severity="info">
                            No events scheduled for today.
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
                                    {dashboardData.events.map((event) => (
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
                                                    onClick={() => handleEventDetail(event)}
                                                    startIcon={<AnalyticsIcon />}
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

            {/* Event Detail Modal */}
            <Dialog open={eventDetailOpen} onClose={() => setEventDetailOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    Attendance Details: {selectedEvent?.eventName}
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
                                            <Avatar sx={{ bgcolor: getStatusColor(record.status) + '.main' }}>
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
                                                        Status: {getStatusText(record.status)}
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
                                        <ListItemSecondaryAction>
                                            <Chip
                                                icon={getStatusIcon(record.status)}
                                                label={getStatusText(record.status)}
                                                color={getStatusColor(record.status)}
                                                size="small"
                                            />
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                ))}
                            </List>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEventDetailOpen(false)}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default LiveAttendanceDashboard;
