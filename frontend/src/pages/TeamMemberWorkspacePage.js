import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { doc, collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    Box, Container, Typography, Breadcrumbs, Link, CircularProgress, Paper, Button, Grid, Chip, Divider,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Avatar, Tooltip,
    Tabs, Tab, Card, CardContent, Rating, MenuItem,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select, FormControl, InputLabel, Badge, Stack, alpha, useTheme
} from '@mui/material';
import {
    NavigateNext as NavigateNextIcon,
    Edit as EditIcon,
    DoNotDisturbOn as DoNotDisturbOnIcon,
    AddCircleOutline as AddCircleOutlineIcon,
    Person as PersonIcon,
    Work as WorkIcon,
    Inventory as InventoryIcon,
    AttachMoney as MoneyIcon,
    Description as DocumentIcon,
    Assignment as AssignmentIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    Send as SendIcon,
    Badge as BadgeIcon,
    MonetizationOn as BonusIcon,
    Message as MessageIcon,
    Verified as VerifiedIcon,
    Circle as CircleIcon,
    Star as StarIcon,
    StarBorder as StarBorderIcon,
    CloudUpload as CloudUploadIcon,
    Event as EventIcon,
    ArrowUpward as ArrowUpIcon,
    ArrowDownward as ArrowDownIcon,
    History as HistoryIcon,
    Warning as WarningIcon,
    Timeline as TimelineIconMUI,
    BarChart as BarChartIcon
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import EditTeamMemberModal from '../components/EditTeamMemberModal';
import DeleteConfirmationDialog from '../components/DeleteConfirmationDialog';
import TeamMemberIDCard from '../components/TeamMemberIDCard';
import RequestLeaveModal from '../components/RequestLeaveModal';
import { equipmentAPI } from '../services/equipmentApi';

// =========================
// STAT CARD COMPONENT
// =========================
const StatCard = ({ icon, title, value, subtitle, color, trend, onClick }) => {
    const theme = useTheme();
    return (
        <Card 
            onClick={onClick}
            sx={{ 
                height: '100%',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all 0.3s ease',
                border: '1px solid',
                borderColor: 'divider',
                '&:hover': onClick ? {
                    transform: 'translateY(-4px)',
                    boxShadow: `0 8px 25px ${alpha(color, 0.25)}`,
                    borderColor: color
                } : {}
            }}
        >
            <CardContent sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Box sx={{
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: alpha(color, 0.1),
                        color: color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {icon}
                    </Box>
                    {trend !== undefined && (
                        <Chip
                            size="small"
                            icon={trend >= 0 ? <ArrowUpIcon sx={{ fontSize: 14 }} /> : <ArrowDownIcon sx={{ fontSize: 14 }} />}
                            label={`${Math.abs(trend)}%`}
                            color={trend >= 0 ? 'success' : 'error'}
                            sx={{ height: 24, fontSize: '0.7rem' }}
                        />
                    )}
                </Box>
                <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 0.5 }}>
                    {value}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    {title}
                </Typography>
                {subtitle && (
                    <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        {subtitle}
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
};

// =========================
// ACTIVITY TIMELINE COMPONENT  
// =========================
const ActivityTimeline = ({ activities }) => {
    const theme = useTheme();
    
    const getActivityIcon = (type) => {
        const iconProps = { sx: { fontSize: 16 } };
        switch(type) {
            case 'checkin': return <CheckCircleIcon {...iconProps} />;
            case 'checkout': return <CancelIcon {...iconProps} />;
            case 'upload': return <CloudUploadIcon {...iconProps} />;
            case 'task': return <AssignmentIcon {...iconProps} />;
            case 'review': return <BarChartIcon {...iconProps} />;
            case 'equipment': return <InventoryIcon {...iconProps} />;
            default: return <HistoryIcon {...iconProps} />;
        }
    };

    const getActivityColor = (type) => {
        switch(type) {
            case 'checkin': return theme.palette.success.main;
            case 'checkout': return theme.palette.error.main;
            case 'upload': return theme.palette.primary.main;
            case 'task': return theme.palette.info.main;
            case 'review': return theme.palette.warning.main;
            case 'equipment': return theme.palette.secondary.main;
            default: return theme.palette.grey[500];
        }
    };

    if (!activities || activities.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                <TimelineIconMUI sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
                <Typography>No activity history</Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ position: 'relative', pl: 3 }}>
            {activities.slice(0, 10).map((activity, index) => (
                <Box key={index} sx={{ display: 'flex', mb: 2, position: 'relative' }}>
                    {/* Vertical Line */}
                    {index < activities.length - 1 && (
                        <Box sx={{
                            position: 'absolute',
                            left: -20,
                            top: 24,
                            bottom: -16,
                            width: 2,
                            bgcolor: 'divider'
                        }} />
                    )}
                    {/* Dot with Icon */}
                    <Box sx={{
                        position: 'absolute',
                        left: -28,
                        top: 0,
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        bgcolor: alpha(getActivityColor(activity.type), 0.1),
                        border: '2px solid',
                        borderColor: getActivityColor(activity.type),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: getActivityColor(activity.type),
                        zIndex: 1
                    }}>
                        {getActivityIcon(activity.type)}
                    </Box>
                    {/* Content */}
                    <Box sx={{ pl: 2, pt: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {activity.description}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {activity.timestamp}
                        </Typography>
                    </Box>
                </Box>
            ))}
        </Box>
    );
};

// =========================
// SKILL ENDORSEMENT COMPONENT
// =========================
const SkillEndorsement = ({ skill, level, onEndorse, isAdmin }) => {
    const theme = useTheme();
    const levels = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
    const levelIndex = levels.indexOf(level) + 1;
    
    return (
        <Box sx={{ 
            p: 1.5, 
            borderRadius: 2, 
            border: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            mb: 1,
            transition: 'all 0.2s',
            '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.02) }
        }}>
            <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{skill}</Typography>
                <Typography variant="caption" color="text.secondary">{level || 'Unrated'}</Typography>
            </Box>
            <Rating
                value={levelIndex}
                max={4}
                size="small"
                readOnly={!isAdmin}
                onChange={(e, newValue) => isAdmin && onEndorse?.(skill, levels[newValue - 1])}
                icon={<StarIcon sx={{ color: theme.palette.warning.main }} />}
                emptyIcon={<StarBorderIcon />}
            />
        </Box>
    );
};

// =========================
// TAB PANEL COMPONENT
// =========================
const TabPanel = ({ children, value, index, ...other }) => (
    <div role="tabpanel" hidden={value !== index} {...other}>
        {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
);

// =========================
// QUICK ACTION MODAL COMPONENTS
// =========================
const AssignToJobModal = ({ open, onClose, onSubmit, memberName, events }) => {
    const [selectedEvent, setSelectedEvent] = useState('');
    const [role, setRole] = useState('');

    const handleSubmit = () => {
        if (selectedEvent && role) {
            onSubmit({ eventId: selectedEvent, role });
            setSelectedEvent('');
            setRole('');
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Assign {memberName} to Job</DialogTitle>
            <DialogContent>
                <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
                    <InputLabel>Select Event</InputLabel>
                    <Select value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)} label="Select Event">
                        {events?.map(event => (
                            <MenuItem key={event.id} value={event.id}>
                                {event.eventName || event.name} - {event.eventDate || 'TBD'}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl fullWidth>
                    <InputLabel>Role in Event</InputLabel>
                    <Select value={role} onChange={(e) => setRole(e.target.value)} label="Role in Event">
                        <MenuItem value="photographer">Photographer</MenuItem>
                        <MenuItem value="videographer">Videographer</MenuItem>
                        <MenuItem value="editor">Editor</MenuItem>
                        <MenuItem value="assistant">Assistant</MenuItem>
                        <MenuItem value="lead">Team Lead</MenuItem>
                    </Select>
                </FormControl>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSubmit} variant="contained" disabled={!selectedEvent || !role}>
                    Assign
                </Button>
            </DialogActions>
        </Dialog>
    );
};

const IssueBonusModal = ({ open, onClose, onSubmit, memberName }) => {
    const [amount, setAmount] = useState('');
    const [type, setType] = useState('bonus');
    const [reason, setReason] = useState('');

    const handleSubmit = () => {
        if (amount && reason) {
            onSubmit({ amount: parseFloat(amount), type, reason });
            setAmount('');
            setType('bonus');
            setReason('');
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Issue {type === 'bonus' ? 'Bonus' : 'Deduction'} for {memberName}</DialogTitle>
            <DialogContent>
                <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
                    <InputLabel>Type</InputLabel>
                    <Select value={type} onChange={(e) => setType(e.target.value)} label="Type">
                        <MenuItem value="bonus">Bonus</MenuItem>
                        <MenuItem value="deduction">Deduction</MenuItem>
                    </Select>
                </FormControl>
                <TextField
                    fullWidth
                    label="Amount"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    sx={{ mb: 2 }}
                    InputProps={{ startAdornment: <Typography sx={{ mr: 1 }}>₹</Typography> }}
                />
                <TextField
                    fullWidth
                    label="Reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    multiline
                    rows={2}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSubmit} variant="contained" color={type === 'bonus' ? 'success' : 'error'} disabled={!amount || !reason}>
                    {type === 'bonus' ? 'Issue Bonus' : 'Apply Deduction'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

const SendMessageModal = ({ open, onClose, onSubmit, memberName }) => {
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('notification');

    const handleSubmit = () => {
        if (message) {
            onSubmit({ message, type: messageType });
            setMessage('');
            setMessageType('notification');
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Send Message to {memberName}</DialogTitle>
            <DialogContent>
                <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
                    <InputLabel>Message Type</InputLabel>
                    <Select value={messageType} onChange={(e) => setMessageType(e.target.value)} label="Message Type">
                        <MenuItem value="notification">Push Notification</MenuItem>
                        <MenuItem value="email">Email</MenuItem>
                        <MenuItem value="sms">SMS</MenuItem>
                    </Select>
                </FormControl>
                <TextField
                    fullWidth
                    label="Message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    multiline
                    rows={4}
                    placeholder="Enter your message..."
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSubmit} variant="contained" startIcon={<SendIcon />} disabled={!message}>
                    Send
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// =========================
// MAIN COMPONENT
// =========================
const TeamMemberWorkspacePage = () => {
    const { memberId } = useParams();
    const { claims } = useAuth();
    const navigate = useNavigate();
    const theme = useTheme();
    
    // Core state
    const [member, setMember] = useState(null);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(0);
    
    // Additional data states
    const [assignments, setAssignments] = useState([]);
    const [equipmentItems, setEquipmentItems] = useState([]);
    const [attendanceData, setAttendanceData] = useState([]);
    const [financialData, setFinancialData] = useState(null);
    const [events, setEvents] = useState([]);
    
    // Modal states
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isCancelLeaveDialogOpen, setIsCancelLeaveDialogOpen] = useState(false);
    const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
    const [isAssignJobModalOpen, setIsAssignJobModalOpen] = useState(false);
    const [isBonusModalOpen, setIsBonusModalOpen] = useState(false);
    const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
    const [selectedLeaveRequest, setSelectedLeaveRequest] = useState(null);

    const orgName = (claims && claims.orgName) || 'Your Organization';
    const orgId = (claims && claims.orgId) || '';
    const isAdmin = claims?.role === 'admin';

    // =========================
    // COMPUTED VALUES
    // =========================
    const stats = useMemo(() => {
        const totalDays = attendanceData.length || 30;
        const presentDays = attendanceData.filter(a => a.status === 'present' || a.status === 'checked-in').length;
        const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
        
        const currentAssignment = assignments.find(a => a.status === 'active' || a.status === 'ongoing');
        const openTasks = assignments.filter(a => a.status === 'pending' || a.status === 'in_progress').length;
        const checkedOutEquipment = equipmentItems.filter(e => e.status === 'checked_out').length;

        return {
            attendanceRate,
            presentDays,
            totalDays,
            currentAssignment: currentAssignment?.eventName || currentAssignment?.name || null,
            openTasks,
            checkedOutEquipment,
            completedTasks: assignments.filter(a => a.status === 'completed').length,
            totalAssignments: assignments.length
        };
    }, [attendanceData, assignments, equipmentItems]);

    // Helper function to format timestamps
    const formatActivityTimestamp = (date) => {
        if (!date || !(date instanceof Date) || isNaN(date)) return 'Unknown';
        
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    };

    // Build activity history from real data
    const activityHistory = useMemo(() => {
        const activities = [];
        
        // Add attendance activities (check-ins/check-outs)
        attendanceData.forEach(att => {
            if (att.checkInTime) {
                activities.push({
                    type: 'checkin',
                    description: `Checked in${att.location ? ` at ${att.location}` : ''}`,
                    timestamp: att.checkInTime?.toDate?.() || new Date(att.checkInTime),
                    rawDate: att.checkInTime?.toDate?.() || new Date(att.checkInTime)
                });
            }
            if (att.checkOutTime) {
                activities.push({
                    type: 'checkout',
                    description: `Checked out${att.location ? ` from ${att.location}` : ''}`,
                    timestamp: att.checkOutTime?.toDate?.() || new Date(att.checkOutTime),
                    rawDate: att.checkOutTime?.toDate?.() || new Date(att.checkOutTime)
                });
            }
        });

        // Add assignment activities
        assignments.forEach(assignment => {
            if (assignment.createdAt) {
                activities.push({
                    type: 'task',
                    description: `Assigned to: ${assignment.eventName || assignment.name || 'New Task'}`,
                    timestamp: assignment.createdAt?.toDate?.() || new Date(assignment.createdAt),
                    rawDate: assignment.createdAt?.toDate?.() || new Date(assignment.createdAt)
                });
            }
            if (assignment.completedAt) {
                activities.push({
                    type: 'review',
                    description: `Completed: ${assignment.eventName || assignment.name || 'Task'}`,
                    timestamp: assignment.completedAt?.toDate?.() || new Date(assignment.completedAt),
                    rawDate: assignment.completedAt?.toDate?.() || new Date(assignment.completedAt)
                });
            }
        });

        // Add equipment activities
        equipmentItems.forEach(item => {
            if (item.checkoutDate) {
                activities.push({
                    type: 'equipment',
                    description: `Checked out: ${item.name || 'Equipment'}`,
                    timestamp: item.checkoutDate?.toDate?.() || new Date(item.checkoutDate),
                    rawDate: item.checkoutDate?.toDate?.() || new Date(item.checkoutDate)
                });
            }
            if (item.returnDate) {
                activities.push({
                    type: 'equipment',
                    description: `Returned: ${item.name || 'Equipment'}`,
                    timestamp: item.returnDate?.toDate?.() || new Date(item.returnDate),
                    rawDate: item.returnDate?.toDate?.() || new Date(item.returnDate)
                });
            }
        });

        // Add leave request activities
        leaveRequests.forEach(leave => {
            activities.push({
                type: leave.status === 'approved' ? 'checkin' : leave.status === 'rejected' ? 'checkout' : 'task',
                description: `Leave ${leave.status}: ${leave.reason || 'Personal'} (${leave.startDate} - ${leave.endDate})`,
                timestamp: leave.createdAt?.toDate?.() || new Date(leave.createdAt || Date.now()),
                rawDate: leave.createdAt?.toDate?.() || new Date(leave.createdAt || Date.now())
            });
        });

        // Sort by date (most recent first) and format timestamps
        return activities
            .sort((a, b) => (b.rawDate?.getTime?.() || 0) - (a.rawDate?.getTime?.() || 0))
            .slice(0, 20)
            .map(activity => ({
                ...activity,
                timestamp: formatActivityTimestamp(activity.rawDate)
            }));
    }, [attendanceData, assignments, equipmentItems, leaveRequests]);

    // =========================
    // DATA FETCHING
    // =========================
    useEffect(() => {
        if (!claims?.orgId || !memberId) { setLoading(false); return; }
        
        // Member data subscription
        const unsubMember = onSnapshot(doc(db, 'organizations', claims.orgId, 'team', memberId), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                const employeeCode = data?.employeeCode || data?.profile?.employeeCode || null;
                setMember({ id: doc.id, ...data, employeeCode });
            } else {
                setMember(null);
            }
            setLoading(false);
        });

        // Leave requests subscription
        const leaveQuery = query(
            collection(db, 'organizations', claims.orgId, 'leaveRequests'), 
            where('userId', '==', memberId)
        );
        const unsubLeave = onSnapshot(leaveQuery, (snapshot) => 
            setLeaveRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
        );

        // Attendance data subscription
        const attendanceQuery = query(
            collection(db, 'organizations', claims.orgId, 'attendance'),
            where('userId', '==', memberId),
            orderBy('date', 'desc'),
            limit(30)
        );
        const unsubAttendance = onSnapshot(attendanceQuery, (snapshot) =>
            setAttendanceData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
        );

        // Assignments/tasks subscription
        const assignmentsQuery = query(
            collection(db, 'organizations', claims.orgId, 'assignments'),
            where('assignedTo', '==', memberId)
        );
        const unsubAssignments = onSnapshot(assignmentsQuery, (snapshot) =>
            setAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })))
        );

        // Fetch events for assignment modal
        const fetchEvents = async () => {
            try {
                const idToken = await auth.currentUser.getIdToken();
                const response = await fetch('/api/events/', {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    setEvents(Array.isArray(data) ? data : data.events || []);
                }
            } catch (e) {
                console.error('Failed to fetch events', e);
            }
        };
        fetchEvents();

        // Fetch equipment
        const fetchEquipment = async () => {
            try {
                const response = await equipmentAPI.getAll();
                const userEquipment = response.data.filter(e => e.checkedOutBy === memberId || e.assignedTo === memberId);
                setEquipmentItems(userEquipment);
            } catch (e) {
                console.error('Failed to fetch equipment', e);
            }
        };
        fetchEquipment();

        // Fetch financial data (admin only)
        if (isAdmin) {
            const fetchFinancial = async () => {
                try {
                    const idToken = await auth.currentUser.getIdToken();
                    const response = await fetch(`/api/financial/member/${memberId}/summary`, {
                        headers: { 'Authorization': `Bearer ${idToken}` }
                    });
                    if (response.ok) {
                        setFinancialData(await response.json());
                    }
                } catch (e) {
                    console.error('Failed to fetch financial data', e);
                }
            };
            fetchFinancial();
        }

        return () => { 
            unsubMember(); 
            unsubLeave(); 
            unsubAttendance();
            unsubAssignments();
        };
    }, [claims, memberId, isAdmin]);
    
    // =========================
    // API HELPERS
    // =========================
    const callApi = async (endpoint, method, body = null) => {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch(`/api${endpoint}`, {
            method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            ...(body && { body: JSON.stringify(body) }),
        });
        if (!response.ok) throw new Error((await response.json()).detail || 'An error occurred.');
        return response.json();
    };
    
    // =========================
    // HANDLERS
    // =========================
    const handleUpdateTeamMember = (id, data) => 
        toast.promise(callApi(`/team/members/${id}`, 'PUT', data), { 
            loading: 'Updating...', success: 'Member updated!', error: (err) => err.message 
        }).finally(() => setIsEditModalOpen(false));

    const handleDeleteTeamMember = () => 
        toast.promise(callApi(`/team/members/${member.id}`, 'DELETE'), { 
            loading: 'Deactivating...', success: 'Member deactivated.', error: (err) => err.message 
        }).finally(() => setIsDeleteDialogOpen(false));
    
    const handleCancelLeave = async () => {
        if (!selectedLeaveRequest) return;
        await toast.promise(
            callApi(`/leave-requests/${selectedLeaveRequest.id}/cancel`, 'PUT'),
            { loading: 'Cancelling leave...', success: 'Leave cancelled!', error: (err) => err.message }
        );
        setIsCancelLeaveDialogOpen(false);
        setSelectedLeaveRequest(null);
    };

    const handleRequestLeave = async (leaveData) => {
        const leaveDataWithName = { ...leaveData, userName: member.name, userId: memberId };
        await callApi('/leave-requests/', 'POST', leaveDataWithName);
        setIsLeaveModalOpen(false);
    };

    const handleAssignToJob = async (data) => {
        await toast.promise(
            callApi('/assignments/', 'POST', { ...data, assignedTo: memberId, assignedToName: member.name }),
            { loading: 'Assigning...', success: 'Assigned to job!', error: (err) => err.message }
        );
        setIsAssignJobModalOpen(false);
    };

    const handleIssueBonus = async (data) => {
        await toast.promise(
            callApi('/financial/adjustments/', 'POST', { ...data, memberId, memberName: member.name }),
            { loading: 'Processing...', success: `${data.type === 'bonus' ? 'Bonus' : 'Deduction'} applied!`, error: (err) => err.message }
        );
        setIsBonusModalOpen(false);
    };

    const handleSendMessage = async (data) => {
        await toast.promise(
            callApi('/messages/', 'POST', { ...data, recipientId: memberId, recipientName: member.name }),
            { loading: 'Sending...', success: 'Message sent!', error: (err) => err.message }
        );
        setIsMessageModalOpen(false);
    };

    const handleRegenerateID = () => {
        toast.success('ID Card regenerated!');
    };

    const handleEndorseSkill = async (skill, newLevel) => {
        const updatedSkills = (member.skillLevels || {})[skill] 
            ? { ...member.skillLevels, [skill]: newLevel }
            : { ...(member.skillLevels || {}), [skill]: newLevel };
        await handleUpdateTeamMember(member.id, { ...member, skillLevels: updatedSkills });
    };

    const getStatusChip = (status) => {
        const colorMap = {
            'approved': 'success',
            'rejected': 'error', 
            'cancelled': 'error',
            'pending': 'warning',
            'completed': 'success',
            'active': 'primary',
            'in_progress': 'info'
        };
        return <Chip label={status} size="small" color={colorMap[status] || 'default'} />;
    };

    // =========================
    // LOADING & ERROR STATES
    // =========================
    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!member) {
        return (
            <Container>
                <Paper sx={{ p: 4, textAlign: 'center', mt: 4 }}>
                    <WarningIcon sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
                    <Typography variant="h5" color="error" gutterBottom>Team member not found</Typography>
                    <Button variant="contained" onClick={() => navigate('/team')} sx={{ mt: 2 }}>
                        Back to Team
                    </Button>
                </Paper>
            </Container>
        );
    }

    // Determine duty status
    const isOnDuty = attendanceData[0]?.status === 'checked-in' || attendanceData[0]?.status === 'present';
    const isVerified = member.verified || member.documentsVerified;

    // =========================
    // RENDER
    // =========================
    return (
        <Container maxWidth="xl" sx={{ mt: 3, mb: 4 }}>
            {/* Breadcrumbs */}
            <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 3 }}>
                <Link component={RouterLink} underline="hover" color="inherit" to="/team">Team</Link>
                <Typography color="text.primary" sx={{ fontWeight: 600 }}>{member.name}</Typography>
            </Breadcrumbs>

            {/* ==================== HERO SECTION ==================== */}
            <Paper 
                elevation={0} 
                sx={{ 
                    p: 3, 
                    mb: 3, 
                    borderRadius: 3,
                    background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.05)} 0%, ${alpha(theme.palette.secondary.main, 0.05)} 100%)`,
                    border: '1px solid',
                    borderColor: 'divider'
                }}
            >
                <Grid container spacing={3} alignItems="center">
                    {/* Profile Info */}
                    <Grid size={{ xs: 12, md: 4 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Badge
                                overlap="circular"
                                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                                badgeContent={
                                    <Box sx={{
                                        width: 16,
                                        height: 16,
                                        borderRadius: '50%',
                                        bgcolor: isOnDuty ? 'success.main' : 'grey.400',
                                        border: '2px solid white',
                                        animation: isOnDuty ? 'pulse 2s infinite' : 'none',
                                        '@keyframes pulse': {
                                            '0%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0.7)' },
                                            '70%': { boxShadow: '0 0 0 8px rgba(76, 175, 80, 0)' },
                                            '100%': { boxShadow: '0 0 0 0 rgba(76, 175, 80, 0)' }
                                        }
                                    }} />
                                }
                            >
                                <Avatar 
                                    src={member.profilePhoto} 
                                    sx={{ width: 80, height: 80, border: '3px solid', borderColor: 'primary.main' }}
                                >
                                    {member.name?.charAt(0)}
                                </Avatar>
                            </Badge>
                            <Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{member.name}</Typography>
                                    {isVerified && (
                                        <Tooltip title="Verified Member">
                                            <VerifiedIcon sx={{ fontSize: 20, color: 'primary.main' }} />
                                        </Tooltip>
                                    )}
                                </Box>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip 
                                        label={member.role} 
                                        color="primary" 
                                        size="small" 
                                        sx={{ fontWeight: 600 }}
                                    />
                                    <Chip 
                                        icon={<CircleIcon sx={{ fontSize: '10px !important' }} />}
                                        label={isOnDuty ? 'On Duty' : 'Off Duty'} 
                                        color={isOnDuty ? 'success' : 'default'}
                                        size="small"
                                        variant="outlined"
                                    />
                                    <Chip 
                                        label={member.employeeCode ? `ID: ${member.employeeCode}` : 'ID Pending'} 
                                        color={member.employeeCode ? 'default' : 'warning'}
                                        size="small"
                                        variant="outlined"
                                    />
                                </Stack>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    {member.email}
                                </Typography>
                            </Box>
                        </Box>
                    </Grid>

                    {/* Quick Stats */}
                    <Grid size={{ xs: 12, md: 8 }}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 6, sm: 3 }}>
                                <StatCard
                                    icon={<CheckCircleIcon />}
                                    title="Attendance"
                                    value={`${stats.attendanceRate}%`}
                                    subtitle={`${stats.presentDays}/${stats.totalDays} days`}
                                    color={theme.palette.success.main}
                                    onClick={() => setActiveTab(0)}
                                />
                            </Grid>
                            <Grid size={{ xs: 6, sm: 3 }}>
                                <StatCard
                                    icon={<EventIcon />}
                                    title="Current Job"
                                    value={stats.currentAssignment ? '1' : '0'}
                                    subtitle={stats.currentAssignment || 'Not assigned'}
                                    color={theme.palette.primary.main}
                                    onClick={() => setActiveTab(1)}
                                />
                            </Grid>
                            <Grid size={{ xs: 6, sm: 3 }}>
                                <StatCard
                                    icon={<AssignmentIcon />}
                                    title="Open Tasks"
                                    value={stats.openTasks}
                                    subtitle={`${stats.completedTasks} completed`}
                                    color={theme.palette.warning.main}
                                    onClick={() => setActiveTab(1)}
                                />
                            </Grid>
                            <Grid size={{ xs: 6, sm: 3 }}>
                                <StatCard
                                    icon={<InventoryIcon />}
                                    title="Equipment"
                                    value={stats.checkedOutEquipment}
                                    subtitle="Items checked out"
                                    color={theme.palette.info.main}
                                    onClick={() => setActiveTab(2)}
                                />
                            </Grid>
                        </Grid>
                    </Grid>
                </Grid>
            </Paper>

            {/* ==================== MAIN CONTENT GRID ==================== */}
            <Grid container spacing={3}>
                {/* LEFT COLUMN - Fixed */}
                <Grid size={{ xs: 12, md: 4, lg: 3 }}>
                    <Box sx={{ position: 'sticky', top: 20 }}>
                        {/* ID Card */}
                        <Paper sx={{ p: 2, mb: 3, borderRadius: 3 }}>
                            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <BadgeIcon /> ID Card
                            </Typography>
                            <TeamMemberIDCard
                                member={{
                                    userId: member.id || member.userId,
                                    employeeCode: member.employeeCode,
                                    name: member.name,
                                    email: member.email,
                                    role: member.role,
                                    phone: member.phone,
                                    profilePhoto: member.profilePhoto,
                                    skills: member.skills || [],
                                    availability: isOnDuty
                                }}
                                orgName={orgName}
                                orgId={orgId}
                                showActions
                            />
                        </Paper>

                        {/* Quick Actions */}
                        <Paper sx={{ p: 2, mb: 3, borderRadius: 3 }}>
                            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Quick Actions</Typography>
                            <Stack spacing={1}>
                                <Button 
                                    variant="contained" 
                                    startIcon={<WorkIcon />} 
                                    fullWidth 
                                    onClick={() => setIsAssignJobModalOpen(true)}
                                    sx={{ justifyContent: 'flex-start', borderRadius: 2 }}
                                >
                                    Assign to Job
                                </Button>
                                {isAdmin && (
                                    <Button 
                                        variant="outlined" 
                                        startIcon={<BonusIcon />} 
                                        fullWidth 
                                        onClick={() => setIsBonusModalOpen(true)}
                                        sx={{ justifyContent: 'flex-start', borderRadius: 2 }}
                                    >
                                        Issue Bonus/Deduction
                                    </Button>
                                )}
                                <Button 
                                    variant="outlined" 
                                    startIcon={<MessageIcon />} 
                                    fullWidth 
                                    onClick={() => setIsMessageModalOpen(true)}
                                    sx={{ justifyContent: 'flex-start', borderRadius: 2 }}
                                >
                                    Send Message
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    startIcon={<BadgeIcon />} 
                                    fullWidth 
                                    onClick={handleRegenerateID}
                                    sx={{ justifyContent: 'flex-start', borderRadius: 2 }}
                                >
                                    Regenerate ID
                                </Button>
                            </Stack>
                            <Divider sx={{ my: 2 }} />
                            <Stack spacing={1}>
                                <Button 
                                    variant="outlined" 
                                    startIcon={<EditIcon />} 
                                    fullWidth 
                                    onClick={() => setIsEditModalOpen(true)}
                                    sx={{ justifyContent: 'flex-start', borderRadius: 2 }}
                                >
                                    Edit Member
                                </Button>
                                <Button 
                                    variant="outlined" 
                                    color="error" 
                                    startIcon={<DoNotDisturbOnIcon />} 
                                    fullWidth 
                                    onClick={() => setIsDeleteDialogOpen(true)}
                                    sx={{ justifyContent: 'flex-start', borderRadius: 2 }}
                                >
                                    Deactivate
                                </Button>
                            </Stack>
                        </Paper>

                        {/* Skills with Endorsements */}
                        <Paper sx={{ p: 2, borderRadius: 3 }}>
                            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Skills & Endorsements</Typography>
                            {member.skills?.length > 0 ? (
                                member.skills.map(skill => (
                                    <SkillEndorsement 
                                        key={skill}
                                        skill={skill}
                                        level={member.skillLevels?.[skill] || 'Beginner'}
                                        onEndorse={handleEndorseSkill}
                                        isAdmin={isAdmin}
                                    />
                                ))
                            ) : (
                                <Typography color="text.secondary" variant="body2">No skills added yet</Typography>
                            )}
                        </Paper>
                    </Box>
                </Grid>

                {/* RIGHT COLUMN - Scrollable Tabbed Content */}
                <Grid size={{ xs: 12, md: 8, lg: 9 }}>
                    <Paper sx={{ borderRadius: 3 }}>
                        <Tabs 
                            value={activeTab} 
                            onChange={(e, v) => setActiveTab(v)}
                            sx={{ 
                                borderBottom: 1, 
                                borderColor: 'divider',
                                px: 2,
                                '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 }
                            }}
                        >
                            <Tab icon={<PersonIcon />} iconPosition="start" label="Overview" />
                            <Tab icon={<WorkIcon />} iconPosition="start" label="Assignments" />
                            <Tab icon={<InventoryIcon />} iconPosition="start" label="Equipment" />
                            {isAdmin && <Tab icon={<MoneyIcon />} iconPosition="start" label="Financial" />}
                            <Tab icon={<DocumentIcon />} iconPosition="start" label="Documents" />
                        </Tabs>

                        {/* TAB 0: Overview */}
                        <TabPanel value={activeTab} index={0}>
                            <Box sx={{ p: 2 }}>
                                <Grid container spacing={3}>
                                    {/* Activity History - Full Width */}
                                    <Grid size={12}>
                                        <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <HistoryIcon /> Activity History
                                        </Typography>
                                        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, maxHeight: 400, overflow: 'auto' }}>
                                            <ActivityTimeline activities={activityHistory} />
                                        </Paper>
                                    </Grid>

                                    {/* Leave History */}
                                    <Grid size={12}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                            <Typography variant="h6" sx={{ fontWeight: 600 }}>Leave History</Typography>
                                            <Button 
                                                variant="contained" 
                                                size="small" 
                                                startIcon={<AddCircleOutlineIcon />} 
                                                onClick={() => setIsLeaveModalOpen(true)}
                                                sx={{ borderRadius: 2, textTransform: 'none' }}
                                            >
                                                Request Leave
                                            </Button>
                                        </Box>
                                        <TableContainer>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Start Date</TableCell>
                                                        <TableCell>End Date</TableCell>
                                                        <TableCell>Reason</TableCell>
                                                        <TableCell>Status</TableCell>
                                                        <TableCell align="right">Actions</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {leaveRequests.length > 0 ? leaveRequests.map(req => (
                                                        <TableRow key={req.id}>
                                                            <TableCell>{req.startDate}</TableCell>
                                                            <TableCell>{req.endDate}</TableCell>
                                                            <TableCell>{req.reason}</TableCell>
                                                            <TableCell>{getStatusChip(req.status)}</TableCell>
                                                            <TableCell align="right">
                                                                {req.status === 'approved' && (
                                                                    <Button size="small" color="warning" onClick={() => { 
                                                                        setSelectedLeaveRequest(req); 
                                                                        setIsCancelLeaveDialogOpen(true); 
                                                                    }}>
                                                                        Cancel
                                                                    </Button>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    )) : (
                                                        <TableRow>
                                                            <TableCell colSpan={5} align="center">
                                                                <Typography color="text.secondary">No leave requests</Typography>
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    </Grid>
                                </Grid>
                            </Box>
                        </TabPanel>

                        {/* TAB 1: Assignments */}
                        <TabPanel value={activeTab} index={1}>
                            <Box sx={{ p: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 600 }}>Job Assignments</Typography>
                                    <Button 
                                        variant="contained" 
                                        size="small" 
                                        startIcon={<AddCircleOutlineIcon />}
                                        onClick={() => setIsAssignJobModalOpen(true)}
                                        sx={{ borderRadius: 2 }}
                                    >
                                        New Assignment
                                    </Button>
                                </Box>
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Event/Job</TableCell>
                                                <TableCell>Role</TableCell>
                                                <TableCell>Date</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell align="right">Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {assignments.length > 0 ? assignments.map(assignment => (
                                                <TableRow key={assignment.id}>
                                                    <TableCell>
                                                        <Typography fontWeight={500}>{assignment.eventName || assignment.name}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{assignment.clientName}</Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip label={assignment.role} size="small" variant="outlined" />
                                                    </TableCell>
                                                    <TableCell>{assignment.eventDate || assignment.date}</TableCell>
                                                    <TableCell>{getStatusChip(assignment.status)}</TableCell>
                                                    <TableCell align="right">
                                                        <Button size="small" onClick={() => navigate(`/events/${assignment.eventId}/postprod`)}>
                                                            View
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                                        <WorkIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                                        <Typography color="text.secondary">No assignments found</Typography>
                                                        <Button 
                                                            variant="outlined" 
                                                            size="small" 
                                                            sx={{ mt: 1 }}
                                                            onClick={() => setIsAssignJobModalOpen(true)}
                                                        >
                                                            Create First Assignment
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        </TabPanel>

                        {/* TAB 2: Equipment */}
                        <TabPanel value={activeTab} index={2}>
                            <Box sx={{ p: 2 }}>
                                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>Checked Out Equipment</Typography>
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Equipment</TableCell>
                                                <TableCell>Category</TableCell>
                                                <TableCell>Checked Out</TableCell>
                                                <TableCell>Due Date</TableCell>
                                                <TableCell>Status</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {equipmentItems.length > 0 ? equipmentItems.map(item => (
                                                <TableRow key={item.id}>
                                                    <TableCell>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <InventoryIcon color="action" />
                                                            <Box>
                                                                <Typography fontWeight={500}>{item.name}</Typography>
                                                                <Typography variant="caption" color="text.secondary">{item.serialNumber}</Typography>
                                                            </Box>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>{item.category}</TableCell>
                                                    <TableCell>{item.checkoutDate || '-'}</TableCell>
                                                    <TableCell>{item.dueDate || 'N/A'}</TableCell>
                                                    <TableCell>{getStatusChip(item.status)}</TableCell>
                                                </TableRow>
                                            )) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                                        <InventoryIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                                                        <Typography color="text.secondary">No equipment checked out</Typography>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        </TabPanel>

                        {/* TAB 3: Financial (Admin Only) */}
                        {isAdmin && (
                            <TabPanel value={activeTab} index={3}>
                                <Box sx={{ p: 2 }}>
                                    <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>Financial Overview</Typography>
                                    <Grid container spacing={3}>
                                        <Grid size={{ xs: 12, sm: 4 }}>
                                            <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                                                <Typography variant="h4" color="success.main" fontWeight={700}>
                                                    ₹{financialData?.totalEarnings?.toLocaleString() || '0'}
                                                </Typography>
                                                <Typography color="text.secondary">Total Earnings</Typography>
                                            </Card>
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 4 }}>
                                            <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                                                <Typography variant="h4" color="warning.main" fontWeight={700}>
                                                    ₹{financialData?.pendingPayout?.toLocaleString() || '0'}
                                                </Typography>
                                                <Typography color="text.secondary">Pending Payout</Typography>
                                            </Card>
                                        </Grid>
                                        <Grid size={{ xs: 12, sm: 4 }}>
                                            <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                                                <Typography variant="h4" color="primary.main" fontWeight={700}>
                                                    ₹{financialData?.lastPayout?.toLocaleString() || '0'}
                                                </Typography>
                                                <Typography color="text.secondary">Last Payout</Typography>
                                            </Card>
                                        </Grid>
                                    </Grid>
                                    
                                    <Typography variant="h6" sx={{ mt: 4, mb: 2, fontWeight: 600 }}>Recent Transactions</Typography>
                                    <TableContainer>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Date</TableCell>
                                                    <TableCell>Description</TableCell>
                                                    <TableCell>Type</TableCell>
                                                    <TableCell align="right">Amount</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {financialData?.recentTransactions?.length > 0 ? (
                                                    financialData.recentTransactions.map((tx, i) => (
                                                        <TableRow key={i}>
                                                            <TableCell>{tx.date}</TableCell>
                                                            <TableCell>{tx.description}</TableCell>
                                                            <TableCell>
                                                                <Chip 
                                                                    label={tx.type} 
                                                                    size="small" 
                                                                    color={tx.type === 'credit' ? 'success' : 'error'}
                                                                />
                                                            </TableCell>
                                                            <TableCell align="right" sx={{ 
                                                                color: tx.type === 'credit' ? 'success.main' : 'error.main',
                                                                fontWeight: 600
                                                            }}>
                                                                {tx.type === 'credit' ? '+' : '-'}₹{tx.amount?.toLocaleString()}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                ) : (
                                                    <TableRow>
                                                        <TableCell colSpan={4} align="center">
                                                            <Typography color="text.secondary">No transactions found</Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Box>
                            </TabPanel>
                        )}

                        {/* TAB 4: Documents */}
                        <TabPanel value={activeTab} index={isAdmin ? 4 : 3}>
                            <Box sx={{ p: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Typography variant="h6" sx={{ fontWeight: 600 }}>Documents & Files</Typography>
                                    <Button variant="outlined" startIcon={<CloudUploadIcon />} sx={{ borderRadius: 2 }}>
                                        Upload Document
                                    </Button>
                                </Box>
                                <Grid container spacing={2}>
                                    {[
                                        { name: 'ID Proof', status: 'verified', date: 'Uploaded Nov 10, 2024' },
                                        { name: 'Contract', status: 'pending', date: 'Uploaded Nov 5, 2024' },
                                        { name: 'Tax Form (W-9)', status: 'verified', date: 'Uploaded Oct 20, 2024' }
                                    ].map((doc, i) => (
                                        <Grid size={{ xs: 12, sm: 6, md: 4 }} key={i}>
                                            <Card variant="outlined" sx={{ p: 2 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                                                    <DocumentIcon color="primary" />
                                                    <Box sx={{ flex: 1 }}>
                                                        <Typography fontWeight={600}>{doc.name}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{doc.date}</Typography>
                                                    </Box>
                                                    <Chip 
                                                        label={doc.status} 
                                                        size="small" 
                                                        color={doc.status === 'verified' ? 'success' : 'warning'}
                                                    />
                                                </Box>
                                            </Card>
                                        </Grid>
                                    ))}
                                </Grid>
                            </Box>
                        </TabPanel>
                    </Paper>
                </Grid>
            </Grid>

            {/* ==================== MODALS ==================== */}
            {member && <EditTeamMemberModal open={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} onSubmit={handleUpdateTeamMember} member={member} />}
            {member && <DeleteConfirmationDialog open={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} onConfirm={handleDeleteTeamMember} clientName={member.name} />}
            {selectedLeaveRequest && <DeleteConfirmationDialog open={isCancelLeaveDialogOpen} onClose={() => setIsCancelLeaveDialogOpen(false)} onConfirm={handleCancelLeave} clientName={`leave for ${member.name}`} />}
            <RequestLeaveModal open={isLeaveModalOpen} onClose={() => setIsLeaveModalOpen(false)} onSubmit={handleRequestLeave} />
            <AssignToJobModal 
                open={isAssignJobModalOpen} 
                onClose={() => setIsAssignJobModalOpen(false)} 
                onSubmit={handleAssignToJob}
                memberName={member.name}
                events={events}
            />
            <IssueBonusModal
                open={isBonusModalOpen}
                onClose={() => setIsBonusModalOpen(false)}
                onSubmit={handleIssueBonus}
                memberName={member.name}
            />
            <SendMessageModal
                open={isMessageModalOpen}
                onClose={() => setIsMessageModalOpen(false)}
                onSubmit={handleSendMessage}
                memberName={member.name}
            />
        </Container>
    );
};

export default TeamMemberWorkspacePage;
