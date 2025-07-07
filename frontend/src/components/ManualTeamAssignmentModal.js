import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography,
    Grid, Card, CardContent, Chip, Box, IconButton, Alert, CircularProgress,
    FormControl, InputLabel, Select, MenuItem, Divider, List, ListItem,
    ListItemText, ListItemSecondaryAction
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import WarningIcon from '@mui/icons-material/Warning';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import toast from 'react-hot-toast';

const ManualTeamAssignmentModal = ({ open, onClose, eventId, clientId, eventData, callApi }) => {
    const [loading, setLoading] = useState(false);
    const [availableMembers, setAvailableMembers] = useState([]);
    const [unavailableMembers, setUnavailableMembers] = useState([]);
    const [currentlyAssigned, setCurrentlyAssigned] = useState([]);
    const [selectedMember, setSelectedMember] = useState('');
    const [selectedRole, setSelectedRole] = useState('');
    const [assigning, setAssigning] = useState(false);

    const roleOptions = [
        'Lead Photographer',
        'Assistant Photographer', 
        'Videographer',
        'Editor',
        'Equipment Manager',
        'Coordinator',
        'Other'
    ];

    useEffect(() => {
        if (open && eventId) {
            fetchAvailableMembers();
        }
    }, [open, eventId]);

    const fetchAvailableMembers = async () => {
        setLoading(true);
        try {
            const data = await callApi(`/events/${eventId}/available-team?client_id=${clientId}`, 'GET');
            setAvailableMembers(data.availableMembers || []);
            setUnavailableMembers(data.unavailableMembers || []);
            setCurrentlyAssigned(data.currentlyAssigned || []);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAssignMember = async () => {
        if (!selectedMember || !selectedRole) {
            toast.error('Please select both a team member and role');
            return;
        }

        setAssigning(true);
        try {
            await callApi(`/events/${eventId}/manual-assign?client_id=${clientId}`, 'POST', {
                userId: selectedMember,
                role: selectedRole
            });
            toast.success('Team member assigned successfully!');
            setSelectedMember('');
            setSelectedRole('');
            await fetchAvailableMembers(); // Refresh the lists
        } catch (error) {
            toast.error(error.message);
        } finally {
            setAssigning(false);
        }
    };

    const handleRemoveMember = async (userId) => {
        try {
            await callApi(`/events/${eventId}/remove-assignment/${userId}?client_id=${clientId}`, 'DELETE');
            toast.success('Team member removed successfully!');
            await fetchAvailableMembers(); // Refresh the lists
        } catch (error) {
            toast.error(error.message);
        }
    };

    const getSelectedMemberInfo = () => {
        if (!selectedMember) return null;
        return availableMembers.find(member => member.userId === selectedMember);
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Typography variant="h6">Manual Team Assignment</Typography>
                <Typography variant="body2" color="text.secondary">
                    {eventData?.name} • {eventData?.date}
                </Typography>
            </DialogTitle>
            
            <DialogContent>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Grid container spacing={3}>
                        {/* Assignment Form */}
                        <Grid item xs={12}>
                            <Card variant="outlined" sx={{ mb: 2 }}>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>
                                        Assign New Team Member
                                    </Typography>
                                    
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} md={6}>
                                            <FormControl fullWidth>
                                                <InputLabel>Select Team Member</InputLabel>
                                                <Select
                                                    value={selectedMember}
                                                    onChange={(e) => setSelectedMember(e.target.value)}
                                                    label="Select Team Member"
                                                >
                                                    {availableMembers.map((member) => (
                                                        <MenuItem key={member.userId} value={member.userId}>
                                                            <Box>
                                                                <Typography>{member.name}</Typography>
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {member.skills?.join(', ') || 'No skills listed'}
                                                                </Typography>
                                                            </Box>
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        </Grid>
                                        
                                        <Grid item xs={12} md={6}>
                                            <FormControl fullWidth>
                                                <InputLabel>Role for this Event</InputLabel>
                                                <Select
                                                    value={selectedRole}
                                                    onChange={(e) => setSelectedRole(e.target.value)}
                                                    label="Role for this Event"
                                                >
                                                    {roleOptions.map((role) => (
                                                        <MenuItem key={role} value={role}>
                                                            {role}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        </Grid>
                                    </Grid>
                                    
                                    {getSelectedMemberInfo() && (
                                        <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                                            <Typography variant="subtitle2">Selected Member:</Typography>
                                            <Typography variant="body2">
                                                <strong>{getSelectedMemberInfo().name}</strong> ({getSelectedMemberInfo().email})
                                            </Typography>
                                            <Box sx={{ mt: 1 }}>
                                                {getSelectedMemberInfo().skills?.map(skill => (
                                                    <Chip key={skill} label={skill} size="small" sx={{ mr: 0.5, mb: 0.5 }} />
                                                ))}
                                            </Box>
                                        </Box>
                                    )}
                                    
                                    <Button
                                        variant="contained"
                                        startIcon={<PersonAddIcon />}
                                        onClick={handleAssignMember}
                                        disabled={!selectedMember || !selectedRole || assigning}
                                        sx={{ mt: 2 }}
                                        fullWidth
                                    >
                                        {assigning ? 'Assigning...' : 'Assign Team Member'}
                                    </Button>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Currently Assigned Members */}
                        <Grid item xs={12} md={6}>
                            <Typography variant="h6" gutterBottom>
                                <CheckCircleIcon sx={{ mr: 1, verticalAlign: 'middle' }} color="success" />
                                Currently Assigned ({currentlyAssigned.length})
                            </Typography>
                            
                            {currentlyAssigned.length > 0 ? (
                                <List dense>
                                    {currentlyAssigned.map((member) => (
                                        <ListItem key={member.userId} divider>
                                            <ListItemText
                                                primary={member.name}
                                                secondary={
                                                    <Box>
                                                        <Typography variant="caption" display="block">
                                                            Role: {member.role}
                                                        </Typography>
                                                        <Box sx={{ mt: 0.5 }}>
                                                            {member.skills?.slice(0, 3).map(skill => (
                                                                <Chip 
                                                                    key={skill} 
                                                                    label={skill} 
                                                                    size="small" 
                                                                    sx={{ mr: 0.5, mb: 0.5 }}
                                                                />
                                                            ))}
                                                        </Box>
                                                    </Box>
                                                }
                                            />
                                            <ListItemSecondaryAction>
                                                <IconButton
                                                    edge="end"
                                                    onClick={() => handleRemoveMember(member.userId)}
                                                    color="error"
                                                    size="small"
                                                >
                                                    <PersonRemoveIcon />
                                                </IconButton>
                                            </ListItemSecondaryAction>
                                        </ListItem>
                                    ))}
                                </List>
                            ) : (
                                <Alert severity="info">No team members assigned yet</Alert>
                            )}
                        </Grid>

                        {/* Available Members */}
                        <Grid item xs={12} md={6}>
                            <Typography variant="h6" gutterBottom>
                                Available Members ({availableMembers.length})
                            </Typography>
                            
                            {availableMembers.length > 0 ? (
                                <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
                                    {availableMembers.map((member) => (
                                        <ListItem key={member.userId} divider>
                                            <ListItemText
                                                primary={member.name}
                                                secondary={
                                                    <Box>
                                                        <Typography variant="caption" display="block">
                                                            {member.email}
                                                        </Typography>
                                                        <Box sx={{ mt: 0.5 }}>
                                                            {member.skills?.slice(0, 3).map(skill => (
                                                                <Chip 
                                                                    key={skill} 
                                                                    label={skill} 
                                                                    size="small" 
                                                                    sx={{ mr: 0.5, mb: 0.5 }}
                                                                />
                                                            ))}
                                                        </Box>
                                                    </Box>
                                                }
                                            />
                                        </ListItem>
                                    ))}
                                </List>
                            ) : (
                                <Alert severity="warning">No available team members for this date</Alert>
                            )}
                        </Grid>

                        {/* Unavailable Members */}
                        {unavailableMembers.length > 0 && (
                            <Grid item xs={12}>
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="h6" gutterBottom>
                                    <WarningIcon sx={{ mr: 1, verticalAlign: 'middle' }} color="warning" />
                                    Unavailable Members ({unavailableMembers.length})
                                </Typography>
                                
                                <List dense sx={{ maxHeight: 200, overflow: 'auto' }}>
                                    {unavailableMembers.map((member) => (
                                        <ListItem key={member.userId} divider>
                                            <ListItemText
                                                primary={member.name}
                                                secondary={
                                                    <Box>
                                                        <Typography variant="caption" display="block" color="error">
                                                            {member.unavailableReason}
                                                        </Typography>
                                                        <Typography variant="caption" display="block">
                                                            {member.email}
                                                        </Typography>
                                                    </Box>
                                                }
                                            />
                                        </ListItem>
                                    ))}
                                </List>
                            </Grid>
                        )}
                    </Grid>
                )}
            </DialogContent>
            
            <DialogActions>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};

export default ManualTeamAssignmentModal;
