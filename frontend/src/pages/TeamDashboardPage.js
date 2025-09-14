import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Card, CardContent, Button, Grid, Box, Chip, Badge, 
    AppBar, Toolbar, Alert, Paper, Tabs, Tab, TableContainer, Table, TableHead, 
    TableRow, TableCell, TableBody, CardActions, Dialog, DialogTitle, DialogContent, 
    DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, IconButton,
    List, ListItem, ListItemText, Divider, Avatar, LinearProgress,
    CircularProgress, ListItemAvatar
} from '@mui/material';
import { 
    Event as EventIcon, CheckCircle as CheckCircleIcon, Schedule as ScheduleIcon, 
    LocationOn as LocationIcon, Person as PersonIcon, Assignment as AssignmentIcon,
    Chat as ChatIcon, Send as SendIcon, Refresh as RefreshIcon, Close as CloseIcon,
    Logout as LogoutIcon, Work as WorkIcon, Business as BusinessIcon, 
    Payments as PaymentsIcon, Receipt as ReceiptIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import RequestLeaveModal from '../components/RequestLeaveModal';
import EnhancedGPSCheckIn from '../components/EnhancedGPSCheckIn';
import TeamMemberIDCard from '../components/TeamMemberIDCard';
import MyPayslips from '../components/financial/MyPayslips';
import CabReceiptUploader from '../components/CabReceiptUploader';
import { useNavigate } from 'react-router-dom';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return <div role="tabpanel" hidden={value !== index} {...other}>{value === index && <Box sx={{ p: 3 }}>{children}</Box>}</div>;
}

const TeamDashboardPage = () => {
    const { user, claims } = useAuth();
    const navigate = useNavigate();
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
    
    // Storage submission states
    const [submitModalOpen, setSubmitModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [storageDetails, setStorageDetails] = useState({
        storageType: '',
        deviceInfo: '',
        notes: ''
    });
    
    // Data intake batch states
    const [dataIntakeModalOpen, setDataIntakeModalOpen] = useState(false);
    const [selectedEventForIntake, setSelectedEventForIntake] = useState(null);
    const [dataBatches, setDataBatches] = useState([]);
    const [batchFormData, setBatchFormData] = useState({
        physicalHandoverDate: '',
        storageDevices: [{ type: '', brand: '', model: '', capacity: '', serialNumber: '', notes: '' }],
        notes: '',
        estimatedDataSize: ''
    });

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
                    // UPDATED: Completed events (regardless of deliverable submission) go to Completed tab
                    setAssignedEvents(events.filter(e => e.status !== 'COMPLETED'));
                    setCompletedEvents(events.filter(e => e.status === 'COMPLETED'));
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

    const handleSubmitCopy = (event) => {
        setSelectedEvent(event);
        setSubmitModalOpen(true);
        setStorageDetails({ storageType: '', deviceInfo: '', notes: '' });
    };

    // Data intake handlers
    const handleOpenDataIntake = (event) => {
        setSelectedEventForIntake(event);
        setDataIntakeModalOpen(true);
        setBatchFormData({
            physicalHandoverDate: '',
            storageDevices: [{ type: '', brand: '', model: '', capacity: '', serialNumber: '', notes: '' }],
            notes: '',
            estimatedDataSize: ''
        });
        fetchEventBatches(event.id);
    };

    const fetchEventBatches = async (eventId) => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/data-submissions/events/${eventId}/batches`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            if (response.ok) {
                const data = await response.json();
                setDataBatches(data.batches || []);
            }
        } catch (error) {
            console.error('Error fetching batches:', error);
        }
    };

    const addStorageDevice = () => {
        setBatchFormData(prev => ({
            ...prev,
            storageDevices: [...prev.storageDevices, { type: '', brand: '', model: '', capacity: '', serialNumber: '', notes: '' }]
        }));
    };

    const removeStorageDevice = (index) => {
        setBatchFormData(prev => ({
            ...prev,
            storageDevices: prev.storageDevices.filter((_, i) => i !== index)
        }));
    };

    const updateStorageDevice = (index, field, value) => {
        setBatchFormData(prev => ({
            ...prev,
            storageDevices: prev.storageDevices.map((device, i) => 
                i === index ? { ...device, [field]: value } : device
            )
        }));
    };

    const handleSubmitDataBatch = async () => {
        if (!selectedEventForIntake) return;
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            
            // Prepare batch data
            const batchData = {
                eventId: selectedEventForIntake.id,
                submittedBy: user.uid,
                submittedByName: memberName,
                physicalHandoverDate: batchFormData.physicalHandoverDate,
                storageDevices: batchFormData.storageDevices.filter(device => device.type && device.brand),
                notes: batchFormData.notes,
                totalDevices: batchFormData.storageDevices.filter(device => device.type && device.brand).length,
                estimatedDataSize: batchFormData.estimatedDataSize
            };

            if (batchData.totalDevices === 0) {
                toast.error('Please add at least one storage device');
                return;
            }

            if (!batchData.physicalHandoverDate) {
                toast.error('Please select a handover date');
                return;
            }

            const response = await fetch('/api/data-submissions/batches', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(batchData)
            });

            if (response.ok) {
                const result = await response.json();
                toast.success('Data batch submitted successfully!');
                setDataIntakeModalOpen(false);
                
                // Reset form
                setBatchFormData({
                    physicalHandoverDate: '',
                    storageDevices: [{ type: '', brand: '', model: '', capacity: '', serialNumber: '', notes: '' }],
                    notes: '',
                    estimatedDataSize: ''
                });
                
                // Refresh event data
                refreshAssignedEvents();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to submit data batch');
            }
        } catch (error) {
            console.error('Error submitting data batch:', error);
            toast.error(error.message || 'Failed to submit data batch');
        }
    };

    const handleCreateDeliverable = async () => {
        if (!selectedEvent) return;
        try {
            const idToken = await auth.currentUser.getIdToken();
            await fetch(`/api/deliverables/events/${selectedEvent.id}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    storageType: storageDetails.storageType,
                    deviceInfo: storageDetails.deviceInfo,
                    notes: storageDetails.notes,
                    submittedBy: user.uid,
                    submittedByName: memberName
                })
            });
            toast.success('Storage device submitted successfully!');
            setSubmitModalOpen(false);
            setStorageDetails({ storageType: '', deviceInfo: '', notes: '' });
            // Refresh classification so event moves out of My Events into Completed
            refreshAssignedEvents();
        } catch (error) {
            toast.error('Failed to submit storage device');
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
                // UPDATED classification
                setAssignedEvents(events.filter(e => e.status !== 'COMPLETED'));
                setCompletedEvents(events.filter(e => e.status === 'COMPLETED'));
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
                // UPDATED classification
                setAssignedEvents(events.filter(e => e.status !== 'COMPLETED'));
                setCompletedEvents(events.filter(e => e.status === 'COMPLETED'));
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

    const orgName = (claims && claims.orgName) || 'Your Organization';
    const orgId = (claims && claims.orgId) || '';

    return (
        <>
            <AppBar position="static" color="primary">
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>Team Portal</Typography>
                    {(claims?.role === 'data-manager' || claims?.role === 'admin') && (
                        <Button color="inherit" onClick={() => navigate('/data-manager')}>
                            Data Manager Portal
                        </Button>
                    )}
                    {process.env.REACT_APP_FEATURE_POSTPROD === 'true' && (
                        <Button color="inherit" onClick={() => navigate('/postprod')}>Post Production</Button>
                    )}
                    <Button color="inherit" onClick={() => signOut(auth)}>Logout</Button>
                </Toolbar>
            </AppBar>
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                {/* New: My ID Card visible to teammate */}
                <Box sx={{ mb: 3 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>My ID Card</Typography>
                    <TeamMemberIDCard
                        member={{
                            userId: auth?.currentUser?.uid,
                            name: (auth?.currentUser?.displayName) || (auth?.currentUser?.email) || 'Team Member',
                            email: auth?.currentUser?.email || '',
                            role: claims?.role || 'crew',
                            phone: auth?.currentUser?.phoneNumber || '',
                            profilePhoto: auth?.currentUser?.photoURL || '',
                            skills: []
                        }}
                        orgName={orgName}
                        orgId={orgId}
                        showActions
                    />
                </Box>
                
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
                            <Tab 
                                label={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <PaymentsIcon fontSize="small" />
                                        My Payslips
                                    </Box>
                                } 
                            />
                            <Tab 
                                label={
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <ReceiptIcon fontSize="small" />
                                        Cab Receipts
                                    </Box>
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
                                                        <Box sx={{ mb: 2 }}>
                                                            <Chip 
                                                                label={event.status} 
                                                                color={getEventStatusColor(event.status)}
                                                                size="small"
                                                            />
                                                            <Chip 
                                                                label={event.userRole} 
                                                                color="secondary"
                                                                size="small"
                                                                sx={{ ml: 1 }}
                                                            />
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
                                                {event.status === 'COMPLETED' && (
                                                    <>
                                                        <Button 
                                                            size="small" 
                                                            variant="contained"
                                                            onClick={() => handleSubmitCopy(event)}
                                                        >
                                                            Submit Copy
                                                        </Button>
                                                        <Button 
                                                            size="small" 
                                                            variant="outlined"
                                                            color="primary"
                                                            onClick={() => handleOpenDataIntake(event)}
                                                        >
                                                            Submit Data Intake
                                                        </Button>
                                                    </>
                                                )}
                                                <Button 
                                                    size="small" 
                                                    startIcon={<ChatIcon />}
                                                    onClick={() => handleOpenChat(event)}
                                                    variant="outlined"
                                                >
                                                    Chat with Client
                                                </Button>
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
                                                {!event.deliverableSubmitted && (
                                                    <Chip 
                                                        label="Awaiting Data Submission" 
                                                        color="warning" 
                                                        size="small" 
                                                        sx={{ mt: 1, mr: 1 }}
                                                    />
                                                )}
                                                {event.deliverableSubmitted && (
                                                    <Chip 
                                                        label="Data Submitted" 
                                                        color="success" 
                                                        size="small" 
                                                        sx={{ mt: 1 }}
                                                    />
                                                )}
                                                {event.dataIntakeStatus && (
                                                    <Chip 
                                                        label={`Data Intake: ${event.dataIntakeStatus}`}
                                                        color={event.dataIntakeStatus === 'CONFIRMED' ? 'success' : 
                                                               event.dataIntakeStatus === 'PENDING' ? 'warning' : 'error'}
                                                        size="small" 
                                                        sx={{ mt: 1, ml: 1 }}
                                                    />
                                                )}
                                            </CardContent>
                                            <CardActions>
                                                {!event.deliverableSubmitted && (
                                                    <Button 
                                                        size="small" 
                                                        variant="contained"
                                                        onClick={() => handleSubmitCopy(event)}
                                                    >
                                                        Submit Data to Data Manager
                                                    </Button>
                                                )}
                                                {!event.dataIntakePending && (
                                                    <Button 
                                                        size="small" 
                                                        variant="outlined"
                                                        color="primary"
                                                        onClick={() => handleOpenDataIntake(event)}
                                                    >
                                                        Submit Data Intake
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
                    
                    <TabPanel value={tabValue} index={4}>
                        <MyPayslips />
                    </TabPanel>
                    
                    <TabPanel value={tabValue} index={5}>
                        <Typography variant="h6" gutterBottom>Cab Receipt Management</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            Upload cab receipts for events you've attended. Receipts will be verified automatically before processing for reimbursement.
                        </Typography>
                        
                        {/* Information Card */}
                        <Alert severity="info" sx={{ mb: 3 }}>
                            <Typography variant="body2">
                                <strong>How it works:</strong>
                                <br />• Upload clear photos of your cab receipts from Uber, Ola, or Rapido
                                <br />• Our AI will automatically extract and verify the receipt information
                                <br />• If you shared the cab with teammates, select them from the dropdown
                                <br />• Low-risk receipts are auto-approved, while suspicious ones require admin review
                            </Typography>
                        </Alert>
                        
                        {/* Show assigned events for cab receipt upload */}
                        {assignedEvents.length > 0 || completedEvents.length > 0 ? (
                            <Grid container spacing={2}>
                                {[...assignedEvents, ...completedEvents].map((event) => (
                                    <Grid item xs={12} key={event.id}>
                                        <Card variant="outlined" sx={{ mb: 2 }}>
                                            <CardContent>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                                    <Box>
                                                        <Typography variant="h6" gutterBottom>
                                                            {event.name}
                                                        </Typography>
                                                        <Typography variant="body2" color="text.secondary">
                                                            <strong>Date:</strong> {event.date} at {event.time}
                                                        </Typography>
                                                        <Typography variant="body2" color="text.secondary">
                                                            <strong>Venue:</strong> {event.venue}
                                                        </Typography>
                                                        <Typography variant="body2" color="text.secondary">
                                                            <strong>Client:</strong> {event.clientName}
                                                        </Typography>
                                                        <Box sx={{ mt: 1 }}>
                                                            <Chip 
                                                                label={event.status} 
                                                                color={getEventStatusColor(event.status)}
                                                                size="small"
                                                            />
                                                        </Box>
                                                    </Box>
                                                </Box>
                                                
                                                {/* Cab Receipt Uploader Component */}
                                                <CabReceiptUploader 
                                                    eventId={event.id}
                                                    eventData={event}
                                                    onUploadSuccess={() => {
                                                        toast.success('Cab receipt uploaded successfully!');
                                                        // Optionally refresh event data here
                                                    }}
                                                />
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        ) : (
                            <Alert severity="info">
                                No events available for cab receipt submission. You'll see events here once you're assigned to them.
                            </Alert>
                        )}
                    </TabPanel>
                </Paper>
            </Container>
            
            {/* Data Intake Batch Submission Modal */}
            <Dialog open={dataIntakeModalOpen} onClose={() => setDataIntakeModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    Submit Data Intake Batch
                    <Typography variant="body2" color="text.secondary">
                        Event: <strong>{selectedEventForIntake?.name}</strong>
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Submit your physical data handover batch. This creates one batch per physical handover session.
                    </Typography>
                    
                    {/* Existing batches for this event */}
                    {dataBatches.length > 0 && (
                        <Box sx={{ mb: 3 }}>
                            <Typography variant="h6" gutterBottom>Previous Submissions</Typography>
                            {dataBatches.map((batch, index) => (
                                <Alert 
                                    key={index} 
                                    severity={batch.status === 'CONFIRMED' ? 'success' : 
                                             batch.status === 'PENDING' ? 'warning' : 'error'}
                                    sx={{ mb: 1 }}
                                >
                                    <Typography variant="body2">
                                        <strong>Batch {index + 1}:</strong> {batch.totalDevices} devices - 
                                        Status: {batch.status} - 
                                        Submitted: {new Date(batch.createdAt.seconds * 1000).toLocaleDateString()}
                                    </Typography>
                                    {batch.dmNotes && (
                                        <Typography variant="caption" display="block">
                                            DM Notes: {batch.dmNotes}
                                        </Typography>
                                    )}
                                </Alert>
                            ))}
                        </Box>
                    )}
                    
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Physical Handover Date"
                                type="date"
                                value={batchFormData.physicalHandoverDate}
                                onChange={(e) => setBatchFormData(prev => ({ ...prev, physicalHandoverDate: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                                required
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Estimated Data Size"
                                placeholder="e.g., 500GB, 2TB"
                                value={batchFormData.estimatedDataSize}
                                onChange={(e) => setBatchFormData(prev => ({ ...prev, estimatedDataSize: e.target.value }))}
                            />
                        </Grid>
                        
                        {/* Storage Devices */}
                        <Grid item xs={12}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6">Storage Devices</Typography>
                                <Button 
                                    variant="outlined" 
                                    size="small" 
                                    onClick={addStorageDevice}
                                >
                                    Add Device
                                </Button>
                            </Box>
                            
                            {batchFormData.storageDevices.map((device, index) => (
                                <Card key={index} variant="outlined" sx={{ mb: 2, p: 2 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Typography variant="subtitle2">Device {index + 1}</Typography>
                                        {batchFormData.storageDevices.length > 1 && (
                                            <Button 
                                                color="error" 
                                                size="small" 
                                                onClick={() => removeStorageDevice(index)}
                                            >
                                                Remove
                                            </Button>
                                        )}
                                    </Box>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} md={4}>
                                            <FormControl fullWidth>
                                                <InputLabel>Type</InputLabel>
                                                <Select
                                                    value={device.type}
                                                    onChange={(e) => updateStorageDevice(index, 'type', e.target.value)}
                                                    label="Type"
                                                >
                                                    <MenuItem value="SD Card">SD Card</MenuItem>
                                                    <MenuItem value="CF Card">CF Card</MenuItem>
                                                    <MenuItem value="SSD">SSD</MenuItem>
                                                    <MenuItem value="Hard Drive">Hard Drive</MenuItem>
                                                    <MenuItem value="USB Drive">USB Drive</MenuItem>
                                                    <MenuItem value="External HDD">External HDD</MenuItem>
                                                    <MenuItem value="Other">Other</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Grid>
                                        <Grid item xs={12} md={4}>
                                            <TextField
                                                fullWidth
                                                label="Brand"
                                                value={device.brand}
                                                onChange={(e) => updateStorageDevice(index, 'brand', e.target.value)}
                                                placeholder="e.g., SanDisk, Samsung"
                                            />
                                        </Grid>
                                        <Grid item xs={12} md={4}>
                                            <TextField
                                                fullWidth
                                                label="Model"
                                                value={device.model}
                                                onChange={(e) => updateStorageDevice(index, 'model', e.target.value)}
                                                placeholder="e.g., EVO 970"
                                            />
                                        </Grid>
                                        <Grid item xs={12} md={4}>
                                            <TextField
                                                fullWidth
                                                label="Capacity"
                                                value={device.capacity}
                                                onChange={(e) => updateStorageDevice(index, 'capacity', e.target.value)}
                                                placeholder="e.g., 64GB, 1TB"
                                            />
                                        </Grid>
                                        <Grid item xs={12} md={4}>
                                            <TextField
                                                fullWidth
                                                label="Serial Number"
                                                value={device.serialNumber}
                                                onChange={(e) => updateStorageDevice(index, 'serialNumber', e.target.value)}
                                                placeholder="Device serial number"
                                            />
                                        </Grid>
                                        <Grid item xs={12} md={4}>
                                            <TextField
                                                fullWidth
                                                label="Notes"
                                                value={device.notes}
                                                onChange={(e) => updateStorageDevice(index, 'notes', e.target.value)}
                                                placeholder="Any device-specific notes"
                                            />
                                        </Grid>
                                    </Grid>
                                </Card>
                            ))}
                        </Grid>
                        
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Batch Notes"
                                multiline
                                rows={3}
                                value={batchFormData.notes}
                                onChange={(e) => setBatchFormData(prev => ({ ...prev, notes: e.target.value }))}
                                placeholder="Any notes about this data handover batch..."
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDataIntakeModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmitDataBatch} variant="contained">
                        Submit Data Batch
                    </Button>
                </DialogActions>
            </Dialog>
            
            {/* Storage Submission Modal */}
            <Dialog open={submitModalOpen} onClose={() => setSubmitModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Submit Storage Copy</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Please provide details about the storage device you're submitting for: <strong>{selectedEvent?.name}</strong>
                    </Typography>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <FormControl fullWidth>
                                <InputLabel>Storage Type</InputLabel>
                                <Select 
                                    value={storageDetails.storageType}
                                    onChange={(e) => setStorageDetails({...storageDetails, storageType: e.target.value})}
                                    label="Storage Type"
                                >
                                    <MenuItem value="SD Card">SD Card</MenuItem>
                                    <MenuItem value="CF Card">CF Card</MenuItem>
                                    <MenuItem value="SSD">SSD</MenuItem>
                                    <MenuItem value="Hard Drive">Hard Drive</MenuItem>
                                    <MenuItem value="USB Drive">USB Drive</MenuItem>
                                    <MenuItem value="Other">Other</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth 
                                label="Device Information (Brand, Model, Capacity)" 
                                placeholder="e.g., SanDisk 64GB, Samsung 1TB SSD"
                                value={storageDetails.deviceInfo}
                                onChange={(e) => setStorageDetails({...storageDetails, deviceInfo: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth 
                                multiline
                                rows={3}
                                label="Additional Notes" 
                                placeholder="Any special handling instructions or notes about the storage device..."
                                value={storageDetails.notes}
                                onChange={(e) => setStorageDetails({...storageDetails, notes: e.target.value})}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setSubmitModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateDeliverable} variant="contained">
                        Submit Data
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
