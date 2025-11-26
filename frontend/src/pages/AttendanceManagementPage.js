import React, { useState, Suspense, lazy, memo } from 'react';
import { Typography, Button, Box, Tabs, Tab, Skeleton, CircularProgress, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { POSTPROD_ENABLED } from '../config';
import AdminLayout from '../components/layout/AdminLayout';
import { 
    Dashboard as DashboardIcon,
    TableChart as TableIcon,
    Wifi as WifiIcon
} from '@mui/icons-material';

// Lazy load dashboard components for better initial load
const AdminAttendanceDashboard = lazy(() => import('../components/AdminAttendanceDashboard'));
const LiveAttendanceDashboard = lazy(() => import('../components/LiveAttendanceDashboard'));

// Loading fallback component
const DashboardLoadingFallback = memo(() => (
    <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <Skeleton variant="text" width={200} height={40} />
            <Skeleton variant="rounded" width={100} height={32} />
        </Box>
        <Box sx={{ display: 'flex', gap: 3, mb: 3 }}>
            {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} variant="rounded" width="25%" height={100} sx={{ borderRadius: 3 }} />
            ))}
        </Box>
        <Skeleton variant="rounded" height={400} sx={{ borderRadius: 3 }} />
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mt: 4 }}>
            <CircularProgress size={32} sx={{ color: '#3b82f6' }} />
        </Box>
    </Box>
));

DashboardLoadingFallback.displayName = 'DashboardLoadingFallback';

// Tab panel component - memoized
const TabPanel = memo(({ children, value, index, ...other }) => {
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`attendance-tabpanel-${index}`}
            aria-labelledby={`attendance-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ pt: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
});

TabPanel.displayName = 'TabPanel';

const AttendanceManagementPage = () => {
    const { claims } = useAuth();
    const navigate = useNavigate();
    const [tabValue, setTabValue] = useState(0);

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    // Check if user has admin role
    const isAdmin = claims?.role === 'admin';

    const headerActions = [
        <Button key="team" variant="outlined" onClick={() => navigate('/team')} sx={{ borderRadius: 2 }}>
            View Team Overview
        </Button>,
    ];

    if (POSTPROD_ENABLED) {
        headerActions.push(
            <Button key="postprod" variant="contained" onClick={() => navigate('/postprod')} sx={{ borderRadius: 2 }}>
                Post Production Hub
            </Button>,
        );
    }

    if (!isAdmin) {
        return (
            <AdminLayout
                appBarTitle="Live Attendance Management"
                pageTitle="Access Denied"
                pageSubtitle="You need admin privileges to access the attendance management dashboard."
                actions={[
                    <Button
                        key="back"
                        variant="contained"
                        onClick={() => navigate('/dashboard')}
                        sx={{ borderRadius: 2 }}
                    >
                        Back to Dashboard
                    </Button>,
                ]}
            >
                <Box
                    sx={{
                        bgcolor: 'background.paper',
                        borderRadius: 3,
                        px: { xs: 3, md: 4 },
                        py: { xs: 4, md: 5 },
                        textAlign: 'center',
                    }}
                >
                    <Typography variant="h5" fontWeight={600} gutterBottom>
                        Administrative Access Required
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Please contact the system administrator if you believe you should have access to this area.
                    </Typography>
                </Box>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            appBarTitle="Live Attendance Management"
            pageTitle="Live Attendance Management"
            pageSubtitle="Monitor real-time presence and dive into historical attendance insights."
            actions={headerActions}
        >
            <Box
                sx={{
                    borderRadius: 3,
                    bgcolor: 'background.paper',
                    boxShadow: '0 4px 20px rgba(15, 23, 42, 0.06)',
                    overflow: 'hidden'
                }}
            >
                {/* Enhanced Tab Header */}
                <Box sx={{ 
                    borderBottom: 1, 
                    borderColor: 'divider',
                    bgcolor: '#fafbfc',
                    px: { xs: 2, md: 3 }
                }}>
                    <Tabs
                        value={tabValue}
                        onChange={handleTabChange}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{
                            '& .MuiTab-root': {
                                minHeight: 56,
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.95rem',
                                color: '#64748b',
                                '&.Mui-selected': {
                                    color: '#1e293b'
                                }
                            },
                            '& .MuiTabs-indicator': {
                                height: 3,
                                borderRadius: '3px 3px 0 0'
                            }
                        }}
                    >
                        <Tab 
                            icon={<DashboardIcon sx={{ fontSize: 20 }} />}
                            iconPosition="start"
                            label={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    Live Dashboard
                                    <Chip 
                                        size="small" 
                                        label="Live" 
                                        color="success"
                                        icon={<WifiIcon sx={{ fontSize: 12 }} />}
                                        sx={{ 
                                            height: 22, 
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            '& .MuiChip-icon': { fontSize: 12 }
                                        }} 
                                    />
                                </Box>
                            }
                        />
                        <Tab 
                            icon={<TableIcon sx={{ fontSize: 20 }} />}
                            iconPosition="start"
                            label="Detailed View" 
                        />
                    </Tabs>
                </Box>

                {/* Tab Content */}
                <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
                    <TabPanel value={tabValue} index={0}>
                        <Suspense fallback={<DashboardLoadingFallback />}>
                            <AdminAttendanceDashboard />
                        </Suspense>
                    </TabPanel>

                    <TabPanel value={tabValue} index={1}>
                        <Suspense fallback={<DashboardLoadingFallback />}>
                            <LiveAttendanceDashboard />
                        </Suspense>
                    </TabPanel>
                </Box>
            </Box>
        </AdminLayout>
    );
};

export default AttendanceManagementPage;
