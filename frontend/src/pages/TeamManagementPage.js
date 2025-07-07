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
    const [invites, setInvites] = useState([]);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    const [selectedItem, setSelectedItem] = useState(null);
    const [anchorEl, setAnchorEl] = useState(null);

    useEffect(() => {
        if (!claims?.orgId) { setLoading(false); return; }
        
        const unsubTeam = onSnapshot(collection(db, 'organizations', claims.orgId, 'team'), (snap) => setTeam(snap.docs.map(d => ({...d.data(), id: d.id}))));
        const unsubInvites = onSnapshot(collection(db, 'organizations', claims.orgId, 'invites'), (snap) => setInvites(snap.docs.map(d => ({...d.data(), id: d.id}))));
        const unsubLeave = onSnapshot(query(collection(db, 'organizations', claims.orgId, 'leaveRequests'), where("status", "==", "pending")), (snap) => setLeaveRequests(snap.docs.map(d => ({...d.data(), id: d.id}))));

        setLoading(false);
        return () => { unsubTeam(); unsubInvites(); unsubLeave(); };
    }, [claims]);

    const handleMenuClick = (event, item) => { setAnchorEl(event.currentTarget); setSelectedItem(item); };
    const handleMenuClose = () => { setAnchorEl(null); setSelectedItem(null); };
    
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
    const handleDeleteTeamMember = () => toast.promise(callApi(`/team/members/${selectedItem.id}`, 'DELETE'), { loading: 'Deactivating...', success: 'Member deactivated.', error: (err) => err.message }).finally(() => setIsDeleteDialogOpen(false));
    
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
                <Table><TableHead><TableRow><TableCell>Name</TableCell><TableCell>Email</TableCell><TableCell>Role</TableCell><TableCell>Skills</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                    <TableBody>
                        {team.map((member) => (
                            <TableRow key={member.id}>
                                <TableCell><Link component={RouterLink} to={`/team/${member.id}`}>{member.name}</Link></TableCell>
                                <TableCell>{member.email}</TableCell><TableCell>{member.role}</TableCell>
                                <TableCell>{member.skills?.map(skill => <Chip key={skill} label={skill} sx={{ mr: 0.5 }} />)}</TableCell>
                                <TableCell><Typography sx={{ fontWeight: 'bold', color: member.availability ? 'success.main' : 'text.secondary' }}>{member.availability ? 'Available' : 'Unavailable'}</Typography></TableCell>
                                <TableCell align="right"><IconButton onClick={(e) => handleMenuClick(e, member)}><MoreVertIcon /></IconButton></TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
                {selectedItem?.status === 'pending' ? (<MenuItem onClick={copyInviteLink}>Copy Invite Link</MenuItem>) : 
                [
                    <MenuItem key="edit" onClick={() => { setIsEditModalOpen(true); }}>Edit</MenuItem>,
                    <MenuItem key="deactivate" onClick={() => { setIsDeleteDialogOpen(true); }} sx={{ color: 'error.main' }}>Deactivate</MenuItem>
                ]}
            </Menu>

            <AddTeamMemberModal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSubmit={handleCreateInvite} />
            {selectedItem && <EditTeamMemberModal open={isEditModalOpen} onClose={() => { handleMenuClose(); setIsEditModalOpen(false); }} onSubmit={handleUpdateTeamMember} member={selectedItem} />}
            {selectedItem && <DeleteConfirmationDialog open={isDeleteDialogOpen} onClose={() => { handleMenuClose(); setIsDeleteDialogOpen(false); }} onConfirm={handleDeleteTeamMember} clientName={selectedItem.name} />}
        </Container>
    );
};

export default TeamManagementPage;
