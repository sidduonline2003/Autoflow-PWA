import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    Box, 
    Grid, 
    Typography, 
    Button, 
    IconButton, 
    FormControlLabel, 
    Switch, 
    Alert,
    CircularProgress,
    Fade,
    Skeleton,
    Chip,
    Paper,
    Tooltip,
    Badge,
    LinearProgress
} from '@mui/material';
import { 
    Refresh as RefreshIcon, 
    Fullscreen as FullscreenIcon,
    SignalCellularAlt as SignalIcon,
    Wifi as WifiIcon,
    WifiOff as WifiOffIcon,
    TrendingUp as TrendingUpIcon,
    Warning as WarningIcon,
    CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { db, auth } from '../firebase';
import { collection, query, onSnapshot, where, orderBy, limit } from 'firebase/firestore';
import toast from 'react-hot-toast';

// Import our new sub-components
import LivePulseMap from './attendance/LivePulseMap';
import ActivityStream from './attendance/ActivityStream';
import StatsWidget from './attendance/StatsWidget';

// Cache for dashboard data to enable instant display
const dashboardCache = {
    data: null,
    timestamp: null,
    maxAge: 60000 // 1 minute cache validity
};

const AdminAttendanceDashboard = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [initialLoad, setInitialLoad] = useState(true);
    const [dashboardData, setDashboardData] = useState(() => {
        // Initialize from cache if valid
        if (dashboardCache.data && dashboardCache.timestamp && 
            (Date.now() - dashboardCache.timestamp) < dashboardCache.maxAge) {
            return dashboardCache.data;
        }
        return null;
    });
    const [recentActivity, setRecentActivity] = useState([]);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [connectionStatus, setConnectionStatus] = useState('connected');
    const [lastRefreshTime, setLastRefreshTime] = useState(null);
    
    // Refs to prevent duplicate fetches and track listeners
    const fetchInProgressRef = useRef(false);
    const listenersSetupRef = useRef(false);
    const abortControllerRef = useRef(null);
    
    // Memoized fetch function to prevent recreation
    const fetchFullDashboardData = useCallback(async (showLoading = true) => {
        // Prevent duplicate fetches
        if (fetchInProgressRef.current) {
            console.log('Fetch already in progress, skipping...');
            return;
        }
        
        // Cancel any previous fetch
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        
        fetchInProgressRef.current = true;
        abortControllerRef.current = new AbortController();
        
        if (showLoading && !dashboardData) setLoading(true);
        
        try {
            if (!auth.currentUser) {
                setLoading(false);
                setInitialLoad(false);
                return;
            }
            
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/attendance/dashboard/live', {
                headers: { 'Authorization': `Bearer ${idToken}` },
                signal: abortControllerRef.current.signal
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('AdminAttendanceDashboard: API response received', {
                    date: data.date,
                    eventsCount: data.events?.length || 0,
                    summary: data.summary
                });
                setDashboardData(data);
                
                // Update cache
                dashboardCache.data = data;
                dashboardCache.timestamp = Date.now();
                
                // Extract activities from events as fallback
                // This ensures activity stream works even if Firestore listener fails
                if (data.events && data.events.length > 0) {
                    const extractedActivities = [];
                    data.events.forEach(event => {
                        if (event.attendanceRecords) {
                            event.attendanceRecords.forEach(record => {
                                if (record.status && record.status !== 'not_checked_in') {
                                    let type = 'check_in';
                                    let message = 'Checked in';
                                    
                                    if (record.status === 'checked_out') {
                                        type = 'check_out';
                                        message = 'Checked out';
                                    } else if (record.status === 'checked_in_late') {
                                        type = 'late';
                                        message = 'Late arrival';
                                    } else if (record.status === 'checked_in_remote') {
                                        type = 'remote';
                                        message = 'Remote check-in';
                                    }
                                    
                                    extractedActivities.push({
                                        id: `${event.eventId}-${record.userId}`,
                                        type,
                                        userName: record.name || 'Team Member',
                                        event: event.eventName || 'Event',
                                        message,
                                        timestamp: record.checkInTime ? new Date(record.checkInTime) : new Date(),
                                        distance: record.distance,
                                        status: record.status
                                    });
                                }
                            });
                        }
                    });
                    
                    // Sort and limit - only update if Firestore listener hasn't provided data
                    if (extractedActivities.length > 0) {
                        const sortedActivities = extractedActivities
                            .sort((a, b) => b.timestamp - a.timestamp)
                            .slice(0, 15);
                        
                        setRecentActivity(prev => {
                            // Prefer API data if we have more or fresher data
                            if (sortedActivities.length >= prev.length) {
                                return sortedActivities;
                            }
                            return prev;
                        });
                    }
                }
                
                setLastRefreshTime(new Date());
                setConnectionStatus('connected');
            } else {
                setConnectionStatus('error');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Fetch aborted');
                return;
            }
            console.error("Failed to fetch live dashboard", error);
            setConnectionStatus('error');
            // Don't toast on background refresh failure to avoid spamming
            if (showLoading && !dashboardData) {
                toast.error("Could not load live dashboard");
            }
        } finally {
            fetchInProgressRef.current = false;
            setLoading(false);
            setInitialLoad(false);
        }
    }, [dashboardData]);
    
    // Initial data fetch and real-time listeners setup
    useEffect(() => {
        if (!user?.claims?.orgId) {
            setLoading(false);
            setInitialLoad(false);
            return;
        }
        
        // Prevent duplicate listener setup
        if (listenersSetupRef.current) return;
        listenersSetupRef.current = true;
        
        const orgId = user.claims.orgId;

        // Fetch data immediately
        fetchFullDashboardData(true);

        // Debounce mechanism for Firestore updates
        let debounceTimer = null;
        const debouncedRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchFullDashboardData(false);
            }, 2000); // 2 second debounce to prevent rapid re-fetches
        };

        // 1. Listen for Dashboard Stats changes (lightweight)
        const dashboardQuery = query(collection(db, 'organizations', orgId, 'liveDashboard'));
        
        const unsubDashboard = onSnapshot(dashboardQuery, (snapshot) => {
            // Only trigger refresh if there are actual changes
            if (snapshot.docChanges().length > 0) {
                debouncedRefresh();
            }
        }, (error) => {
            console.error('Dashboard listener error:', error);
            setConnectionStatus('disconnected');
        });

        // 2. Listen for Activity Stream (lightweight - just status changes)
        // Get today's date at midnight in local time for Firestore query
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Query attendance records - use simple query without date filter initially
        // to avoid permission issues and missing field issues
        // Limit to recent records and filter in memory
        const activityQuery = query(
            collection(db, 'organizations', orgId, 'attendance'),
            orderBy('updatedAt', 'desc'),
            limit(30) // Get recent records
        );

        const unsubActivity = onSnapshot(activityQuery, (snapshot) => {
            console.log('Activity snapshot received:', snapshot.docs.length, 'documents');
            
            const todayStart = today.getTime();
            
            const activities = snapshot.docs
                .map(doc => {
                    const data = doc.data();
                    
                    // Determine activity type based on status
                    let type = 'check_in';
                    let message = 'Checked in';
                    
                    if (data.status === 'checked_out') {
                        type = 'check_out';
                        message = 'Checked out';
                    } else if (data.status === 'checked_in_late') {
                        type = 'late';
                        message = 'Late arrival';
                    } else if (data.status === 'checked_in_remote') {
                        type = 'remote';
                        message = 'Remote check-in';
                    }
                    
                    // Get timestamp - prefer updatedAt for latest activity, fallback to checkInTime
                    let timestamp;
                    if (data.updatedAt?.toDate) {
                        timestamp = data.updatedAt.toDate();
                    } else if (data.checkInTime?.toDate) {
                        timestamp = data.checkInTime.toDate();
                    } else if (data.createdAt?.toDate) {
                        timestamp = data.createdAt.toDate();
                    } else {
                        timestamp = new Date();
                    }
                    
                    // Get user name from various possible fields
                    const userName = data.userName || 
                                   data.memberName || 
                                   data.name ||
                                   'Team Member';

                    return {
                        id: doc.id,
                        type,
                        userName,
                        event: data.eventName || 'Event',
                        message,
                        timestamp,
                        distance: data.distance,
                        status: data.status
                    };
                })
                // Filter to today's activities in memory
                .filter(activity => activity.timestamp.getTime() >= todayStart)
                .sort((a, b) => b.timestamp - a.timestamp) // Sort by most recent
                .slice(0, 15); // Limit to 15 most recent
            
            console.log('Processed activities:', activities.length);
            setRecentActivity(activities);
            setConnectionStatus('connected');
        }, (error) => {
            console.error('Activity listener error:', error);
            // Firestore failed - fallback to API data
            // Data from API is already set via fetchFullDashboardData
            console.log('Using API data fallback for activities');
            setConnectionStatus('degraded');
        });

        return () => {
            listenersSetupRef.current = false;
            if (debounceTimer) clearTimeout(debounceTimer);
            if (abortControllerRef.current) abortControllerRef.current.abort();
            unsubDashboard();
            unsubActivity();
        };
    }, [user, fetchFullDashboardData]);

    // Periodic refresh for consistency
    useEffect(() => {
        if (!autoRefresh) return;
        
        const interval = setInterval(() => {
            fetchFullDashboardData(false);
        }, 45000); // 45s refresh for better balance

        return () => clearInterval(interval);
    }, [autoRefresh, fetchFullDashboardData]);
    
    // Manual refresh handler
    const handleManualRefresh = useCallback(() => {
        fetchFullDashboardData(true);
        toast.success('Refreshing dashboard...', { duration: 1500 });
    }, [fetchFullDashboardData]);
    
    // Memoized summary data for stats widget
    const summaryData = useMemo(() => {
        if (!dashboardData?.summary) {
            return {
                totalEvents: 0,
                totalAssigned: 0,
                totalCheckedIn: 0,
                totalCheckedOut: 0,
                lateArrivals: 0,
                remoteCheckIns: 0,
                attendanceRate: 0
            };
        }
        return dashboardData.summary;
    }, [dashboardData?.summary]);
    
    // Memoized events data for map
    const eventsData = useMemo(() => {
        const events = dashboardData?.events || [];
        console.log('AdminAttendanceDashboard: eventsData computed', {
            hasData: !!dashboardData,
            eventsCount: events.length,
            firstEvent: events[0] ? {
                name: events[0].eventName,
                hasRecords: events[0].attendanceRecords?.length || 0
            } : null
        });
        return events;
    }, [dashboardData?.events]);

    // Loading skeleton for initial load
    if (initialLoad && !dashboardData) {
        return (
            <Box sx={{ position: 'relative', minHeight: 'calc(100vh - 100px)' }}>
                {/* Header Skeleton */}
                <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Box>
                            <Skeleton variant="text" width={200} height={40} />
                            <Skeleton variant="text" width={300} height={24} />
                        </Box>
                        <Skeleton variant="rounded" width={180} height={40} />
                    </Box>
                    
                    {/* Stats Widget Skeleton */}
                    <Grid container spacing={3}>
                        {[1, 2, 3, 4].map((i) => (
                            <Grid size={{ xs: 12, sm: 6, md: 3 }} key={i}>
                                <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />
                            </Grid>
                        ))}
                    </Grid>
                </Box>
                
                {/* Map & Activity Skeleton */}
                <Grid container spacing={3} sx={{ height: 650 }}>
                    <Grid size={{ xs: 12, lg: 9 }}>
                        <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 3 }} />
                    </Grid>
                    <Grid size={{ xs: 12, lg: 3 }}>
                        <Skeleton variant="rounded" height="100%" sx={{ borderRadius: 3 }} />
                    </Grid>
                </Grid>
                
                {/* Loading indicator overlay */}
                <Box sx={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2
                }}>
                    <CircularProgress size={48} thickness={4} sx={{ color: '#3b82f6' }} />
                    <Typography variant="body2" color="text.secondary" fontWeight={500}>
                        Loading Mission Control...
                    </Typography>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ position: 'relative', minHeight: 'calc(100vh - 100px)' }}>
            {/* Connection Status Bar */}
            {connectionStatus !== 'connected' && (
                <Alert 
                    severity={connectionStatus === 'error' ? 'error' : 'warning'} 
                    sx={{ mb: 2, borderRadius: 2 }}
                    icon={<WifiOffIcon />}
                >
                    {connectionStatus === 'error' 
                        ? 'Connection issue detected. Data may be outdated. Click refresh to retry.'
                        : 'Reconnecting to live feed...'}
                </Alert>
            )}
            
            {/* 1. Today at a Glance Header */}
            <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                    <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <Typography variant="h5" fontWeight={800} sx={{ color: '#1e293b' }}>
                                Mission Control
                            </Typography>
                            <Chip 
                                size="small"
                                icon={connectionStatus === 'connected' ? <WifiIcon sx={{ fontSize: 14 }} /> : <WifiOffIcon sx={{ fontSize: 14 }} />}
                                label={connectionStatus === 'connected' ? 'Live' : 'Offline'}
                                color={connectionStatus === 'connected' ? 'success' : 'warning'}
                                variant="filled"
                                sx={{ 
                                    height: 24, 
                                    fontWeight: 600,
                                    fontSize: '0.7rem',
                                    animation: connectionStatus === 'connected' ? 'pulse 2s infinite' : 'none',
                                    '@keyframes pulse': {
                                        '0%': { opacity: 1 },
                                        '50%': { opacity: 0.7 },
                                        '100%': { opacity: 1 }
                                    }
                                }}
                            />
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            Live operational view for {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            {lastRefreshTime && (
                                <Typography component="span" variant="caption" sx={{ ml: 1, opacity: 0.7 }}>
                                    • Updated {lastRefreshTime.toLocaleTimeString()}
                                </Typography>
                            )}
                        </Typography>
                    </Box>
                    
                    <Paper 
                        elevation={0}
                        sx={{ 
                            display: 'flex', 
                            gap: 1, 
                            alignItems: 'center', 
                            bgcolor: 'white', 
                            p: 1, 
                            pl: 2,
                            borderRadius: 2, 
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                        }}
                    >
                        <FormControlLabel
                            control={
                                <Switch 
                                    size="small" 
                                    checked={autoRefresh} 
                                    onChange={(e) => setAutoRefresh(e.target.checked)}
                                    color="success"
                                />
                            }
                            label={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                    <SignalIcon sx={{ fontSize: 14, color: autoRefresh ? '#22c55e' : '#94a3b8' }} />
                                    <Typography variant="caption" fontWeight={600}>Auto-Sync</Typography>
                                </Box>
                            }
                            sx={{ mr: 1 }}
                        />
                        <Tooltip title="Refresh Now">
                            <IconButton 
                                size="small" 
                                onClick={handleManualRefresh}
                                disabled={loading}
                                sx={{ 
                                    bgcolor: '#f1f5f9',
                                    '&:hover': { bgcolor: '#e2e8f0' }
                                }}
                            >
                                <RefreshIcon 
                                    fontSize="small" 
                                    sx={{ 
                                        animation: loading ? 'spin 1s linear infinite' : 'none',
                                        '@keyframes spin': {
                                            '0%': { transform: 'rotate(0deg)' },
                                            '100%': { transform: 'rotate(360deg)' }
                                        }
                                    }} 
                                />
                            </IconButton>
                        </Tooltip>
                    </Paper>
                </Box>
                
                {/* Stats Widget with memoized data */}
                <Fade in={true} timeout={500}>
                    <Box>
                        <StatsWidget summary={summaryData} />
                    </Box>
                </Fade>
                
                {/* Quick Insights Bar */}
                {summaryData.totalEvents > 0 && (
                    <Fade in={true} timeout={700}>
                        <Paper 
                            elevation={0}
                            sx={{ 
                                mt: 2, 
                                p: 1.5, 
                                borderRadius: 2, 
                                bgcolor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2,
                                flexWrap: 'wrap'
                            }}
                        >
                            <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                Quick Insights:
                            </Typography>
                            
                            {summaryData.attendanceRate >= 80 && (
                                <Chip 
                                    size="small"
                                    icon={<TrendingUpIcon sx={{ fontSize: 14 }} />}
                                    label="High Attendance Day"
                                    color="success"
                                    variant="outlined"
                                    sx={{ height: 24 }}
                                />
                            )}
                            
                            {summaryData.lateArrivals > 0 && (
                                <Chip 
                                    size="small"
                                    icon={<WarningIcon sx={{ fontSize: 14 }} />}
                                    label={`${summaryData.lateArrivals} Late Arrivals`}
                                    color="warning"
                                    variant="outlined"
                                    sx={{ height: 24 }}
                                />
                            )}
                            
                            {summaryData.totalCheckedOut > 0 && (
                                <Chip 
                                    size="small"
                                    icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                                    label={`${summaryData.totalCheckedOut} Completed Shifts`}
                                    color="info"
                                    variant="outlined"
                                    sx={{ height: 24 }}
                                />
                            )}
                            
                            {summaryData.totalAssigned > 0 && summaryData.totalCheckedIn === 0 && (
                                <Chip 
                                    size="small"
                                    label="Awaiting First Check-ins"
                                    color="default"
                                    variant="outlined"
                                    sx={{ height: 24 }}
                                />
                            )}
                        </Paper>
                    </Fade>
                )}
            </Box>

            {/* 2. Main Content Area: Map & Stream */}
            <Fade in={true} timeout={800}>
                <Grid container spacing={3} sx={{ height: 650 }}>
                    {/* Left: The Live Map */}
                    <Grid size={{ xs: 12, lg: 9 }} sx={{ height: '100%' }}>
                        <LivePulseMap 
                            events={eventsData} 
                            onMarkerClick={(user, event) => {
                                toast.success(`Viewing ${user.name} at ${event.eventName}`, { duration: 2000 });
                            }}
                        />
                    </Grid>

                    {/* Right: Activity Stream */}
                    <Grid size={{ xs: 12, lg: 3 }} sx={{ height: '100%' }}>
                        <ActivityStream activities={recentActivity} isLoading={initialLoad} />
                    </Grid>
                </Grid>
            </Fade>
            
            {/* Loading overlay for background refresh */}
            {loading && dashboardData && (
                <LinearProgress 
                    sx={{ 
                        position: 'absolute', 
                        top: 0, 
                        left: 0, 
                        right: 0,
                        height: 2,
                        borderRadius: 1
                    }} 
                />
            )}
        </Box>
    );
};

export default AdminAttendanceDashboard;