import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, Button, AppBar, Toolbar, Paper, Card, CardContent, 
    Grid, Avatar, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    Badge, IconButton, Tabs, Tab, List, ListItem, ListItemAvatar, ListItemText,
    Divider, LinearProgress, Accordion, AccordionSummary, AccordionDetails, Fab,
    Alert, CircularProgress, TableContainer, Table, TableHead, TableRow, TableCell,
    TableBody, Snackbar
} from '@mui/material';
import { 
    Event as EventIcon, 
    People as PeopleIcon, 
    Chat as ChatIcon, 
    Notifications as NotificationsIcon,
    ExpandMore as ExpandMoreIcon,
    Send as SendIcon,
    Phone as PhoneIcon,
    Email as EmailIcon,
    Star as StarIcon,
    Timeline as TimelineIcon,
    AttachFile as AttachFileIcon,
    Refresh as RefreshIcon,
    CheckCircle as CheckCircleIcon,
    Schedule as ScheduleIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

// Safe date formatting function
const formatDate = (dateString, formatString = 'MMM dd, yyyy') => {
    if (!dateString) return 'Date not set';
    try {
        // If it's already a Date object
        if (dateString instanceof Date) {
            return format(dateString, formatString);
        }
        // If it's a Firestore timestamp object
        if (dateString._seconds || dateString.seconds) {
            const timestamp = dateString._seconds || dateString.seconds;
            return format(new Date(timestamp * 1000), formatString);
        }
        // If it's an ISO string
        return format(parseISO(dateString), formatString);
    } catch (error) {
        console.error('Date formatting error:', error, 'for date:', dateString);
        return 'Invalid date';
    }
};

const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
        // If it's already a Date object
        if (timestamp instanceof Date) {
            return format(timestamp, 'MMM dd, HH:mm');
        }
        // If it's a Firestore timestamp object
        if (timestamp._seconds || timestamp.seconds) {
            const seconds = timestamp._seconds || timestamp.seconds;
            return format(new Date(seconds * 1000), 'MMM dd, HH:mm');
        }
        // If it's an ISO string
        return format(parseISO(timestamp), 'MMM dd, HH:mm');
    } catch (error) {
        console.error('Timestamp formatting error:', error, 'for timestamp:', timestamp);
        return 'Just now';
    }
};

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return <div role="tabpanel" hidden={value !== index} {...other}>{value === index && <Box sx={{ p: 3 }}>{children}</Box>}</div>;
}

const ClientDashboardPage = () => {
    const { user, claims } = useAuth();
    const [events, setEvents] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0);
    
    // Chat states
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    
    // Team detail states
    const [teamDetailOpen, setTeamDetailOpen] = useState(false);
    const [selectedTeamEvent, setSelectedTeamEvent] = useState(null);
    const [teamDetails, setTeamDetails] = useState([]);
    
    // Notification states
    const [notificationOpen, setNotificationOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (claims?.orgId && user?.uid) {
            fetchDashboardData();
            // Set up periodic refresh
            const interval = setInterval(fetchDashboardData, 30000); // 30 seconds
            return () => clearInterval(interval);
        }
    }, [claims, user]);

    const fetchDashboardData = async () => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            
            // Fetch events and notifications in parallel
            const [eventsResponse, notificationsResponse] = await Promise.all([
                fetch('/api/client/my-events', {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                }),
                fetch('/api/client/notifications', {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                })
            ]);

            if (eventsResponse.ok) {
                const eventsData = await eventsResponse.json();
                setEvents(eventsData.events || []);
            }

            if (notificationsResponse.ok) {
                const notifData = await notificationsResponse.json();
                setNotifications(notifData.notifications || []);
                setUnreadCount(notifData.unread_count || 0);
            }
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const handleChatOpen = async (event) => {
        setSelectedEvent(event);
        setChatOpen(true);
        setChatLoading(true);
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/client/event/${event.id}/chat`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                setChatMessages(data.messages || []);
            }
        } catch (error) {
            console.error('Error fetching chat messages:', error);
            toast.error('Failed to load chat messages');
        } finally {
            setChatLoading(false);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !selectedEvent) return;
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/client/event/${selectedEvent.id}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ message: newMessage.trim() })
            });
            
            if (response.ok) {
                const data = await response.json();
                setChatMessages(prev => [...prev, data.message]);
                setNewMessage('');
                toast.success('Message sent!');
            }
        } catch (error) {
            console.error('Error sending message:', error);
            toast.error('Failed to send message');
        }
    };

    const handleViewTeam = async (event) => {
        setSelectedTeamEvent(event);
        setTeamDetailOpen(true);
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/client/event/${event.id}/team`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            
            console.log('Team details response status:', response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log('Team details response data:', data);
                setTeamDetails(data.team_members || []);
            } else {
                const errorText = await response.text();
                console.error('Team details API error:', response.status, errorText);
                toast.error(`Failed to load team details: ${response.status}`);
            }
        } catch (error) {
            console.error('Error fetching team details:', error);
            toast.error('Failed to load team details');
        }
    };

    const getStatusColor = (status) => {
        const colors = {
            'UPCOMING': 'primary',
            'IN_PROGRESS': 'warning', 
            'COMPLETED': 'success',
            'CANCELLED': 'error'
        };
        return colors[status] || 'default';
    };

    const getProgressPercentage = (event) => {
        // Use real-time progress data from backend if available
        if (event.progress !== undefined && event.progress !== null && !isNaN(event.progress)) {
            return Math.max(0, Math.min(100, event.progress)); // Clamp between 0-100
        }
        
        // Fallback to status-based calculation
        switch (event.status) {
            case 'COMPLETED': return 100;
            case 'DELIVERED': return 90;
            case 'POST_PRODUCTION': return 70;
            case 'IN_PROGRESS': return 60;
            case 'UPCOMING': return 20;
            case 'CANCELLED': return 0;
            default: return 0;
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Failed to log out', error);
        }
    };

    const upcomingEvents = events.filter(e => e.status !== 'COMPLETED');
    const completedEvents = events.filter(e => e.status === 'COMPLETED');

    if (loading) {
        return (
            <Container sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Container>
        );
    }

    return (
        <>
            <AppBar position="static" sx={{ background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)' }}>
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Client Portal
                    </Typography>
                    <IconButton color="inherit" onClick={() => setNotificationOpen(true)}>
                        <Badge badgeContent={unreadCount} color="error">
                            <NotificationsIcon />
                        </Badge>
                    </IconButton>
                    <IconButton color="inherit" onClick={fetchDashboardData}>
                        <RefreshIcon />
                    </IconButton>
                    <Button color="inherit" onClick={handleLogout}>Logout</Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                {/* Welcome Section */}
                <Paper elevation={3} sx={{ p: 3, mb: 4, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                    <Typography variant="h4" gutterBottom>
                        Welcome, {user?.displayName || user?.email?.split('@')[0]}!
                    </Typography>
                    <Typography variant="h6" sx={{ opacity: 0.9 }}>
                        Your Project Dashboard & Communication Center
                    </Typography>
                </Paper>

                {/* Quick Stats */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ background: 'linear-gradient(45deg, #FE6B8B 30%, #FF8E53 90%)', color: 'white' }}>
                            <CardContent>
                                <Box display="flex" alignItems="center">
                                    <EventIcon sx={{ fontSize: 40, mr: 2 }} />
                                    <Box>
                                        <Typography variant="h4">{upcomingEvents.length}</Typography>
                                        <Typography variant="body2">Upcoming Events</Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)', color: 'white' }}>
                            <CardContent>
                                <Box display="flex" alignItems="center">
                                    <PeopleIcon sx={{ fontSize: 40, mr: 2 }} />
                                    <Box>
                                        <Typography variant="h4">
                                            {events.reduce((total, event) => total + (event.assigned_team?.length || 0), 0)}
                                        </Typography>
                                        <Typography variant="body2">Team Members</Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ background: 'linear-gradient(45deg, #4CAF50 30%, #45a049 90%)', color: 'white' }}>
                            <CardContent>
                                <Box display="flex" alignItems="center">
                                    <CheckCircleIcon sx={{ fontSize: 40, mr: 2 }} />
                                    <Box>
                                        <Typography variant="h4">{completedEvents.length}</Typography>
                                        <Typography variant="body2">Completed</Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ background: 'linear-gradient(45deg, #FF9800 30%, #F57C00 90%)', color: 'white' }}>
                            <CardContent>
                                <Box display="flex" alignItems="center">
                                    <ChatIcon sx={{ fontSize: 40, mr: 2 }} />
                                    <Box>
                                        <Typography variant="h4">{unreadCount}</Typography>
                                        <Typography variant="body2">New Messages</Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>

                {/* Main Content */}
                <Paper elevation={3}>
                    <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} variant="fullWidth">
                        <Tab label="My Events" icon={<EventIcon />} />
                        <Tab label="Team Directory" icon={<PeopleIcon />} />
                        <Tab label="Progress Timeline" icon={<TimelineIcon />} />
                    </Tabs>

                    {/* Events Tab */}
                    <TabPanel value={tabValue} index={0}>
                        <Grid container spacing={3}>
                            {events.map((event) => (
                                <Grid item xs={12} md={6} lg={4} key={event.id}>
                                    <Card elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                        <CardContent sx={{ flexGrow: 1 }}>
                                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                                                <Typography variant="h6" noWrap>{event.title}</Typography>
                                                <Chip 
                                                    label={event.status} 
                                                    color={getStatusColor(event.status)} 
                                                    size="small"
                                                />
                                            </Box>
                                            
                                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                                <ScheduleIcon fontSize="small" sx={{ mr: 1, verticalAlign: 'middle' }} />
                                                {formatDate(event.date)}
                                            </Typography>
                                            
                                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                                📍 {event.location}
                                            </Typography>

                                            {/* Progress Bar */}
                                            <Box sx={{ mt: 2 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                    Progress: {getProgressPercentage(event)}%
                                                </Typography>
                                                <LinearProgress 
                                                    variant="determinate" 
                                                    value={getProgressPercentage(event)} 
                                                    sx={{ mt: 1, height: 8, borderRadius: 4 }}
                                                />
                                            </Box>

                                            {/* Team Avatars */}
                                            <Box display="flex" alignItems="center" mt={2}>
                                                <Typography variant="body2" sx={{ mr: 1 }}>Team:</Typography>
                                                <Box display="flex" sx={{ '& > *': { mr: 0.5 } }}>
                                                    {(event.assigned_team || []).slice(0, 3).map((member, index) => (
                                                        <Avatar 
                                                            key={index} 
                                                            sx={{ width: 24, height: 24, fontSize: '0.75rem' }}
                                                        >
                                                            {member.name?.charAt(0) || '?'}
                                                        </Avatar>
                                                    ))}
                                                    {event.assigned_team?.length > 3 && (
                                                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                                                            +{event.assigned_team.length - 3}
                                                        </Avatar>
                                                    )}
                                                </Box>
                                            </Box>
                                        </CardContent>
                                        
                                        <Box sx={{ p: 1, display: 'flex', gap: 1 }}>
                                            <Button 
                                                size="small" 
                                                startIcon={<PeopleIcon />}
                                                onClick={() => handleViewTeam(event)}
                                                variant="outlined"
                                                fullWidth
                                            >
                                                View Team
                                            </Button>
                                            <Button 
                                                size="small" 
                                                startIcon={<ChatIcon />}
                                                onClick={() => handleChatOpen(event)}
                                                variant="contained"
                                                fullWidth
                                            >
                                                Chat
                                            </Button>
                                        </Box>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                        
                        {events.length === 0 && (
                            <Alert severity="info" sx={{ mt: 2 }}>
                                No events assigned to you yet. Contact your project manager for more information.
                            </Alert>
                        )}
                    </TabPanel>

                    {/* Team Directory Tab */}
                    <TabPanel value={tabValue} index={1}>
                        <Typography variant="h6" gutterBottom>Your Project Teams</Typography>
                        {events.map((event) => (
                            <Accordion key={event.id} sx={{ mb: 2 }}>
                                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                    <Box display="flex" alignItems="center" width="100%">
                                        <Typography variant="h6" sx={{ flexGrow: 1 }}>
                                            {event.title}
                                        </Typography>
                                        <Chip 
                                            label={`${event.assigned_team?.length || 0} members`} 
                                            size="small" 
                                            sx={{ mr: 2 }}
                                        />
                                        <Chip 
                                            label={event.status} 
                                            color={getStatusColor(event.status)} 
                                            size="small"
                                        />
                                    </Box>
                                </AccordionSummary>
                                <AccordionDetails>
                                    <Grid container spacing={2}>
                                        {(event.assigned_team || []).map((member, index) => (
                                            <Grid item xs={12} sm={6} md={4} key={index}>
                                                <Card variant="outlined">
                                                    <CardContent>
                                                        <Box display="flex" alignItems="center" mb={2}>
                                                            <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
                                                                {member.name?.charAt(0) || '?'}
                                                            </Avatar>
                                                            <Box>
                                                                <Typography variant="subtitle1">
                                                                    {member.name}
                                                                </Typography>
                                                                <Typography variant="body2" color="text.secondary">
                                                                    {member.role}
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                        
                                                        {member.skills && (
                                                            <Box mb={2}>
                                                                <Typography variant="body2" gutterBottom>Skills:</Typography>
                                                                <Box display="flex" flexWrap="wrap" gap={0.5}>
                                                                    {member.skills.slice(0, 3).map((skill, i) => (
                                                                        <Chip key={i} label={skill} size="small" variant="outlined" />
                                                                    ))}
                                                                </Box>
                                                            </Box>
                                                        )}
                                                        
                                                        <Box display="flex" gap={1}>
                                                            <IconButton size="small" color="primary">
                                                                <PhoneIcon />
                                                            </IconButton>
                                                            <IconButton size="small" color="primary">
                                                                <EmailIcon />
                                                            </IconButton>
                                                            <IconButton size="small" color="primary">
                                                                <ChatIcon />
                                                            </IconButton>
                                                        </Box>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                        ))}
                                    </Grid>
                                </AccordionDetails>
                            </Accordion>
                        ))}
                    </TabPanel>

                    {/* Progress Timeline Tab */}
                    <TabPanel value={tabValue} index={2}>
                        <Typography variant="h6" gutterBottom>Project Timeline</Typography>
                        <TableContainer component={Paper} variant="outlined">
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Event</TableCell>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Progress</TableCell>
                                        <TableCell>Team Size</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {events.map((event) => (
                                        <TableRow key={event.id}>
                                            <TableCell>
                                                <Typography variant="subtitle2">{event.title}</Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {event.location}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                {formatDate(event.date)}
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={event.status} 
                                                    color={getStatusColor(event.status)} 
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Box display="flex" alignItems="center">
                                                    <LinearProgress 
                                                        variant="determinate" 
                                                        value={getProgressPercentage(event)} 
                                                        sx={{ width: 100, mr: 1 }}
                                                    />
                                                    <Typography variant="body2">
                                                        {getProgressPercentage(event)}%
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                {event.assigned_team?.length || 0} members
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </TabPanel>
                </Paper>
            </Container>

            {/* Chat Dialog */}
            <Dialog open={chatOpen} onClose={() => setChatOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    Chat: {selectedEvent?.title}
                    <Typography variant="body2" color="text.secondary">
                        Direct communication with your project team
                    </Typography>
                </DialogTitle>
                <DialogContent>
                    {chatLoading ? (
                        <Box display="flex" justifyContent="center" p={4}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Box sx={{ height: 400, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}>
                            {chatMessages.map((msg, index) => (
                                <Box key={index} sx={{ mb: 2 }}>
                                    <Box display="flex" alignItems="center" mb={0.5}>
                                        <Avatar sx={{ width: 24, height: 24, mr: 1, fontSize: '0.75rem' }}>
                                            {msg.sender_name?.charAt(0) || '?'}
                                        </Avatar>
                                        <Typography variant="subtitle2">{msg.sender_name}</Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                                            {formatTimestamp(msg.timestamp)}
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" sx={{ ml: 4 }}>
                                        {msg.message}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    )}
                    <Box display="flex" mt={2} gap={1}>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder="Type your message..."
                            value={newMessage}
                            onChange={(e) => setNewMessage(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                        />
                        <Button 
                            variant="contained" 
                            onClick={handleSendMessage}
                            startIcon={<SendIcon />}
                            disabled={!newMessage.trim()}
                        >
                            Send
                        </Button>
                    </Box>
                </DialogContent>
            </Dialog>

            {/* Team Detail Dialog */}
            <Dialog open={teamDetailOpen} onClose={() => setTeamDetailOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Team Details: {selectedTeamEvent?.title}</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2}>
                        {teamDetails.map((member, index) => (
                            <Grid item xs={12} sm={6} key={index}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Box display="flex" alignItems="center" mb={2}>
                                            <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
                                                {member.name?.charAt(0) || '?'}
                                            </Avatar>
                                            <Box>
                                                <Typography variant="h6">{member.name}</Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {member.role}
                                                </Typography>
                                            </Box>
                                        </Box>
                                        
                                        <Typography variant="body2" gutterBottom>
                                            📧 {member.email}
                                        </Typography>
                                        
                                        {member.phone && (
                                            <Typography variant="body2" gutterBottom>
                                                📞 {member.phone}
                                            </Typography>
                                        )}
                                        
                                        {member.skills && (
                                            <Box mt={2}>
                                                <Typography variant="body2" gutterBottom>Skills:</Typography>
                                                <Box display="flex" flexWrap="wrap" gap={0.5}>
                                                    {member.skills.map((skill, i) => (
                                                        <Chip key={i} label={skill} size="small" />
                                                    ))}
                                                </Box>
                                            </Box>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTeamDetailOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Notifications Dialog */}
            <Dialog open={notificationOpen} onClose={() => setNotificationOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Notifications</DialogTitle>
                <DialogContent>
                    <List>
                        {notifications.map((notif, index) => (
                            <React.Fragment key={index}>
                                <ListItem>
                                    <ListItemAvatar>
                                        <Avatar sx={{ bgcolor: notif.read ? 'grey.400' : 'primary.main' }}>
                                            <NotificationsIcon />
                                        </Avatar>
                                    </ListItemAvatar>
                                    <ListItemText
                                        primary={notif.title}
                                        secondary={notif.message}
                                    />
                                </ListItem>
                                {index < notifications.length - 1 && <Divider />}
                            </React.Fragment>
                        ))}
                    </List>
                    {notifications.length === 0 && (
                        <Typography variant="body2" color="text.secondary" textAlign="center" py={4}>
                            No notifications yet
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setNotificationOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Floating Action Button for Quick Actions */}
            <Fab 
                color="primary" 
                sx={{ position: 'fixed', bottom: 24, right: 24 }}
                onClick={fetchDashboardData}
            >
                <RefreshIcon />
            </Fab>
        </>
    );
};

export default ClientDashboardPage;
