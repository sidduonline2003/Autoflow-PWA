import React, { useState, useEffect } from 'react';
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
    Fade
} from '@mui/material';
import { Refresh as RefreshIcon, Fullscreen as FullscreenIcon } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { db, auth } from '../firebase';
import { collection, query, onSnapshot, where, orderBy, limit } from 'firebase/firestore';
import toast from 'react-hot-toast';

// Import our new sub-components
import LivePulseMap from './attendance/LivePulseMap';
import ActivityStream from './attendance/ActivityStream';
import StatsWidget from './attendance/StatsWidget';

const AdminAttendanceDashboard = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState(null);
    const [recentActivity, setRecentActivity] = useState([]);
    const [autoRefresh, setAutoRefresh] = useState(true);
    
    // Fetch initial data and set up listeners
    useEffect(() => {
        if (!user?.claims?.orgId) return;
        const orgId = user.claims.orgId;

        // 1. Listen for Dashboard Stats & Event Data
        // We listen to the 'liveDashboard' collection where the backend aggregates data
        const dashboardQuery = query(collection(db, 'organizations', orgId, 'liveDashboard'));
        
        const unsubDashboard = onSnapshot(dashboardQuery, (snapshot) => {
            const events = [];
            let totalAssigned = 0;
            let totalCheckedIn = 0;
            let totalCheckedOut = 0;
            let lateArrivals = 0;
            let remoteCheckIns = 0;

            snapshot.forEach(doc => {
                const data = doc.data();
                // The backend stores attendanceStats in the liveDashboard doc
                if (data.attendanceStats) {
                    totalAssigned += data.attendanceStats.totalAssigned || 0;
                    totalCheckedIn += data.attendanceStats.checkedIn || 0;
                    totalCheckedOut += data.attendanceStats.checkedOut || 0;
                }
                
                // Manually aggregate anomalies if backend doesn't pre-calc all
                // For this view, we assume the backend provides detailed enough event objects
                // If backend only provides high level, we might need to fetch attendance sub-collection
                // But let's assume the backend 'get_live_attendance_dashboard' populates this efficiently
                events.push(data);
            });

            // Since the firestore listener might not give us the deep nested attendance records
            // we might need to trigger a manual fetch for the full detailed tree if the listener payload is thin.
            // However, for the Map to pulse, we need the user locations.
            // Strategy: Use the REST API for the full heavy tree on interval, 
            // and use Firestore for the lightweight status updates.
            // For this implementation, to ensure "Map" works, we will fetch the full REST endpoint.
            fetchFullDashboardData();
        });

        // 2. Listen for Raw Attendance Activity (The Ticker)
        // Query recent attendance records for the sidebar
        // Assuming there is a 'createdAt' or 'updatedAt' on attendance records
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const activityQuery = query(
            collection(db, 'organizations', orgId, 'attendance'),
            where('updatedAt', '>=', today),
            orderBy('updatedAt', 'desc'),
            limit(20)
        );

        const unsubActivity = onSnapshot(activityQuery, (snapshot) => {
            const activities = snapshot.docs.map(doc => {
                const data = doc.data();
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

                return {
                    id: doc.id,
                    type: type,
                    userName: data.userName || 'Team Member', // Ensure backend saves this or we fetch user profile
                    event: data.eventName,
                    message: message,
                    timestamp: data.updatedAt?.toDate(),
                    distance: data.distance
                };
            });
            setRecentActivity(activities);
        });

        return () => {
            unsubDashboard();
            unsubActivity();
        };
    }, [user]);

    // Periodic full-tree fetch for Map markers (locations)
    // This is necessary because Firestore listeners on deep objects can be expensive or complex
    // and the map needs precise lat/lng which might change.
    useEffect(() => {
        if (!autoRefresh) return;
        
        const interval = setInterval(() => {
            fetchFullDashboardData(false);
        }, 30000); // 30s poll for full map consistency

        return () => clearInterval(interval);
    }, [autoRefresh]);

    const fetchFullDashboardData = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/attendance/dashboard/live', {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                setDashboardData(data);
            }
        } catch (error) {
            console.error("Failed to fetch live dashboard", error);
            // Don't toast on background refresh failure to avoid spamming
            if (showLoading) toast.error("Could not load live dashboard");
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    if (loading && !dashboardData) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <CircularProgress size={60} thickness={4} sx={{ color: '#3b82f6' }} />
            </Box>
        );
    }

    return (
        <Box sx={{ position: 'relative', minHeight: 'calc(100vh - 100px)' }}>
            {/* 1. Today at a Glance Header */}
            <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box>
                        <Typography variant="h5" fontWeight={800} sx={{ color: '#1e293b' }}>
                            Mission Control
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Live operational view for {new Date().toLocaleDateString()}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', bgcolor: 'white', p: 1, borderRadius: 2, border: '1px solid #e2e8f0' }}>
                        <FormControlLabel
                            control={<Switch size="small" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />}
                            label={<Typography variant="caption" fontWeight={600}>Live Feed</Typography>}
                            sx={{ mr: 1 }}
                        />
                        <IconButton size="small" onClick={() => fetchFullDashboardData(true)}>
                            <RefreshIcon fontSize="small" />
                        </IconButton>
                    </Box>
                </Box>
                
                {dashboardData && <StatsWidget summary={dashboardData.summary} />}
            </Box>

            {/* 2. Main Content Area: Map & Stream */}
            <Grid container spacing={3} sx={{ height: 650 }}>
                {/* Left: The Live Map */}
                <Grid item xs={12} lg={9} sx={{ height: '100%' }}>
                    <LivePulseMap 
                        events={dashboardData?.events || []} 
                        onMarkerClick={(user, event) => {
                            console.log("Focused user:", user.name);
                        }}
                    />
                </Grid>

                {/* Right: Activity Stream */}
                <Grid item xs={12} lg={3} sx={{ height: '100%' }}>
                    <ActivityStream activities={recentActivity} />
                </Grid>
            </Grid>
        </Box>
    );
};

export default AdminAttendanceDashboard;