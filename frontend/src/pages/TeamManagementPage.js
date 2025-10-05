import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import {
    Box, Container, Typography, Button, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Paper, CircularProgress, Chip, Link,
    IconButton, Menu, MenuItem, ButtonGroup
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import toast from 'react-hot-toast';
import AddTeamMemberModal from '../components/AddTeamMemberModal';
import EditTeamMemberModal from '../components/EditTeamMemberModal';
import DeleteConfirmationDialog from '../components/DeleteConfirmationDialog';

const TeamManagementPage = () => {
    const { claims } = useAuth();
    const [team, setTeam] = useState([]);
    const [deletedTeam, setDeletedTeam] = useState([]);
    const [invites, setInvites] = useState([]);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [deleteMode, setDeleteMode] = useState(null); // 'soft' | 'invite' | 'permanent'
    
    const [selectedItem, setSelectedItem] = useState(null);
    const [anchorEl, setAnchorEl] = useState(null);

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

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;

    return (
        <Container maxWidth="lg" sx={{ mt: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                <Typography variant="h4" component="h1">Team Management</Typography>
                <Button variant="contained" onClick={() => setIsAddModalOpen(true)}>Invite New Team Member</Button>
            </Box>

            <Typography variant="h6" sx={{ mt: 4 }}>Pending Leave Requests</Typography>
            <TableContainer component={Paper} sx={{ mb: 4 }}>
                <Table><TableHead><TableRow><TableCell>Team Member</TableCell><TableCell>Dates</TableCell><TableCell>Reason</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                    <TableBody>
                        {leaveRequests.map((req) => {
                            let displayName = req.userName;
                            if (!displayName && req.userId) {
                                displayName = getMemberName(req.userId);
                            }
                            if (!displayName) displayName = 'Unknown';
                            return (
                                <TableRow key={req.id}>
                                    <TableCell>{displayName}</TableCell>
                                    <TableCell>{req.startDate} to {req.endDate}</TableCell>
                                    <TableCell>{req.reason}</TableCell>
                                    <TableCell align="right">
                                        <ButtonGroup variant="outlined" size="small">
                                            <Button color="success" onClick={() => handleLeaveRequest(req.id, 'approve')}>Approve</Button>
                                            <Button color="error" onClick={() => handleLeaveRequest(req.id, 'reject')}>Reject</Button>
                                        </ButtonGroup>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            <Typography variant="h6" sx={{ mt: 4 }}>Pending Invitations</Typography>
            <TableContainer component={Paper} sx={{ mb: 4 }}>
                <Table><TableHead><TableRow><TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Role</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                    <TableBody>
                        {invites.filter(i => i.status === 'pending').map((invite) => (
                            <TableRow key={invite.id}>
                                <TableCell>{invite.name}</TableCell><TableCell>{invite.email}</TableCell><TableCell>{invite.role}</TableCell>
                                <TableCell align="right"><IconButton onClick={(e) => handleMenuClick(e, invite)}><MoreVertIcon /></IconButton></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Typography variant="h6">Active Team Members</Typography>
            <TableContainer component={Paper}>
                <Table><TableHead><TableRow><TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Role</TableCell><TableCell>Employee ID</TableCell><TableCell>Skills</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                    <TableBody>
                        {team.map((member) => (
                            <TableRow key={member.id}>
                                <TableCell><Link component={RouterLink} to={`/team/${member.id}`}>{member.name}</Link></TableCell>
                                <TableCell>{member.email}</TableCell>
                                <TableCell>{member.role}</TableCell>
                                <TableCell>{member.employeeCode ? <Chip label={member.employeeCode} color="success" size="small" sx={{ fontWeight: 600 }} /> : <Chip label="Unassigned" color="warning" size="small" />}</TableCell>
                                <TableCell>{member.skills?.map(skill => <Chip key={skill} label={skill} sx={{ mr: 0.5 }} />)}</TableCell>
                                <TableCell><Typography sx={{ fontWeight: 'bold', color: member.availability ? 'success.main' : 'text.secondary' }}>{member.availability ? 'Available' : 'Unavailable'}</Typography></TableCell>
                                <TableCell align="right"><IconButton onClick={(e) => handleMenuClick(e, member)}><MoreVertIcon /></IconButton></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => handleMenuClose(true)}>
                {selectedItem?.status === 'pending' ? ([
                    <MenuItem key="copy" onClick={copyInviteLink}>Copy Invite Link</MenuItem>,
                    <MenuItem
                        key="delete-invite"
                        onClick={() => {
                            handleMenuClose();
                            setDeleteMode('invite');
                            setIsDeleteDialogOpen(true);
                        }}
                    >
                        Delete Invite
                    </MenuItem>
                ]) : [
                    <MenuItem
                        key="edit"
                        onClick={() => {
                            handleMenuClose();
                            setIsEditModalOpen(true);
                        }}
                    >
                        Edit
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
                        Move to Deleted
                    </MenuItem>
                ]}
            </Menu>

            <AddTeamMemberModal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSubmit={handleCreateInvite} />
            {selectedItem && deleteMode !== 'invite' && <EditTeamMemberModal open={isEditModalOpen} onClose={() => { handleMenuClose(true); setIsEditModalOpen(false); }} onSubmit={handleUpdateTeamMember} member={selectedItem} />}

            <Box sx={{ mt: 6 }}>
                <Typography variant="h6">Deleted Teammates</Typography>
                <TableContainer component={Paper} sx={{ mt: 2 }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Email</TableCell>
                                <TableCell>Role</TableCell>
                                <TableCell>Deleted At</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {deletedTeam.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5}>
                                        <Typography color="text.secondary">No deleted teammates.</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                deletedTeam.map((member) => (
                                    <TableRow key={member.id}>
                                        <TableCell>{member.name}</TableCell>
                                        <TableCell>{member.email}</TableCell>
                                        <TableCell>{member.role}</TableCell>
                                        <TableCell>
                                            {member.deletedAt?.seconds ? new Date(member.deletedAt.seconds * 1000).toLocaleString() : '—'}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Button
                                                color="error"
                                                size="small"
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
            </Box>

            <DeleteConfirmationDialog
                open={isDeleteDialogOpen}
                onClose={closeDeleteDialog}
                onConfirm={handleConfirmDelete}
                clientName={selectedItem?.name}
                title={deleteMode === 'soft' ? 'Move teammate to deleted list?' : deleteMode === 'invite' ? 'Delete pending invite?' : 'Delete teammate permanently?'}
                message={
                    deleteMode === 'soft'
                        ? `Are you sure you want to move "${selectedItem?.name}" to Deleted Teammates? You can still permanently delete them later.`
                        : deleteMode === 'invite'
                        ? `Delete the pending invite for "${selectedItem?.email}"? This will revoke their ability to join using the invite link.`
                        : `This will permanently remove "${selectedItem?.name}" and cannot be undone. Continue?`
                }
                confirmLabel={deleteMode === 'soft' ? 'Move to Deleted' : deleteMode === 'invite' ? 'Delete Invite' : 'Delete Permanently'}
            />
        </Container>
    );
};

export default TeamManagementPage;
