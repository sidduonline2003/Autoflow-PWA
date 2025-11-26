import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
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
    CircularProgress,
    TextField,
    InputAdornment,
    Skeleton,
    Fade,
    Collapse,
    Tab,
    Tabs,
    Select,
    MenuItem,
    FormControl,
    InputLabel
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
    AccessTime as AccessTimeIcon,
    Search as SearchIcon,
    FilterList as FilterIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Download as DownloadIcon,
    CalendarToday as CalendarIcon,
    WorkOutline as WorkIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { onSnapshot, collection, query, where } from 'firebase/firestore';
import toast from 'react-hot-toast';

// Cache for dashboard data
const detailedDashboardCache = {
    data: null,
    timestamp: null,
    maxAge: 60000
};

// Memoized Summary Card Component
const SummaryCard = memo(({ icon, value, label, color, trend }) => (
    <Card sx={{ 
        height: '100%',
        borderRadius: 3,
        border: '1px solid #e2e8f0',
        boxShadow: 'none',
        transition: 'all 0.2s ease',
        '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
        }
    }}>
        <CardContent sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Avatar sx={{ 
                    bgcolor: `${color}.50`, 
                    color: `${color}.main`,
                    width: 48, 
                    height: 48, 
                    mr: 2,
                    boxShadow: `0 4px 12px ${color === 'primary' ? 'rgba(59, 130, 246, 0.2)' : 
                                color === 'success' ? 'rgba(34, 197, 94, 0.2)' : 
                                color === 'warning' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(6, 182, 212, 0.2)'}`
                }}>
                    {icon}
                </Avatar>
                <Box>
                    <Typography variant="h4" fontWeight={700} color={`${color}.main`}>
                        {value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                        {label}
                    </Typography>
                </Box>
            </Box>
        </CardContent>
    </Card>
));

SummaryCard.displayName = 'SummaryCard';

// Memoized Event Row Component
const EventRow = memo(({ event, onDetailClick, getProgressPercentage, getStatusColor }) => {
    const [expanded, setExpanded] = useState(false);
    
    const progressValue = useMemo(() => getProgressPercentage(event), [event, getProgressPercentage]);
    
    return (
        <>
            <TableRow 
                hover 
                sx={{ 
                    cursor: 'pointer',
                    '&:hover': { bgcolor: '#f8fafc' },
                    transition: 'background 0.15s ease'
                }}
                onClick={() => setExpanded(!expanded)}
            >
                <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconButton size="small" sx={{ p: 0.5 }}>
                            {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                        </IconButton>
                        <Box>
                            <Typography variant="subtitle2" fontWeight={600} color="#1e293b">
                                {event.eventName}
                            </Typography>
                            <Chip 
                                label={event.status} 
                                size="small" 
                                color={event.status === 'COMPLETED' ? 'success' : event.status === 'IN_PROGRESS' ? 'primary' : 'default'}
                                sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, mt: 0.5 }}
                            />
                        </Box>
                    </Box>
                </TableCell>
                <TableCell>
                    <Typography variant="body2" fontWeight={500}>
                        {event.clientName}
                    </Typography>
                </TableCell>
                <TableCell>
                    <Chip 
                        icon={<AccessTimeIcon sx={{ fontSize: 14 }} />}
                        label={event.time}
                        size="small"
                        variant="outlined"
                        sx={{ height: 24, fontWeight: 500 }}
                    />
                </TableCell>
                <TableCell>
                    <Tooltip title={event.venue} arrow placement="top">
                        <Typography 
                            variant="body2" 
                            sx={{ 
                                maxWidth: 180, 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {event.venue}
                        </Typography>
                    </Tooltip>
                </TableCell>
                <TableCell align="center">
                    <Chip 
                        label={event.totalAssigned}
                        size="small"
                        sx={{ minWidth: 32, fontWeight: 600 }}
                    />
                </TableCell>
                <TableCell align="center">
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                        <Badge badgeContent={event.checkedIn} color="success" max={99}>
                            <CheckCircleIcon color="success" fontSize="small" />
                        </Badge>
                        {event.lateArrivals > 0 && (
                            <Badge badgeContent={event.lateArrivals} color="warning" max={99}>
                                <WarningIcon color="warning" fontSize="small" />
                            </Badge>
                        )}
                        {event.remoteCheckIns > 0 && (
                            <Badge badgeContent={event.remoteCheckIns} color="info" max={99}>
                                <LocationOnIcon color="info" fontSize="small" />
                            </Badge>
                        )}
                    </Box>
                </TableCell>
                <TableCell align="center" sx={{ minWidth: 120 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                        <LinearProgress
                            variant="determinate"
                            value={progressValue}
                            sx={{ 
                                width: 60, 
                                height: 6, 
                                borderRadius: 3,
                                bgcolor: '#e2e8f0',
                                '& .MuiLinearProgress-bar': {
                                    borderRadius: 3,
                                    bgcolor: progressValue >= 80 ? '#22c55e' : progressValue >= 50 ? '#3b82f6' : '#f59e0b'
                                }
                            }}
                        />
                        <Typography variant="caption" fontWeight={600} color={progressValue >= 80 ? 'success.main' : 'text.secondary'}>
                            {Math.round(progressValue)}%
                        </Typography>
                    </Box>
                </TableCell>
                <TableCell align="right">
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDetailClick(event);
                        }}
                        startIcon={<AnalyticsIcon />}
                        sx={{ 
                            borderRadius: 2,
                            textTransform: 'none',
                            fontWeight: 600
                        }}
                    >
                        Details
                    </Button>
                </TableCell>
            </TableRow>
            
            {/* Expanded Quick View */}
            <TableRow>
                <TableCell colSpan={8} sx={{ py: 0, border: 0 }}>
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2, px: 4, bgcolor: '#f8fafc', borderRadius: 2, my: 1 }}>
                            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                                Quick Team Overview
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                {event.attendanceRecords?.slice(0, 6).map((record, idx) => (
                                    <Chip
                                        key={idx}
                                        avatar={
                                            <Avatar sx={{ bgcolor: getStatusColor(record.status) + '.main' }}>
                                                {record.name?.[0] || 'T'}
                                            </Avatar>
                                        }
                                        label={record.name || 'Team Member'}
                                        size="small"
                                        variant={record.status === 'checked_in' ? 'filled' : 'outlined'}
                                        color={getStatusColor(record.status)}
                                        sx={{ height: 28 }}
                                    />
                                ))}
                                {event.attendanceRecords?.length > 6 && (
                                    <Chip 
                                        label={`+${event.attendanceRecords.length - 6} more`}
                                        size="small"
                                        sx={{ height: 28 }}
                                    />
                                )}
                            </Box>
                        </Box>
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
});

EventRow.displayName = 'EventRow';

// Loading Skeleton Component
const DashboardSkeleton = () => (
    <Container maxWidth="xl" sx={{ mt: 3, mb: 4 }}>
        <Skeleton variant="text" width={300} height={40} />
        <Skeleton variant="text" width={200} height={24} sx={{ mb: 3 }} />
        
        <Grid container spacing={3} sx={{ mb: 4 }}>
            {[1, 2, 3, 4].map((i) => (
                <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                    <Skeleton variant="rounded" height={100} sx={{ borderRadius: 3 }} />
                </Grid>
            ))}
        </Grid>
        
        <Skeleton variant="rounded" height={400} sx={{ borderRadius: 3 }} />
    </Container>
);

const LiveAttendanceDashboard = () => {
    const { user, claims, loading: authLoading } = useAuth();
    const [dashboardData, setDashboardData] = useState(() => {
        if (detailedDashboardCache.data && detailedDashboardCache.timestamp && 
            (Date.now() - detailedDashboardCache.timestamp) < detailedDashboardCache.maxAge) {
            return detailedDashboardCache.data;
        }
        return null;
    });
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [eventDetailOpen, setEventDetailOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [detailTab, setDetailTab] = useState(0);
    
    // Refs to prevent duplicate operations
    const fetchInProgressRef = useRef(false);
    const abortControllerRef = useRef(null);

    // Safety timeout to prevent infinite loading
    useEffect(() => {
        const timer = setTimeout(() => {
            if (loading) {
                console.warn('LiveAttendanceDashboard: Force stopping loading after 8s safety timeout');
                setLoading(false);
            }
        }, 8000);
        return () => clearTimeout(timer);
    }, [loading]);

    // Memoized fetch function
    const fetchDashboardData = useCallback(async (showRefreshMessage = false) => {
        if (fetchInProgressRef.current) return;
        
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        
        fetchInProgressRef.current = true;
        abortControllerRef.current = new AbortController();
        
        try {
            if (showRefreshMessage) setRefreshing(true);
            
            if (!auth.currentUser) {
                setLoading(false);
                return;
            }

            const idToken = await auth.currentUser.getIdToken();
            
            const response = await fetch('/api/attendance/dashboard/live', {
                headers: { 'Authorization': `Bearer ${idToken}` },
                signal: abortControllerRef.current.signal
            });

            if (response.ok) {
                const data = await response.json();
                setDashboardData(data);
                
                // Update cache
                detailedDashboardCache.data = data;
                detailedDashboardCache.timestamp = Date.now();
                
                if (showRefreshMessage) {
                    toast.success('Dashboard refreshed');
                }
            } else {
                throw new Error('Failed to fetch dashboard data');
            }
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Error fetching dashboard:', error);
            if (showRefreshMessage) {
                toast.error('Failed to refresh dashboard');
            }
        } finally {
            fetchInProgressRef.current = false;
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    // Initial fetch and real-time updates
    useEffect(() => {
        if (authLoading) return;

        if (!user || !claims?.orgId) {
            setLoading(false);
            return;
        }

        fetchDashboardData();
        
        // Debounced real-time listener
        let debounceTimer = null;
        const debouncedRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => fetchDashboardData(false), 3000);
        };
        
        // Listen for attendance updates
        const attendanceQuery = query(
            collection(db, 'organizations', claims.orgId, 'attendance')
        );
        
        const unsubscribe = onSnapshot(attendanceQuery, (snapshot) => {
            if (snapshot.docChanges().length > 0) {
                debouncedRefresh();
            }
        }, (error) => {
            // Handle permission errors gracefully - just rely on API polling
            console.warn('Attendance listener error (falling back to polling):', error.code);
        });
        
        // Auto-refresh interval
        const interval = setInterval(() => fetchDashboardData(false), 45000);
        
        return () => {
            clearInterval(interval);
            if (debounceTimer) clearTimeout(debounceTimer);
            if (abortControllerRef.current) abortControllerRef.current.abort();
            unsubscribe();
        };
    }, [user, claims, authLoading, fetchDashboardData]);

    // Memoized filtered events
    const filteredEvents = useMemo(() => {
        if (!dashboardData?.events) return [];
        
        return dashboardData.events.filter(event => {
            const matchesSearch = !searchTerm || 
                event.eventName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                event.clientName?.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesStatus = statusFilter === 'all' || event.status === statusFilter;
            
            return matchesSearch && matchesStatus;
        });
    }, [dashboardData?.events, searchTerm, statusFilter]);

    // Helper functions - memoized
    const getStatusColor = useCallback((status) => {
        switch (status) {
            case 'checked_in': return 'success';
            case 'checked_in_late': return 'warning';
            case 'checked_in_remote': return 'info';
            case 'checked_out': return 'secondary';
            case 'not_checked_in': return 'error';
            default: return 'default';
        }
    }, []);

    const getStatusIcon = useCallback((status) => {
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
    }, []);

    const getStatusText = useCallback((status) => {
        switch (status) {
            case 'checked_in': return 'On Site';
            case 'checked_in_late': return 'Late Arrival';
            case 'checked_in_remote': return 'Remote';
            case 'checked_out': return 'Completed';
            case 'not_checked_in': return 'Pending';
            default: return 'Unknown';
        }
    }, []);

    const formatTime = useCallback((timestamp) => {
        if (!timestamp) return '-';
        try {
            return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '-';
        }
    }, []);

    const getProgressPercentage = useCallback((event) => {
        if (event.progress !== undefined && event.progress !== null) {
            return event.progress;
        }
        return event.totalAssigned > 0 ? (event.checkedIn / event.totalAssigned * 100) : 0;
    }, []);

    const handleRefresh = useCallback(() => {
        fetchDashboardData(true);
    }, [fetchDashboardData]);

    const handleEventDetail = useCallback((event) => {
        setSelectedEvent(event);
        setDetailTab(0);
        setEventDetailOpen(true);
    }, []);

    // Loading state
    if (loading && !dashboardData) {
        return <DashboardSkeleton />;
    }

    if (!user) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    Please log in to view the dashboard.
                </Alert>
            </Container>
        );
    }

    if (!claims?.orgId) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                <Alert severity="warning" sx={{ borderRadius: 2 }}>
                    You are not associated with any organization. Please contact your administrator.
                </Alert>
            </Container>
        );
    }

    if (!dashboardData) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                <Alert severity="error" sx={{ borderRadius: 2 }}>
                    Failed to load attendance dashboard. Please try refreshing the page.
                </Alert>
            </Container>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ mt: 3, mb: 4, position: 'relative' }}>
            {/* Loading overlay for background refresh */}
            {refreshing && (
                <LinearProgress 
                    sx={{ 
                        position: 'fixed', 
                        top: 0, 
                        left: 0, 
                        right: 0,
                        zIndex: 9999,
                        height: 3
                    }} 
                />
            )}
            
            {/* Header */}
            <Fade in timeout={300}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4, flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="h4" fontWeight={800} color="#1e293b">
                                Detailed Attendance View
                            </Typography>
                            <Chip 
                                icon={<CalendarIcon sx={{ fontSize: 14 }} />}
                                label={new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                size="small"
                                sx={{ height: 28, fontWeight: 600 }}
                            />
                        </Box>
                        <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
                            Comprehensive attendance tracking with detailed event insights
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Export Report">
                            <IconButton sx={{ bgcolor: '#f1f5f9' }}>
                                <DownloadIcon />
                            </IconButton>
                        </Tooltip>
                        <Button
                            variant="contained"
                            startIcon={refreshing ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                            onClick={handleRefresh}
                            disabled={refreshing}
                            sx={{ 
                                borderRadius: 2,
                                textTransform: 'none',
                                fontWeight: 600,
                                px: 3
                            }}
                        >
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </Button>
                    </Box>
                </Box>
            </Fade>

            {/* Summary Cards */}
            <Fade in timeout={400}>
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <SummaryCard 
                            icon={<EventIcon />}
                            value={dashboardData?.summary?.totalEvents || 0}
                            label="Events Today"
                            color="primary"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <SummaryCard 
                            icon={<PeopleIcon />}
                            value={dashboardData?.summary?.totalAssigned || 0}
                            label="Team Members"
                            color="info"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <SummaryCard 
                            icon={<CheckCircleIcon />}
                            value={dashboardData?.summary?.totalCheckedIn || 0}
                            label="Checked In"
                            color="success"
                        />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                        <SummaryCard 
                            icon={<TrendingUpIcon />}
                            value={`${dashboardData?.summary?.attendanceRate || 0}%`}
                            label="Attendance Rate"
                            color="warning"
                        />
                    </Grid>
                </Grid>
            </Fade>

            {/* Events Table with Search and Filter */}
            <Fade in timeout={500}>
                <Paper sx={{ borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    {/* Table Header with Search */}
                    <Box sx={{ p: 2.5, borderBottom: '1px solid #e2e8f0', bgcolor: '#fafbfc' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                            <Typography variant="h6" fontWeight={700} color="#1e293b">
                                Today's Events ({filteredEvents.length})
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                <TextField
                                    size="small"
                                    placeholder="Search events..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    InputProps={{
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon color="action" fontSize="small" />
                                            </InputAdornment>
                                        )
                                    }}
                                    sx={{ 
                                        minWidth: 220,
                                        '& .MuiOutlinedInput-root': { borderRadius: 2 }
                                    }}
                                />
                                <FormControl size="small" sx={{ minWidth: 140 }}>
                                    <InputLabel>Status</InputLabel>
                                    <Select
                                        value={statusFilter}
                                        label="Status"
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        sx={{ borderRadius: 2 }}
                                    >
                                        <MenuItem value="all">All Status</MenuItem>
                                        <MenuItem value="UPCOMING">Upcoming</MenuItem>
                                        <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                                        <MenuItem value="COMPLETED">Completed</MenuItem>
                                    </Select>
                                </FormControl>
                            </Box>
                        </Box>
                    </Box>
                    
                    {filteredEvents.length === 0 ? (
                        <Box sx={{ p: 6, textAlign: 'center' }}>
                            <EventIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 2 }} />
                            <Typography variant="h6" color="text.secondary" gutterBottom>
                                No events found
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {searchTerm || statusFilter !== 'all' 
                                    ? 'Try adjusting your search or filter criteria'
                                    : 'No events scheduled for today'}
                            </Typography>
                        </Box>
                    ) : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                        <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Event</TableCell>
                                        <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Client</TableCell>
                                        <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Time</TableCell>
                                        <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Venue</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700, color: '#475569' }}>Team</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700, color: '#475569' }}>Attendance</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700, color: '#475569' }}>Progress</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 700, color: '#475569' }}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredEvents.map((event) => (
                                        <EventRow 
                                            key={event.eventId}
                                            event={event}
                                            onDetailClick={handleEventDetail}
                                            getProgressPercentage={getProgressPercentage}
                                            getStatusColor={getStatusColor}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>
            </Fade>

            {/* Enhanced Event Detail Modal */}
            <Dialog 
                open={eventDetailOpen} 
                onClose={() => setEventDetailOpen(false)} 
                maxWidth="md" 
                fullWidth
                PaperProps={{
                    sx: { borderRadius: 3 }
                }}
            >
                <DialogTitle sx={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    borderBottom: '1px solid #e2e8f0',
                    pb: 2
                }}>
                    <Box>
                        <Typography variant="h6" fontWeight={700}>
                            {selectedEvent?.eventName}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Attendance Details
                        </Typography>
                    </Box>
                    <IconButton onClick={() => setEventDetailOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                
                <DialogContent sx={{ p: 0 }}>
                    {selectedEvent && (
                        <Box>
                            {/* Tabs */}
                            <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
                                <Tabs value={detailTab} onChange={(e, v) => setDetailTab(v)}>
                                    <Tab label="Overview" />
                                    <Tab label="Team Status" />
                                    <Tab label="Timeline" />
                                </Tabs>
                            </Box>
                            
                            {/* Tab Content */}
                            <Box sx={{ p: 3 }}>
                                {detailTab === 0 && (
                                    <Box>
                                        {/* Event Info */}
                                        <Paper sx={{ p: 2.5, bgcolor: '#f8fafc', borderRadius: 2, mb: 3 }}>
                                            <Grid container spacing={3}>
                                                <Grid size={{ xs: 12, sm: 4 }}>
                                                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Client</Typography>
                                                    <Typography variant="body1" fontWeight={500}>{selectedEvent.clientName}</Typography>
                                                </Grid>
                                                <Grid size={{ xs: 12, sm: 4 }}>
                                                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Time</Typography>
                                                    <Typography variant="body1" fontWeight={500}>{selectedEvent.time}</Typography>
                                                </Grid>
                                                <Grid size={{ xs: 12, sm: 4 }}>
                                                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Status</Typography>
                                                    <Chip 
                                                        label={selectedEvent.status} 
                                                        size="small" 
                                                        color={selectedEvent.status === 'COMPLETED' ? 'success' : 'primary'}
                                                        sx={{ mt: 0.5 }}
                                                    />
                                                </Grid>
                                                <Grid size={{ xs: 12 }}>
                                                    <Typography variant="caption" color="text.secondary" fontWeight={600}>Venue</Typography>
                                                    <Typography variant="body1" fontWeight={500}>{selectedEvent.venue}</Typography>
                                                </Grid>
                                            </Grid>
                                        </Paper>

                                        {/* Attendance Summary */}
                                        <Typography variant="subtitle1" fontWeight={700} gutterBottom>
                                            Attendance Summary
                                        </Typography>
                                        <Grid container spacing={2} sx={{ mb: 3 }}>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
                                                    <Typography variant="h4" color="primary.main" fontWeight={700}>
                                                        {selectedEvent.totalAssigned}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">Assigned</Typography>
                                                </Paper>
                                            </Grid>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
                                                    <Typography variant="h4" color="success.main" fontWeight={700}>
                                                        {selectedEvent.checkedIn}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">Checked In</Typography>
                                                </Paper>
                                            </Grid>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
                                                    <Typography variant="h4" color="info.main" fontWeight={700}>
                                                        {selectedEvent.checkedOut}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">Completed</Typography>
                                                </Paper>
                                            </Grid>
                                            <Grid size={{ xs: 6, sm: 3 }}>
                                                <Paper sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}>
                                                    <Typography variant="h4" color="warning.main" fontWeight={700}>
                                                        {selectedEvent.lateArrivals}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">Late</Typography>
                                                </Paper>
                                            </Grid>
                                        </Grid>
                                    </Box>
                                )}
                                
                                {detailTab === 1 && (
                                    <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                                        {selectedEvent.attendanceRecords?.map((record, index) => (
                                            <ListItem 
                                                key={index} 
                                                divider
                                                sx={{ 
                                                    borderRadius: 2, 
                                                    mb: 1,
                                                    bgcolor: record.status === 'checked_in' ? 'success.50' : 'transparent'
                                                }}
                                            >
                                                <ListItemAvatar>
                                                    <Avatar sx={{ bgcolor: getStatusColor(record.status) + '.main' }}>
                                                        {getStatusIcon(record.status)}
                                                    </Avatar>
                                                </ListItemAvatar>
                                                <ListItemText
                                                    primary={
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Typography variant="subtitle1" fontWeight={600}>
                                                                {record.name}
                                                            </Typography>
                                                            <Chip size="small" label={record.role} variant="outlined" sx={{ height: 22 }} />
                                                        </Box>
                                                    }
                                                    secondary={
                                                        <Box sx={{ mt: 0.5 }}>
                                                            {record.checkInTime && (
                                                                <Typography variant="body2" color="text.secondary">
                                                                    Check-in: {formatTime(record.checkInTime)}
                                                                    {record.distance && ` • ${Math.round(record.distance)}m from venue`}
                                                                </Typography>
                                                            )}
                                                            {record.checkOutTime && (
                                                                <Typography variant="body2" color="text.secondary">
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
                                                        sx={{ fontWeight: 600 }}
                                                    />
                                                </ListItemSecondaryAction>
                                            </ListItem>
                                        ))}
                                    </List>
                                )}
                                
                                {detailTab === 2 && (
                                    <Box sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }}>
                                        <AccessTimeIcon sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
                                        <Typography>Timeline view coming soon</Typography>
                                    </Box>
                                )}
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                
                <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #e2e8f0' }}>
                    <Button 
                        onClick={() => setEventDetailOpen(false)}
                        variant="outlined"
                        sx={{ borderRadius: 2 }}
                    >
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default LiveAttendanceDashboard;
