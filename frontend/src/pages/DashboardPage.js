import React from 'react';
import { Container, Typography, Button, AppBar, Toolbar, Paper, Menu, MenuItem, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

const DashboardPage = () => {
    const { user, claims } = useAuth();
    const navigate = useNavigate();
    const [eventsAnchor, setEventsAnchor] = React.useState(null);
    const [loadingEvents, setLoadingEvents] = React.useState(false);
    const [events, setEvents] = React.useState([]);

    const isAdmin = (claims?.role || '').toLowerCase() === 'admin';
    // Treat feature flag as enabled by default unless explicitly set to 'false'
    const featurePostprod = process.env.REACT_APP_FEATURE_POSTPROD !== 'false';

    React.useEffect(() => {
        if (!(featurePostprod && isAdmin)) return;
        let cancelled = false;
        (async () => {
            try {
                setLoadingEvents(true);
                const idToken = await user?.getIdToken?.();
                if (!idToken) return;
                const res = await fetch('/api/events/', { headers: { Authorization: `Bearer ${idToken}` } });
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled) setEvents(Array.isArray(data) ? data : (data.events || []));
            } finally { if (!cancelled) setLoadingEvents(false); }
        })();
        return () => { cancelled = true; };
    }, [featurePostprod, isAdmin, user]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Failed to log out', error);
        }
    };

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>Dashboard</Typography>
                    <Button color="inherit" onClick={() => navigate('/team')}>Team Management</Button>
                    <Button color="inherit" onClick={() => navigate('/clients')}>Client Management</Button>
                    <Button color="inherit" onClick={() => navigate('/attendance')}>Live Attendance</Button>
                    <Button color="inherit" onClick={() => navigate('/receipts')}>Receipt Verification</Button>
                    <Button color="inherit" onClick={() => navigate('/financial')}>Financial Hub</Button>
                    <Button color="inherit" onClick={() => navigate('/accounts-receivable')}>Accounts Receivable</Button>
                    {featurePostprod && (
                        <>
                            <Button color="inherit" onClick={() => navigate('/my-work')}>My Work</Button>
                            {isAdmin && (
                                <Button
                                    color="inherit"
                                    onClick={() => navigate('/postprod')}
                                >Post Production</Button>
                            )}
                        </>
                    )}
                    <Button color="inherit" onClick={handleLogout}>Logout</Button>
                </Toolbar>
            </AppBar>
            <Menu
                anchorEl={eventsAnchor}
                open={false}
                onClose={() => setEventsAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
            </Menu>
            <Container sx={{ mt: 4 }}>
                <Typography component="h1" variant="h4">
                    Hello, {user?.displayName || user?.email}!
                </Typography>
                {claims && (
                    <Paper sx={{ mt: 4, p: 2, backgroundColor: '#f5f5f5' }}>
                        <Typography variant="h6">Your Custom Claims (for debugging):</Typography>
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {JSON.stringify(claims, null, 2)}
                        </pre>
                    </Paper>
                )}
            </Container>
        </>
    );
};

export default DashboardPage;
