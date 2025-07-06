import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    Box, Container, Typography, Breadcrumbs, Link, Tabs, Tab, CircularProgress, Paper, Button, Card, CardContent, CardActions, Grid, Chip
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import toast from 'react-hot-toast';
import EventForm from '../components/EventForm';
import AISuggestionDisplay from '../components/AISuggestionDisplay';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return <div role="tabpanel" hidden={value !== index} {...other}>{value === index && <Box sx={{ p: 3 }}>{children}</Box>}</div>;
}

const ClientWorkspacePage = () => {
    const { clientId } = useParams();
    const { claims } = useAuth();
    const [client, setClient] = useState(null);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0);
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    
    const [aiSuggestions, setAiSuggestions] = useState({});
    const [aiLoading, setAiLoading] = useState({});
    const [aiError, setAiError] = useState({});

    useEffect(() => {
        if (!claims?.orgId || !clientId) { setLoading(false); return; }
        const clientDocRef = doc(db, 'organizations', claims.orgId, 'clients', clientId);
        const unsubClient = onSnapshot(clientDocRef, (doc) => {
            if (doc.exists()) setClient({ id: doc.id, ...doc.data().profile });
            else setClient(null);
            setLoading(false);
        });
        
        const eventsCollectionRef = collection(db, 'organizations', claims.orgId, 'clients', clientId, 'events');
        const unsubEvents = onSnapshot(eventsCollectionRef, (snapshot) => {
            setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => { unsubClient(); unsubEvents(); };
    }, [claims, clientId]);

    const handleTabChange = (event, newValue) => setTabValue(newValue);

    const callApi = async (endpoint, method, body = null) => {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch(`/api${endpoint}`, {
            method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            ...(body && { body: JSON.stringify(body) }),
        });
        if (!response.ok) throw new Error((await response.json()).detail || 'An error occurred.');
        return response.json();
    };

    const handleCreateEvent = (eventData) => {
        toast.promise(callApi(`/events/for-client/${clientId}`, 'POST', eventData), {
            loading: 'Creating event...',
            success: 'Event created!',
            error: (err) => err.message,
        }).then(() => setIsEventModalOpen(false));
    };

    const getAiSuggestions = async (eventId) => {
        setAiLoading(prev => ({ ...prev, [eventId]: true }));
        setAiError(prev => ({ ...prev, [eventId]: '' }));
        setAiSuggestions(prev => ({ ...prev, [eventId]: null }));
        try {
            const data = await callApi(`/events/${eventId}/suggest-team?client_id=${clientId}`, 'GET');
            setAiSuggestions(prev => ({ ...prev, [eventId]: data.ai_suggestions }));
        } catch (error) {
            setAiError(prev => ({ ...prev, [eventId]: error.message }));
            toast.error(error.message);
        } finally {
            setAiLoading(prev => ({ ...prev, [eventId]: false }));
        }
    };
    
    const handleAssignTeam = (eventId, team) => {
        toast.promise(callApi(`/events/${eventId}/assign-crew?client_id=${clientId}`, 'POST', { team }), {
            loading: 'Assigning team...',
            success: 'Team assigned successfully!',
            error: (err) => err.message,
        });
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;
    if (!client) return <Container><Typography variant="h5" color="error">Client not found.</Typography></Container>;

    return (
        <Container maxWidth="lg" sx={{ mt: 4 }}>
            <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
                <Link component={RouterLink} underline="hover" color="inherit" to="/clients">Clients</Link>
                <Typography color="text.primary">{client.name}</Typography>
            </Breadcrumbs>
            <Typography variant="h4" gutterBottom>{client.name}'s Workspace</Typography>

            <Paper sx={{ width: '100%' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleTabChange}><Tab label="Events" /><Tab label="Invoices" /><Tab label="History" /></Tabs>
                </Box>
                <TabPanel value={tabValue} index={0}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Events</Typography>
                        <Button variant="contained" onClick={() => setIsEventModalOpen(true)}>Add New Event</Button>
                    </Box>
                    <Grid container spacing={3}>
                        {events.length > 0 ? (
                            events.map(event => (
                                <Grid xs={12} key={event.id}>
                                    <Card variant="outlined">
                                        <CardContent>
                                            <Typography variant="h6">{event.name}</Typography>
                                            <Chip label={event.status} color="primary" sx={{ mb: 1 }} />
                                            <Typography color="text.secondary">{event.date} at {event.time}</Typography>
                                            <Box mt={2}>
                                                <Typography variant="subtitle1" fontWeight="bold">Assigned Team:</Typography>
                                                {event.assignedCrew && event.assignedCrew.length > 0 ?
                                                    event.assignedCrew.map(c => <Chip key={c.userId} label={`${c.name} (${c.role})`} sx={{mr: 1}}/>) :
                                                    <Typography variant="body2">No team assigned yet.</Typography>
                                                }
                                            </Box>
                                            <AISuggestionDisplay eventId={event.id} suggestions={aiSuggestions[event.id]} loading={aiLoading[event.id]} error={aiError[event.id]} onAssign={handleAssignTeam} />
                                        </CardContent>
                                        <CardActions>
                                            <Button size="small" onClick={() => getAiSuggestions(event.id)} disabled={aiLoading[event.id]}>
                                                {aiLoading[event.id] ? 'Getting Suggestions...' : 'Suggest Team'}
                                            </Button>
                                        </CardActions>
                                    </Card>
                                </Grid>
                            ))
                        ) : (
                            <Grid xs={12}><Typography sx={{ mt: 2 }}>No events found.</Typography></Grid>
                        )}
                    </Grid>
                </TabPanel>
                <TabPanel value={tabValue} index={1}><Typography>Invoices will go here.</Typography></TabPanel>
                <TabPanel value={tabValue} index={2}><Typography>History will go here.</Typography></TabPanel>
            </Paper>
            
            <EventForm open={isEventModalOpen} onClose={() => setIsEventModalOpen(false)} onSubmit={handleCreateEvent} clientName={client.name} />
        </Container>
    );
};

export default ClientWorkspacePage;
