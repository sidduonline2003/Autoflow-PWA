import React, { useState, useEffect, useMemo } from 'react';
import { 
    Container, Typography, Card, CardContent, Button, Grid, Box, Chip, Badge, 
    AppBar, Toolbar, Alert, Paper, Tabs, Tab, TableContainer, Table, TableHead, 
    TableRow, TableCell, TableBody, CardActions, Dialog, DialogTitle, DialogContent, 
    DialogActions, TextField, FormControl, InputLabel, Select, MenuItem, IconButton,
    List, ListItem, ListItemAvatar, ListItemText, Divider, Avatar, LinearProgress, CircularProgress,
    Menu, Tooltip
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
    Storage as StorageIcon
} from '@mui/icons-material';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
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
            {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
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

const DELIVERABLE_COMPLETED_STATES = new Set([
    'DONE',
    'DELIVERED',
    'DELIVERABLE_COMPLETE',
    'COMPLETE',
    'COMPLETED',
    'READY',
    'APPROVED',
]);

const DELIVERABLE_IN_PROGRESS_STATES = new Set([
    'IN_PROGRESS',
    'WORKING',
    'EDITING',
    'PROCESSING',
    'REVISION',
    'CHANGES',
    'PENDING_REVIEW',
]);

const normalizeStatusValue = (value) => {
    if (!value) return '';
    return value.toString().trim().toUpperCase();
};

const humanizeStatus = (value) => {
    if (!value) return 'Pending';
    return value
        .toString()
        .split(/[_\s]+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};

const coerceCount = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const deriveDeliverableSummary = (assignment) => {
    if (!assignment) {
        return { total: 0, completed: 0, inProgress: 0, pending: 0, completionPct: 0 };
    }
    const summary = assignment.deliverablesSummary || {};
    const total = coerceCount(summary.total ?? (assignment.deliverables?.length ?? 0));
    const completed = Math.min(coerceCount(summary.completed), total);
    const inProgress = Math.min(coerceCount(summary.inProgress), Math.max(total - completed, 0));
    const pendingValue = summary.pending !== undefined ? coerceCount(summary.pending) : Math.max(total - completed - inProgress, 0);
    const pending = Math.max(Math.min(pendingValue, total), 0);
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, pending, completionPct };
};

const getDeliverableStatusMeta = (deliverable) => {
    const normalized = normalizeStatusValue(deliverable?.status || deliverable?.state);
    if (normalized && DELIVERABLE_COMPLETED_STATES.has(normalized)) {
        return {
            label: humanizeStatus(normalized),
            color: 'success',
            icon: <CheckCircleIcon fontSize="small" />,
        };
    }
    if (normalized && DELIVERABLE_IN_PROGRESS_STATES.has(normalized)) {
        return {
            label: humanizeStatus(normalized),
            color: 'info',
            icon: <RefreshIcon fontSize="small" />,
        };
    }
    if (normalized && (normalized.includes('REJECT') || normalized.includes('REVISION') || normalized.includes('CHANGE'))) {
        return {
            label: humanizeStatus(normalized),
            color: 'warning',
            icon: <WarningAmberIcon fontSize="small" />,
        };
    }
    return {
        label: humanizeStatus(normalized) || 'Pending',
        color: 'default',
        icon: <HourglassBottomIcon fontSize="small" />,
    };
};

const TeamDashboardPage = () => {
    const { user, claims } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const { jobId: jobIdParam } = useParams();
    const decodedJobId = jobIdParam ? decodeURIComponent(jobIdParam) : null;

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
    const [tabValue, setTabValue] = useState(() => (
        location.pathname.startsWith('/team/post-production') ? 2 : 0
    ));
    const [focusedJobId, setFocusedJobId] = useState(decodedJobId || '');

    const [postProdMenuAnchor, setPostProdMenuAnchor] = useState(null);

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

    useEffect(() => {
        if (decodedJobId) {
            setFocusedJobId(decodedJobId);
            setTabValue(2);
        } else if (focusedJobId) {
            setFocusedJobId('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [decodedJobId]);

    useEffect(() => {
        if (!decodedJobId && location.pathname.startsWith('/team/post-production') && tabValue !== 2) {
            setTabValue(2);
        }
    }, [location.pathname, decodedJobId, tabValue]);

    const focusedAssignment = useMemo(() => {
        if (!focusedJobId) return null;
        return editingAssignments.find((assignment) => assignment.jobId === focusedJobId) || null;
    }, [editingAssignments, focusedJobId]);

    const focusedDeliverableSummary = useMemo(() => deriveDeliverableSummary(focusedAssignment), [focusedAssignment]);
    const focusedDeliverablesPreview = useMemo(() => {
        if (!focusedAssignment?.deliverables) return [];
        return focusedAssignment.deliverables.slice(0, 4);
    }, [focusedAssignment]);

    const loadEditingAssignments = React.useCallback(async () => {
        if (!auth.currentUser) return;
        setLoadingAssignments(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/postprod/my-assignments', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
            });

            if (response.ok) {
                const data = await response.json();
                setEditingAssignments(data || []);
            } else {
                const errorText = await response.text();
                console.error('Failed to fetch editing assignments:', response.status, errorText);
            }
        } catch (error) {
            console.error('Error fetching editing assignments:', error);
        } finally {
            setLoadingAssignments(false);
        }
    }, []);

    const applyAssignmentUpdate = React.useCallback((updatedAssignment) => {
        if (!updatedAssignment) return;
        setEditingAssignments((previous) => {
            const next = [...previous];
            const index = next.findIndex((item) => item.jobId === updatedAssignment.jobId);
            if (index >= 0) {
                next[index] = { ...next[index], ...updatedAssignment };
            } else {
                next.push(updatedAssignment);
            }
            return next;
        });
    }, []);

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

        fetchMemberName();
        fetchAssignedEvents();
        loadEditingAssignments();

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
    }, [claims, user, loadEditingAssignments]);

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
            await loadEditingAssignments();

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

            let payload = null;
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                payload = await response.json().catch(() => null);
            }

            if (response.ok) {
                toast.success('Work started successfully!');
                if (payload?.assignment) {
                    applyAssignmentUpdate(payload.assignment);
                    if (focusedJobId === payload.assignment.jobId) {
                        setFocusedJobId(payload.assignment.jobId);
                    }
                } else {
                    await loadEditingAssignments();
                }
            } else {
                const errorMessage = payload?.detail || payload?.message || 'Failed to start work';
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Error starting work:', error);
            toast.error(error.message || 'Failed to start work');
        }
    };

    const handleSubmitForReview = async (jobId) => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/postprod/${jobId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    to_status: 'REVIEW',
                    reason: 'Submitted work for review'
                })
            });

            let payload = null;
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                payload = await response.json().catch(() => null);
            }

            if (response.ok) {
                toast.success('Work submitted for review!');
                if (payload?.assignment) {
                    applyAssignmentUpdate(payload.assignment);
                } else {
                    await loadEditingAssignments();
                }
            } else {
                const errorMessage = payload?.detail || payload?.message || 'Failed to submit for review';
                throw new Error(errorMessage);
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

    const getStatusIcon = (status) => {
        switch (status) {
            case 'IN_PROGRESS':
                return <EditIcon />;
            case 'REVIEW':
                return <UploadIcon />;
            case 'ASSIGNED':
                return <PlayArrowIcon />;
            case 'REVISION':
                return <WarningAmberIcon />;
            case 'READY':
                return <CheckCircleIcon />;
            default:
                return null;
        }
    };

    const renderAssignmentActions = (assignment) => {
        if (!assignment) return null;
        return (
            <>
                {assignment.status === 'ASSIGNED' && (
                    <Button 
                        size="small" 
                        variant="contained"
                        startIcon={<PlayArrowIcon />}
                        onClick={() => handleStartWork(assignment.jobId)}
                        color="primary"
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
                    >
                        Resume Work
                    </Button>
                )}
                {assignment.status === 'REVIEW' && (
                    <Chip 
                        label="Under Review" 
                        color="info" 
                        size="small"
                    />
                )}
                {assignment.status === 'READY' && (
                    <Chip 
                        label="Complete" 
                        color="success" 
                        size="small"
                    />
                )}
            </>
        );
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

    const clearFocusedJob = (targetPath) => {
        if (focusedJobId) {
            setFocusedJobId('');
        }
        handlePostProdMenuClose();
        if (targetPath) {
            navigate(targetPath);
        }
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
        <>
            <AppBar position="static" color="primary">
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>Team Portal</Typography>
                    
                    {/* Post-Production Navigation */}
                    {hasPostProdAccess() && (
                        <>
                            <Button 
                                color="inherit" 
                                startIcon={<MovieIcon />}
                                endIcon={<ArrowDropDownIcon />}
                                onClick={handlePostProdMenuOpen}
                                sx={{ mr: 2 }}
                            >
                                Post-Production
                            </Button>
                            <Menu
                                anchorEl={postProdMenuAnchor}
                                open={Boolean(postProdMenuAnchor)}
                                onClose={handlePostProdMenuClose}
                            >
                                <MenuItem onClick={() => {
                                    clearFocusedJob('/team/post-production/dashboard');
                                    handlePostProdMenuClose();
                                }}>
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
                            color="inherit"
                            startIcon={<StorageIcon />}
                            sx={{ mr: 2 }}
                            onClick={() => navigate('/data-manager')}
                        >
                            Data Manager
                        </Button>
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
                                    <Badge 
                                        badgeContent={editingAssignments.filter(a => ['ASSIGNED', 'IN_PROGRESS', 'REVISION'].includes(a.status)).length} 
                                        color="warning"
                                        max={99}
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
                                            <CardActions sx={{ flexWrap: 'wrap', gap: 1 }}>
                                                {event.status === 'COMPLETED' && canSubmitStorageBatch(event) && (
                                                    <Button 
                                                        size="small" 
                                                        variant="contained"
                                                        onClick={() => handleSubmitCopy(event)}
                                                    >
                                                        {getDeliverableStatus(event) === 'REJECTED' ? 'Resubmit Storage' : 'Submit Storage'}
                                                    </Button>
                                                )}
                                                {event.status === 'COMPLETED' && getDeliverableStatus(event) === 'PENDING_REVIEW' && (
                                                    <Tooltip title="Waiting for data manager approval">
                                                        <span>
                                                            <Button size="small" variant="contained" disabled>
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
                                            <CardActions>
                                                {canSubmitStorageBatch(event) && (
                                                    <Button 
                                                        size="small" 
                                                        variant="contained"
                                                        onClick={() => handleSubmitCopy(event)}
                                                    >
                                                        {getDeliverableStatus(event) === 'REJECTED' ? 'Resubmit Storage' : 'Submit Storage'}
                                                    </Button>
                                                )}
                                                {getDeliverableStatus(event) === 'PENDING_REVIEW' && (
                                                    <Tooltip title="Waiting for data manager approval">
                                                        <span>
                                                            <Button size="small" variant="contained" disabled>
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
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6">My Editing Assignments</Typography>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button 
                                    variant="outlined" 
                                    size="small"
                                    startIcon={<DashboardIcon />}
                                    onClick={() => clearFocusedJob('/team/post-production/dashboard')}
                                >
                                    Full Dashboard
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    size="small"
                                    onClick={refreshAllData}
                                    disabled={loadingAssignments}
                                >
                                    {loadingAssignments ? 'Loading...' : 'Refresh'}
                                </Button>
                            </Box>
                        </Box>
                        
                        {/* Quick Actions Card */}
                        {hasPostProdAccess() && (
                            <Card sx={{ mb: 3, background: 'linear-gradient(45deg, #1976d2 30%, #42a5f5 90%)', color: 'white' }}>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>
                                        <MovieIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                                        Post-Production Quick Actions
                                    </Typography>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6} md={3}>
                                            <Button
                                                fullWidth
                                                variant="contained"
                                                sx={{ 
                                                    backgroundColor: 'rgba(255, 255, 255, 0.1)', 
                                                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.2)' }
                                                }}
                                                startIcon={<DashboardIcon />}
                                                onClick={() => clearFocusedJob('/team/post-production/dashboard')}
                                            >
                                                Dashboard
                                            </Button>
                                        </Grid>
                                        <Grid item xs={12} sm={6} md={3}>
                                            <Button
                                                fullWidth
                                                variant="contained"
                                                sx={{ 
                                                    backgroundColor: 'rgba(255, 255, 255, 0.1)', 
                                                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.2)' }
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
                                                    backgroundColor: 'rgba(255, 255, 255, 0.1)', 
                                                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.2)' }
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
                                                    backgroundColor: 'rgba(255, 255, 255, 0.1)', 
                                                    '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.2)' }
                                                }}
                                                startIcon={<MovieIcon />}
                                                onClick={() => clearFocusedJob('/team/post-production/video')}
                                            >
                                                Video Editing
                                            </Button>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        )}
                        
                        {focusedAssignment && (
                            <Card 
                                variant="outlined" 
                                sx={{ 
                                    mb: 3, 
                                    borderLeft: '4px solid', 
                                    borderColor: 'primary.main',
                                    backgroundColor: 'rgba(25,118,210,0.05)'
                                }}
                            >
                                <CardContent>
                                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', gap: 2 }}>
                                        <Box>
                                            <Typography variant="overline" color="primary" display="block">
                                                Focused Post-Production Job
                                            </Typography>
                                            <Typography variant="h5" gutterBottom>
                                                {focusedAssignment.eventName}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                <strong>Client:</strong> {focusedAssignment.clientName || 'Not set'}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                <strong>Event Type:</strong> {focusedAssignment.eventType || 'Not set'}
                                            </Typography>
                                            {focusedAssignment.due && (
                                                <Typography variant="body2" color="text.secondary">
                                                    <strong>Due:</strong> {formatTimestamp(focusedAssignment.due)}
                                                </Typography>
                                            )}
                                            <Typography variant="body2" color="text.secondary">
                                                <strong>Role:</strong> {focusedAssignment.myRole?.replace('_', ' ') || 'Editor'}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                                            <Chip 
                                                label={focusedAssignment.status}
                                                color={getStatusColor(focusedAssignment.status)}
                                                icon={getStatusIcon(focusedAssignment.status)}
                                                sx={{ mb: 1 }}
                                            />
                                            {focusedAssignment.updatedAt && (
                                                <Typography variant="caption" color="text.secondary" display="block">
                                                    Updated {formatTimestamp(focusedAssignment.updatedAt)}
                                                </Typography>
                                            )}
                                            {focusedAssignment.eventDate && (
                                                <Typography variant="caption" color="text.secondary" display="block">
                                                    Event Date {formatTimestamp(focusedAssignment.eventDate)}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>

                                    <Box sx={{ mt: 3 }}>
                                        {focusedDeliverableSummary.total > 0 ? (
                                            <>
                                                <Typography variant="subtitle2" gutterBottom>
                                                    Deliverables Progress
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {focusedDeliverableSummary.completed}/{focusedDeliverableSummary.total} completed
                                                    {focusedDeliverableSummary.inProgress > 0 && ` • ${focusedDeliverableSummary.inProgress} in progress`}
                                                    {focusedDeliverableSummary.pending > 0 && ` • ${focusedDeliverableSummary.pending} pending`}
                                                </Typography>
                                                <LinearProgress 
                                                    variant="determinate" 
                                                    value={focusedDeliverableSummary.completionPct} 
                                                    sx={{ mt: 1, height: 8, borderRadius: 1 }}
                                                />
                                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                                                    <Chip size="small" color="success" label={`Completed ${focusedDeliverableSummary.completed}`} />
                                                    <Chip size="small" color="info" label={`In Progress ${focusedDeliverableSummary.inProgress}`} />
                                                    <Chip size="small" color="warning" label={`Pending ${focusedDeliverableSummary.pending}`} />
                                                </Box>
                                            </>
                                        ) : (
                                            <Alert severity="info" sx={{ mt: 2 }}>
                                                This job doesn't have tracked deliverables yet.
                                            </Alert>
                                        )}

                                        {focusedDeliverablesPreview.length > 0 && (
                                            <List dense disablePadding sx={{ mt: 2 }}>
                                                {focusedDeliverablesPreview.map((deliverable, index) => {
                                                    const meta = getDeliverableStatusMeta(deliverable);
                                                    const deliverableName = deliverable.name || deliverable.title || deliverable.id || `Deliverable ${index + 1}`;
                                                    const details = [];
                                                    if (deliverable.type) details.push(deliverable.type);
                                                    const updatedLabel = deliverable.updatedAt ? formatTimestamp(deliverable.updatedAt, null) : null;
                                                    const submittedLabel = deliverable.submittedAt ? formatTimestamp(deliverable.submittedAt, null) : null;
                                                    if (updatedLabel) details.push(`Updated ${updatedLabel}`);
                                                    if (submittedLabel) details.push(`Submitted ${submittedLabel}`);
                                                    return (
                                                        <ListItem key={`${focusedAssignment.jobId}-${deliverable.id || deliverableName}`} disableGutters sx={{ py: 0.5 }}>
                                                            <ListItemText 
                                                                primary={deliverableName}
                                                                secondary={details.length > 0 ? details.join(' • ') : undefined}
                                                            />
                                                            <Chip size="small" color={meta.color} label={meta.label} icon={meta.icon} sx={{ ml: 1 }} />
                                                        </ListItem>
                                                    );
                                                })}
                                                {focusedAssignment.deliverables && focusedAssignment.deliverables.length > focusedDeliverablesPreview.length && (
                                                    <ListItem disableGutters sx={{ py: 0.5 }}>
                                                        <ListItemText primary={`+${focusedAssignment.deliverables.length - focusedDeliverablesPreview.length} more deliverables`} />
                                                    </ListItem>
                                                )}
                                            </List>
                                        )}
                                    </Box>
                                </CardContent>
                                <CardActions>
                                    {renderAssignmentActions(focusedAssignment)}
                                    <Button 
                                        size="small" 
                                        startIcon={<CameraIcon />}
                                        variant="outlined"
                                        onClick={() => {
                                            const encodedJobId = encodeURIComponent(focusedAssignment.jobId);
                                            navigate(`/team/post-production/job/${encodedJobId}`);
                                        }}
                                    >
                                        View Job Details
                                    </Button>
                                    <Button 
                                        size="small" 
                                        variant="text"
                                        onClick={() => clearFocusedJob()}
                                    >
                                        Clear Focus
                                    </Button>
                                </CardActions>
                            </Card>
                        )}

                        {loadingAssignments ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                                <LinearProgress sx={{ width: '100%' }} />
                            </Box>
                        ) : editingAssignments.length > 0 ? (
                            <Grid container spacing={2}>
                                {editingAssignments.map((assignment) => {
                                    const metrics = deriveDeliverableSummary(assignment);
                                    const previewDeliverables = assignment.deliverables ? assignment.deliverables.slice(0, 3) : [];

                                    return (
                                        <Grid item xs={12} key={assignment.jobId}>
                                            <Card variant="outlined" sx={{ 
                                                mb: 2,
                                                border: isOverdue(assignment.due) ? '2px solid #f44336' : undefined,
                                                backgroundColor: isOverdue(assignment.due) ? '#ffebee' : undefined
                                            }}>
                                                <CardContent>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                                        <Box>
                                                            <Typography variant="h6" gutterBottom>
                                                                {assignment.eventName}
                                                            </Typography>
                                                            <Box sx={{ mb: 2 }}>
                                                                <Chip 
                                                                    label={assignment.status} 
                                                                    color={getStatusColor(assignment.status)}
                                                                    size="small"
                                                                    icon={getStatusIcon(assignment.status)}
                                                                />
                                                                <Chip 
                                                                    label={assignment.myRole.replace('_', ' ')} 
                                                                    color="secondary"
                                                                    size="small"
                                                                    sx={{ ml: 1 }}
                                                                    icon={assignment.myRole.includes('PHOTO') ? <PhotoIcon /> : 
                                                                          assignment.myRole.includes('VIDEO') ? <MovieIcon /> : <EditIcon />}
                                                                />
                                                                {isOverdue(assignment.due) && (
                                                                    <Chip 
                                                                        label="OVERDUE" 
                                                                        color="error"
                                                                        size="small"
                                                                        sx={{ ml: 1 }}
                                                                    />
                                                                )}
                                                            </Box>
                                                        </Box>
                                                    </Box>

                                                    <Grid container spacing={2}>
                                                        <Grid item xs={12} md={6}>
                                                            <Typography variant="body2" color="text.secondary">
                                                                <strong>Event Type:</strong> {assignment.eventType || 'Not set'}
                                                            </Typography>
                                                            <Typography variant="body2" color="text.secondary">
                                                                <strong>Client:</strong> {assignment.clientName || 'Not set'}
                                                            </Typography>
                                                            {assignment.due && (
                                                                <Typography variant="body2" color={isOverdue(assignment.due) ? 'error' : 'text.secondary'}>
                                                                    <strong>Due:</strong> {format(new Date(assignment.due), 'MMM dd, yyyy HH:mm')}
                                                                </Typography>
                                                            )}
                                                            <Typography variant="body2" color="text.secondary">
                                                                <strong>Complexity:</strong> 
                                                                {assignment.complexity?.estimatedHours && ` ${assignment.complexity.estimatedHours}h`}
                                                                {assignment.complexity?.gb && ` • ${assignment.complexity.gb}GB`}
                                                                {assignment.complexity?.cams && ` • ${assignment.complexity.cams} cams`}
                                                            </Typography>
                                                            {assignment.notes && assignment.notes.length > 0 && (
                                                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                                                    <strong>Latest Note:</strong> {assignment.notes[assignment.notes.length - 1]?.text?.substring(0, 80)}
                                                                </Typography>
                                                            )}
                                                        </Grid>

                                                        <Grid item xs={12} md={6}>
                                                            {metrics.total > 0 ? (
                                                                <>
                                                                    <Typography variant="body2" color="text.secondary">
                                                                        <strong>Deliverables:</strong> {metrics.total} items
                                                                    </Typography>
                                                                    <Typography variant="body2" color="text.secondary">
                                                                        {metrics.completed}/{metrics.total} completed
                                                                        {metrics.inProgress > 0 && ` • ${metrics.inProgress} in progress`}
                                                                        {metrics.pending > 0 && ` • ${metrics.pending} pending`}
                                                                    </Typography>
                                                                    <LinearProgress 
                                                                        variant="determinate" 
                                                                        value={metrics.completionPct}
                                                                        sx={{ mt: 1, height: 6, borderRadius: 1 }}
                                                                    />
                                                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
                                                                        <Chip size="small" color="success" label={`Completed ${metrics.completed}`} />
                                                                        <Chip size="small" color="info" label={`In Progress ${metrics.inProgress}`} />
                                                                        <Chip size="small" color="warning" label={`Pending ${metrics.pending}`} />
                                                                    </Box>
                                                                </>
                                                            ) : (
                                                                <Alert severity="info">
                                                                    No deliverables have been added to this job yet.
                                                                </Alert>
                                                            )}

                                                            {previewDeliverables.length > 0 && (
                                                                <List dense disablePadding sx={{ mt: 2 }}>
                                                                    {previewDeliverables.map((deliverable, index) => {
                                                                        const meta = getDeliverableStatusMeta(deliverable);
                                                                        const deliverableName = deliverable.name || deliverable.title || deliverable.id || `Deliverable ${index + 1}`;
                                                                        const detailParts = [];
                                                                        if (deliverable.type) detailParts.push(deliverable.type);
                                                                        const updatedLabel = deliverable.updatedAt ? formatTimestamp(deliverable.updatedAt, null) : null;
                                                                        const submittedLabel = deliverable.submittedAt ? formatTimestamp(deliverable.submittedAt, null) : null;
                                                                        if (updatedLabel) detailParts.push(`Updated ${updatedLabel}`);
                                                                        if (submittedLabel) detailParts.push(`Submitted ${submittedLabel}`);
                                                                        return (
                                                                            <ListItem key={`${assignment.jobId}-${deliverable.id || deliverableName}`} disableGutters sx={{ py: 0.5 }}>
                                                                                <ListItemText
                                                                                    primary={deliverableName}
                                                                                    secondary={detailParts.length > 0 ? detailParts.join(' • ') : undefined}
                                                                                />
                                                                                <Chip size="small" color={meta.color} label={meta.label} icon={meta.icon} sx={{ ml: 1 }} />
                                                                            </ListItem>
                                                                        );
                                                                    })}
                                                                    {assignment.deliverables && assignment.deliverables.length > previewDeliverables.length && (
                                                                        <ListItem disableGutters sx={{ py: 0.5 }}>
                                                                            <ListItemText primary={`+${assignment.deliverables.length - previewDeliverables.length} more deliverables`} />
                                                                        </ListItem>
                                                                    )}
                                                                </List>
                                                            )}
                                                        </Grid>
                                                    </Grid>
                                                </CardContent>
                                                <CardActions>
                                                    {renderAssignmentActions(assignment)}
                                                    <Button 
                                                        size="small" 
                                                        startIcon={<CameraIcon />}
                                                        variant="outlined"
                                                        onClick={() => {
                                                            const encodedJobId = encodeURIComponent(assignment.jobId);
                                                            setFocusedJobId(assignment.jobId);
                                                            navigate(`/team/post-production/job/${encodedJobId}`);
                                                        }}
                                                    >
                                                        View Job Details
                                                    </Button>
                                                    <Button 
                                                        size="small" 
                                                        startIcon={<DashboardIcon />}
                                                        variant="text"
                                                        onClick={() => clearFocusedJob('/team/post-production/dashboard')}
                                                    >
                                                        Dashboard
                                                    </Button>
                                                </CardActions>
                                            </Card>
                                        </Grid>
                                    );
                                })}
                            </Grid>
                        ) : (
                            <Alert severity="info" sx={{ mb: 3 }}>
                                <Typography variant="h6" gutterBottom>No editing assignments currently</Typography>
                                <Typography variant="body2" gutterBottom>
                                    You'll see post-production tasks here when they're assigned to you by an admin or post-production supervisor.
                                </Typography>
                                {!hasPostProdAccess() && (
                                    <Typography variant="body2" color="text.secondary">
                                        If you're an editor or have post-production skills, contact your admin to get access to the post-production system.
                                    </Typography>
                                )}
                            </Alert>
                        )}
                    </TabPanel>
                    
                    <TabPanel value={tabValue} index={3}>
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
                    
                    <TabPanel value={tabValue} index={4}>
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
                    
                    <TabPanel value={tabValue} index={5}>
                        <MyPayslips />
                    </TabPanel>
                    
                    <TabPanel value={tabValue} index={6}>
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
            
            {/* Storage Submission Modal */}
            <Dialog open={submitModalOpen} onClose={() => setSubmitModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Submit Storage Batch for Review</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Hand over details for <strong>{selectedEvent?.name}</strong>. Your data manager will review the batch before approving the copy.
                    </Typography>
                    <Alert severity="info" sx={{ mb: 3 }}>
                        Include every card or drive you are turning in; type, brand, model, and capacity are required for each entry.
                    </Alert>

                    <Grid container spacing={2} sx={{ mb: 3 }}>
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
                        <Typography variant="subtitle1">Storage Devices</Typography>
                        <Button
                            variant="outlined"
                            startIcon={<AddCircleOutlineIcon />}
                            onClick={handleAddStorageDevice}
                        >
                            Add Device
                        </Button>
                    </Box>

                    <Grid container spacing={2}>
                        {storageBatchDetails.storageDevices.map((device, index) => (
                            <Grid item xs={12} key={`storage-device-${index}`}>
                                <Paper variant="outlined" sx={{ p: 2 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                        <Typography variant="subtitle2">Device #{index + 1}</Typography>
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
                <DialogActions>
                    <Button onClick={() => setSubmitModalOpen(false)}>Cancel</Button>
                    <Button
                        onClick={handleCreateDataBatch}
                        variant="contained"
                        disabled={isSubmittingBatch}
                    >
                        {isSubmittingBatch ? 'Submitting…' : 'Submit for Review'}
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
