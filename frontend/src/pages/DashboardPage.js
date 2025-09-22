import React from 'react';
import { Container, Typography, Button, AppBar, Toolbar, Paper, Menu, MenuItem, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, TextField, List, ListItem, ListItemText, Stack, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { POSTPROD_ENABLED } from '../config';

const DashboardPage = () => {
    const { user, claims } = useAuth();
    const navigate = useNavigate();
    const [eventsAnchor, setEventsAnchor] = React.useState(null);
    const [loadingEvents, setLoadingEvents] = React.useState(false);
    const [events, setEvents] = React.useState([]);

    // Event Finder state
    const [findOpen, setFindOpen] = React.useState(false);
    const [findTerm, setFindTerm] = React.useState('');
    const filtered = React.useMemo(() => {
        const term = findTerm.trim().toLowerCase();
        if (!term) return events;
        return events.filter(e => (e.eventName || '').toLowerCase().includes(term));
    }, [findTerm, events]);

    const isAdmin = (claims?.role || '').toLowerCase() === 'admin';
    // Treat feature flag as enabled by default unless explicitly set to 'false'
    const featurePostprod = POSTPROD_ENABLED;

    React.useEffect(() => {
        if (!(featurePostprod && (isAdmin || (claims?.role || '').toLowerCase() === 'accountant' || (claims?.role || '').toLowerCase() === 'teammate'))) return;
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
    }, [featurePostprod, isAdmin, user, claims]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Failed to log out', error);
        }
    };

    // Quick open helpers
    const openPostProd = (evt) => {
        if (!evt?.id) return;
        navigate(`/events/${evt.id}/postprod`);
        setFindOpen(false);
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
                    {/* Event Finder entry point */}
                    <Button color="inherit" onClick={() => setFindOpen(true)} disabled={loadingEvents}>
                        {loadingEvents ? 'Loading events…' : 'Find Event'}
                    </Button>
                    {featurePostprod && (
                        <>
                            <Button color="inherit" onClick={() => navigate('/my-assignments')}>My Post-Production</Button>
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

            {/* Event Finder Dialog */}
            <Dialog open={findOpen} onClose={() => setFindOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Find Event by Name</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Search by event name (e.g., TEST2)"
                        value={findTerm}
                        onChange={(e) => setFindTerm(e.target.value)}
                        sx={{ my: 1 }}
                    />
                    <List sx={{ maxHeight: 420, overflow: 'auto' }}>
                        {filtered.map((evt) => (
                            <ListItem key={evt.id} divider secondaryAction={
                                featurePostprod ? (
                                    <Button size="small" variant="contained" onClick={() => openPostProd(evt)}>
                                        Open Post-Production
                                    </Button>
                                ) : null
                            }>
                                <ListItemText
                                    primary={evt.eventName || 'Untitled Event'}
                                    secondary={
                                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                            <Chip label={`Date: ${evt.date || 'N/A'}`} size="small" />
                                            <Chip label={`Time: ${evt.time || 'N/A'}`} size="small" />
                                            <Chip label={`Venue: ${evt.venue || 'N/A'}`} size="small" />
                                            <Chip label={`Status: ${evt.status || 'UPCOMING'}`} size="small" color="info" />
                                            {evt.clientId && <Chip label={`Client: ${evt.clientId}`} size="small" />}
                                        </Stack>
                                    }
                                />
                            </ListItem>
                        ))}
                        {!loadingEvents && filtered.length === 0 && (
                            <Typography sx={{ p: 2 }} color="text.secondary">No events match that name.</Typography>
                        )}
                    </List>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setFindOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default DashboardPage;
