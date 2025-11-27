import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import {
    Box, Typography, Button, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Paper, CircularProgress, Chip, Link,
    IconButton, Menu, MenuItem, ButtonGroup, Stack, Tabs, Tab, Badge, TextField,
    InputAdornment, Select, FormControl, InputLabel, Card, CardContent, Grid, alpha
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import PeopleIcon from '@mui/icons-material/People';
import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import BadgeIcon from '@mui/icons-material/Badge';
import FilterListIcon from '@mui/icons-material/FilterList';
import toast from 'react-hot-toast';
import AddTeamMemberModal from '../components/AddTeamMemberModal';
import EditTeamMemberModal from '../components/EditTeamMemberModal';
import DeleteConfirmationDialog from '../components/DeleteConfirmationDialog';
import AdminLayout from '../components/layout/AdminLayout';

const TeamManagementPage = () => {
    const { claims } = useAuth();
    const [team, setTeam] = useState([]);
    const [deletedTeam, setDeletedTeam] = useState([]);
    const [invites, setInvites] = useState([]);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Tab state
    const [activeTab, setActiveTab] = useState(0);
    
    // Search and filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deleteMode, setDeleteMode] = useState(null); // 'soft' | 'invite' | 'permanent'
    
    const [selectedItem, setSelectedItem] = useState(null);
    const [anchorEl, setAnchorEl] = useState(null);

    // Get unique roles from team members
    const uniqueRoles = useMemo(() => {
        const roles = new Set(team.map(m => m.role).filter(Boolean));
        return ['all', ...Array.from(roles)];
    }, [team]);

    // Filter team members based on search and filters
    const filteredTeam = useMemo(() => {
        return team.filter(member => {
            const matchesSearch = searchQuery === '' || 
                member.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                member.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                member.employeeCode?.toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesRole = roleFilter === 'all' || member.role === roleFilter;
            const matchesStatus = statusFilter === 'all' || 
                (statusFilter === 'available' && member.availability) ||
                (statusFilter === 'unavailable' && !member.availability);
            
            return matchesSearch && matchesRole && matchesStatus;
        });
    }, [team, searchQuery, roleFilter, statusFilter]);

    // Filter invites based on search
    const filteredInvites = useMemo(() => {
        return invites.filter(invite => {
            if (invite.status !== 'pending') return false;
            const matchesSearch = searchQuery === '' || 
                invite.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                invite.email?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRole = roleFilter === 'all' || invite.role === roleFilter;
            return matchesSearch && matchesRole;
        });
    }, [invites, searchQuery, roleFilter]);

    // Filter deleted team based on search
    const filteredDeletedTeam = useMemo(() => {
        return deletedTeam.filter(member => {
            const matchesSearch = searchQuery === '' || 
                member.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                member.email?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesRole = roleFilter === 'all' || member.role === roleFilter;
            return matchesSearch && matchesRole;
        });
    }, [deletedTeam, searchQuery, roleFilter]);

    // KPI calculations
    const kpiData = useMemo(() => {
        const pendingInvites = invites.filter(i => i.status === 'pending').length;
        const missingIds = team.filter(m => !m.employeeCode).length;
        const onLeaveToday = leaveRequests.length; // pending leave requests
        
        return {
            totalHeadcount: team.length,
            onLeave: onLeaveToday,
            pendingInvites,
            missingIds
        };
    }, [team, invites, leaveRequests]);

    useEffect(() => {
        if (!claims?.orgId) { setLoading(false); return; }
        
        const mapMember = (doc) => {
            const data = doc.data();
            const employeeCode = data?.employeeCode || data?.profile?.employeeCode || null;
            return { ...data, id: doc.id, employeeCode };
        };

        const unsubTeam = onSnapshot(collection(db, 'organizations', claims.orgId, 'team'), (snap) => setTeam(snap.docs.map(mapMember)));
        const unsubDeleted = onSnapshot(collection(db, 'organizations', claims.orgId, 'deleted_team'), (snap) => setDeletedTeam(snap.docs.map(mapMember)));
        const unsubInvites = onSnapshot(collection(db, 'organizations', claims.orgId, 'invites'), (snap) => setInvites(snap.docs.map(d => ({...d.data(), id: d.id}))));
        const unsubLeave = onSnapshot(query(collection(db, 'organizations', claims.orgId, 'leaveRequests'), where("status", "==", "pending")), (snap) => setLeaveRequests(snap.docs.map(d => ({...d.data(), id: d.id}))));

        setLoading(false);
        return () => { unsubTeam(); unsubDeleted(); unsubInvites(); unsubLeave(); };
    }, [claims]);

    const handleMenuClick = (event, item) => { setAnchorEl(event.currentTarget); setSelectedItem(item); };
    const handleMenuClose = (clearSelection = false) => {
        setAnchorEl(null);
        if (clearSelection) {
            setSelectedItem(null);
        }
    };
    
    const copyInviteLink = () => {
        const joinUrl = `${window.location.origin}/join/${selectedItem.orgId}/${selectedItem.id}`;
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(joinUrl);
            toast.success('Invite link copied!');
        } else {
            toast.error('Clipboard not supported in this environment.');
        }
        handleMenuClose();
    };

    const callApi = async (endpoint, method, body = null) => {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch(`/api${endpoint}`, {
            method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            ...(body && { body: JSON.stringify(body) }),
        });
        if (!response.ok) throw new Error((await response.json()).detail || 'An error occurred.');
        return response.json();
    };

    const handleCreateInvite = (data) => callApi('/team/invites', 'POST', data);
    const handleUpdateTeamMember = (id, data) => toast.promise(callApi(`/team/members/${id}`, 'PUT', data), { loading: 'Updating...', success: 'Member updated!', error: (err) => err.message });

    const closeDeleteDialog = () => {
        setIsDeleteDialogOpen(false);
        setDeleteMode(null);
        setSelectedItem(null);
        handleMenuClose(true);
    };

    const handleConfirmDelete = () => {
        if (!selectedItem || !deleteMode) return;

        if (deleteMode === 'soft') {
            return toast.promise(
                callApi(`/team/members/${selectedItem.id}`, 'DELETE'),
                {
                    loading: 'Moving teammate to deleted list...',
                    success: 'Teammate moved to deleted list.',
                    error: (err) => err.message
                }
            ).finally(closeDeleteDialog);
        }

        if (deleteMode === 'invite') {
            return toast.promise(
                callApi(`/team/invites/${selectedItem.id}`, 'DELETE'),
                {
                    loading: 'Deleting invite...',
                    success: 'Invite deleted.',
                    error: (err) => err.message
                }
            ).finally(closeDeleteDialog);
        }

        if (deleteMode === 'permanent') {
            return toast.promise(
                callApi(`/team/deleted/${selectedItem.id}`, 'DELETE'),
                {
                    loading: 'Deleting teammate permanently...',
                    success: 'Teammate deleted permanently.',
                    error: (err) => err.message
                }
            ).finally(closeDeleteDialog);
        }

        return closeDeleteDialog();
    };
    
    const handleLeaveRequest = (requestId, action) => {
        const promise = callApi(`/leave-requests/${requestId}/${action}`, 'PUT');
        toast.promise(promise, {
            loading: `${action === 'approve' ? 'Approving' : 'Rejecting'}...`,
            success: `Request ${action}d!`,
            error: (err) => err.message,
        });
    };
    
    // Helper to get member name by userId
    const getMemberName = (userId) => {
        const member = team.find(m => m.id === userId);
        return member ? member.name : 'Unknown';
    };
    const isAdmin = claims?.role === 'admin';

    const headerActions = [
        <Button key="invite" variant="contained" onClick={() => setIsAddModalOpen(true)}>
            Invite New Team Member
        </Button>,
    ];

    // KPI Card Component
    const KPICard = ({ icon: Icon, title, value, subtitle, color, alertColor }) => (
        <Card 
            sx={{ 
                height: '100%',
                background: `linear-gradient(135deg, ${alpha(color, 0.1)} 0%, ${alpha(color, 0.05)} 100%)`,
                border: `1px solid ${alpha(color, 0.2)}`,
                borderRadius: 3,
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: `0 8px 25px ${alpha(color, 0.15)}`
                }
            }}
        >
            <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Box>
                        <Typography variant="body2" color="text.secondary" fontWeight={500} gutterBottom>
                            {title}
                        </Typography>
                        <Typography variant="h3" fontWeight={700} sx={{ color, mb: 0.5 }}>
                            {value}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {subtitle}
                        </Typography>
                    </Box>
                    <Box 
                        sx={{ 
                            p: 1.5, 
                            borderRadius: 2, 
                            bgcolor: alpha(color, 0.1),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <Icon sx={{ fontSize: 28, color }} />
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );

    // Tab label with badge
    const TabLabel = ({ label, count, showBadge, badgeColor = 'error' }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {label}
            {showBadge && count > 0 && (
                <Chip 
                    label={count} 
                    size="small" 
                    color={badgeColor}
                    sx={{ 
                        height: 20, 
                        minWidth: 20, 
                        fontSize: '0.75rem',
                        fontWeight: 600
                    }} 
                />
            )}
        </Box>
    );

    // Render Roster Tab Content
    const renderRosterTab = () => (
        <TableContainer component={Paper} sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Table>
                <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Employee ID</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Skills</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {filteredTeam.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7}>
                                <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                                    {team.length === 0 
                                        ? 'No team members yet. Invite someone to get started.'
                                        : 'No team members match your search criteria.'}
                                </Typography>
                            </TableCell>
                        </TableRow>
                    ) : (
                        filteredTeam.map((member) => (
                            <TableRow key={member.id} hover>
                                <TableCell>
                                    <Link component={RouterLink} to={`/team/${member.id}`} underline="hover" fontWeight={500}>
                                        {member.name}
                                    </Link>
                                </TableCell>
                                <TableCell>{member.email}</TableCell>
                                <TableCell>
                                    <Chip label={member.role} size="small" variant="outlined" />
                                </TableCell>
                                <TableCell>
                                    {member.employeeCode ? (
                                        <Chip label={member.employeeCode} color="success" size="small" sx={{ fontWeight: 600 }} />
                                    ) : (
                                        <Chip label="Unassigned" color="warning" size="small" />
                                    )}
                                </TableCell>
                                <TableCell>
                                    {member.skills?.length ? (
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                            {member.skills.slice(0, 3).map((skill) => (
                                                <Chip key={skill} label={skill} size="small" sx={{ fontSize: '0.7rem' }} />
                                            ))}
                                            {member.skills.length > 3 && (
                                                <Chip label={`+${member.skills.length - 3}`} size="small" variant="outlined" />
                                            )}
                                        </Box>
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">—</Typography>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Chip 
                                        label={member.availability ? 'Available' : 'Unavailable'}
                                        color={member.availability ? 'success' : 'default'}
                                        size="small"
                                        sx={{ fontWeight: 500 }}
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <IconButton onClick={(e) => handleMenuClick(e, member)} size="small">
                                        <MoreVertIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );

    // Render Pending Invites Tab Content
    const renderInvitesTab = () => (
        <TableContainer component={Paper} sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Table>
                <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Invited</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {filteredInvites.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5}>
                                <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                                    No pending invitations. Send one to grow your team.
                                </Typography>
                            </TableCell>
                        </TableRow>
                    ) : (
                        filteredInvites.map((invite) => (
                            <TableRow key={invite.id} hover>
                                <TableCell fontWeight={500}>{invite.name}</TableCell>
                                <TableCell>{invite.email}</TableCell>
                                <TableCell>
                                    <Chip label={invite.role} size="small" variant="outlined" />
                                </TableCell>
                                <TableCell>
                                    {invite.createdAt?.seconds
                                        ? new Date(invite.createdAt.seconds * 1000).toLocaleDateString()
                                        : '—'}
                                </TableCell>
                                <TableCell align="right">
                                    <IconButton onClick={(e) => handleMenuClick(e, invite)} size="small">
                                        <MoreVertIcon />
                                    </IconButton>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );

    // Render Leave Requests Tab Content
    const renderLeaveRequestsTab = () => (
        <TableContainer component={Paper} sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Table>
                <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 600 }}>Team Member</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Start Date</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>End Date</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Reason</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {leaveRequests.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5}>
                                <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                                    No pending leave requests right now. 🎉
                                </Typography>
                            </TableCell>
                        </TableRow>
                    ) : (
                        leaveRequests.map((req) => {
                            let displayName = req.userName;
                            if (!displayName && req.userId) {
                                displayName = getMemberName(req.userId);
                            }
                            if (!displayName) displayName = 'Unknown';
                            return (
                                <TableRow key={req.id} hover>
                                    <TableCell fontWeight={500}>{displayName}</TableCell>
                                    <TableCell>{req.startDate}</TableCell>
                                    <TableCell>{req.endDate}</TableCell>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {req.reason}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <ButtonGroup variant="contained" size="small" disableElevation>
                                            <Button 
                                                color="success" 
                                                onClick={() => handleLeaveRequest(req.id, 'approve')}
                                                sx={{ textTransform: 'none' }}
                                            >
                                                Approve
                                            </Button>
                                            <Button 
                                                color="error" 
                                                onClick={() => handleLeaveRequest(req.id, 'reject')}
                                                sx={{ textTransform: 'none' }}
                                            >
                                                Reject
                                            </Button>
                                        </ButtonGroup>
                                    </TableCell>
                                </TableRow>
                            );
                        })
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );

    // Render Archive/Deleted Tab Content
    const renderDeletedTab = () => (
        <TableContainer component={Paper} sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Table>
                <TableHead>
                    <TableRow sx={{ bgcolor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Deleted At</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {filteredDeletedTeam.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5}>
                                <Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>
                                    No archived teammates.
                                </Typography>
                            </TableCell>
                        </TableRow>
                    ) : (
                        filteredDeletedTeam.map((member) => (
                            <TableRow key={member.id} hover>
                                <TableCell>{member.name}</TableCell>
                                <TableCell>{member.email}</TableCell>
                                <TableCell>
                                    <Chip label={member.role} size="small" variant="outlined" />
                                </TableCell>
                                <TableCell>
                                    {member.deletedAt?.seconds
                                        ? new Date(member.deletedAt.seconds * 1000).toLocaleString()
                                        : '—'}
                                </TableCell>
                                <TableCell align="right">
                                    <Button
                                        color="error"
                                        size="small"
                                        variant="outlined"
                                        onClick={() => {
                                            setSelectedItem(member);
                                            setDeleteMode('permanent');
                                            setIsDeleteDialogOpen(true);
                                        }}
                                    >
                                        Delete Permanently
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );

    if (loading) {
        return (
            <AdminLayout
                appBarTitle="Team Operations"
                pageTitle="Team Management"
                pageSubtitle="Monitor teammates and manage your roster."
            >
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 320 }}>
                    <CircularProgress />
                </Box>
            </AdminLayout>
        );
    }

    if (!isAdmin) {
        return (
            <AdminLayout
                appBarTitle="Team Operations"
                pageTitle="Access Denied"
                pageSubtitle="You need administrator privileges to manage teammates."
                actions={[
                    <Button key="dashboard" variant="outlined" component={RouterLink} to="/dashboard">
                        Return to Dashboard
                    </Button>,
                ]}
            >
                <Box
                    sx={{
                        bgcolor: 'background.paper',
                        borderRadius: 3,
                        px: { xs: 3, md: 4 },
                        py: { xs: 4, md: 6 },
                        textAlign: 'center',
                        boxShadow: '0 24px 45px rgba(15, 23, 42, 0.08)',
                    }}
                >
                    <Typography variant="h5" fontWeight={600} gutterBottom>
                        Administrative Access Required
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Contact your system administrator if you believe you should have permissions for team management.
                    </Typography>
                </Box>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            appBarTitle="Team Operations"
            pageTitle="Team Management"
            pageSubtitle="Handle invites, track attendance requests, and keep your roster in sync."
            actions={headerActions}
        >
            <Stack spacing={4}>
                {/* KPI Header Cards */}
                <Grid container spacing={3}>
                    <Grid item xs={12} sm={6} md={3}>
                        <KPICard
                            icon={PeopleIcon}
                            title="Total Headcount"
                            value={kpiData.totalHeadcount}
                            subtitle="Active members"
                            color="#2563eb"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <KPICard
                            icon={BeachAccessIcon}
                            title="Leave Requests"
                            value={kpiData.onLeave}
                            subtitle="Pending approval"
                            color={kpiData.onLeave > 0 ? '#dc2626' : '#16a34a'}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <KPICard
                            icon={MailOutlineIcon}
                            title="Pending Invites"
                            value={kpiData.pendingInvites}
                            subtitle="Waiting to join"
                            color="#f59e0b"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <KPICard
                            icon={BadgeIcon}
                            title="Missing IDs"
                            value={kpiData.missingIds}
                            subtitle="Unassigned codes"
                            color={kpiData.missingIds > 0 ? '#dc2626' : '#16a34a'}
                        />
                    </Grid>
                </Grid>

                {/* Smart Toolbar - Search & Filters */}
                <Paper sx={{ p: 2.5, borderRadius: 3 }}>
                    <Stack 
                        direction={{ xs: 'column', md: 'row' }} 
                        spacing={2} 
                        alignItems={{ xs: 'stretch', md: 'center' }}
                    >
                        <TextField
                            placeholder="Search by name, email, or employee ID..."
                            size="small"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            sx={{ 
                                minWidth: { xs: '100%', md: 300 },
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2
                                }
                            }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon color="action" />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <FilterListIcon color="action" sx={{ display: { xs: 'none', md: 'block' } }} />
                            
                            <FormControl size="small" sx={{ minWidth: 140 }}>
                                <InputLabel>Role</InputLabel>
                                <Select
                                    value={roleFilter}
                                    label="Role"
                                    onChange={(e) => setRoleFilter(e.target.value)}
                                    sx={{ borderRadius: 2 }}
                                >
                                    {uniqueRoles.map(role => (
                                        <MenuItem key={role} value={role}>
                                            {role === 'all' ? 'All Roles' : role}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl size="small" sx={{ minWidth: 140 }}>
                                <InputLabel>Status</InputLabel>
                                <Select
                                    value={statusFilter}
                                    label="Status"
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    sx={{ borderRadius: 2 }}
                                >
                                    <MenuItem value="all">All Status</MenuItem>
                                    <MenuItem value="available">Available</MenuItem>
                                    <MenuItem value="unavailable">Unavailable</MenuItem>
                                </Select>
                            </FormControl>

                            {(searchQuery || roleFilter !== 'all' || statusFilter !== 'all') && (
                                <Button 
                                    size="small" 
                                    onClick={() => {
                                        setSearchQuery('');
                                        setRoleFilter('all');
                                        setStatusFilter('all');
                                    }}
                                    sx={{ textTransform: 'none' }}
                                >
                                    Clear Filters
                                </Button>
                            )}
                        </Box>
                    </Stack>
                </Paper>

                {/* Tabbed Navigation */}
                <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
                        <Tabs 
                            value={activeTab} 
                            onChange={(e, newValue) => setActiveTab(newValue)}
                            sx={{
                                px: 2,
                                '& .MuiTab-root': {
                                    textTransform: 'none',
                                    fontWeight: 500,
                                    minHeight: 56
                                }
                            }}
                        >
                            <Tab 
                                label={<TabLabel label="Roster" count={filteredTeam.length} />} 
                            />
                            <Tab 
                                label={<TabLabel label="Pending Invites" count={filteredInvites.length} showBadge badgeColor="warning" />} 
                            />
                            <Tab 
                                label={<TabLabel label="Leave Requests" count={leaveRequests.length} showBadge badgeColor="error" />} 
                            />
                            <Tab 
                                label={<TabLabel label="Archive" count={filteredDeletedTeam.length} />} 
                            />
                        </Tabs>
                    </Box>
                    
                    <Box sx={{ p: 0 }}>
                        {activeTab === 0 && renderRosterTab()}
                        {activeTab === 1 && renderInvitesTab()}
                        {activeTab === 2 && renderLeaveRequestsTab()}
                        {activeTab === 3 && renderDeletedTab()}
                    </Box>
                </Paper>
            </Stack>

            {/* Context Menu */}
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => handleMenuClose(true)}>
                {selectedItem?.status === 'pending'
                    ? [
                          <MenuItem key="copy" onClick={copyInviteLink}>
                              Copy Invite Link
                          </MenuItem>,
                          <MenuItem
                              key="delete-invite"
                              onClick={() => {
                                  handleMenuClose();
                                  setDeleteMode('invite');
                                  setIsDeleteDialogOpen(true);
                              }}
                              sx={{ color: 'error.main' }}
                          >
                              Delete Invite
                          </MenuItem>,
                      ]
                    : [
                          <MenuItem
                              key="edit"
                              onClick={() => {
                                  handleMenuClose();
                                  setIsEditModalOpen(true);
                              }}
                          >
                              Edit Member
                          </MenuItem>,
                          <MenuItem
                              key="soft-delete"
                              onClick={() => {
                                  handleMenuClose();
                                  setDeleteMode('soft');
                                  setIsDeleteDialogOpen(true);
                              }}
                              sx={{ color: 'error.main' }}
                          >
                              Move to Archive
                          </MenuItem>,
                      ]}
            </Menu>

            {/* Modals */}
            <AddTeamMemberModal
                open={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onSubmit={handleCreateInvite}
            />
            {selectedItem && deleteMode !== 'invite' && (
                <EditTeamMemberModal
                    open={isEditModalOpen}
                    onClose={() => {
                        handleMenuClose(true);
                        setIsEditModalOpen(false);
                    }}
                    onSubmit={handleUpdateTeamMember}
                    member={selectedItem}
                />
            )}

            <DeleteConfirmationDialog
                open={isDeleteDialogOpen}
                onClose={closeDeleteDialog}
                onConfirm={handleConfirmDelete}
                clientName={selectedItem?.name}
                title={
                    deleteMode === 'soft'
                        ? 'Move teammate to archive?'
                        : deleteMode === 'invite'
                        ? 'Delete pending invite?'
                        : 'Delete teammate permanently?'
                }
                message={
                    deleteMode === 'soft'
                        ? `Are you sure you want to archive "${selectedItem?.name}"? You can still permanently delete them later.`
                        : deleteMode === 'invite'
                        ? `Delete the pending invite for "${selectedItem?.email}"? This will revoke their ability to join using the invite link.`
                        : `This will permanently remove "${selectedItem?.name}" and cannot be undone. Continue?`
                }
                confirmLabel={
                    deleteMode === 'soft'
                        ? 'Move to Archive'
                        : deleteMode === 'invite'
                        ? 'Delete Invite'
                        : 'Delete Permanently'
                }
            />
        </AdminLayout>
    );
};

export default TeamManagementPage;