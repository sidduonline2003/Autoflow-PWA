import React, { useState } from 'react';
import { Typography, Button, Box, Tabs, Tab } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AdminAttendanceDashboard from '../components/AdminAttendanceDashboard';
import LiveAttendanceDashboard from '../components/LiveAttendanceDashboard';
import { POSTPROD_ENABLED } from '../config';
import AdminLayout from '../components/layout/AdminLayout';

// Tab panel component
function TabPanel({ children, value, index, ...other }) {
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`attendance-tabpanel-${index}`}
            aria-labelledby={`attendance-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

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
        <Button key="team" variant="outlined" onClick={() => navigate('/team')}>
            View Team Overview
        </Button>,
    ];

    if (POSTPROD_ENABLED) {
        headerActions.push(
            <Button key="postprod" variant="contained" onClick={() => navigate('/postprod')}>
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
                    boxShadow: '0 24px 45px rgba(15, 23, 42, 0.08)',
                    px: { xs: 2.5, md: 4 },
                    py: { xs: 3, md: 4 },
                }}
            >
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs
                        value={tabValue}
                        onChange={handleTabChange}
                        variant="scrollable"
                        scrollButtons="auto"
                    >
                        <Tab label="Live Dashboard" />
                        <Tab label="Detailed View" />
                    </Tabs>
                </Box>

                <TabPanel value={tabValue} index={0}>
                    <AdminAttendanceDashboard />
                </TabPanel>

                <TabPanel value={tabValue} index={1}>
                    <LiveAttendanceDashboard />
                </TabPanel>
            </Box>
        </AdminLayout>
    );
};

export default AttendanceManagementPage;
