import React, { useState, useEffect } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { doc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    Box, Container, Typography, Breadcrumbs, Link, CircularProgress, Paper, Button, Grid, Chip, Divider,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import EditIcon from '@mui/icons-material/Edit';
import DoNotDisturbOnIcon from '@mui/icons-material/DoNotDisturbOn';
import toast from 'react-hot-toast';
import EditTeamMemberModal from '../components/EditTeamMemberModal';
import DeleteConfirmationDialog from '../components/DeleteConfirmationDialog';
import TeamMemberIDCard from '../components/TeamMemberIDCard';

const TeamMemberWorkspacePage = () => {
    const { memberId } = useParams();
    const { claims } = useAuth();
    const [member, setMember] = useState(null);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isCancelLeaveDialogOpen, setIsCancelLeaveDialogOpen] = useState(false);
    const [selectedLeaveRequest, setSelectedLeaveRequest] = useState(null);

    const orgName = (claims && claims.orgName) || 'Your Organization';
    const orgId = (claims && claims.orgId) || '';

    useEffect(() => {
        if (!claims?.orgId || !memberId) { setLoading(false); return; }
        
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

        const leaveQuery = query(collection(db, 'organizations', claims.orgId, 'leaveRequests'), where('userId', '==', memberId));
        const unsubLeave = onSnapshot(leaveQuery, (snapshot) => setLeaveRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

        return () => { unsubMember(); unsubLeave(); };
    }, [claims, memberId]);
    
    const callApi = async (endpoint, method, body = null) => {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch(`/api${endpoint}`, {
            method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            ...(body && { body: JSON.stringify(body) }),
        });
        if (!response.ok) throw new Error((await response.json()).detail || 'An error occurred.');
        return response.json();
    };
    
    // Update endpoints to match backend: /team/members/{id}
    const handleUpdateTeamMember = (id, data) => toast.promise(callApi(`/team/members/${id}`, 'PUT', data),{ loading: 'Updating...', success: 'Member updated!', error: (err) => err.message }).finally(() => setIsEditModalOpen(false));
    const handleDeleteTeamMember = () => toast.promise(callApi(`/team/members/${member.id}`, 'DELETE'),{ loading: 'Deactivating...', success: 'Member deactivated.', error: (err) => err.message }).finally(() => setIsDeleteDialogOpen(false));
    
    const handleCancelLeave = async () => {
        if (!selectedLeaveRequest) return;
        await toast.promise(
            callApi(`/leave-requests/${selectedLeaveRequest.id}/cancel`, 'PUT'),
            { loading: 'Cancelling leave...', success: 'Leave cancelled!', error: (err) => err.message }
        );
        setIsCancelLeaveDialogOpen(false);
        setSelectedLeaveRequest(null);
    };

    const getStatusChip = (status) => <Chip label={status} size="small" color={status === 'approved' ? 'success' : status === 'rejected' || status === 'cancelled' ? 'error' : 'warning'} />;

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;
    if (!member) return <Container><Typography variant="h5" color="error">Team member not found.</Typography></Container>;

    return (
        <Container maxWidth="lg" sx={{ mt: 4 }}>
            <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ mb: 2 }}>
                <Link component={RouterLink} underline="hover" color="inherit" to="/team">Team</Link>
                <Typography color="text.primary">{member.name}</Typography>
            </Breadcrumbs>
            
            <Grid container spacing={3}>
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 2, mb: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                            <Typography variant="h4">{member.name}</Typography>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <Chip label={member.role} color="primary" />
                                <Chip label={member.employeeCode ? `ID ${member.employeeCode}` : 'ID Pending'} color={member.employeeCode ? 'success' : 'warning'} />
                            </Box>
                        </Box>
                        <Typography variant="subtitle1" color="text.secondary">{member.email}</Typography>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="h6">Skills</Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>{member.skills?.map(skill => <Chip key={skill} label={skill} />)}</Box>
                    </Paper>

                    <Typography variant="h5">Leave History</Typography>
                    <TableContainer component={Paper} sx={{mt: 2}}>
                        <Table><TableHead><TableRow><TableCell>Start Date</TableCell><TableCell>End Date</TableCell><TableCell>Reason</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                            <TableBody>
                                {leaveRequests.map(req => (
                                    <TableRow key={req.id}><TableCell>{req.startDate}</TableCell><TableCell>{req.endDate}</TableCell><TableCell>{req.reason}</TableCell><TableCell>{getStatusChip(req.status)}</TableCell>
                                    <TableCell align="right">{req.status === 'approved' && (<Button size="small" color="warning" onClick={() => { setSelectedLeaveRequest(req); setIsCancelLeaveDialogOpen(true); }}>Cancel</Button>)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>

                <Grid item xs={12} md={4}>
                    {/* New: Team Member ID Card */}
                    {member && (
                        <Paper sx={{ p: 2, mb: 2 }}>
                            <Typography variant="h6" sx={{ mb: 1 }}>ID Card</Typography>
                            <TeamMemberIDCard
                                member={{
                                    userId: member.id || member.userId,
                                    employeeCode: member.employeeCode,
                                    name: member.name,
                                    email: member.email,
                                    role: member.role,
                                    phone: member.phone,
                                    profilePhoto: member.profilePhoto,
                                    skills: member.skills || []
                                }}
                                orgName={orgName}
                                orgId={orgId}
                                showActions
                            />
                        </Paper>
                    )}

                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6">Actions</Typography>
                        <Button variant="outlined" startIcon={<EditIcon />} fullWidth sx={{ mb: 1 }} onClick={() => setIsEditModalOpen(true)}>Edit Member</Button>
                        <Button variant="outlined" color="error" startIcon={<DoNotDisturbOnIcon />} fullWidth onClick={() => setIsDeleteDialogOpen(true)}>Deactivate Member</Button>
                    </Paper>
                </Grid>
            </Grid>
            
            {member && <EditTeamMemberModal open={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} onSubmit={handleUpdateTeamMember} member={member} />}
            {member && <DeleteConfirmationDialog open={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} onConfirm={handleDeleteTeamMember} clientName={member.name} />}
            {selectedLeaveRequest && <DeleteConfirmationDialog open={isCancelLeaveDialogOpen} onClose={() => setIsCancelLeaveDialogOpen(false)} onConfirm={handleCancelLeave} clientName={`leave for ${member.name}`} />}
        </Container>
    );
};

export default TeamMemberWorkspacePage;
