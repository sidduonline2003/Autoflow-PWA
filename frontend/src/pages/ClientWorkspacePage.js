import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    Box, Container, Typography, Breadcrumbs, Link, Tabs, Tab, CircularProgress, Paper, Button, Card, CardContent, CardActions, /* Grid, */ Chip, 
    Dialog, DialogContent, DialogTitle, DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, 
    IconButton, Menu, Divider, List, ListItem, ListItemText, ListItemIcon, Badge, Alert, LinearProgress, Avatar,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Accordion, AccordionSummary, AccordionDetails,
    Stepper, Step, StepLabel, StepContent, Timeline, TimelineItem, TimelineSeparator, TimelineConnector, 
    TimelineContent, TimelineDot, Tooltip, Switch, FormControlLabel
} from '@mui/material';
import Grid from '@mui/material/Grid2';
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
import GetAppIcon from '@mui/icons-material/GetApp';
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
import { getOverview as getPostprodOverview } from '../api/postprod.api';
import { getAuth } from "firebase/auth";

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return <div role="tabpanel" hidden={value !== index} {...other}>{value === index && <Box sx={{ p: 3 }}>{children}</Box>}</div>;
}

// Helper function to generate CSV report
const generateCSVReport = (batches) => {
    const headers = [
        'Event Name',
        'Event Type', 
        'Status',
        'Submitted By',
        'Submitted Date',
        'Handover Date',
        'Total Devices',
        'Device Details',
        'Storage Location',
        'Notes',
        'DM Notes',
        'Rejection Reason'
    ];
    
    const rows = batches.map(batch => [
        batch.eventInfo?.name || batch.eventName || 'Unknown Event',
        batch.eventInfo?.eventType || 'N/A',
        batch.status || 'Unknown',
        batch.submittedByName || 'Unknown',
        batch.createdAt ? new Date(batch.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown',
        batch.physicalHandoverDate || 'Not specified',
        batch.totalDevices || batch.storageDevices?.length || 0,
        batch.storageDevices?.map(d => `${d.type} ${d.capacity}`).join('; ') || 'No devices',
        batch.storageLocation ? `Room ${batch.storageLocation.room}, Shelf ${batch.storageLocation.shelf}, Bin ${batch.storageLocation.bin}` : 'Not assigned',
        batch.notes || 'No notes',
        batch.dmNotes || 'No DM notes',
        batch.rejectionReason || 'N/A'
    ]);
    
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    return csvContent;
};

const ClientWorkspacePage = () => {
    const { clientId } = useParams();
    const navigate = useNavigate();
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

    // Data submissions tracking states
    const [dataBatches, setDataBatches] = useState([]);
    const [dataLoading, setDataLoading] = useState(false);
    const [selectedDataBatch, setSelectedDataBatch] = useState(null);
    const [dataDetailModalOpen, setDataDetailModalOpen] = useState(false);
    const [dataFilters, setDataFilters] = useState({
        status: 'all',
        dateRange: 'all',
        eventId: 'all',
        search: ''
    });

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

    // Fetch data submissions for this client
    const fetchDataSubmissions = async () => {
        if (!clientId) return;
        
        setDataLoading(true);
        try {
            const data = await callApi(`/data-submissions/client/${clientId}/batches`, 'GET');
            setDataBatches(data.batches || []);
        } catch (error) {
            console.error('Error fetching data submissions:', error);
            toast.error('Failed to load data submissions');
            setDataBatches([]);
        } finally {
            setDataLoading(false);
        }
    };

    // Load data submissions when tab changes to data submissions or on mount
    useEffect(() => {
        if (tabValue === 3 && clientId) { // Data submissions tab index
            fetchDataSubmissions();
        }
    }, [tabValue, clientId]);

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
                    <Grid size={{ xs: 12, md: 6 }}>
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
                    
                    <Grid size={{ xs: 12, md: 6 }}>
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
                    
                    <Grid size={{ xs: 12 }}>
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
                            <Button size="small" variant="contained" onClick={() => navigate(`/events/${event.id}/postprod`)}>
                                Post-Production
                            </Button>
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
                        <Tab label="Data Submissions" />
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
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Typography variant="h6">Data Submissions Tracking</Typography>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <Button 
                                variant="outlined" 
                                startIcon={<GetAppIcon />}
                                onClick={() => {
                                    const csvContent = generateCSVReport(dataBatches);
                                    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                                    const link = document.createElement('a');
                                    const url = URL.createObjectURL(blob);
                                    link.setAttribute('href', url);
                                    link.setAttribute('download', `data-submissions-${client.name}-${new Date().toISOString().split('T')[0]}.csv`);
                                    link.style.visibility = 'hidden';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                }}
                                disabled={dataBatches.length === 0}
                            >
                                Export CSV
                            </Button>
                            <Button variant="outlined" onClick={fetchDataSubmissions} disabled={dataLoading}>
                                {dataLoading ? <CircularProgress size={20} /> : 'Refresh'}
                            </Button>
                        </Box>
                    </Box>

                    {/* Filters */}
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid xs={12} sm={3}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Search"
                                placeholder="Search events, team members..."
                                value={dataFilters.search || ''}
                                onChange={(e) => setDataFilters(prev => ({ ...prev, search: e.target.value }))}
                            />
                        </Grid>
                        <Grid xs={12} sm={3}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Status</InputLabel>
                                <Select
                                    value={dataFilters.status}
                                    label="Status"
                                    onChange={(e) => setDataFilters(prev => ({ ...prev, status: e.target.value }))}
                                >
                                    <MenuItem value="all">All Status</MenuItem>
                                    <MenuItem value="PENDING">Pending</MenuItem>
                                    <MenuItem value="SUBMITTED">Submitted</MenuItem>
                                    <MenuItem value="CONFIRMED">Confirmed</MenuItem>
                                    <MenuItem value="REJECTED">Rejected</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid xs={12} sm={3}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Event</InputLabel>
                                <Select
                                    value={dataFilters.eventId}
                                    label="Event"
                                    onChange={(e) => setDataFilters(prev => ({ ...prev, eventId: e.target.value }))}
                                >
                                    <MenuItem value="all">All Events</MenuItem>
                                    {events.map((event) => (
                                        <MenuItem key={event.id} value={event.id}>
                                            {event.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid xs={12} sm={3}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Date Range</InputLabel>
                                <Select
                                    value={dataFilters.dateRange}
                                    label="Date Range"
                                    onChange={(e) => setDataFilters(prev => ({ ...prev, dateRange: e.target.value }))}
                                >
                                    <MenuItem value="all">All Time</MenuItem>
                                    <MenuItem value="today">Today</MenuItem>
                                    <MenuItem value="week">This Week</MenuItem>
                                    <MenuItem value="month">This Month</MenuItem>
                                    <MenuItem value="quarter">This Quarter</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>

                    {/* Summary Stats */}
                    {dataBatches.length > 0 && (
                        <Grid container spacing={2} sx={{ mb: 3 }}>
                            <Grid xs={6} sm={3}>
                                <Card variant="outlined">
                                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                        <Typography variant="h4" color="primary">
                                            {dataBatches.length}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Total Batches
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid xs={6} sm={3}>
                                <Card variant="outlined">
                                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                        <Typography variant="h4" color="warning.main">
                                            {dataBatches.filter(b => b.status === 'PENDING').length}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Pending
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid xs={6} sm={3}>
                                <Card variant="outlined">
                                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                        <Typography variant="h4" color="success.main">
                                            {dataBatches.filter(b => b.status === 'CONFIRMED').length}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Confirmed
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid xs={6} sm={3}>
                                <Card variant="outlined">
                                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                                        <Typography variant="h4" color="error.main">
                                            {dataBatches.filter(b => b.status === 'REJECTED').length}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Rejected
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    )}

                    {/* Progress Overview */}
                    {dataBatches.length > 0 && (
                        <Card variant="outlined" sx={{ mb: 3 }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Data Processing Progress</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                    <Box sx={{ flexGrow: 1 }}>
                                        <LinearProgress 
                                            variant="determinate" 
                                            value={(dataBatches.filter(b => b.status === 'CONFIRMED').length / dataBatches.length) * 100}
                                            sx={{ height: 8, borderRadius: 4 }}
                                        />
                                    </Box>
                                    <Typography variant="body2" color="text.secondary">
                                        {Math.round((dataBatches.filter(b => b.status === 'CONFIRMED').length / dataBatches.length) * 100)}% Complete
                                    </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', gap: 3 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ width: 12, height: 12, bgcolor: 'success.main', borderRadius: '50%' }} />
                                        <Typography variant="body2">Confirmed ({dataBatches.filter(b => b.status === 'CONFIRMED').length})</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ width: 12, height: 12, bgcolor: 'warning.main', borderRadius: '50%' }} />
                                        <Typography variant="body2">Pending ({dataBatches.filter(b => b.status === 'PENDING').length})</Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ width: 12, height: 12, bgcolor: 'error.main', borderRadius: '50%' }} />
                                        <Typography variant="body2">Rejected ({dataBatches.filter(b => b.status === 'REJECTED').length})</Typography>
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    )}

                    {/* Data Batches Table */}
                    {dataLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : dataBatches.length === 0 ? (
                        <Alert severity="info">
                            No data submissions found for this client.
                        </Alert>
                    ) : (
                        <TableContainer component={Paper}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Event</TableCell>
                                        <TableCell>Handover Date</TableCell>
                                        <TableCell>Devices</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Submitted By</TableCell>
                                        <TableCell>Storage Location</TableCell>
                                        <TableCell>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {dataBatches
                                        .filter(batch => {
                                            // Status filter
                                            if (dataFilters.status !== 'all' && batch.status !== dataFilters.status) return false;
                                            
                                            // Event filter
                                            if (dataFilters.eventId !== 'all' && batch.eventId !== dataFilters.eventId) return false;
                                            
                                            // Search filter
                                            if (dataFilters.search) {
                                                const searchTerm = dataFilters.search.toLowerCase();
                                                const eventName = (batch.eventInfo?.name || batch.eventName || '').toLowerCase();
                                                const submittedBy = (batch.submittedByName || '').toLowerCase();
                                                const status = (batch.status || '').toLowerCase();
                                                const notes = (batch.notes || '').toLowerCase();
                                                
                                                if (!eventName.includes(searchTerm) && 
                                                    !submittedBy.includes(searchTerm) && 
                                                    !status.includes(searchTerm) && 
                                                    !notes.includes(searchTerm)) {
                                                    return false;
                                                }
                                            }
                                            
                                            // Date range filter
                                            if (dataFilters.dateRange !== 'all' && batch.createdAt) {
                                                const batchDate = new Date(batch.createdAt.seconds * 1000);
                                                const now = new Date();
                                                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                                
                                                switch (dataFilters.dateRange) {
                                                    case 'today':
                                                        if (batchDate < today) return false;
                                                        break;
                                                    case 'week':
                                                        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                                                        if (batchDate < weekAgo) return false;
                                                        break;
                                                    case 'month':
                                                        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                                                        if (batchDate < monthAgo) return false;
                                                        break;
                                                    case 'quarter':
                                                        const quarterAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
                                                        if (batchDate < quarterAgo) return false;
                                                        break;
                                                    default:
                                                        break;
                                                }
                                            }
                                            
                                            return true;
                                        })
                                        .sort((a, b) => {
                                            // Sort by created date, newest first
                                            const dateA = a.createdAt ? new Date(a.createdAt.seconds * 1000) : new Date(0);
                                            const dateB = b.createdAt ? new Date(b.createdAt.seconds * 1000) : new Date(0);
                                            return dateB - dateA;
                                        })
                                        .map((batch) => (
                                            <TableRow key={batch.id} hover>
                                                <TableCell>
                                                    <Box>
                                                        <Typography variant="subtitle2">
                                                            {batch.eventInfo?.name || batch.eventName || 'Unknown Event'}
                                                        </Typography>
                                                        <Typography variant="body2" color="text.secondary">
                                                            {batch.eventInfo?.eventType}
                                                        </Typography>
                                                    </Box>
                                                </TableCell>
                                                <TableCell>
                                                    {batch.physicalHandoverDate || 'Not specified'}
                                                </TableCell>
                                                <TableCell>
                                                    <Box>
                                                        <Typography variant="body2">
                                                            {batch.totalDevices || batch.storageDevices?.length || 0} devices
                                                        </Typography>
                                                        {batch.storageDevices?.slice(0, 2).map((device, idx) => (
                                                            <Typography key={idx} variant="caption" display="block" color="text.secondary">
                                                                {device.type} {device.capacity}
                                                            </Typography>
                                                        ))}
                                                        {batch.storageDevices?.length > 2 && (
                                                            <Typography variant="caption" color="text.secondary">
                                                                +{batch.storageDevices.length - 2} more
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={batch.status}
                                                        color={
                                                            batch.status === 'CONFIRMED' ? 'success' :
                                                            batch.status === 'PENDING' ? 'warning' :
                                                            batch.status === 'REJECTED' ? 'error' : 'default'
                                                        }
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Box>
                                                        <Typography variant="body2">
                                                            {batch.submittedByName || 'Unknown'}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {batch.createdAt ? new Date(batch.createdAt.seconds * 1000).toLocaleDateString() : ''}
                                                        </Typography>
                                                    </Box>
                                                </TableCell>
                                                <TableCell>
                                                    {batch.status === 'CONFIRMED' ? (
                                                        <Box>
                                                            <Typography variant="body2">
                                                                Room {batch.storageLocation?.room}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary">
                                                                Shelf {batch.storageLocation?.shelf}, Bin {batch.storageLocation?.bin}
                                                            </Typography>
                                                        </Box>
                                                    ) : (
                                                        <Typography variant="body2" color="text.secondary">
                                                            Not assigned
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <IconButton 
                                                        size="small"
                                                        onClick={() => {
                                                            setSelectedDataBatch(batch);
                                                            setDataDetailModalOpen(true);
                                                        }}
                                                    >
                                                        <VisibilityIcon />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </TabPanel>
                
                <TabPanel value={tabValue} index={4}>
                    <Typography variant="h6" gutterBottom>Deliverables & Storage Tracking</Typography>
                    {deliverables.length > 0 ? (
                        <Grid container spacing={2}>
                            {deliverables.map((deliverable) => (
                                <Grid xs={12} md={6} key={deliverable.id}>
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
                
                <TabPanel value={tabValue} index={5}>
                    <Typography variant="h6" gutterBottom>Contracts & Budget Management</Typography>
                    
                    <Grid container spacing={3}>
                        {/* Budget Overview */}
                        <Grid xs={12} md={6}>
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
                        <Grid xs={12} md={6}>
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
                        <Grid xs={12}>
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
                
                <TabPanel value={tabValue} index={6}>
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
                                    <Grid xs={12} key={event.id}>
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
                
                <TabPanel value={tabValue} index={7}>
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
                        <>
                        {/* Fetch post-production overview when details open */}
                        {(() => {
                            // local scoped state via hooks in parent scope
                            return null;
                        })()}
                        <Grid container spacing={3} sx={{ mt: 1 }}>
                            <Grid xs={12} md={6}>
                                <Typography variant="h6" gutterBottom>Event Information</Typography>
                                <Typography><strong>Date:</strong> {selectedEvent.date}</Typography>
                                <Typography><strong>Time:</strong> {selectedEvent.time}</Typography>
                                <Typography><strong>Venue:</strong> {selectedEvent.venue}</Typography>
                                <Typography><strong>Type:</strong> {selectedEvent.eventType}</Typography>
                                <Typography><strong>Priority:</strong> {selectedEvent.priority}</Typography>
                                <Typography><strong>Duration:</strong> {selectedEvent.estimatedDuration} hours</Typography>
                                <Typography><strong>Expected Photos:</strong> {selectedEvent.expectedPhotos}</Typography>
                            </Grid>
                            
                            <Grid xs={12} md={6}>
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
                            
                            <Grid xs={12}>
                                <Typography variant="h6" gutterBottom>Special Requirements</Typography>
                                <Typography>{selectedEvent.specialRequirements || 'None specified'}</Typography>
                            </Grid>
                            
                            <Grid xs={12}>
                                <Typography variant="h6" gutterBottom>Required Skills</Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                    {selectedEvent.requiredSkills?.map(skill => (
                                        <Chip key={skill} label={skill} size="small" />
                                    ))}
                                </Box>
                            </Grid>
                            
                            <Grid xs={12}>
                                <Typography variant="h6" gutterBottom>Post-Production</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                    View and manage post-production streams, assignments, and activity for this event.
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <Button variant="contained" onClick={() => navigate(`/events/${selectedEvent.id}/postprod`)}>Open Post-Production</Button>
                                </Box>
                            </Grid>
                            
                            {/* Post-production functionality temporarily disabled */}
                        </Grid>
                        </>
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
                        <Grid xs={12}>
                            <TextField 
                                fullWidth 
                                label="Description" 
                                value={invoiceData.description}
                                onChange={(e) => setInvoiceData({...invoiceData, description: e.target.value})}
                            />
                        </Grid>
                        <Grid xs={6}>
                            <TextField 
                                fullWidth 
                                label="Amount" 
                                type="number"
                                value={invoiceData.amount}
                                onChange={(e) => setInvoiceData({...invoiceData, amount: e.target.value})}
                            />
                        </Grid>
                        <Grid xs={6}>
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
                        <Grid xs={12}>
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
                        <Grid xs={12}>
                            <TextField 
                                fullWidth 
                                label="Device Information (Brand, Model, Capacity)" 
                                placeholder="e.g., SanDisk 64GB, Samsung 1TB SSD"
                                value={storageDetails.deviceInfo}
                                onChange={(e) => setStorageDetails({...storageDetails, deviceInfo: e.target.value})}
                            />
                        </Grid>
                        <Grid xs={12}>
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
                        <Grid xs={12}>
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
                        <Grid xs={12}>
                            <TextField 
                                fullWidth
                                label="Contract Title"
                                value={contractData.title}
                                onChange={(e) => setContractData({...contractData, title: e.target.value})}
                            />
                        </Grid>
                        <Grid xs={12} md={6}>
                            <TextField 
                                fullWidth
                                label="Amount"
                                type="number"
                                value={contractData.amount}
                                onChange={(e) => setContractData({...contractData, amount: e.target.value})}
                                InputProps={{ startAdornment: '$' }}
                            />
                        </Grid>
                        <Grid xs={12} md={6}>
                            <TextField 
                                fullWidth
                                label="Due Date"
                                type="date"
                                value={contractData.dueDate}
                                onChange={(e) => setContractData({...contractData, dueDate: e.target.value})}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid xs={12}>
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
                        <Grid xs={12} md={6}>
                            <TextField 
                                fullWidth
                                label="Estimated Cost"
                                type="number"
                                value={budgetDetails.estimatedCost}
                                onChange={(e) => setBudgetDetails({...budgetDetails, estimatedCost: e.target.value})}
                                InputProps={{ startAdornment: '$' }}
                            />
                        </Grid>
                        <Grid xs={12} md={6}>
                            <TextField 
                                fullWidth
                                label="Actual Cost"
                                type="number"
                                value={budgetDetails.actualCost}
                                onChange={(e) => setBudgetDetails({...budgetDetails, actualCost: e.target.value})}
                                InputProps={{ startAdornment: '$' }}
                            />
                        </Grid>
                        <Grid xs={12}>
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
                        <Grid xs={12}>
                            <TextField 
                                fullWidth
                                label="Milestone Title"
                                placeholder="e.g., Pre-production meeting"
                            />
                        </Grid>
                        <Grid xs={12} md={6}>
                            <TextField 
                                fullWidth
                                label="Due Date"
                                type="date"
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid xs={12}>
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
                        <Grid xs={12}>
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
                        <Grid xs={12}>
                            <TextField 
                                fullWidth
                                label="Subject"
                                placeholder="e.g., Budget approval required for wedding photography"
                            />
                        </Grid>
                        <Grid xs={12}>
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

            {/* Data Submission Detail Modal */}
            <Dialog open={dataDetailModalOpen} onClose={() => setDataDetailModalOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="h6">Data Submission Details</Typography>
                        <Chip 
                            label={selectedDataBatch?.status || 'Unknown'}
                            color={
                                selectedDataBatch?.status === 'CONFIRMED' ? 'success' :
                                selectedDataBatch?.status === 'PENDING' ? 'warning' :
                                selectedDataBatch?.status === 'REJECTED' ? 'error' : 'default'
                            }
                        />
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedDataBatch && (
                        <Grid container spacing={3}>
                            {/* Basic Information */}
                            <Grid xs={12} md={6}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="h6" gutterBottom>Event Information</Typography>
                                        <Grid container spacing={2}>
                                            <Grid xs={6}>
                                                <Typography variant="body2" color="text.secondary">Event Name</Typography>
                                                <Typography variant="body1">{selectedDataBatch.eventInfo?.name || selectedDataBatch.eventName || 'Unknown Event'}</Typography>
                                            </Grid>
                                            <Grid xs={6}>
                                                <Typography variant="body2" color="text.secondary">Event Type</Typography>
                                                <Typography variant="body1">{selectedDataBatch.eventInfo?.eventType || 'Not specified'}</Typography>
                                            </Grid>
                                            <Grid xs={6}>
                                                <Typography variant="body2" color="text.secondary">Handover Date</Typography>
                                                <Typography variant="body1">{selectedDataBatch.physicalHandoverDate || 'Not specified'}</Typography>
                                            </Grid>
                                            <Grid xs={6}>
                                                <Typography variant="body2" color="text.secondary">Estimated Data Size</Typography>
                                                                                               <Typography variant="body1">{selectedDataBatch.estimatedDataSize || 'Not specified'}</Typography>
                                                                                       </Grid>
                                        </Grid>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Status and Timeline */}
                            <Grid xs={12} md={6}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="h6" gutterBottom>Status & Timeline</Typography>
                                        <Grid container spacing={2}>
                                            <Grid xs={6}>
                                                <Typography variant="body2" color="text.secondary">Submitted By</Typography>
                                                <Typography variant="body1">{selectedDataBatch.submittedByName || 'Unknown'}</Typography>
                                            </Grid>
                                            <Grid xs={6}>
                                                <Typography variant="body2" color="text.secondary">Submitted Date</Typography>
                                                <Typography variant="body1">
                                                    {selectedDataBatch.createdAt ? new Date(selectedDataBatch.createdAt.seconds * 1000).toLocaleDateString() : 'Unknown'}
                                                </Typography>
                                            </Grid>
                                            {selectedDataBatch.status === 'CONFIRMED' && (
                                                <>
                                                    <Grid xs={6}>
                                                        <Typography variant="body2" color="text.secondary">Confirmed By</Typography>
                                                        <Typography variant="body1">{selectedDataBatch.confirmedBy || 'Unknown'}</Typography>
                                                    </Grid>
                                                    <Grid xs={6}>
                                                        <Typography variant="body2" color="text.secondary">Confirmed Date</Typography>
                                                        <Typography variant="body1">
                                                            {selectedDataBatch.confirmedAt ? new Date(selectedDataBatch.confirmedAt.seconds * 1000).toLocaleDateString() : 'Unknown'}
                                                        </Typography>
                                                    </Grid>
                                                </>
                                            )}
                                            {selectedDataBatch.status === 'REJECTED' && (
                                                <>
                                                    <Grid xs={6}>
                                                        <Typography variant="body2" color="text.secondary">Rejected By</Typography>
                                                        <Typography variant="body1">{selectedDataBatch.rejectedBy || 'Unknown'}</Typography>
                                                    </Grid>
                                                    <Grid xs={6}>
                                                        <Typography variant="body2" color="text.secondary">Rejected Date</Typography>
                                                        <Typography variant="body1">
                                                            {selectedDataBatch.rejectedAt ? new Date(selectedDataBatch.rejectedAt.seconds * 1000).toLocaleDateString() : 'Unknown'}
                                                        </Typography>
                                                    </Grid>
                                                </>
                                            )}
                                        </Grid>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Storage Devices */}
                            <Grid xs={12}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="h6" gutterBottom>Storage Devices ({selectedDataBatch.totalDevices || selectedDataBatch.storageDevices?.length || 0})</Typography>
                                        {selectedDataBatch.storageDevices && selectedDataBatch.storageDevices.length > 0 ? (
                                            <TableContainer>
                                                <Table size="small">
                                                    <TableHead>
                                                        <TableRow>
                                                            <TableCell>Type</TableCell>
                                                            <TableCell>Brand</TableCell>
                                                            <TableCell>Model</TableCell>
                                                            <TableCell>Capacity</TableCell>
                                                            <TableCell>Serial Number</TableCell>
                                                            <TableCell>Notes</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {selectedDataBatch.storageDevices.map((device, index) => (
                                                            <TableRow key={index}>
                                                                <TableCell>{device.type || 'N/A'}</TableCell>
                                                                <TableCell>{device.brand || 'N/A'}</TableCell>
                                                                <TableCell>{device.model || 'N/A'}</TableCell>
                                                                <TableCell>{device.capacity || 'N/A'}</TableCell>
                                                                <TableCell>{device.serialNumber || 'N/A'}</TableCell>
                                                                <TableCell>{device.notes || 'N/A'}</TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        ) : (
                                            <Alert severity="info">No storage device details available</Alert>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Storage Location (if confirmed) */}
                            {selectedDataBatch.status === 'CONFIRMED' && selectedDataBatch.storageLocation && (
                                <Grid xs={12} md={6}>
                                    <Card variant="outlined">
                                        <CardContent>
                                            <Typography variant="h6" gutterBottom>Storage Location</Typography>
                                            <Grid container spacing={2}>
                                                <Grid xs={4}>
                                                    <Typography variant="body2" color="text.secondary">Room</Typography>
                                                    <Typography variant="body1">{selectedDataBatch.storageLocation.room || 'N/A'}</Typography>
                                                </Grid>
                                                <Grid xs={4}>
                                                    <Typography variant="body2" color="text.secondary">Shelf</Typography>
                                                    <Typography variant="body1">{selectedDataBatch.storageLocation.shelf || 'N/A'}</Typography>
                                                </Grid>
                                                <Grid xs={4}>
                                                    <Typography variant="body2" color="text.secondary">Bin</Typography>
                                                    <Typography variant="body1">{selectedDataBatch.storageLocation.bin || 'N/A'}</Typography>
                                                </Grid>
                                                {selectedDataBatch.storageMediumId && (
                                                    <Grid xs={12}>
                                                        <Typography variant="body2" color="text.secondary">Storage Medium ID</Typography>
                                                        <Typography variant="body1">{selectedDataBatch.storageMediumId}</Typography>
                                                    </Grid>
                                                )}
                                            </Grid>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            )}

                            {/* Notes and Comments */}
                            <Grid xs={12} md={selectedDataBatch.status === 'CONFIRMED' ? 6 : 12}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="h6" gutterBottom>Notes & Comments</Typography>
                                        {selectedDataBatch.notes && (
                                            <Box sx={{ mb: 2 }}>
                                                <Typography variant="body2" color="text.secondary">Submission Notes</Typography>
                                                <Typography variant="body1">{selectedDataBatch.notes}</Typography>
                                            </Box>
                                        )}
                                        {selectedDataBatch.dmNotes && (
                                            <Box sx={{ mb: 2 }}>
                                                <Typography variant="body2" color="text.secondary">Data Manager Notes</Typography>
                                                <Typography variant="body1">{selectedDataBatch.dmNotes}</Typography>
                                            </Box>
                                        )}
                                        {selectedDataBatch.rejectionReason && (
                                            <Box sx={{ mb: 2 }}>
                                                <Typography variant="body2" color="text.secondary">Rejection Reason</Typography>
                                                <Alert severity="error">
                                                    {selectedDataBatch.rejectionReason}
                                                </Alert>
                                            </Box>
                                        )}
                                        {!selectedDataBatch.notes && !selectedDataBatch.dmNotes && !selectedDataBatch.rejectionReason && (
                                            <Typography variant="body2" color="text.secondary">No notes available</Typography>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDataDetailModalOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

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
