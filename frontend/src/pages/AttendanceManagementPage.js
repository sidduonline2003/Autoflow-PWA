import React, { useState } from 'react';
import {
    Container,
    Typography,
    AppBar,
    Toolbar,
    Button,
    Box,
    Tabs,
    Tab
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import AdminAttendanceDashboard from '../components/AdminAttendanceDashboard';
import LiveAttendanceDashboard from '../components/LiveAttendanceDashboard';
import { POSTPROD_ENABLED } from '../config';

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

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Failed to log out', error);
        }
    };

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    // Check if user has admin role
    const isAdmin = claims?.role === 'admin';

    if (!isAdmin) {
        return (
            <Container sx={{ mt: 4 }}>
                <Typography variant="h4" color="error">
                    Access Denied
                </Typography>
                <Typography variant="body1" sx={{ mt: 2 }}>
                    You need admin privileges to access the attendance management dashboard.
                </Typography>
                <Button 
                    variant="contained" 
                    onClick={() => navigate('/dashboard')} 
                    sx={{ mt: 2 }}
                >
                    Back to Dashboard
                </Button>
            </Container>
        );
    }

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Live Attendance Management
                    </Typography>
                    <Button color="inherit" onClick={() => navigate('/dashboard')}>
                        Dashboard
                    </Button>
                    <Button color="inherit" onClick={() => navigate('/team')}>
                        Team Management
                    </Button>
                    <Button color="inherit" onClick={() => navigate('/clients')}>
                        Client Management
                    </Button>
                    <Button color="inherit" onClick={() => navigate('/settings')}>
                        Settings
                    </Button>
                    {POSTPROD_ENABLED && (
                        <Button color="inherit" onClick={() => navigate('/postprod')}>Post Production</Button>
                    )}
                    <Button color="inherit" onClick={handleLogout}>
                        Logout
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="xl" sx={{ mt: 2 }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleTabChange}>
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
            </Container>
        </>
    );
};

export default AttendanceManagementPage;
