import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, Button, AppBar, Toolbar, Paper, Table, TableBody, 
    TableCell, TableContainer, TableHead, TableRow, Chip, Grid, Card, CardContent, 
    CardActions, Dialog, DialogTitle, DialogContent, DialogActions, TextField, 
    FormControl, InputLabel, Select, MenuItem, Alert, Tabs, Tab, Badge
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import RequestLeaveModal from '../components/RequestLeaveModal';

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
    
    // Storage submission states
    const [submitModalOpen, setSubmitModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [storageDetails, setStorageDetails] = useState({
        storageType: '',
        deviceInfo: '',
        notes: ''
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

        fetchMemberName();

        // Subscribe to leave requests
        const leaveQuery = query(
            collection(db, 'organizations', claims.orgId, 'leaveRequests'),
            where('userId', '==', user.uid)
        );
        const unsubLeave = onSnapshot(leaveQuery, (snapshot) => {
            setLeaveRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Subscribe to assigned events across all clients
        const eventsQuery = query(
            collection(db, 'organizations', claims.orgId, 'events'),
            where('assignedCrew', 'array-contains', { userId: user.uid, name: memberName })
        );
        const unsubEvents = onSnapshot(eventsQuery, (snapshot) => {
            const allEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAssignedEvents(allEvents.filter(event => event.status !== 'COMPLETED'));
            setCompletedEvents(allEvents.filter(event => event.status === 'COMPLETED'));
        });

        return () => { unsubLeave(); unsubEvents(); };
    }, [claims, user, memberName]);

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
                            <Tab label="Leave Requests" />
                        </Tabs>
                    </Box>
                    
                    <TabPanel value={tabValue} index={0}>
                        <Typography variant="h6" gutterBottom>Your Assigned Events</Typography>
                        {assignedEvents.length > 0 ? (
                            <Grid container spacing={2}>
                                {assignedEvents.map((event) => (
                                    <Grid item xs={12} md={6} key={event.id}>
                                        <Card variant="outlined">
                                            <CardContent>
                                                <Typography variant="h6" gutterBottom>
                                                    {event.name}
                                                </Typography>
                                                <Box sx={{ mb: 2 }}>
                                                    <Chip 
                                                        label={event.status} 
                                                        color={getEventStatusColor(event.status)}
                                                        size="small"
                                                    />
                                                </Box>
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
                                            </CardContent>
                                            <CardActions>
                                                {event.status === 'COMPLETED' && (
                                                    <Button 
                                                        size="small" 
                                                        variant="contained"
                                                        onClick={() => handleSubmitCopy(event)}
                                                    >
                                                        Submit Copy
                                                    </Button>
                                                )}
                                            </CardActions>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        ) : (
                            <Alert severity="info">
                                No events assigned to you currently.
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
                                                {event.deliverableSubmitted && (
                                                    <Chip 
                                                        label="Copy Submitted" 
                                                        color="success" 
                                                        size="small" 
                                                        sx={{ mt: 1 }}
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
                                                        Submit Copy
                                                    </Button>
                                                )}
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
                        Submit Storage Device
                    </Button>
                </DialogActions>
            </Dialog>
            
            <RequestLeaveModal open={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleRequestLeave} />
        </>
    );
};

export default TeamDashboardPage;
