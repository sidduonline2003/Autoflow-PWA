import React, { useState, useEffect, useMemo } from 'react';
import { 
    Container, Typography, Card, CardContent, Button, Grid, Box, Chip, Badge, 
    AppBar, Toolbar, Alert, Paper, Tabs, Tab, TableContainer, Table, TableHead, 
    TableRow, TableCell, TableBody, CardActions, Dialog, DialogTitle, DialogContent, 
    DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, IconButton,
    List, ListItem, ListItemAvatar, Divider, Avatar, LinearProgress, CircularProgress,
    Menu, Tooltip, useTheme
} from '@mui/material';
import { 
    CheckCircle as CheckCircleIcon, Assignment as AssignmentIcon,
    Chat as ChatIcon, Send as SendIcon, Refresh as RefreshIcon,
    Payments as PaymentsIcon, Receipt as ReceiptIcon, Edit as EditIcon,
    PlayArrow as PlayArrowIcon, Upload as UploadIcon, Camera as CameraIcon,
    Movie as MovieIcon, Photo as PhotoIcon, Dashboard as DashboardIcon,
    ArrowDropDown as ArrowDropDownIcon, AddCircleOutline as AddCircleOutlineIcon,
    Delete as DeleteIcon, HourglassBottom as HourglassBottomIcon,
    WarningAmber as WarningAmberIcon,
    Storage as StorageIcon,
    QrCodeScanner as QrCodeScannerIcon,
    Inventory as InventoryIcon,
    Person as PersonIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
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

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div role="tabpanel" hidden={value !== index} {...other}>
            {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
        </div>
    );
}

const timestampToDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'number') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'string') {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof value === 'object' && value.seconds !== undefined) {
        const milliseconds = value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
        const date = new Date(milliseconds);
        return Number.isNaN(date.getTime()) ? null : date;
    }
    return null;
};

const formatTimestamp = (value, fallback = 'Not available') => {
    const date = timestampToDate(value);
    if (!date) return fallback;
    try {
        return format(date, 'MMM d, yyyy h:mm a');
    } catch (error) {
        console.error('Failed to format timestamp', error);
        return fallback;
    }
};

const createEmptyDevice = () => ({
        type: '',
        brand: '',
        model: '',
        capacity: '',
        serialNumber: '',
        notes: ''
    });

const buildDefaultBatchDetails = () => ({
        physicalHandoverDate: new Date().toISOString().slice(0, 10),
        notes: '',
        estimatedDataSize: '',
        storageDevices: [createEmptyDevice()]
    });

const TeamDashboardPage = () => {
    const { user, claims } = useAuth();
    const navigate = useNavigate();
    const theme = useTheme();

    const normalizedRole = useMemo(() => {
        const role = claims?.role;
        if (!role) return null;
        return role
            .toString()
            .trim()
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .replace(/[\s_]+/g, '-')
            .toLowerCase();
    }, [claims]);

    const [leaveRequests, setLeaveRequests] = useState([]);
    const [assignedEvents, setAssignedEvents] = useState([]);
    const [completedEvents, setCompletedEvents] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [memberName, setMemberName] = useState('');
    const [memberProfile, setMemberProfile] = useState(null);
    const [tabValue, setTabValue] = useState(0);

    const [postProdMenuAnchor, setPostProdMenuAnchor] = useState(null);
    const [equipmentMenuAnchor, setEquipmentMenuAnchor] = useState(null);

    const [selectedEventForChat, setSelectedEventForChat] = useState(null);
    const [chatMessages, setChatMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [chatOpen, setChatOpen] = useState(false);
    const [chatLoading, setChatLoading] = useState(false);

    const [submitModalOpen, setSubmitModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [storageBatchDetails, setStorageBatchDetails] = useState(buildDefaultBatchDetails);
    const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

    const handleBatchFieldChange = (field, value) => {
        setStorageBatchDetails((prev) => ({ ...prev, [field]: value }));
    };

    const handleStorageDeviceChange = (index, field, value) => {
        setStorageBatchDetails((prev) => {
            const devices = prev.storageDevices.map((device, idx) =>
                idx === index ? { ...device, [field]: value } : device
            );
            return { ...prev, storageDevices: devices };
        });
    };

    const handleAddStorageDevice = () => {
        setStorageBatchDetails((prev) => ({
            ...prev,
            storageDevices: [...prev.storageDevices, createEmptyDevice()]
        }));
    };

    const handleRemoveStorageDevice = (index) => {
        setStorageBatchDetails((prev) => {
            if (prev.storageDevices.length <= 1) return prev;
            const devices = prev.storageDevices.filter((_, idx) => idx !== index);
            return { ...prev, storageDevices: devices };
        });
    };

    // Post-production editing assignments states
    const [editingAssignments, setEditingAssignments] = useState([]);
    const [loadingAssignments, setLoadingAssignments] = useState(false);
    
    // Deliverables submission modal states
    const [deliverablesModalOpen, setDeliverablesModalOpen] = useState(false);
    const [selectedJobForDeliverables, setSelectedJobForDeliverables] = useState(null);
    const [deliverableLinks, setDeliverableLinks] = useState({
        previewUrl: '',
        finalUrl: '',
        downloadUrl: '',
        additionalUrl: '',
        notes: ''
    });

    useEffect(() => {
        if (!claims?.orgId || !user?.uid) return;

        // Fetch the team member's name from Firestore
        const fetchMemberProfile = async () => {
            try {
                const memberDoc = await getDoc(doc(db, 'organizations', claims.orgId, 'team', user.uid));
                if (memberDoc.exists()) {
                    const data = memberDoc.data();
                    const employeeCode = data?.employeeCode || data?.profile?.employeeCode || null;
                    setMemberProfile({ id: memberDoc.id, ...data, employeeCode });
                    setMemberName(data.name || user.displayName || user.email);
                } else {
                    setMemberName(user.displayName || user.email);
                    setMemberProfile(null);
                }
            } catch {
                setMemberName(user.displayName || user.email);
                setMemberProfile(null);
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

        // Fetch editing assignments for post-production
        const fetchEditingAssignments = async () => {
            setLoadingAssignments(true);
            try {
                const idToken = await auth.currentUser.getIdToken();
                const response = await fetch('/api/postprod/my-assignments', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    setEditingAssignments(data || []);
                } else {
                    console.error('Failed to fetch editing assignments');
                }
            } catch (error) {
                console.error('Error fetching editing assignments:', error);
            } finally {
                setLoadingAssignments(false);
            }
        };

    fetchMemberProfile();
        fetchAssignedEvents();
        fetchEditingAssignments();

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
        setStorageBatchDetails(buildDefaultBatchDetails());
        setSubmitModalOpen(true);
    };

    const handleCreateDataBatch = async () => {
        if (!selectedEvent) return;

        const { physicalHandoverDate, storageDevices, notes, estimatedDataSize } = storageBatchDetails;
        if (!physicalHandoverDate) {
            toast.error('Please select the physical handover date.');
            return;
        }

        const sanitizeDevice = (device) => {
            const sanitized = {
                type: (device.type || '').trim(),
                brand: (device.brand || '').trim(),
                model: (device.model || '').trim(),
                capacity: (device.capacity || '').trim()
            };
            const serial = (device.serialNumber || '').trim();
            if (serial) sanitized.serialNumber = serial;
            const deviceNotes = (device.notes || '').trim();
            if (deviceNotes) sanitized.notes = deviceNotes;
            return sanitized;
        };

        const sanitizedDevices = storageDevices.map(sanitizeDevice).filter((device) =>
            device.type || device.brand || device.model || device.capacity
        );

        if (sanitizedDevices.length === 0) {
            toast.error('Add at least one storage device to continue.');
            return;
        }

        const missingRequired = sanitizedDevices.some((device) =>
            !device.type || !device.brand || !device.model || !device.capacity
        );
        if (missingRequired) {
            toast.error('Fill in type, brand, model, and capacity for each storage device.');
            return;
        }

        setIsSubmittingBatch(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const trimmedNotes = (notes || '').trim();
            const trimmedEstimatedSize = (estimatedDataSize || '').trim();
            const payload = {
                eventId: selectedEvent.id,
                physicalHandoverDate,
                storageDevices: sanitizedDevices,
                notes: trimmedNotes || undefined,
                estimatedDataSize: trimmedEstimatedSize || undefined
            };

            const response = await fetch('/api/data-submissions/batches', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                let errorMessage = 'Failed to submit storage handoff';
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorData.message || errorMessage;
                } catch {
                    // ignore parse errors
                }
                throw new Error(errorMessage);
            }

            const data = await response.json();
            toast.success('Storage handoff submitted for approval!');

            const submissionTimestamp = new Date().toISOString();
            const submissionSummary = {
                lastSubmittedBatchId: data.batchId,
                lastSubmittedAt: submissionTimestamp,
                lastSubmittedBy: user?.uid,
                lastSubmittedByName: memberName,
                notes: trimmedNotes,
                deviceCount: sanitizedDevices.length,
                storageDevices: sanitizedDevices,
                physicalHandoverDate,
                estimatedDataSize: trimmedEstimatedSize
            };

            const enhanceEvent = (event) => {
                if (event.id !== selectedEvent.id) return event;
                const updatedDataIntake = {
                    ...(event.dataIntake || {}),
                    status: 'PENDING',
                    lastSubmittedAt: submissionTimestamp,
                    lastSubmittedBy: user?.uid,
                    lastSubmittedDevices: sanitizedDevices,
                    lastSubmittedBatchId: data.batchId,
                    estimatedDataSize: trimmedEstimatedSize || undefined
                };
                return {
                    ...event,
                    deliverableStatus: 'PENDING_REVIEW',
                    deliverableSubmitted: false,
                    deliverablePendingBatchId: data.batchId,
                    deliverableSubmission: submissionSummary,
                    dataIntakeStatus: 'PENDING',
                    dataIntakePending: true,
                    dataIntake: updatedDataIntake
                };
            };

            setAssignedEvents((prev) => prev.map(enhanceEvent));
            setCompletedEvents((prev) => prev.map(enhanceEvent));
            setSubmitModalOpen(false);
            setSelectedEvent(null);
        } catch (error) {
            console.error('Failed to submit storage batch', error);
            toast.error(error.message || 'Failed to submit storage handoff');
        } finally {
            setIsSubmittingBatch(false);
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

    const getDeliverableStatus = (event) => {
        if (!event) return 'AWAITING_SUBMISSION';
        if (event.deliverableStatus) return event.deliverableStatus;
        return event.deliverableSubmitted ? 'APPROVED' : 'AWAITING_SUBMISSION';
    };

    const canSubmitStorageBatch = (event) => {
        if (!event || event.status !== 'COMPLETED') return false;
        const status = getDeliverableStatus(event);
        return status === 'AWAITING_SUBMISSION' || status === 'REJECTED';
    };

    const deliverableStatusMeta = {
        AWAITING_SUBMISSION: { label: 'Awaiting Submission', color: 'default' },
        PENDING_REVIEW: { label: 'Awaiting DM Review', color: 'warning', icon: <HourglassBottomIcon fontSize="small" /> },
        APPROVED: { label: 'Copy Approved', color: 'success', icon: <CheckCircleIcon fontSize="small" /> },
        REJECTED: { label: 'Resubmission Required', color: 'error', icon: <WarningAmberIcon fontSize="small" /> }
    };

    const renderDeliverableStatusChip = (event, options = {}) => {
        const status = getDeliverableStatus(event);
        const meta = deliverableStatusMeta[status] || deliverableStatusMeta.AWAITING_SUBMISSION;
        return (
            <Chip
                label={meta.label}
                color={meta.color}
                size={options.size || 'small'}
                icon={meta.icon || undefined}
                sx={{ mr: options.noMargin ? 0 : 1 }}
            />
        );
    };

    const renderDeliverableStatusDetails = (event) => {
        const status = getDeliverableStatus(event);
        const summary = event?.deliverableSubmission || {};
        const renderSubmissionMeta = () => {
            const meta = [];
            if (summary.estimatedDataSize) {
                meta.push(`Estimated data size: ${summary.estimatedDataSize}`);
            }
            if (summary.deviceCount) {
                const label = summary.deviceCount === 1 ? 'device' : 'devices';
                meta.push(`Devices submitted: ${summary.deviceCount} ${label}`);
            }
            if (summary.notes) {
                meta.push(`Notes: ${summary.notes}`);
            }
            return meta.map((text, index) => (
                <Box component="span" key={`submission-meta-${index}`} sx={{ display: 'block', mt: 0.5 }}>
                    {text}
                </Box>
            ));
        };
        if (status === 'PENDING_REVIEW') {
            return (
                <Alert severity="info" sx={{ mt: 1 }}>
                    Storage handoff submitted on {formatTimestamp(summary.lastSubmittedAt)}. Waiting for data manager approval.
                    {renderSubmissionMeta()}
                </Alert>
            );
        }
        if (status === 'REJECTED') {
            return (
                <Alert severity="warning" sx={{ mt: 1 }}>
                    Data manager rejected the previous submission on {formatTimestamp(summary.lastRejectedAt)}.
                    {summary.lastRejectedReason && (
                        <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                            Reason: {summary.lastRejectedReason}
                        </Box>
                    )}
                    {renderSubmissionMeta()}
                </Alert>
            );
        }
        if (status === 'APPROVED') {
            return (
                <Alert severity="success" sx={{ mt: 1 }}>
                    Storage approved on {formatTimestamp(summary.lastApprovedAt)} and assigned for archival.
                    {renderSubmissionMeta()}
                </Alert>
            );
        }
        return null;
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

            // Refresh editing assignments
            const assignmentsResponse = await fetch('/api/postprod/my-assignments', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                }
            });
            
            if (assignmentsResponse.ok) {
                const assignmentsData = await assignmentsResponse.json();
                setEditingAssignments(assignmentsData || []);
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
                const payload = await response.json();
                setChatMessages(payload.messages || []);
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
                await response.json();
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

    // Post-production assignment handlers
    const handleStartWork = async (jobId) => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/postprod/${jobId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    to_status: 'IN_PROGRESS',
                    reason: 'Started working on assignment'
                })
            });
            
            if (response.ok) {
                toast.success('Work started successfully!');
                // Refresh assignments
                const assignmentsResponse = await fetch('/api/postprod/my-assignments', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    }
                });
                
                if (assignmentsResponse.ok) {
                    const assignmentsData = await assignmentsResponse.json();
                    setEditingAssignments(assignmentsData || []);
                }
            } else {
                throw new Error('Failed to start work');
            }
        } catch (error) {
            console.error('Error starting work:', error);
            toast.error('Failed to start work');
        }
    };

    const handleSubmitForReview = async (jobId) => {
        // Open modal to collect deliverable links
        setSelectedJobForDeliverables(jobId);
        setDeliverablesModalOpen(true);
    };

    const handleDeliverableSubmission = async () => {
        if (!selectedJobForDeliverables) return;
        
        // Validate at least one URL is provided
        const hasAnyUrl = deliverableLinks.previewUrl || deliverableLinks.finalUrl || 
                          deliverableLinks.downloadUrl || deliverableLinks.additionalUrl;
        
        if (!hasAnyUrl) {
            toast.error('Please provide at least one deliverable link');
            return;
        }
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            
            // Prepare deliverables object (only include non-empty fields)
            const deliverables = {};
            if (deliverableLinks.previewUrl) deliverables.previewUrl = deliverableLinks.previewUrl;
            if (deliverableLinks.finalUrl) deliverables.finalUrl = deliverableLinks.finalUrl;
            if (deliverableLinks.downloadUrl) deliverables.downloadUrl = deliverableLinks.downloadUrl;
            if (deliverableLinks.additionalUrl) deliverables.additionalUrl = deliverableLinks.additionalUrl;
            if (deliverableLinks.notes) deliverables.notes = deliverableLinks.notes;
            
            const response = await fetch(`/api/postprod/${selectedJobForDeliverables}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    to_status: 'REVIEW',
                    reason: 'Submitted work for review with deliverables',
                    deliverables: deliverables
                })
            });
            
            if (response.ok) {
                toast.success('Work submitted for review with deliverables!');
                setDeliverablesModalOpen(false);
                // Reset form
                setDeliverableLinks({
                    previewUrl: '',
                    finalUrl: '',
                    downloadUrl: '',
                    additionalUrl: '',
                    notes: ''
                });
                setSelectedJobForDeliverables(null);
                
                // Refresh assignments
                const assignmentsResponse = await fetch('/api/postprod/my-assignments', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    }
                });
                
                if (assignmentsResponse.ok) {
                    const assignmentsData = await assignmentsResponse.json();
                    setEditingAssignments(assignmentsData || []);
                }
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to submit for review');
            }
        } catch (error) {
            console.error('Error submitting for review:', error);
            toast.error(error.message || 'Failed to submit for review');
        }
    };

    const getStatusColor = (status) => {
        const colors = {
            'ASSIGNED': 'warning',
            'IN_PROGRESS': 'primary',
            'REVIEW': 'info',
            'REVISION': 'error',
            'READY': 'success'
        };
        return colors[status] || 'default';
    };

    const isOverdue = (dueDate) => {
        if (!dueDate) return false;
        const due = new Date(dueDate);
        const now = new Date();
        return due < now;
    };

    // Navigation handlers
    const handlePostProdMenuOpen = (event) => {
        setPostProdMenuAnchor(event.currentTarget);
    };

    const handlePostProdMenuClose = () => {
        setPostProdMenuAnchor(null);
    };

    const navigateToPostProd = (path) => {
        navigate(path);
        handlePostProdMenuClose();
    };

    const handleEquipmentMenuOpen = (event) => {
        setEquipmentMenuAnchor(event.currentTarget);
    };

    const handleEquipmentMenuClose = () => {
        setEquipmentMenuAnchor(null);
    };

    const navigateToEquipment = (path) => {
        navigate(path);
        handleEquipmentMenuClose();
    };

    // Check if user has post-production access
    const hasPostProdAccess = () => {
        const role = claims?.role?.toLowerCase();
        return ['admin', 'editor', 'post_supervisor'].includes(role) || 
               (editingAssignments && editingAssignments.length > 0);
    };

    const hasDataManagerAccess = () => {
        return normalizedRole === 'data-manager' || normalizedRole === 'admin';
    };

    const orgName = (claims && claims.orgName) || 'Your Organization';
    const orgId = (claims && claims.orgId) || '';

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f8f9fa' }}>
            <AppBar position="static" elevation={0} sx={{ bgcolor: '#ffffff', borderBottom: '1px solid #e2e8f0' }}>
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1, color: '#1e293b', fontWeight: 700 }}>
                        Team Portal
                    </Typography>
                    
                    {/* Post-Production Navigation */}
                    {hasPostProdAccess() && (
                        <>
                            <Button 
                                sx={{ color: '#475569', mr: 1 }} 
                                startIcon={<MovieIcon />}
                                endIcon={<ArrowDropDownIcon />}
                                onClick={handlePostProdMenuOpen}
                            >
                                Post-Production
                            </Button>
                            <Menu
                                anchorEl={postProdMenuAnchor}
                                open={Boolean(postProdMenuAnchor)}
                                onClose={handlePostProdMenuClose}
                            >
                                <MenuItem onClick={() => navigateToPostProd('/team/post-production/dashboard')}>
                                    <DashboardIcon sx={{ mr: 1 }} />
                                    Dashboard
                                </MenuItem>
                                <MenuItem onClick={() => {
                                    setTabValue(2);
                                    handlePostProdMenuClose();
                                }}>
                                    <AssignmentIcon sx={{ mr: 1 }} />
                                    My Assignments
                                </MenuItem>
                                {(claims?.role === 'admin' || claims?.role === 'post_supervisor') && (
                                    <MenuItem onClick={() => navigateToPostProd('/post-production')}>
                                        <EditIcon sx={{ mr: 1 }} />
                                        Admin Board
                                    </MenuItem>
                                )}
                            </Menu>
                        </>
                    )}

                    {hasDataManagerAccess() && (
                        <Button
                            sx={{ color: '#475569', mr: 1 }}
                            startIcon={<StorageIcon />}
                            onClick={() => navigate('/data-manager')}
                        >
                            Data Manager
                        </Button>
                    )}

                    {/* Equipment Tracking Navigation */}
                    <Button 
                        sx={{ color: '#475569', mr: 1 }} 
                        startIcon={<InventoryIcon />}
                        endIcon={<ArrowDropDownIcon />}
                        onClick={handleEquipmentMenuOpen}
                    >
                        Equipment
                    </Button>
                    <Menu
                        anchorEl={equipmentMenuAnchor}
                        open={Boolean(equipmentMenuAnchor)}
                        onClose={handleEquipmentMenuClose}
                    >
                        <MenuItem onClick={() => navigateToEquipment('/equipment/checkout')}>
                            <QrCodeScannerIcon sx={{ mr: 1 }} />
                            Checkout Equipment
                        </MenuItem>
                        <MenuItem onClick={() => navigateToEquipment('/equipment/checkin')}>
                            <QrCodeScannerIcon sx={{ mr: 1 }} />
                            Check-in Equipment
                        </MenuItem>
                        <MenuItem onClick={() => navigateToEquipment('/equipment/my-checkouts')}>
                            <InventoryIcon sx={{ mr: 1 }} />
                            My Equipment
                        </MenuItem>
                    </Menu>
                    
                    <Button 
                        sx={{ color: '#ef4444' }} 
                        onClick={() => signOut(auth)}
                    >
                        Logout
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
                
                {/* Advanced Hero Profile Section with ID Card */}
                <Paper 
                    elevation={0} 
                    sx={{ 
                        p: 0, 
                        mb: 4, 
                        borderRadius: 4, 
                        overflow: 'hidden',
                        background: 'linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%)',
                        border: '1px solid rgba(0,0,0,0.08)',
                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)'
                    }}
                >
                    <Grid container>
                        {/* Left Content: Welcome & Stats */}
                        <Grid item xs={12} md={6} lg={7} sx={{ p: { xs: 3, md: 5 }, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <Box sx={{ mb: 2 }}>
                                <Chip 
                                    icon={<PersonIcon sx={{ fontSize: '16px !important' }} />} 
                                    label={claims?.orgName || 'Autoflow Studio'} 
                                    color="primary" 
                                    size="small" 
                                    variant="outlined"
                                    sx={{ borderRadius: '8px', fontWeight: 600, opacity: 0.9 }} 
                                />
                            </Box>
                            <Typography variant="h3" sx={{ fontWeight: 800, color: '#1e293b', mb: 1, letterSpacing: '-0.02em' }}>
                                Hello, {memberName.split(' ')[0]} 👋
                            </Typography>
                            <Typography variant="h6" sx={{ color: '#64748b', mb: 4, fontWeight: 500 }}>
                                {memberProfile?.role ? memberProfile.role.toUpperCase() : 'TEAM MEMBER'} • ID: {memberProfile?.employeeCode || '---'}
                            </Typography>
                            
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 5 }}>
                                <Button 
                                    variant="contained" 
                                    size="large"
                                    startIcon={<AddCircleOutlineIcon />}
                                    onClick={() => setIsModalOpen(true)}
                                    sx={{ 
                                        borderRadius: '12px', 
                                        textTransform: 'none', 
                                        px: 3, 
                                        boxShadow: '0 10px 15px -3px rgba(59, 130, 246, 0.3)',
                                        bgcolor: '#3b82f6',
                                        '&:hover': { bgcolor: '#2563eb' }
                                    }}
                                >
                                    Request Leave
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    size="large"
                                    startIcon={<RefreshIcon />}
                                    onClick={refreshAllData}
                                    sx={{ borderRadius: '12px', textTransform: 'none', px: 3, borderWidth: '1px', borderColor: '#cbd5e1', color: '#475569', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f1f5f9' } }}
                                >
                                    Refresh Data
                                </Button>
                            </Box>

                            <Grid container spacing={3}>
                                <Grid item xs={4}>
                                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#3b82f6' }}>
                                        {assignedEvents.length}
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#64748b' }}>
                                        Active Events
                                    </Typography>
                                </Grid>
                                <Grid item xs={4}>
                                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#10b981' }}>
                                        {completedEvents.length}
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#64748b' }}>
                                        Completed
                                    </Typography>
                                </Grid>
                                <Grid item xs={4}>
                                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#f59e0b' }}>
                                        {editingAssignments.filter(a => ['ASSIGNED', 'IN_PROGRESS'].includes(a.status)).length}
                                    </Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#64748b' }}>
                                        Pending Edits
                                    </Typography>
                                </Grid>
                            </Grid>
                        </Grid>

                        {/* Right Content: Enhanced ID Card Presentation */}
                        <Grid item xs={12} md={6} lg={5} sx={{ 
                            bgcolor: '#0f172a', 
                            p: { xs: 3, md: 4 },
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                             {/* Abstract Spotlight Effect */}
                             <Box sx={{ position: 'absolute', top: '-50%', right: '-50%', width: '200%', height: '200%', background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(0,0,0,0) 70%)', pointerEvents: 'none' }} />
                             <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '100px', background: 'linear-gradient(to top, rgba(15,23,42,1) 0%, rgba(15,23,42,0) 100%)', zIndex: 1 }} />

                             <Box sx={{ position: 'relative', zIndex: 2, transform: 'scale(0.95)', transition: 'transform 0.3s ease', '&:hover': { transform: 'scale(1)' }, width: '100%', maxWidth: '400px' }}>
                                <TeamMemberIDCard
                                    member={{
                                        userId: auth?.currentUser?.uid,
                                        employeeCode: memberProfile?.employeeCode,
                                        name: memberProfile?.name || auth?.currentUser?.displayName || auth?.currentUser?.email || 'Team Member',
                                        email: memberProfile?.email || auth?.currentUser?.email || '',
                                        role: memberProfile?.role || claims?.role || 'crew',
                                        phone: memberProfile?.phone || auth?.currentUser?.phoneNumber || '',
                                        profilePhoto: memberProfile?.profilePhoto || auth?.currentUser?.photoURL || '',
                                        skills: memberProfile?.skills || []
                                    }}
                                    orgName={orgName}
                                    orgId={orgId}
                                    showActions={true}
                                />
                             </Box>
                        </Grid>
                    </Grid>
                </Paper>
                
                <Paper sx={{ width: '100%', borderRadius: 3, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'white', px: 2, pt: 1 }}>
                        <Tabs 
                            value={tabValue} 
                            onChange={handleTabChange} 
                            variant="scrollable" 
                            scrollButtons="auto"
                            sx={{ 
                                '& .MuiTab-root': { textTransform: 'none', fontWeight: 600, minHeight: 56 },
                                '& .Mui-selected': { color: '#3b82f6' },
                                '& .MuiTabs-indicator': { backgroundColor: '#3b82f6', height: 3, borderRadius: '3px 3px 0 0' }
                            }}
                        >
                            <Tab 
                                label={
                                    <Badge badgeContent={assignedEvents.length} color="primary" sx={{ '& .MuiBadge-badge': { bgcolor: '#3b82f6' } }}>
                                        My Events
                                    </Badge>
                                } 
                            />
                            <Tab 
                                label={
                                    <Badge badgeContent={completedEvents.length} color="success" sx={{ '& .MuiBadge-badge': { bgcolor: '#10b981' } }}>
                                        Completed Events
                                    </Badge>
                                } 
                            />
                            <Tab 
                                label={
                                    <Badge 
                                        badgeContent={editingAssignments.filter(a => ['ASSIGNED', 'IN_PROGRESS', 'REVISION'].includes(a.status)).length} 
                                        color="warning"
                                        max={99}
                                        sx={{ '& .MuiBadge-badge': { bgcolor: '#f59e0b' } }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <EditIcon fontSize="small" />
                                            Post-Production
                                        </Box>
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
                    
                    <Box sx={{ bgcolor: 'white', minHeight: 400, p: 2 }}>
                        <TabPanel value={tabValue} index={0}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Typography variant="h6" fontWeight={700}>Your Assigned Events</Typography>
                                <Button 
                                    variant="text" 
                                    size="small"
                                    startIcon={<RefreshIcon />}
                                    onClick={refreshAllData}
                                >
                                    Refresh List
                                </Button>
                            </Box>
                            {assignedEvents.length > 0 ? (
                                <Grid container spacing={3}>
                                    {assignedEvents.map((event) => (
                                        <Grid item xs={12} key={event.id}>
                                            <Card variant="outlined" sx={{ borderRadius: 2, '&:hover': { borderColor: '#3b82f6', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }, transition: 'all 0.2s' }}>
                                                <CardContent>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                                        <Box>
                                                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                                                {event.name}
                                                            </Typography>
                                                            <Box sx={{ mb: 2 }}>
                                                                <Chip 
                                                                    label={event.status} 
                                                                    color={getEventStatusColor(event.status)}
                                                                    size="small"
                                                                    sx={{ fontWeight: 600 }}
                                                                />
                                                                <Chip 
                                                                    label={event.userRole} 
                                                                    size="small"
                                                                    sx={{ ml: 1, bgcolor: '#f1f5f9', color: '#475569', fontWeight: 600 }}
                                                                />
                                                            </Box>
                                                        </Box>
                                                    </Box>
                                                    
                                                    <Grid container spacing={2}>
                                                        <Grid item xs={12} md={6}>
                                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                                                            </Box>
                                                        </Grid>
                                                        
                                                        <Grid item xs={12} md={6}>
                                                            {/* GPS Check-in Component integrated here */}
                                                            <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                                                                <Typography variant="subtitle2" gutterBottom sx={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                    <CheckCircleIcon fontSize="small" /> GPS Check-in
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
                                                    {event.status === 'COMPLETED' && (
                                                        <>
                                                            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                                {renderDeliverableStatusChip(event)}
                                                                {event.deliverableSubmission?.lastSubmittedAt && (
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        Last submitted: {formatTimestamp(event.deliverableSubmission.lastSubmittedAt)}
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                            {renderDeliverableStatusDetails(event)}
                                                        </>
                                                    )}
                                                </CardContent>
                                                <CardActions sx={{ px: 2, pb: 2, pt: 0, flexWrap: 'wrap', gap: 1 }}>
                                                    {event.status === 'COMPLETED' && canSubmitStorageBatch(event) && (
                                                        <Button 
                                                            size="small" 
                                                            variant="contained"
                                                            onClick={() => handleSubmitCopy(event)}
                                                            sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                        >
                                                            {getDeliverableStatus(event) === 'REJECTED' ? 'Resubmit Storage' : 'Submit Storage'}
                                                        </Button>
                                                    )}
                                                    {event.status === 'COMPLETED' && getDeliverableStatus(event) === 'PENDING_REVIEW' && (
                                                        <Tooltip title="Waiting for data manager approval">
                                                            <span>
                                                                <Button size="small" variant="contained" disabled sx={{ borderRadius: '8px', textTransform: 'none' }}>
                                                                    Pending Review
                                                                </Button>
                                                            </span>
                                                        </Tooltip>
                                                    )}
                                                    <Button 
                                                        size="small" 
                                                        startIcon={<ChatIcon />}
                                                        onClick={() => handleOpenChat(event)}
                                                        variant="outlined"
                                                        sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                    >
                                                        Chat with Client
                                                    </Button>
                                                </CardActions>
                                            </Card>
                                        </Grid>
                                    ))}
                                </Grid>
                            ) : (
                                <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                    No events assigned to you currently. Click "Refresh" to check for new assignments.
                                </Alert>
                            )}
                        </TabPanel>
                        
                        <TabPanel value={tabValue} index={1}>
                            <Typography variant="h6" gutterBottom fontWeight={700}>Completed Events</Typography>
                            {completedEvents.length > 0 ? (
                                <Grid container spacing={3}>
                                    {completedEvents.map((event) => (
                                        <Grid item xs={12} md={6} key={event.id}>
                                            <Card variant="outlined" sx={{ borderRadius: 2 }}>
                                                <CardContent>
                                                    <Typography variant="h6" gutterBottom fontWeight={600}>
                                                        {event.name}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        <strong>Completed:</strong> {event.completedDate || event.date}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        <strong>Client:</strong> {event.clientName}
                                                    </Typography>
                                                    <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                                        {renderDeliverableStatusChip(event)}
                                                        {event.deliverableSubmission?.lastSubmittedAt && (
                                                            <Typography variant="caption" color="text.secondary">
                                                                Last submitted: {formatTimestamp(event.deliverableSubmission.lastSubmittedAt)}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                    {renderDeliverableStatusDetails(event)}
                                                </CardContent>
                                                <CardActions sx={{ px: 2, pb: 2 }}>
                                                    {canSubmitStorageBatch(event) && (
                                                        <Button 
                                                            size="small" 
                                                            variant="contained"
                                                            onClick={() => handleSubmitCopy(event)}
                                                            sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                        >
                                                            {getDeliverableStatus(event) === 'REJECTED' ? 'Resubmit Storage' : 'Submit Storage'}
                                                        </Button>
                                                    )}
                                                    <Button 
                                                        size="small" 
                                                        startIcon={<ChatIcon />}
                                                        onClick={() => handleOpenChat(event)}
                                                        variant="outlined"
                                                        sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                    >
                                                        View Chat
                                                    </Button>
                                                </CardActions>
                                            </Card>
                                        </Grid>
                                    ))}
                                </Grid>
                            ) : (
                                <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                    No completed events yet.
                                </Alert>
                            )}
                        </TabPanel>
                        
                        <TabPanel value={tabValue} index={2}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Typography variant="h6" fontWeight={700}>My Editing Assignments</Typography>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button 
                                        variant="outlined" 
                                        size="small"
                                        startIcon={<DashboardIcon />}
                                        onClick={() => navigate('/team/post-production/dashboard')}
                                        sx={{ borderRadius: '8px', textTransform: 'none' }}
                                    >
                                        Full Dashboard
                                    </Button>
                                    <Button 
                                        variant="outlined" 
                                        size="small"
                                        onClick={refreshAllData}
                                        disabled={loadingAssignments}
                                        sx={{ borderRadius: '8px', textTransform: 'none' }}
                                    >
                                        {loadingAssignments ? 'Loading...' : 'Refresh'}
                                    </Button>
                                </Box>
                            </Box>
                            
                            {/* Quick Actions Card */}
                            {hasPostProdAccess() && (
                                <Card sx={{ mb: 4, background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', color: 'white', borderRadius: 3, boxShadow: '0 10px 20px -5px rgba(37, 99, 235, 0.3)' }}>
                                    <CardContent>
                                        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 700 }}>
                                            <MovieIcon sx={{ mr: 1 }} />
                                            Post-Production Quick Actions
                                        </Typography>
                                        <Grid container spacing={2} sx={{ mt: 0 }}>
                                            <Grid item xs={12} sm={6} md={3}>
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    sx={{ 
                                                        bgcolor: 'rgba(255, 255, 255, 0.15)', 
                                                        backdropFilter: 'blur(4px)',
                                                        boxShadow: 'none',
                                                        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.25)', boxShadow: 'none' },
                                                        textTransform: 'none',
                                                        fontWeight: 600
                                                    }}
                                                    startIcon={<DashboardIcon />}
                                                    onClick={() => navigate('/team/post-production/dashboard')}
                                                >
                                                    Dashboard
                                                </Button>
                                            </Grid>
                                            <Grid item xs={12} sm={6} md={3}>
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    sx={{ 
                                                        bgcolor: 'rgba(255, 255, 255, 0.15)', 
                                                        backdropFilter: 'blur(4px)',
                                                        boxShadow: 'none',
                                                        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.25)', boxShadow: 'none' },
                                                        textTransform: 'none',
                                                        fontWeight: 600
                                                    }}
                                                    startIcon={<AssignmentIcon />}
                                                    onClick={() => setTabValue(2)}
                                                >
                                                    My Jobs ({editingAssignments.filter(a => ['ASSIGNED', 'IN_PROGRESS', 'REVISION'].includes(a.status)).length})
                                                </Button>
                                            </Grid>
                                            <Grid item xs={12} sm={6} md={3}>
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    sx={{ 
                                                        bgcolor: 'rgba(255, 255, 255, 0.15)', 
                                                        backdropFilter: 'blur(4px)',
                                                        boxShadow: 'none',
                                                        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.25)', boxShadow: 'none' },
                                                        textTransform: 'none',
                                                        fontWeight: 600
                                                    }}
                                                    startIcon={<PhotoIcon />}
                                                    onClick={() => navigate('/team/post-production/photo')}
                                                >
                                                    Photo Editing
                                                </Button>
                                            </Grid>
                                            <Grid item xs={12} sm={6} md={3}>
                                                <Button
                                                    fullWidth
                                                    variant="contained"
                                                    sx={{ 
                                                        bgcolor: 'rgba(255, 255, 255, 0.15)', 
                                                        backdropFilter: 'blur(4px)',
                                                        boxShadow: 'none',
                                                        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.25)', boxShadow: 'none' },
                                                        textTransform: 'none',
                                                        fontWeight: 600
                                                    }}
                                                    startIcon={<MovieIcon />}
                                                    onClick={() => navigate('/team/post-production/video')}
                                                >
                                                    Video Editing
                                                </Button>
                                            </Grid>
                                        </Grid>
                                    </CardContent>
                                </Card>
                            )}
                            
                            {loadingAssignments ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                                    <LinearProgress sx={{ width: '100%', maxWidth: 400, borderRadius: 2 }} />
                                </Box>
                            ) : editingAssignments.length > 0 ? (
                                <Grid container spacing={3}>
                                    {editingAssignments.map((assignment) => (
                                        <Grid item xs={12} key={assignment.jobId}>
                                            <Card variant="outlined" sx={{ 
                                                borderRadius: 3,
                                                border: isOverdue(assignment.due) ? '1px solid #ef4444' : '1px solid #e2e8f0',
                                                backgroundColor: isOverdue(assignment.due) ? '#fef2f2' : 'white',
                                                transition: 'all 0.2s',
                                                '&:hover': { boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }
                                            }}>
                                                <CardContent>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                                        <Box>
                                                            <Typography variant="h6" gutterBottom fontWeight={700}>
                                                                {assignment.eventName}
                                                            </Typography>
                                                            <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                                                <Chip 
                                                                    label={assignment.status} 
                                                                    color={getStatusColor(assignment.status)}
                                                                    size="small"
                                                                    icon={assignment.status === 'IN_PROGRESS' ? <EditIcon /> : 
                                                                          assignment.status === 'REVIEW' ? <UploadIcon /> :
                                                                          assignment.status === 'ASSIGNED' ? <PlayArrowIcon /> : null}
                                                                    sx={{ fontWeight: 600 }}
                                                                />
                                                                <Chip 
                                                                    label={assignment.myRole.replace('_', ' ')} 
                                                                    size="small"
                                                                    sx={{ bgcolor: '#f1f5f9', color: '#475569', fontWeight: 600 }}
                                                                    icon={assignment.myRole.includes('PHOTO') ? <PhotoIcon sx={{ color: '#64748b !important' }} /> : 
                                                                          assignment.myRole.includes('VIDEO') ? <MovieIcon sx={{ color: '#64748b !important' }} /> : <EditIcon sx={{ color: '#64748b !important' }} />}
                                                                />
                                                                {isOverdue(assignment.due) && (
                                                                    <Chip 
                                                                        label="OVERDUE" 
                                                                        color="error"
                                                                        size="small"
                                                                        sx={{ fontWeight: 600 }}
                                                                    />
                                                                )}
                                                            </Box>
                                                        </Box>
                                                    </Box>
                                                    
                                                    <Grid container spacing={2}>
                                                        <Grid item xs={12} md={6}>
                                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                                <Typography variant="body2" color="text.secondary">
                                                                    <strong>Event Type:</strong> {assignment.eventType}
                                                                </Typography>
                                                                <Typography variant="body2" color="text.secondary">
                                                                    <strong>Client:</strong> {assignment.clientName}
                                                                </Typography>
                                                                {assignment.due && (
                                                                    <Typography variant="body2" sx={{ color: isOverdue(assignment.due) ? '#ef4444' : 'text.secondary', fontWeight: isOverdue(assignment.due) ? 600 : 400 }}>
                                                                        <strong>Due:</strong> {format(new Date(assignment.due), 'MMM dd, yyyy HH:mm')}
                                                                    </Typography>
                                                                )}
                                                                <Typography variant="body2" color="text.secondary">
                                                                    <strong>Complexity:</strong> 
                                                                    {assignment.complexity?.estimatedHours && ` ${assignment.complexity.estimatedHours}h`}
                                                                    {assignment.complexity?.gb && ` • ${assignment.complexity.gb}GB`}
                                                                    {assignment.complexity?.cams && ` • ${assignment.complexity.cams} cams`}
                                                                </Typography>
                                                            </Box>
                                                        </Grid>
                                                        
                                                        <Grid item xs={12} md={6}>
                                                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                                                <strong>Deliverables:</strong> {assignment.deliverables?.length || 0} items
                                                            </Typography>
                                                            {assignment.notes && assignment.notes.length > 0 && (
                                                                <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f8fafc', borderRadius: 2 }}>
                                                                    <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" sx={{ mb: 0.5 }}>
                                                                        LATEST NOTE
                                                                    </Typography>
                                                                    <Typography variant="body2" color="text.primary">
                                                                        {assignment.notes[assignment.notes.length - 1]?.text?.substring(0, 100)}
                                                                        {assignment.notes[assignment.notes.length - 1]?.text?.length > 100 && '...'}
                                                                    </Typography>
                                                                </Paper>
                                                            )}
                                                        </Grid>
                                                        
                                                        {/* Storage Data Section */}
                                                        {assignment.storageData && assignment.storageData.length > 0 && (
                                                            <Grid item xs={12}>
                                                                <Box sx={{ mt: 2, p: 2, bgcolor: '#f1f5f9', borderRadius: 2 }}>
                                                                    <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', color: '#475569', fontWeight: 600 }}>
                                                                        <StorageIcon sx={{ mr: 1, fontSize: 18 }} />
                                                                        Data Storage Information
                                                                    </Typography>
                                                                    {assignment.storageData.map((storage, idx) => (
                                                                        <Box key={idx} sx={{ mb: 1, pl: 2, borderLeft: '3px solid', borderColor: '#3b82f6' }}>
                                                                            <Typography variant="caption" display="block" color="text.primary">
                                                                                <strong>Submitted by:</strong> {storage.submitterName}
                                                                            </Typography>
                                                                            {storage.storageLocation && (
                                                                                <Typography variant="caption" display="block" color="text.secondary">
                                                                                    <strong>Location:</strong> Room {storage.storageLocation.room}, 
                                                                                    {storage.storageLocation.cabinet && ` Cabinet ${storage.storageLocation.cabinet},`}
                                                                                    {` Shelf ${storage.storageLocation.shelf}, Bin ${storage.storageLocation.bin}`}
                                                                                </Typography>
                                                                            )}
                                                                            {storage.storageMediumId && (
                                                                                <Typography variant="caption" display="block" color="text.secondary">
                                                                                    <strong>Storage ID:</strong> {storage.storageMediumId}
                                                                                </Typography>
                                                                            )}
                                                                            <Typography variant="caption" display="block" color="text.secondary">
                                                                                <strong>Devices:</strong> {storage.deviceCount} ({storage.estimatedDataSize || 'Size unknown'})
                                                                            </Typography>
                                                                        </Box>
                                                                    ))}
                                                                </Box>
                                                            </Grid>
                                                        )}
                                                    </Grid>
                                                </CardContent>
                                                <CardActions sx={{ px: 2, pb: 2, gap: 1, flexWrap: 'wrap' }}>
                                                    {assignment.status === 'ASSIGNED' && (
                                                        <Button 
                                                            size="small" 
                                                            variant="contained"
                                                            startIcon={<PlayArrowIcon />}
                                                            onClick={() => handleStartWork(assignment.jobId)}
                                                            color="primary"
                                                            sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                        >
                                                            Start Work
                                                        </Button>
                                                    )}
                                                    
                                                    {assignment.status === 'IN_PROGRESS' && (
                                                        <Button 
                                                            size="small" 
                                                            variant="contained"
                                                            startIcon={<UploadIcon />}
                                                            onClick={() => handleSubmitForReview(assignment.jobId)}
                                                            color="success"
                                                            sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                        >
                                                            Submit for Review
                                                        </Button>
                                                    )}
                                                    
                                                    {assignment.status === 'REVISION' && (
                                                        <Button 
                                                            size="small" 
                                                            variant="contained"
                                                            startIcon={<EditIcon />}
                                                            onClick={() => handleStartWork(assignment.jobId)}
                                                            color="warning"
                                                            sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                        >
                                                            Resume Work
                                                        </Button>
                                                    )}
                                                    
                                                    <Button 
                                                        size="small" 
                                                        startIcon={<CameraIcon />}
                                                        variant="outlined"
                                                        sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                        onClick={() => {
                                                            // Parse jobId format: "eventId:stream"
                                                            const [eventId, stream] = assignment.jobId.split(':');
                                                            if (eventId) {
                                                                // Navigate to post-production panel for this event
                                                                navigate(`/events/${eventId}/postprod`);
                                                            } else {
                                                                toast.error('Invalid job ID format');
                                                            }
                                                        }}
                                                    >
                                                        View Details
                                                    </Button>
                                                </CardActions>
                                            </Card>
                                        </Grid>
                                    ))}
                                </Grid>
                            ) : (
                                <Alert severity="info" variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
                                    <Typography variant="subtitle1" gutterBottom fontWeight={600}>No editing assignments currently</Typography>
                                    <Typography variant="body2">
                                        You'll see post-production tasks here when they're assigned to you by an admin or post-production supervisor.
                                    </Typography>
                                </Alert>
                            )}
                        </TabPanel>
                        
                        <TabPanel value={tabValue} index={3}>
                            <Typography variant="h6" gutterBottom fontWeight={700}>Event Chat - Communicate with Clients</Typography>
                            {assignedEvents.length > 0 ? (
                                <Grid container spacing={3}>
                                    {assignedEvents.map((event) => (
                                        <Grid item xs={12} md={6} key={event.id}>
                                            <Card variant="outlined" sx={{ borderRadius: 2 }}>
                                                <CardContent>
                                                    <Typography variant="h6" gutterBottom fontWeight={600}>
                                                        {event.name}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        <strong>Date:</strong> {event.date} at {event.time}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        <strong>Client:</strong> {event.clientName}
                                                    </Typography>
                                                </CardContent>
                                                <CardActions sx={{ px: 2, pb: 2 }}>
                                                    <Button 
                                                        size="small" 
                                                        startIcon={<ChatIcon />}
                                                        onClick={() => handleOpenChat(event)}
                                                        variant="contained"
                                                        fullWidth
                                                        sx={{ borderRadius: '8px', textTransform: 'none' }}
                                                    >
                                                        Open Chat with Client
                                                    </Button>
                                                </CardActions>
                                            </Card>
                                        </Grid>
                                    ))}
                                </Grid>
                            ) : (
                                <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                    No events assigned to you currently. You'll see client chat options here once you're assigned to events.
                                </Alert>
                            )}
                        </TabPanel>
                        
                        <TabPanel value={tabValue} index={4}>
                            <Typography variant="h6" gutterBottom fontWeight={700}>Your Leave Requests</Typography>
                            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                                <Table>
                                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 600 }}>Start Date</TableCell>
                                            <TableCell sx={{ fontWeight: 600 }}>End Date</TableCell>
                                            <TableCell sx={{ fontWeight: 600 }}>Reason</TableCell>
                                            <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {leaveRequests.length > 0 ? leaveRequests.map(req => (
                                            <TableRow key={req.id}>
                                                <TableCell>{req.startDate}</TableCell>
                                                <TableCell>{req.endDate}</TableCell>
                                                <TableCell>{req.reason}</TableCell>
                                                <TableCell>{getStatusChip(req.status)}</TableCell>
                                            </TableRow>
                                        )) : (
                                            <TableRow>
                                                <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                                                    No leave requests found
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </TabPanel>
                        
                        <TabPanel value={tabValue} index={5}>
                            <MyPayslips />
                        </TabPanel>
                        
                        <TabPanel value={tabValue} index={6}>
                            <Typography variant="h6" gutterBottom fontWeight={700}>Cab Receipt Management</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                                Upload cab receipts for events you've attended. Receipts will be verified automatically before processing for reimbursement.
                            </Typography>
                            
                            {/* Information Card */}
                            <Alert severity="info" variant="outlined" sx={{ mb: 3, borderRadius: 2 }}>
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
                                <Grid container spacing={3}>
                                    {[...assignedEvents, ...completedEvents].map((event) => (
                                        <Grid item xs={12} key={event.id}>
                                            <Card variant="outlined" sx={{ borderRadius: 2 }}>
                                                <CardContent>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                                        <Box>
                                                            <Typography variant="h6" gutterBottom fontWeight={600}>
                                                                {event.name}
                                                            </Typography>
                                                            <Typography variant="body2" color="text.secondary">
                                                                <strong>Date:</strong> {event.date} at {event.time}
                                                            </Typography>
                                                            <Typography variant="body2" color="text.secondary">
                                                                <strong>Venue:</strong> {event.venue}
                                                            </Typography>
                                                            <Box sx={{ mt: 1 }}>
                                                                <Chip 
                                                                    label={event.status} 
                                                                    color={getEventStatusColor(event.status)}
                                                                    size="small"
                                                                    sx={{ fontWeight: 600 }}
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
                                <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                    No events available for cab receipt submission. You'll see events here once you're assigned to them.
                                </Alert>
                            )}
                        </TabPanel>
                    </Box>
                </Paper>
            </Container>
            
            {/* Storage Submission Modal */}
            <Dialog open={submitModalOpen} onClose={() => setSubmitModalOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>Submit Storage Batch for Review</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Hand over details for <strong>{selectedEvent?.name}</strong>. Your data manager will review the batch before approving the copy.
                    </Typography>
                    <Alert severity="info" variant="outlined" sx={{ mb: 3, borderRadius: 2 }}>
                        Include every card or drive you are turning in; type, brand, model, and capacity are required for each entry.
                    </Alert>

                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                type="date"
                                label="Physical Handover Date"
                                InputLabelProps={{ shrink: true }}
                                value={storageBatchDetails.physicalHandoverDate}
                                onChange={(e) => handleBatchFieldChange('physicalHandoverDate', e.target.value)}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Estimated Data Size (optional)"
                                placeholder="e.g., 250 GB"
                                value={storageBatchDetails.estimatedDataSize || ''}
                                onChange={(e) => handleBatchFieldChange('estimatedDataSize', e.target.value)}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                minRows={3}
                                label="Notes for Data Manager"
                                placeholder="Optional context, special handling instructions, courier info, etc."
                                value={storageBatchDetails.notes}
                                onChange={(e) => handleBatchFieldChange('notes', e.target.value)}
                            />
                        </Grid>
                    </Grid>

                    <Divider sx={{ mb: 3 }} />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="subtitle1" fontWeight={600}>Storage Devices</Typography>
                        <Button
                            variant="outlined"
                            startIcon={<AddCircleOutlineIcon />}
                            onClick={handleAddStorageDevice}
                            sx={{ textTransform: 'none', borderRadius: 2 }}
                        >
                            Add Device
                        </Button>
                    </Box>

                    <Grid container spacing={2}>
                        {storageBatchDetails.storageDevices.map((device, index) => (
                            <Grid item xs={12} key={`storage-device-${index}`}>
                                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: '#f8fafc' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Typography variant="subtitle2" fontWeight={600}>Device #{index + 1}</Typography>
                                        {storageBatchDetails.storageDevices.length > 1 && (
                                            <Tooltip title="Remove device">
                                                <IconButton size="small" color="error" onClick={() => handleRemoveStorageDevice(index)}>
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </Box>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={4}>
                                            <FormControl fullWidth>
                                                <InputLabel>Type</InputLabel>
                                                <Select
                                                    label="Type"
                                                    value={device.type}
                                                    onChange={(e) => handleStorageDeviceChange(index, 'type', e.target.value)}
                                                >
                                                    {['SD Card', 'CF Card', 'SSD', 'Hard Drive', 'USB Drive', 'Tape', 'Other'].map((option) => (
                                                        <MenuItem key={option} value={option}>{option}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            <TextField
                                                fullWidth
                                                label="Brand"
                                                value={device.brand}
                                                onChange={(e) => handleStorageDeviceChange(index, 'brand', e.target.value)}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            <TextField
                                                fullWidth
                                                label="Model"
                                                value={device.model}
                                                onChange={(e) => handleStorageDeviceChange(index, 'model', e.target.value)}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            <TextField
                                                fullWidth
                                                label="Capacity"
                                                placeholder="e.g., 64GB, 2TB"
                                                value={device.capacity}
                                                onChange={(e) => handleStorageDeviceChange(index, 'capacity', e.target.value)}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={4}>
                                            <TextField
                                                fullWidth
                                                label="Serial Number (optional)"
                                                value={device.serialNumber || ''}
                                                onChange={(e) => handleStorageDeviceChange(index, 'serialNumber', e.target.value)}
                                            />
                                        </Grid>
                                        <Grid item xs={12}>
                                            <TextField
                                                fullWidth
                                                multiline
                                                minRows={2}
                                                label="Device Notes (optional)"
                                                placeholder="Condition, issues, or special handling instructions"
                                                value={device.notes || ''}
                                                onChange={(e) => handleStorageDeviceChange(index, 'notes', e.target.value)}
                                            />
                                        </Grid>
                                    </Grid>
                                </Paper>
                            </Grid>
                        ))}
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setSubmitModalOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
                    <Button
                        onClick={handleCreateDataBatch}
                        variant="contained"
                        disabled={isSubmittingBatch}
                        sx={{ textTransform: 'none', borderRadius: 2 }}
                    >
                        {isSubmittingBatch ? 'Submitting…' : 'Submit for Review'}
                    </Button>
                </DialogActions>
            </Dialog>
            
            {/* Event Chat Dialog */}
            <Dialog open={chatOpen} onClose={() => setChatOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
                <DialogTitle>
                    <Typography variant="h6" fontWeight={700}>
                        Chat: {selectedEventForChat?.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Client: {selectedEventForChat?.clientName} • {selectedEventForChat?.date}
                    </Typography>
                </DialogTitle>
                <DialogContent dividers>
                    {chatLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <>
                            <Box sx={{ height: 400, overflowY: 'auto', mb: 2, border: '1px solid #e0e0e0', borderRadius: 2, p: 2, bgcolor: '#f8fafc' }}>
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
                                                <Typography variant="body1" sx={{ ml: 7, p: 1.5, bgcolor: 'white', borderRadius: 2, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                    {message.message}
                                                </Typography>
                                            </ListItem>
                                        ))}
                                    </List>
                                ) : (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.6 }}>
                                        <ChatIcon sx={{ fontSize: 48, mb: 2, color: 'text.secondary' }} />
                                        <Typography variant="body2" color="text.secondary">
                                            No messages yet. Start the conversation with your client!
                                        </Typography>
                                    </Box>
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
                                    sx={{ bgcolor: 'white' }}
                                />
                                <IconButton 
                                    color="primary" 
                                    onClick={handleSendMessage}
                                    disabled={!newMessage.trim()}
                                    sx={{ bgcolor: '#e0f2fe', '&:hover': { bgcolor: '#bae6fd' }, width: 56, height: 56, borderRadius: 2 }}
                                >
                                    <SendIcon />
                                </IconButton>
                            </Box>
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setChatOpen(false)} sx={{ textTransform: 'none' }}>Close</Button>
                    <Button 
                        startIcon={<RefreshIcon />}
                        onClick={() => handleOpenChat(selectedEventForChat)}
                        variant="outlined"
                        sx={{ borderRadius: 2, textTransform: 'none' }}
                    >
                        Refresh Messages
                    </Button>
                </DialogActions>
            </Dialog>
            
            {/* Deliverables Submission Modal */}
            <Dialog 
                open={deliverablesModalOpen} 
                onClose={() => setDeliverablesModalOpen(false)} 
                maxWidth="md" 
                fullWidth
                PaperProps={{ sx: { borderRadius: 3 } }}
            >
                <DialogTitle sx={{ fontWeight: 700 }}>
                    Submit Work for Review
                </DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Please provide links to your work deliverables. At least one link is required.
                    </Typography>
                    
                    <TextField
                        fullWidth
                        label="Preview URL (Google Drive, Dropbox, etc.)"
                        placeholder="https://drive.google.com/..."
                        value={deliverableLinks.previewUrl}
                        onChange={(e) => setDeliverableLinks(prev => ({ ...prev, previewUrl: e.target.value }))}
                        margin="normal"
                        helperText="Link to preview version of your work"
                    />
                    
                    <TextField
                        fullWidth
                        label="Final/High-Res URL"
                        placeholder="https://drive.google.com/..."
                        value={deliverableLinks.finalUrl}
                        onChange={(e) => setDeliverableLinks(prev => ({ ...prev, finalUrl: e.target.value }))}
                        margin="normal"
                        helperText="Link to final high-resolution deliverables"
                    />
                    
                    <TextField
                        fullWidth
                        label="Download URL"
                        placeholder="https://wetransfer.com/..."
                        value={deliverableLinks.downloadUrl}
                        onChange={(e) => setDeliverableLinks(prev => ({ ...prev, downloadUrl: e.target.value }))}
                        margin="normal"
                        helperText="Direct download link if applicable"
                    />
                    
                    <TextField
                        fullWidth
                        label="Additional URL (Optional)"
                        placeholder="https://..."
                        value={deliverableLinks.additionalUrl}
                        onChange={(e) => setDeliverableLinks(prev => ({ ...prev, additionalUrl: e.target.value }))}
                        margin="normal"
                        helperText="Any additional resources or references"
                    />
                    
                    <TextField
                        fullWidth
                        label="Notes"
                        placeholder="Add any notes about your submission..."
                        value={deliverableLinks.notes}
                        onChange={(e) => setDeliverableLinks(prev => ({ ...prev, notes: e.target.value }))}
                        margin="normal"
                        multiline
                        rows={3}
                        helperText="Optional notes for the reviewer"
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => {
                        setDeliverablesModalOpen(false);
                        setDeliverableLinks({
                            previewUrl: '',
                            finalUrl: '',
                            downloadUrl: '',
                            additionalUrl: '',
                            notes: ''
                        });
                    }} sx={{ textTransform: 'none' }}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleDeliverableSubmission}
                        variant="contained"
                        color="success"
                        startIcon={<UploadIcon />}
                        sx={{ textTransform: 'none', borderRadius: 2 }}
                    >
                        Submit for Review
                    </Button>
                </DialogActions>
            </Dialog>
            
            <RequestLeaveModal open={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleRequestLeave} />
        </Box>
    );
};

export default TeamDashboardPage;