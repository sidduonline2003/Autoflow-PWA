import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    Box, Container, Typography, Breadcrumbs, Link, Tabs, Tab, CircularProgress, Paper, Button, Card, CardContent, CardActions, Grid, Chip, 
    Dialog, DialogContent, DialogTitle, DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, 
    IconButton, Menu, Divider, List, ListItem, ListItemText, ListItemIcon, Badge, Alert, LinearProgress, Avatar,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Accordion, AccordionSummary, AccordionDetails,
    Stepper, Step, StepLabel, StepContent, Timeline, TimelineItem, TimelineSeparator, TimelineConnector, 
    TimelineContent, TimelineDot, Tooltip, Switch, FormControlLabel
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ChatIcon from '@mui/icons-material/Chat';
import ReceiptIcon from '@mui/icons-material/Receipt';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import TimelineIcon from '@mui/icons-material/Timeline';
import BuildIcon from '@mui/icons-material/Build';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import toast from 'react-hot-toast';
import EventForm from '../components/EventForm';
import AISuggestionDisplay from '../components/AISuggestionDisplay';
import ManualTeamAssignmentModal from '../components/ManualTeamAssignmentModal';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return <div role="tabpanel" hidden={value !== index} {...other}>{value === index && <Box sx={{ p: 3 }}>{children}</Box>}</div>;
}

const ClientWorkspacePage = () => {
    const { clientId } = useParams();
    const { claims } = useAuth();
    const [client, setClient] = useState(null);
    const [events, setEvents] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0);
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [eventDetailOpen, setEventDetailOpen] = useState(false);
    const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
    const [messageModalOpen, setMessageModalOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState(null);
    
    // Event management states
    const [newStatus, setNewStatus] = useState('');
    const [statusUpdateOpen, setStatusUpdateOpen] = useState(false);
    const [uploadFiles, setUploadFiles] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    
    // Invoice states
    const [invoiceData, setInvoiceData] = useState({
        description: '',
        amount: '',
        dueDate: '',
        items: []
    });
    
    // AI suggestions states
    const [aiSuggestions, setAiSuggestions] = useState({});
    const [aiLoading, setAiLoading] = useState({});
    const [aiError, setAiError] = useState({});

    // File/Deliverable tracking states
    const [deliverables, setDeliverables] = useState([]);
    const [deliverableModalOpen, setDeliverableModalOpen] = useState(false);
    const [confirmSubmissionOpen, setConfirmSubmissionOpen] = useState(false);
    const [selectedDeliverable, setSelectedDeliverable] = useState(null);
    const [storageDetails, setStorageDetails] = useState({
        storageType: '',
        deviceInfo: '',
        notes: ''
    });

    // Enhanced features states
    const [equipmentModalOpen, setEquipmentModalOpen] = useState(false);
    const [contractModalOpen, setContractModalOpen] = useState(false);
    const [budgetModalOpen, setBudgetModalOpen] = useState(false);
    const [timelineModalOpen, setTimelineModalOpen] = useState(false);
    const [approvalModalOpen, setApprovalModalOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState(null);
    const [equipmentList, setEquipmentList] = useState([]);
    const [budgetDetails, setBudgetDetails] = useState({
        estimatedCost: '',
        actualCost: '',
        items: []
    });
    const [contractData, setContractData] = useState({
        title: '',
        terms: '',
        amount: '',
        dueDate: '',
        status: 'draft'
    });
    const [milestones, setMilestones] = useState([]);
    const [approvalRequests, setApprovalRequests] = useState([]);
    
    // Manual team assignment state
    const [manualAssignmentModalOpen, setManualAssignmentModalOpen] = useState(false);

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

        // Subscribe to invoices
        const invoicesCollectionRef = collection(db, 'organizations', claims.orgId, 'clients', clientId, 'invoices');
        const unsubInvoices = onSnapshot(invoicesCollectionRef, (snapshot) => {
            setInvoices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Subscribe to messages
        const messagesCollectionRef = collection(db, 'organizations', claims.orgId, 'clients', clientId, 'messages');
        const unsubMessages = onSnapshot(messagesCollectionRef, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Subscribe to deliverables
        const deliverablesCollectionRef = collection(db, 'organizations', claims.orgId, 'clients', clientId, 'deliverables');
        const unsubDeliverables = onSnapshot(deliverablesCollectionRef, (snapshot) => {
            setDeliverables(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        
        return () => { unsubClient(); unsubEvents(); unsubInvoices(); unsubMessages(); unsubDeliverables(); };
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

    const handleEventMenuClick = (event, eventData) => {
        setAnchorEl(event.currentTarget);
        setSelectedEvent(eventData);
    };

    const handleEventMenuClose = () => {
        setAnchorEl(null);
        setSelectedEvent(null);
    };

    const handleStatusUpdate = async () => {
        if (!selectedEvent || !newStatus) return;
        try {
            await callApi(`/events/${selectedEvent.id}/status?client_id=${clientId}`, 'PUT', { status: newStatus });
            toast.success('Event status updated!');
            setStatusUpdateOpen(false);
            setNewStatus('');
            handleEventMenuClose();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleCreateInvoice = async () => {
        try {
            await callApi(`/invoices/for-client/${clientId}`, 'POST', invoiceData);
            toast.success('Invoice created!');
            setInvoiceModalOpen(false);
            setInvoiceData({ description: '', amount: '', dueDate: '', items: [] });
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;
        try {
            await callApi(`/messages/for-client/${clientId}`, 'POST', { 
                message: newMessage,
                eventId: selectedEvent?.id || null 
            });
            toast.success('Message sent!');
            setNewMessage('');
            setMessageModalOpen(false);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleOpenDeliverableModal = () => {
        setDeliverableModalOpen(true);
        setStorageDetails({ storageType: '', deviceInfo: '', notes: '' });
    };

    const handleCreateDeliverable = async () => {
        if (!selectedEvent) return;
        try {
            await callApi(`/deliverables/events/${selectedEvent.id}/tracking?client_id=${clientId}`, 'POST', {
                storageType: storageDetails.storageType,
                deviceInfo: storageDetails.deviceInfo,
                notes: storageDetails.notes,
                eventId: selectedEvent.id,
                eventName: selectedEvent.name
            });
            toast.success('Deliverable tracking created!');
            setDeliverableModalOpen(false);
            setStorageDetails({ storageType: '', deviceInfo: '', notes: '' });
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleConfirmSubmission = (deliverable) => {
        setSelectedDeliverable(deliverable);
        setConfirmSubmissionOpen(true);
    };

    const handleFinalizeSubmission = async () => {
        if (!selectedDeliverable) return;
        try {
            await callApi(`/deliverables/${selectedDeliverable.id}/finalize?client_id=${clientId}`, 'PUT');
            toast.success('Deliverable submission finalized!');
            setConfirmSubmissionOpen(false);
            setSelectedDeliverable(null);
        } catch (error) {
            toast.error(error.message);
        }
    };

    // Enhanced Feature Handlers
    const handleCreateEquipmentAssignment = async () => {
        if (!selectedEvent || equipmentList.length === 0) return;
        try {
            await callApi(`/equipment/events/${selectedEvent.id}/assign?client_id=${clientId}`, 'POST', { equipment: equipmentList });
            toast.success('Equipment assigned successfully!');
            setEquipmentModalOpen(false);
            setEquipmentList([]);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleCreateContract = async () => {
        try {
            await callApi(`/contracts/for-client/${clientId}`, 'POST', contractData);
            toast.success('Contract created successfully!');
            setContractModalOpen(false);
            setContractData({ title: '', terms: '', amount: '', dueDate: '', status: 'draft' });
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleUpdateBudget = async () => {
        if (!selectedEvent) return;
        try {
            await callApi(`/budgets/events/${selectedEvent.id}?client_id=${clientId}`, 'PUT', budgetDetails);
            toast.success('Budget updated successfully!');
            setBudgetModalOpen(false);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleCreateMilestone = async (milestoneData) => {
        if (!selectedEvent) return;
        try {
            await callApi(`/milestones/events/${selectedEvent.id}?client_id=${clientId}`, 'POST', milestoneData);
            toast.success('Milestone created successfully!');
            setTimelineModalOpen(false);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleRequestApproval = async (approvalData) => {
        try {
            await callApi(`/approvals/for-client/${clientId}`, 'POST', { 
                ...approvalData, 
                eventId: selectedEvent?.id 
            });
            toast.success('Approval request sent to client!');
            setApprovalModalOpen(false);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const getStatusColor = (status) => {
        const colors = {
            'UPCOMING': 'primary',
            'IN_PROGRESS': 'warning',
            'COMPLETED': 'success',
            'CANCELLED': 'error',
            'ON_HOLD': 'default'
        };
        return colors[status] || 'default';
    };

    const getEventProgress = (event) => {
        const stages = ['UPCOMING', 'IN_PROGRESS', 'POST_PRODUCTION', 'DELIVERED', 'COMPLETED'];
        const currentIndex = stages.indexOf(event.status);
        return currentIndex >= 0 ? ((currentIndex + 1) / stages.length) * 100 : 0;
    };

    const EventCard = ({ event }) => (
        <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="h6">{event.name}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip label={event.status} color={getStatusColor(event.status)} size="small" />
                        <IconButton size="small" onClick={(e) => handleEventMenuClick(e, event)}>
                            <MoreVertIcon />
                        </IconButton>
                    </Box>
                </Box>
                
                <Typography color="text.secondary" gutterBottom>
                    {event.date} at {event.time} • {event.venue}
                </Typography>
                
                <LinearProgress 
                    variant="determinate" 
                    value={getEventProgress(event)} 
                    sx={{ mb: 2, height: 6, borderRadius: 3 }}
                />
                
                <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" gutterBottom>Assigned Team:</Typography>
                        {event.assignedCrew && event.assignedCrew.length > 0 ? (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                {event.assignedCrew.map(c => (
                                    <Chip key={c.userId} label={`${c.name} (${c.role})`} size="small" />
                                ))}
                            </Box>
                        ) : (
                            <Typography variant="body2" color="text.secondary">No team assigned yet.</Typography>
                        )}
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" gutterBottom>Project Status:</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Chip 
                                icon={<AttachFileIcon />} 
                                label={event.deliverableSubmitted ? 'Storage Submitted' : 'Awaiting Storage'} 
                                size="small" 
                                color={event.deliverableSubmitted ? 'success' : 'default'}
                                variant="outlined" 
                            />
                            {event.budgetApproved && (
                                <Chip 
                                    label="Budget Approved" 
                                    size="small" 
                                    color="success" 
                                />
                            )}
                            {event.contractSigned && (
                                <Chip 
                                    label="Contract Signed" 
                                    size="small" 
                                    color="success" 
                                />
                            )}
                            {event.invoice && (
                                <Chip 
                                    icon={<ReceiptIcon />} 
                                    label="Invoiced" 
                                    size="small" 
                                    color="info" 
                                />
                            )}
                        </Box>
                    </Grid>
                    
                    <Grid item xs={12}>
                        <Typography variant="subtitle2" gutterBottom>Next Actions:</Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {!event.assignedCrew?.length && (
                                <>
                                    <Button size="small" variant="outlined" onClick={() => getAiSuggestions(event.id)}>
                                        AI Suggest Team
                                    </Button>
                                    <Button size="small" variant="outlined" onClick={() => {
                                        setSelectedEvent(event);
                                        setManualAssignmentModalOpen(true);
                                    }}>
                                        Manual Assign
                                    </Button>
                                </>
                            )}
                            {event.assignedCrew?.length > 0 && (
                                <Button size="small" variant="outlined" onClick={() => {
                                    setSelectedEvent(event);
                                    setManualAssignmentModalOpen(true);
                                }}>
                                    Manage Team
                                </Button>
                            )}
                            {!event.budgetApproved && (
                                <Button size="small" variant="outlined" onClick={() => {
                                    setSelectedEvent(event);
                                    setBudgetModalOpen(true);
                                }}>
                                    Set Budget
                                </Button>
                            )}
                            {!event.contractSigned && (
                                <Button size="small" variant="outlined" onClick={() => {
                                    setSelectedEvent(event);
                                    setContractModalOpen(true);
                                }}>
                                    Create Contract
                                </Button>
                            )}
                            {event.status === 'COMPLETED' && !event.deliverableSubmitted && (
                                <Chip label="Awaiting Storage Submission" color="warning" size="small" />
                            )}
                        </Box>
                    </Grid>
                </Grid>
                
                <AISuggestionDisplay 
                    eventId={event.id} 
                    suggestions={aiSuggestions[event.id]} 
                    loading={aiLoading[event.id]} 
                    error={aiError[event.id]} 
                    onAssign={handleAssignTeam} 
                />
            </CardContent>
            
            <CardActions>
                <Button size="small" onClick={() => getAiSuggestions(event.id)} disabled={aiLoading[event.id]}>
                    {aiLoading[event.id] ? 'Getting Suggestions...' : 'Suggest Team'}
                </Button>
                <Button size="small" startIcon={<VisibilityIcon />} onClick={() => {
                    setSelectedEvent(event);
                    setEventDetailOpen(true);
                }}>
                    View Details
                </Button>
            </CardActions>
        </Card>
    );

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;
    if (!client) return <Container><Typography variant="h5" color="error">Client not found.</Typography></Container>;

    return (
        <Container maxWidth="lg" sx={{ mt: 4 }}>
            <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
                <Link component={RouterLink} underline="hover" color="inherit" to="/clients">Clients</Link>
                <Typography color="text.primary">{client.name}</Typography>
            </Breadcrumbs>
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">{client.name}'s Workspace</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" startIcon={<ChatIcon />} onClick={() => setMessageModalOpen(true)}>
                        Message Client
                    </Button>
                    <Button variant="outlined" startIcon={<ReceiptIcon />} onClick={() => setInvoiceModalOpen(true)}>
                        Create Invoice
                    </Button>
                    <Button variant="outlined" startIcon={<FileUploadIcon />} onClick={handleOpenDeliverableModal}>
                        Track Storage
                    </Button>
                </Box>
            </Box>

            <Paper sx={{ width: '100%' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleTabChange}>
                        <Tab 
                            label={
                                <Badge badgeContent={events.length} color="primary">
                                    Events
                                </Badge>
                            } 
                        />
                        <Tab 
                            label={
                                <Badge badgeContent={invoices.filter(i => i.status === 'pending').length} color="error">
                                    Invoices
                                </Badge>
                            } 
                        />
                        <Tab label="Communication" />
                        <Tab label="Deliverables" />
                        <Tab label="Contracts & Budgets" />
                        <Tab label="Timeline & Milestones" />
                        <Tab label="History" />
                    </Tabs>
                </Box>
                
                <TabPanel value={tabValue} index={0}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Events</Typography>
                        <Button variant="contained" onClick={() => setIsEventModalOpen(true)}>
                            Add New Event
                        </Button>
                    </Box>
                    
                    {events.length > 0 ? (
                        events.map(event => <EventCard key={event.id} event={event} />)
                    ) : (
                        <Alert severity="info">No events found. Create your first event to get started!</Alert>
                    )}
                </TabPanel>
                
                <TabPanel value={tabValue} index={1}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Invoices</Typography>
                        <Button variant="contained" onClick={() => setInvoiceModalOpen(true)}>
                            Create Invoice
                        </Button>
                    </Box>
                    
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Invoice #</TableCell>
                                    <TableCell>Description</TableCell>
                                    <TableCell>Amount</TableCell>
                                    <TableCell>Due Date</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {invoices.map((invoice) => (
                                    <TableRow key={invoice.id}>
                                        <TableCell>#{invoice.invoiceNumber}</TableCell>
                                        <TableCell>{invoice.description}</TableCell>
                                        <TableCell>${invoice.amount}</TableCell>
                                        <TableCell>{invoice.dueDate}</TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={invoice.status} 
                                                color={invoice.status === 'paid' ? 'success' : 'warning'}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <IconButton size="small">
                                                <DownloadIcon />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </TabPanel>
                
                <TabPanel value={tabValue} index={2}>
                    <Typography variant="h6" gutterBottom>Communication History</Typography>
                    <List>
                        {messages.map((message) => (
                            <ListItem key={message.id} divider>
                                <ListItemIcon>
                                    <Avatar>{message.senderName?.[0]}</Avatar>
                                </ListItemIcon>
                                <ListItemText
                                    primary={message.message}
                                    secondary={`${message.senderName} • ${new Date(message.createdAt?.toDate()).toLocaleDateString()}`}
                                />
                            </ListItem>
                        ))}
                    </List>
                </TabPanel>
                
                <TabPanel value={tabValue} index={3}>
                    <Typography variant="h6" gutterBottom>Deliverables & Storage Tracking</Typography>
                    {deliverables.length > 0 ? (
                        <Grid container spacing={2}>
                            {deliverables.map((deliverable) => (
                                <Grid item xs={12} md={6} key={deliverable.id}>
                                    <Card variant="outlined">
                                        <CardContent>
                                            <Typography variant="h6" gutterBottom>
                                                {deliverable.eventName}
                                            </Typography>
                                            <Box sx={{ mb: 2 }}>
                                                <Chip 
                                                    label={deliverable.status || 'Pending Submission'} 
                                                    color={deliverable.status === 'submitted' ? 'success' : 
                                                          deliverable.status === 'in_post_production' ? 'info' : 'warning'}
                                                    size="small"
                                                />
                                            </Box>
                                            <Typography variant="body2" color="text.secondary">
                                                <strong>Storage Type:</strong> {deliverable.storageType || 'Not specified'}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                <strong>Device Info:</strong> {deliverable.deviceInfo || 'Not specified'}
                                            </Typography>
                                            {deliverable.notes && (
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>Notes:</strong> {deliverable.notes}
                                                </Typography>
                                            )}
                                            {deliverable.submittedAt && (
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>Submitted:</strong> {new Date(deliverable.submittedAt.toDate()).toLocaleDateString()}
                                                </Typography>
                                            )}
                                        </CardContent>
                                        <CardActions>
                                            {deliverable.status !== 'submitted' && deliverable.status !== 'in_post_production' && (
                                                <Button 
                                                    size="small" 
                                                    variant="contained"
                                                    onClick={() => handleConfirmSubmission(deliverable)}
                                                >
                                                    Mark as Submitted
                                                </Button>
                                            )}
                                            {deliverable.status === 'submitted' && (
                                                <Chip label="Ready for Post-Production" color="success" size="small" />
                                            )}
                                        </CardActions>
                                    </Card>
                                </Grid>
                            ))}
                        </Grid>
                    ) : (
                        <Alert severity="info">
                            No deliverables tracking yet. Deliverable tracking will be created automatically when events are completed.
                        </Alert>
                    )}
                </TabPanel>
                
                <TabPanel value={tabValue} index={4}>
                    <Typography variant="h6" gutterBottom>Contracts & Budget Management</Typography>
                    
                    <Grid container spacing={3}>
                        {/* Budget Overview */}
                        <Grid item xs={12} md={6}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>Budget Overview</Typography>
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Total Estimated: ${events.reduce((sum, event) => sum + (parseFloat(event.estimatedBudget) || 0), 0).toFixed(2)}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Total Actual: ${events.reduce((sum, event) => sum + (parseFloat(event.actualCost) || 0), 0).toFixed(2)}
                                        </Typography>
                                    </Box>
                                    <Button 
                                        variant="outlined" 
                                        fullWidth
                                        onClick={() => setBudgetModalOpen(true)}
                                        startIcon={<EditIcon />}
                                    >
                                        Update Budget
                                    </Button>
                                </CardContent>
                            </Card>
                        </Grid>
                        
                        {/* Contract Management */}
                        <Grid item xs={12} md={6}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>Contracts & Agreements</Typography>
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Signed Contracts: {events.filter(e => e.contractSigned).length}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Pending Signatures: {events.filter(e => !e.contractSigned).length}
                                        </Typography>
                                    </Box>
                                    <Button 
                                        variant="outlined" 
                                        fullWidth
                                        onClick={() => setContractModalOpen(true)}
                                        startIcon={<EditIcon />}
                                    >
                                        Create New Contract
                                    </Button>
                                </CardContent>
                            </Card>
                        </Grid>
                        
                        {/* Event-wise Budget Breakdown */}
                        <Grid item xs={12}>
                            <Typography variant="h6" gutterBottom>Event Budget Breakdown</Typography>
                            <TableContainer component={Paper}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Event</TableCell>
                                            <TableCell>Estimated Budget</TableCell>
                                            <TableCell>Actual Cost</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {events.map((event) => (
                                            <TableRow key={event.id}>
                                                <TableCell>{event.name}</TableCell>
                                                <TableCell>${event.estimatedBudget || '0.00'}</TableCell>
                                                <TableCell>${event.actualCost || '0.00'}</TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={event.budgetApproved ? 'Approved' : 'Pending'} 
                                                        color={event.budgetApproved ? 'success' : 'warning'}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Button 
                                                        size="small" 
                                                        onClick={() => {
                                                            setSelectedEvent(event);
                                                            setBudgetModalOpen(true);
                                                        }}
                                                    >
                                                        Edit
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Grid>
                    </Grid>
                </TabPanel>
                
                <TabPanel value={tabValue} index={5}>
                    <Typography variant="h6" gutterBottom>Timeline & Milestones</Typography>
                    
                    {/* Project Timeline Overview */}
                    <Card variant="outlined" sx={{ mb: 3 }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Project Timeline</Typography>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                <Button 
                                    variant="outlined" 
                                    startIcon={<CalendarTodayIcon />}
                                    onClick={() => setTimelineModalOpen(true)}
                                >
                                    Add Milestone
                                </Button>
                                <Typography variant="body2" color="text.secondary">
                                    Total Events: {events.length} | Completed: {events.filter(e => e.status === 'COMPLETED').length}
                                </Typography>
                            </Box>
                            
                            {/* Timeline visualization */}
                            <Grid container spacing={2}>
                                {events.sort((a, b) => new Date(a.date) - new Date(b.date)).map((event, index) => (
                                    <Grid item xs={12} key={event.id}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                            <Box sx={{ 
                                                width: 12, 
                                                height: 12, 
                                                borderRadius: '50%', 
                                                bgcolor: event.status === 'COMPLETED' ? 'success.main' : 
                                                        event.status === 'IN_PROGRESS' ? 'warning.main' : 'grey.400'
                                            }} />
                                            <Box sx={{ flex: 1 }}>
                                                <Typography variant="subtitle2">{event.name}</Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {event.date} • {event.status}
                                                </Typography>
                                            </Box>
                                            <Chip 
                                                label={event.status} 
                                                color={getStatusColor(event.status)} 
                                                size="small" 
                                            />
                                        </Box>
                                        {index < events.length - 1 && (
                                            <Box sx={{ ml: 1, my: 1, borderLeft: '2px solid', borderColor: 'grey.300', height: 20 }} />
                                        )}
                                    </Grid>
                                ))}
                            </Grid>
                        </CardContent>
                    </Card>
                    
                    {/* Milestones Table */}
                    <Typography variant="h6" gutterBottom>Key Milestones</Typography>
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Milestone</TableCell>
                                    <TableCell>Due Date</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Event</TableCell>
                                    <TableCell>Progress</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {events.map((event) => (
                                    <TableRow key={event.id}>
                                        <TableCell>
                                            <Typography variant="subtitle2">{event.name}</Typography>
                                        </TableCell>
                                        <TableCell>{event.date}</TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={event.status} 
                                                color={getStatusColor(event.status)} 
                                                size="small" 
                                            />
                                        </TableCell>
                                        <TableCell>{event.eventType}</TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <LinearProgress 
                                                    variant="determinate" 
                                                    value={getEventProgress(event)} 
                                                    sx={{ flex: 1, height: 6, borderRadius: 3 }}
                                                />
                                                <Typography variant="body2" color="text.secondary">
                                                    {Math.round(getEventProgress(event))}%
                                                </Typography>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </TabPanel>
                
                <TabPanel value={tabValue} index={6}>
                    <Typography variant="h6" gutterBottom>Project History</Typography>
                    <List>
                        {events.filter(e => e.status === 'COMPLETED').map((event) => (
                            <ListItem key={event.id} divider>
                                <ListItemIcon>
                                    <CheckCircleIcon color="success" />
                                </ListItemIcon>
                                <ListItemText
                                    primary={event.name}
                                    secondary={`Completed on ${event.completedDate || event.date}`}
                                />
                            </ListItem>
                        ))}
                    </List>
                </TabPanel>
            </Paper>

            {/* Event Actions Menu */}
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleEventMenuClose}>
                <MenuItem onClick={() => setStatusUpdateOpen(true)}>
                    <EditIcon sx={{ mr: 1 }} /> Update Status
                </MenuItem>
                <MenuItem onClick={() => {
                    setSelectedEvent(selectedEvent);
                    setEventDetailOpen(true);
                    handleEventMenuClose();
                }}>
                    <VisibilityIcon sx={{ mr: 1 }} /> View Details
                </MenuItem>
                <Divider />
                <MenuItem onClick={() => {
                    setManualAssignmentModalOpen(true);
                    handleEventMenuClose();
                }}>
                    <PersonAddIcon sx={{ mr: 1 }} /> Manage Team Assignment
                </MenuItem>
                <MenuItem onClick={() => {
                    setEquipmentModalOpen(true);
                    handleEventMenuClose();
                }}>
                    <BuildIcon sx={{ mr: 1 }} /> Assign Equipment
                </MenuItem>
                <MenuItem onClick={() => {
                    setBudgetModalOpen(true);
                    handleEventMenuClose();
                }}>
                    <AccountBalanceIcon sx={{ mr: 1 }} /> Manage Budget
                </MenuItem>
                <MenuItem onClick={() => {
                    setTimelineModalOpen(true);
                    handleEventMenuClose();
                }}>
                    <TimelineIcon sx={{ mr: 1 }} /> Add Milestone
                </MenuItem>
                <MenuItem onClick={() => {
                    setContractModalOpen(true);
                    handleEventMenuClose();
                }}>
                    <AssignmentIcon sx={{ mr: 1 }} /> Create Contract
                </MenuItem>
                <MenuItem onClick={() => {
                    setApprovalModalOpen(true);
                    handleEventMenuClose();
                }}>
                    <CheckCircleIcon sx={{ mr: 1 }} /> Request Approval
                </MenuItem>
                <Divider />
                <MenuItem onClick={() => handleEventMenuClose()} sx={{ color: 'error.main' }}>
                    <DeleteIcon sx={{ mr: 1 }} /> Cancel Event
                </MenuItem>
            </Menu>

            {/* Status Update Dialog */}
            <Dialog open={statusUpdateOpen} onClose={() => setStatusUpdateOpen(false)}>
                <DialogTitle>Update Event Status</DialogTitle>
                <DialogContent>
                    <FormControl fullWidth sx={{ mt: 2 }}>
                        <InputLabel>Status</InputLabel>
                        <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                            <MenuItem value="UPCOMING">Upcoming</MenuItem>
                            <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                            <MenuItem value="POST_PRODUCTION">Post Production</MenuItem>
                            <MenuItem value="DELIVERED">Delivered</MenuItem>
                            <MenuItem value="COMPLETED">Completed</MenuItem>
                            <MenuItem value="ON_HOLD">On Hold</MenuItem>
                            <MenuItem value="CANCELLED">Cancelled</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStatusUpdateOpen(false)}>Cancel</Button>
                    <Button onClick={handleStatusUpdate} variant="contained">Update</Button>
                </DialogActions>
            </Dialog>

            {/* Event Details Dialog */}
            <Dialog open={eventDetailOpen} onClose={() => setEventDetailOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>{selectedEvent?.name} - Event Details</DialogTitle>
                <DialogContent>
                    {selectedEvent && (
                        <Grid container spacing={3} sx={{ mt: 1 }}>
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" gutterBottom>Event Information</Typography>
                                <Typography><strong>Date:</strong> {selectedEvent.date}</Typography>
                                <Typography><strong>Time:</strong> {selectedEvent.time}</Typography>
                                <Typography><strong>Venue:</strong> {selectedEvent.venue}</Typography>
                                <Typography><strong>Type:</strong> {selectedEvent.eventType}</Typography>
                                <Typography><strong>Priority:</strong> {selectedEvent.priority}</Typography>
                                <Typography><strong>Duration:</strong> {selectedEvent.estimatedDuration} hours</Typography>
                                <Typography><strong>Expected Photos:</strong> {selectedEvent.expectedPhotos}</Typography>
                            </Grid>
                            
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" gutterBottom>Project Progress</Typography>
                                <LinearProgress 
                                    variant="determinate" 
                                    value={getEventProgress(selectedEvent)} 
                                    sx={{ mb: 2, height: 8, borderRadius: 4 }}
                                />
                                <Typography variant="body2" color="text.secondary">
                                    {Math.round(getEventProgress(selectedEvent))}% Complete
                                </Typography>
                            </Grid>
                            
                            <Grid item xs={12}>
                                <Typography variant="h6" gutterBottom>Special Requirements</Typography>
                                <Typography>{selectedEvent.specialRequirements || 'None specified'}</Typography>
                            </Grid>
                            
                            <Grid item xs={12}>
                                <Typography variant="h6" gutterBottom>Required Skills</Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                    {selectedEvent.requiredSkills?.map(skill => (
                                        <Chip key={skill} label={skill} size="small" />
                                    ))}
                                </Box>
                            </Grid>
                            
                            {/* Post-production functionality temporarily disabled */}
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEventDetailOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Invoice Creation Dialog */}
            <Dialog open={invoiceModalOpen} onClose={() => setInvoiceModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create Invoice</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth 
                                label="Description" 
                                value={invoiceData.description}
                                onChange={(e) => setInvoiceData({...invoiceData, description: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField 
                                fullWidth 
                                label="Amount" 
                                type="number"
                                value={invoiceData.amount}
                                onChange={(e) => setInvoiceData({...invoiceData, amount: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField 
                                fullWidth 
                                label="Due Date" 
                                type="date"
                                InputLabelProps={{ shrink: true }}
                                value={invoiceData.dueDate}
                                onChange={(e) => setInvoiceData({...invoiceData, dueDate: e.target.value})}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setInvoiceModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateInvoice} variant="contained">Create Invoice</Button>
                </DialogActions>
            </Dialog>

            {/* Message Dialog */}
            <Dialog open={messageModalOpen} onClose={() => setMessageModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Send Message to {client.name}</DialogTitle>
                <DialogContent>
                    <TextField 
                        fullWidth 
                        multiline 
                        rows={4} 
                        label="Message" 
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        sx={{ mt: 2 }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setMessageModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleSendMessage} variant="contained" disabled={!newMessage.trim()}>
                        Send Message
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Deliverable Submission Dialog */}
            <Dialog open={deliverableModalOpen} onClose={() => setDeliverableModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Track Storage Submission</DialogTitle>
                <DialogContent>
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
                    <Button onClick={() => setDeliverableModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateDeliverable} variant="contained">
                        Create Storage Tracking
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirm Submission Dialog */}
            <Dialog open={confirmSubmissionOpen} onClose={() => setConfirmSubmissionOpen(false)}>
                <DialogTitle>Confirm Submission</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to submit this deliverable? This action cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmSubmissionOpen(false)}>Cancel</Button>
                    <Button onClick={handleFinalizeSubmission} variant="contained" color="error">
                        Confirm Submission
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Equipment Assignment Modal */}
            <Dialog open={equipmentModalOpen} onClose={() => setEquipmentModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Assign Equipment to {selectedEvent?.name}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Specify equipment needed for this event
                    </Typography>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth
                                label="Equipment List (one per line)"
                                multiline
                                rows={4}
                                placeholder="e.g.,&#10;Camera - Canon EOS R5&#10;Lens - 24-70mm f/2.8&#10;Tripod - Manfrotto&#10;Lighting Kit"
                                value={equipmentList.join('\n')}
                                onChange={(e) => setEquipmentList(e.target.value.split('\n').filter(item => item.trim()))}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEquipmentModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateEquipmentAssignment} variant="contained">
                        Assign Equipment
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Contract Modal */}
            <Dialog open={contractModalOpen} onClose={() => setContractModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Create Contract Agreement</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth
                                label="Contract Title"
                                value={contractData.title}
                                onChange={(e) => setContractData({...contractData, title: e.target.value})}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                fullWidth
                                label="Amount"
                                type="number"
                                value={contractData.amount}
                                onChange={(e) => setContractData({...contractData, amount: e.target.value})}
                                InputProps={{ startAdornment: '$' }}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                fullWidth
                                label="Due Date"
                                type="date"
                                value={contractData.dueDate}
                                onChange={(e) => setContractData({...contractData, dueDate: e.target.value})}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth
                                label="Terms & Conditions"
                                multiline
                                rows={6}
                                value={contractData.terms}
                                onChange={(e) => setContractData({...contractData, terms: e.target.value})}
                                placeholder="Enter contract terms, conditions, and requirements..."
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setContractModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateContract} variant="contained">
                        Create Contract
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Budget Modal */}
            <Dialog open={budgetModalOpen} onClose={() => setBudgetModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Update Budget for {selectedEvent?.name}</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                fullWidth
                                label="Estimated Cost"
                                type="number"
                                value={budgetDetails.estimatedCost}
                                onChange={(e) => setBudgetDetails({...budgetDetails, estimatedCost: e.target.value})}
                                InputProps={{ startAdornment: '$' }}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                fullWidth
                                label="Actual Cost"
                                type="number"
                                value={budgetDetails.actualCost}
                                onChange={(e) => setBudgetDetails({...budgetDetails, actualCost: e.target.value})}
                                InputProps={{ startAdornment: '$' }}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth
                                label="Budget Items (one per line)"
                                multiline
                                rows={4}
                                placeholder="e.g.,&#10;Equipment rental - $500&#10;Transportation - $200&#10;Crew meals - $150"
                                value={budgetDetails.items.join('\n')}
                                onChange={(e) => setBudgetDetails({...budgetDetails, items: e.target.value.split('\n').filter(item => item.trim())})}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBudgetModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpdateBudget} variant="contained">
                        Update Budget
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Timeline/Milestone Modal */}
            <Dialog open={timelineModalOpen} onClose={() => setTimelineModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add Milestone</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Create a new milestone for project tracking
                    </Typography>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth
                                label="Milestone Title"
                                placeholder="e.g., Pre-production meeting"
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField 
                                fullWidth
                                label="Due Date"
                                type="date"
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth>
                                <InputLabel>Priority</InputLabel>
                                <Select label="Priority">
                                    <MenuItem value="high">High</MenuItem>
                                    <MenuItem value="medium">Medium</MenuItem>
                                    <MenuItem value="low">Low</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth
                                label="Description"
                                multiline
                                rows={3}
                                placeholder="Describe the milestone requirements and deliverables..."
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTimelineModalOpen(false)}>Cancel</Button>
                    <Button onClick={() => {
                        handleCreateMilestone({
                            title: "Sample Milestone", 
                            dueDate: "2024-01-01", 
                            priority: "medium",
                            description: "Sample description"
                        });
                    }} variant="contained">
                        Add Milestone
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Client Approval Modal */}
            <Dialog open={approvalModalOpen} onClose={() => setApprovalModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Request Client Approval</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Send an approval request to the client for review
                    </Typography>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <FormControl fullWidth>
                                <InputLabel>Approval Type</InputLabel>
                                <Select label="Approval Type">
                                    <MenuItem value="budget">Budget Approval</MenuItem>
                                    <MenuItem value="contract">Contract Signature</MenuItem>
                                    <MenuItem value="concept">Concept Approval</MenuItem>
                                    <MenuItem value="final_delivery">Final Delivery</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth
                                label="Subject"
                                placeholder="e.g., Budget approval required for wedding photography"
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField 
                                fullWidth
                                label="Message to Client"
                                multiline
                                rows={4}
                                placeholder="Please provide details about what needs approval..."
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setApprovalModalOpen(false)}>Cancel</Button>
                    <Button onClick={() => {
                        handleRequestApproval({
                            type: "budget",
                            subject: "Approval Required",
                            message: "Please review and approve."
                        });
                    }} variant="contained">
                        Send Request
                    </Button>
                </DialogActions>
            </Dialog>

            <ManualTeamAssignmentModal
                open={manualAssignmentModalOpen}
                onClose={() => setManualAssignmentModalOpen(false)}
                eventId={selectedEvent?.id}
                clientId={clientId}
                eventData={selectedEvent}
                callApi={callApi}
            />

            <EventForm 
                open={isEventModalOpen} 
                onClose={() => setIsEventModalOpen(false)} 
                onSubmit={handleCreateEvent} 
                clientName={client.name} 
            />
        </Container>
    );
};

export default ClientWorkspacePage;
