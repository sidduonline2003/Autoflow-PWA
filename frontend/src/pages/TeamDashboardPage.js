import React, { useState, useEffect } from 'react';
import {
    Container, Typography, Box, Button, AppBar, Toolbar, Paper, Table, TableBody, 
    TableCell, TableContainer, TableHead, TableRow, Chip, Grid, Card, CardContent, 
    CardActions, Dialog, DialogTitle, DialogContent, DialogActions, TextField, 
    FormControl, InputLabel, Select, MenuItem, Alert, Tabs, Tab, Badge, List, 
    ListItem, ListItemText, ListItemAvatar, Avatar, IconButton, Divider, 
    CircularProgress
} from '@mui/material';
import { 
    Send as SendIcon, 
    Chat as ChatIcon, 
    Refresh as RefreshIcon 
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import RequestLeaveModal from '../components/RequestLeaveModal';
import EnhancedGPSCheckIn from '../components/EnhancedGPSCheckIn';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return <div role="tabpanel" hidden={value !== index} {...other}>{value === index && <Box sx={{ p: 3 }}>{children}</Box>}</div>;
}

const TeamDashboardPage = () => {
    const { user, claims } = useAuth();
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [assignedEvents, setAssignedEvents] = useState([]);
    const [completedEvents, setCompletedEvents] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [memberName, setMemberName] = useState('');
    const [tabValue, setTabValue] = useState(0);
    
    // Chat states
    const [selectedEventForChat, setSelectedEventForChat] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [chatOpen, setChatOpen] = useState(false);
    const [chatLoading, setChatLoading] = useState(false);
    const [allEventChats, setAllEventChats] = useState([]);
    const [chatTabLoading, setChatTabLoading] = useState(false);
    
    // Data submission states (simplified)
    const [dataSubmissionModalOpen, setDataSubmissionModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [dataSubmissionDetails, setDataSubmissionDetails] = useState({
        submissionType: 'primary',
        notes: ''
    });
    const [myDataSubmissions, setMyDataSubmissions] = useState([]);

    // Fetch my data submissions function - defined outside useEffect so it can be reused
    const fetchMyDataSubmissions = async () => {
        if (!claims?.orgId || !user?.uid) return;
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/data-submissions/my-submissions', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                setMyDataSubmissions(data || []);
            } else {
                console.error('Failed to fetch data submissions');
            }
        } catch (error) {
            console.error('Error fetching data submissions:', error);
        }
    };

    useEffect(() => {
        if (!claims?.orgId || !user?.uid) return;

        // Fetch the team member's name from Firestore
        const fetchMemberName = async () => {
            try {
                const memberDoc = await getDoc(doc(db, 'organizations', claims.orgId, 'team', user.uid));
                if (memberDoc.exists()) {
                    setMemberName(memberDoc.data().name || user.displayName || user.email);
                } else {
                    setMemberName(user.displayName || user.email);
                }
            } catch {
                setMemberName(user.displayName || user.email);
            }
        };

        // Fetch assigned events from backend API
        const fetchAssignedEvents = async () => {
            try {
                const idToken = await auth.currentUser.getIdToken();
                const response = await fetch('/api/events/assigned-to-me', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const events = data.assignedEvents || [];
                    setAssignedEvents(events.filter(event => event.status !== 'COMPLETED'));
                    setCompletedEvents(events.filter(event => event.status === 'COMPLETED'));
                } else {
                    const errorText = await response.text();
                    console.error('Failed to fetch assigned events:', response.status, errorText);
                    toast.error('Failed to fetch assigned events');
                }
            } catch (error) {
                console.error('Error fetching assigned events:', error);
                toast.error('Error fetching assigned events');
            }
        };

        // Fetch all event chats for team member
        const fetchAllEventChats = async () => {
            setChatTabLoading(true);
            try {
                const idToken = await auth.currentUser.getIdToken();
                const response = await fetch('/api/events/team/my-event-chats', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    setAllEventChats(data.eventChats || []);
                } else {
                    console.error('Failed to fetch event chats');
                }
            } catch (error) {
                console.error('Error fetching event chats:', error);
            } finally {
                setChatTabLoading(false);
            }
        };

        fetchMemberName();
        fetchAssignedEvents();
        fetchAllEventChats();
        fetchMyDataSubmissions();

        // Subscribe to leave requests
        const leaveQuery = query(
            collection(db, 'organizations', claims.orgId, 'leaveRequests'),
            where('userId', '==', user.uid)
        );
        const unsubLeave = onSnapshot(leaveQuery, (snapshot) => {
            setLeaveRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Set up interval to periodically refresh assigned events
        const intervalId = setInterval(fetchAssignedEvents, 30000); // Refresh every 30 seconds

        return () => { 
            unsubLeave(); 
            clearInterval(intervalId);
        };
    }, [claims, user]);

    const handleRequestLeave = async (leaveData) => {
        const idToken = await auth.currentUser.getIdToken();
        // Always include userName in the leave request
        const leaveDataWithName = { ...leaveData, userName: memberName };
        const promise = fetch(`/api/leave-requests/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            body: JSON.stringify(leaveDataWithName),
        });

        await toast.promise(promise, {
            loading: 'Submitting request...',
            success: 'Leave request submitted!',
            error: 'Failed to submit request.',
        });
    };

    const handleSubmitDataToDataManager = (event) => {
        setSelectedEvent(event);
        setDataSubmissionModalOpen(true);
        setDataSubmissionDetails({ 
            submissionType: 'primary',
            notes: ''
        });
    };

    const handleCreateDataSubmission = async () => {
        if (!selectedEvent) return;
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/data-submissions/submit', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${idToken}` 
                },
                body: JSON.stringify({
                    eventId: selectedEvent.id,
                    clientId: selectedEvent.clientId,
                    storageType: dataSubmissionDetails.submissionType,
                    deviceInfo: 'Pending Data Manager Input',
                    notes: dataSubmissionDetails.notes || 'No additional notes provided',
                    dataSize: null,
                    fileCount: null
                })
            });
            
            if (response.ok) {
                toast.success('Data submission request sent to data manager!');
                setDataSubmissionModalOpen(false);
                setDataSubmissionDetails({ 
                    submissionType: 'primary',
                    notes: ''
                });
                // Refresh the submissions and events
                fetchMyDataSubmissions();
                refreshAssignedEvents();
            } else {
                let errorMessage = 'Failed to submit data request';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorMessage;
                } catch (jsonError) {
                    // If response is not JSON, use status text
                    errorMessage = `Server error: ${response.status} ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Error submitting data:', error);
            toast.error(error.message || 'Failed to submit data request to data manager');
        }
    };

    const handleTabChange = (event, newValue) => setTabValue(newValue);

    const getStatusChip = (status) => {
        const color = status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'warning';
        return <Chip label={status} color={color} />;
    };

    const getEventStatusColor = (status) => {
        const colors = {
            'UPCOMING': 'primary',
            'IN_PROGRESS': 'warning',
            'COMPLETED': 'success',
            'CANCELLED': 'error',
            'ON_HOLD': 'default'
        };
        return colors[status] || 'default';
    };

    // Helper function to get data submission status for an event
    const getDataSubmissionStatus = (eventId) => {
        const submission = myDataSubmissions.find(sub => sub.eventId === eventId);
        if (!submission) return null;
        
        if (submission.status === 'processed') {
            return { status: 'approved', text: 'Data Approved', color: 'success' };
        } else if (submission.status === 'pending') {
            return { status: 'pending', text: 'Pending Approval', color: 'warning' };
        }
        return null;
    };

    // Check if user can submit data for an event
    const canSubmitData = (event) => {
        const hasSubmission = myDataSubmissions.some(sub => sub.eventId === event.id);
        return (event.status === 'COMPLETED' || event.status === 'SHOOT_COMPLETE' || event.userHasCheckedOut) && !hasSubmission;
    };

    // Add refresh function for manually refreshing assigned events
    const refreshAssignedEvents = async () => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/events/assigned-to-me', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                const events = data.assignedEvents || [];
                setAssignedEvents(events.filter(event => event.status !== 'COMPLETED'));
                setCompletedEvents(events.filter(event => event.status === 'COMPLETED'));
                toast.success('Events refreshed successfully!');
            } else {
                throw new Error('Failed to fetch assigned events');
            }
        } catch (error) {
            console.error('Error fetching assigned events:', error);
            toast.error('Failed to refresh events');
        }
    };

    // Refresh all data
    const refreshAllData = async () => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            
            // Refresh events
            const eventsResponse = await fetch('/api/events/assigned-to-me', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                }
            });
            
            if (eventsResponse.ok) {
                const eventsData = await eventsResponse.json();
                const events = eventsData.assignedEvents || [];
                setAssignedEvents(events.filter(event => event.status !== 'COMPLETED'));
                setCompletedEvents(events.filter(event => event.status === 'COMPLETED'));
            }

            // Refresh chats
            const chatsResponse = await fetch('/api/events/team/my-event-chats', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                }
            });
            
            if (chatsResponse.ok) {
                const chatsData = await chatsResponse.json();
                setAllEventChats(chatsData.eventChats || []);
            }

            // Refresh data submissions
            await fetchMyDataSubmissions();

            toast.success('Data refreshed successfully!');
        } catch (error) {
            console.error('Error refreshing data:', error);
            toast.error('Failed to refresh data');
        }
    };

    // Chat functionality
    const handleOpenChat = async (event) => {
        setSelectedEventForChat(event);
        setChatOpen(true);
        setChatLoading(true);
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/events/team/event/${event.id}/chat`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                setChatMessages(data.messages || []);
            } else {
                throw new Error('Failed to load chat messages');
            }
        } catch (error) {
            console.error('Error fetching chat messages:', error);
            toast.error('Failed to load chat messages');
        } finally {
            setChatLoading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedEventForChat) return;
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/events/team/event/${selectedEventForChat.id}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ 
                    message: newMessage.trim()
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                // Refresh messages after sending
                handleOpenChat(selectedEventForChat);
                setNewMessage('');
                toast.success('Message sent!');
            } else {
                throw new Error('Failed to send message');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            toast.error('Failed to send message');
        }
    };

    return (
        <>
            <AppBar position="static" color="primary">
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>Team Portal</Typography>
                    <Button color="inherit" onClick={() => signOut(auth)}>Logout</Button>
                </Toolbar>
            </AppBar>
            <Container sx={{ mt: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                    <Typography component="h1" variant="h4">Welcome, {memberName}!</Typography>
                    <Button variant="contained" onClick={() => setIsModalOpen(true)}>Request Leave</Button>
                </Box>
                
                <Paper sx={{ width: '100%' }}>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                        <Tabs value={tabValue} onChange={handleTabChange}>
                            <Tab 
                                label={
                                    <Badge badgeContent={assignedEvents.length} color="primary">
                                        My Events
                                    </Badge>
                                } 
                            />
                            <Tab 
                                label={
                                    <Badge badgeContent={completedEvents.length} color="success">
                                        Completed Events
                                    </Badge>
                                } 
                            />
                            <Tab 
                                label={
                                    <Badge badgeContent={0} color="warning">
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <ChatIcon fontSize="small" />
                                            Event Chat
                                        </Box>
                                    </Badge>
                                } 
                            />
                            <Tab 
                                label={
                                    <Badge badgeContent={leaveRequests.filter(req => req.status === 'pending').length} color="error">
                                        Leave Requests
                                    </Badge>
                                } 
                            />
                        </Tabs>
                    </Box>
                    
                    <TabPanel value={tabValue} index={0}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6">Your Assigned Events</Typography>
                            <Button 
                                variant="outlined" 
                                size="small"
                                onClick={refreshAllData}
                            >
                                Refresh
                            </Button>
                        </Box>
                        {assignedEvents.length > 0 ? (
                            <Grid container spacing={2}>
                                {assignedEvents.map((event) => (
                                    <Grid item xs={12} key={event.id}>
                                        <Card variant="outlined" sx={{ mb: 2 }}>
                                            <CardContent>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                                    <Box>
                                                        <Typography variant="h6" gutterBottom>
                                                            {event.name}
                                                        </Typography>
                                                        <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                                            <Chip 
                                                                label={event.status} 
                                                                color={getEventStatusColor(event.status)}
                                                                size="small"
                                                            />
                                                            <Chip 
                                                                label={event.userRole} 
                                                                color="secondary"
                                                                size="small"
                                                            />
                                                            {/* Data submission status */}
                                                            {getDataSubmissionStatus(event.id) && (
                                                                <Chip 
                                                                    label={getDataSubmissionStatus(event.id).text}
                                                                    color={getDataSubmissionStatus(event.id).color}
                                                                    size="small"
                                                                />
                                                            )}
                                                        </Box>
                                                    </Box>
                                                </Box>
                                                
                                                <Grid container spacing={2}>
                                                    <Grid item xs={12} md={6}>
                                                        <Typography variant="body2" color="text.secondary">
                                                            <strong>Date:</strong> {event.date} at {event.time}
                                                        </Typography>
                                                        <Typography variant="body2" color="text.secondary">
                                                            <strong>Venue:</strong> {event.venue}
                                                        </Typography>
                                                        <Typography variant="body2" color="text.secondary">
                                                            <strong>Client:</strong> {event.clientName}
                                                        </Typography>
                                                        <Typography variant="body2" color="text.secondary">
                                                            <strong>Type:</strong> {event.eventType}
                                                        </Typography>
                                                        {event.priority && (
                                                            <Typography variant="body2" color="text.secondary">
                                                                <strong>Priority:</strong> {event.priority}
                                                            </Typography>
                                                        )}
                                                    </Grid>
                                                    
                                                    <Grid item xs={12} md={6}>
                                                        {/* GPS Check-in Component integrated here */}
                                                        <Box sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                                                            <Typography variant="subtitle2" gutterBottom color="primary">
                                                                📍 GPS Check-in
                                                            </Typography>
                                                            <EnhancedGPSCheckIn 
                                                                event={event}
                                                                showMap={false}
                                                                onStatusUpdate={(status) => {
                                                                    console.log('Attendance status updated:', status);
                                                                }}
                                                            />
                                                        </Box>
                                                    </Grid>
                                                </Grid>
                                            </CardContent>
                                            <CardActions>
                                                <Button 
                                                    size="small" 
                                                    startIcon={<ChatIcon />}
                                                    onClick={() => handleOpenChat(event)}
                                                    variant="outlined"
                                                >
                                                    Chat with Client
                                                </Button>
                                                {/* Show submit button only if user can submit data */}
                                                {canSubmitData(event) && (
                                                    <Button 
                                                        size="small" 
                                                        variant="contained"
                                                        onClick={() => handleSubmitDataToDataManager(event)}
                                                    >
                                                        Submit Data
                                                    </Button>
                                                )}
                                            </CardActions>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        ) : (
                            <Alert severity="info">
                                No events assigned to you currently. Click "Refresh" to check for new assignments.
                            </Alert>
                        )}
                    </TabPanel>
                    
                    <TabPanel value={tabValue} index={1}>
                        <Typography variant="h6" gutterBottom>Completed Events</Typography>
                        {completedEvents.length > 0 ? (
                            <Grid container spacing={2}>
                                {completedEvents.map((event) => (
                                    <Grid item xs={12} md={6} key={event.id}>
                                        <Card variant="outlined">
                                            <CardContent>
                                                <Typography variant="h6" gutterBottom>
                                                    {event.name}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>Completed:</strong> {event.completedDate || event.date}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>Client:</strong> {event.clientName}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>Type:</strong> {event.eventType}
                                                </Typography>
                                                <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                                    {event.deliverableSubmitted && (
                                                        <Chip 
                                                            label="Copy Submitted" 
                                                            color="success" 
                                                            size="small"
                                                        />
                                                    )}
                                                    {/* Data submission status */}
                                                    {getDataSubmissionStatus(event.id) && (
                                                        <Chip 
                                                            label={getDataSubmissionStatus(event.id).text}
                                                            color={getDataSubmissionStatus(event.id).color}
                                                            size="small"
                                                        />
                                                    )}
                                                </Box>
                                            </CardContent>
                                            <CardActions>
                                                {canSubmitData(event) && (
                                                    <Button 
                                                        size="small" 
                                                        variant="contained"
                                                        onClick={() => handleSubmitDataToDataManager(event)}
                                                    >
                                                        Submit Data
                                                    </Button>
                                                )}
                                                <Button 
                                                    size="small" 
                                                    startIcon={<ChatIcon />}
                                                    onClick={() => handleOpenChat(event)}
                                                    variant="outlined"
                                                >
                                                    View Chat
                                                </Button>
                                            </CardActions>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        ) : (
                            <Alert severity="info">
                                No completed events yet.
                            </Alert>
                        )}
                    </TabPanel>
                    
                    <TabPanel value={tabValue} index={2}>
                        <Typography variant="h6" gutterBottom>Event Chat - Communicate with Clients</Typography>
                        {assignedEvents.length > 0 ? (
                            <Grid container spacing={2}>
                                {assignedEvents.map((event) => (
                                    <Grid item xs={12} md={6} key={event.id}>
                                        <Card variant="outlined">
                                            <CardContent>
                                                <Typography variant="h6" gutterBottom>
                                                    {event.name}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>Date:</strong> {event.date} at {event.time}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>Client:</strong> {event.clientName}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>Type:</strong> {event.eventType}
                                                </Typography>
                                            </CardContent>
                                            <CardActions>
                                                <Button 
                                                    size="small" 
                                                    startIcon={<ChatIcon />}
                                                    onClick={() => handleOpenChat(event)}
                                                    variant="contained"
                                                    fullWidth
                                                >
                                                    Open Chat with Client
                                                </Button>
                                            </CardActions>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        ) : (
                            <Alert severity="info">
                                No events assigned to you currently. You'll see client chat options here once you're assigned to events.
                            </Alert>
                        )}
                    </TabPanel>
                    
                    <TabPanel value={tabValue} index={3}>
                        <Typography variant="h6" gutterBottom>Your Leave Requests</Typography>
                        <TableContainer component={Paper}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Start Date</TableCell>
                                        <TableCell>End Date</TableCell>
                                        <TableCell>Reason</TableCell>
                                        <TableCell>Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {leaveRequests.map(req => (
                                        <TableRow key={req.id}>
                                            <TableCell>{req.startDate}</TableCell>
                                            <TableCell>{req.endDate}</TableCell>
                                            <TableCell>{req.reason}</TableCell>
                                            <TableCell>{getStatusChip(req.status)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </TabPanel>
                </Paper>
            </Container>
            
            {/* Data Submission Modal */}
            <Dialog open={dataSubmissionModalOpen} onClose={() => setDataSubmissionModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Submit Data Request</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Submit a data collection request to the data manager for: <strong>{selectedEvent?.name}</strong>
                    </Typography>
                    <Grid container spacing={3} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <FormControl fullWidth>
                                <InputLabel>Submission Type</InputLabel>
                                <Select 
                                    value={dataSubmissionDetails.submissionType}
                                    onChange={(e) => setDataSubmissionDetails({...dataSubmissionDetails, submissionType: e.target.value})}
                                    label="Submission Type"
                                >
                                    <MenuItem value="primary">Primary Data</MenuItem>
                                    <MenuItem value="backup">Backup Copy</MenuItem>
                                    <MenuItem value="additional">Additional Files</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth 
                                multiline
                                rows={3}
                                label="Additional Notes (Optional)" 
                                placeholder="Any special instructions or details about the data location..."
                                value={dataSubmissionDetails.notes}
                                onChange={(e) => setDataSubmissionDetails({...dataSubmissionDetails, notes: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Alert severity="info">
                                The data manager will collect the data and provide storage details once processed.
                            </Alert>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDataSubmissionModalOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={handleCreateDataSubmission} 
                        variant="contained"
                    >
                        Submit Request
                    </Button>
                </DialogActions>
            </Dialog>
            
            {/* Event Chat Dialog */}
            <Dialog open={chatOpen} onClose={() => setChatOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    <Typography variant="h6">
                        Chat: {selectedEventForChat?.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Client: {selectedEventForChat?.clientName} • {selectedEventForChat?.date}
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    {chatLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <>
                            <Box sx={{ height: 400, overflowY: 'auto', mb: 2, border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
                                {chatMessages.length > 0 ? (
                                    <List>
                                        {chatMessages.map((message, index) => (
                                            <ListItem key={index} sx={{ flexDirection: 'column', alignItems: 'flex-start', p: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                                    <ListItemAvatar>
                                                        <Avatar sx={{ bgcolor: message.sender_type === 'client' ? 'primary.main' : 'secondary.main' }}>
                                                            {message.sender_name?.charAt(0) || '?'}
                                                        </Avatar>
                                                    </ListItemAvatar>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight="bold">
                                                            {message.senderName || 'Unknown'} 
                                                            <Chip 
                                                                label={message.senderType === 'client' ? 'Client' : 'Team'} 
                                                                size="small" 
                                                                sx={{ ml: 1 }}
                                                                color={message.senderType === 'client' ? 'primary' : 'secondary'}
                                                            />
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {message.timestamp ? format(new Date(message.timestamp.seconds * 1000 || message.timestamp), 'MMM dd, HH:mm') : 'Just now'}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                                <Typography variant="body1" sx={{ ml: 7 }}>
                                                    {message.message}
                                                </Typography>
                                                {index < chatMessages.length - 1 && <Divider sx={{ width: '100%', mt: 1 }} />}
                                            </ListItem>
                                        ))}
                                    </List>
                                ) : (
                                    <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                                        No messages yet. Start the conversation with your client!
                                    </Typography>
                                )}
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <TextField
                                    fullWidth
                                    multiline
                                    maxRows={3}
                                    placeholder="Type your message here..."
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                />
                                <IconButton 
                                    color="primary" 
                                    onClick={handleSendMessage}
                                    disabled={!newMessage.trim()}
                                >
                                    <SendIcon />
                                </IconButton>
                            </Box>
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setChatOpen(false)}>Close</Button>
                    <Button 
                        startIcon={<RefreshIcon />}
                        onClick={() => handleOpenChat(selectedEventForChat)}
                        variant="outlined"
                    >
                        Refresh Messages
                    </Button>
                </DialogActions>
            </Dialog>
            
            <RequestLeaveModal open={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleRequestLeave} />
        </>
    );
};

export default TeamDashboardPage;
