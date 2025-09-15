import React, { useState, useEffect } from 'react';
import {
    Container, Typography, Card, CardContent, Button, Grid, Box, Chip, Badge,
    AppBar, Toolbar, Alert, Paper, Tabs, Tab, TableContainer, Table, TableHead,
    TableRow, TableCell, TableBody, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, FormControl, InputLabel, Select, MenuItem,
    List, ListItem, ListItemText, Divider, CircularProgress
} from '@mui/material';
import {
    Dashboard as DashboardIcon, Storage as StorageIcon, CheckCircle as CheckIcon,
    Cancel as RejectIcon, Assignment as AssignmentIcon, Refresh as RefreshIcon,
    Schedule as ScheduleIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import toast from 'react-hot-toast';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return <div role="tabpanel" hidden={value !== index} {...other}>{value === index && <Box sx={{ p: 3 }}>{children}</Box>}</div>;
}

const DataManagerPortal = () => {
    const { claims } = useAuth();
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(true);
    
    // Dashboard states
    const [dashboardData, setDashboardData] = useState(null);
    const [pendingBatches, setPendingBatches] = useState([]);
    const [storageMedia, setStorageMedia] = useState([]);
    
    // Approval modal states
    const [approvalModalOpen, setApprovalModalOpen] = useState(false);
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [approvalAction, setApprovalAction] = useState('');
    const [approvalData, setApprovalData] = useState({
        storageMediumId: '',
        storageLocation: { room: '', shelf: '', bin: '' },
        notes: '',
        rejectionReason: ''
    });
    
    // Storage creation modal
    const [storageModalOpen, setStorageModalOpen] = useState(false);
    const [newStorageData, setNewStorageData] = useState({
        type: '',
        capacity: '',
        room: '',
        shelf: '',
        bin: ''
    });

    useEffect(() => {
        if (claims?.role === 'data-manager' || claims?.role === 'admin') {
            loadDashboardData();
            loadPendingBatches();
            loadStorageMedia();
        }
    }, [claims]);

    const loadDashboardData = async () => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/data-submissions/dm/dashboard', {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            if (response.ok) {
                const data = await response.json();
                setDashboardData(data);
                
                // Log successful data load
                console.log('Dashboard data loaded:', data);
            } else {
                const errorData = await response.json();
                console.error('Dashboard API error:', response.status, errorData);
                
                // Set fallback data if the API returns an error
                setDashboardData({
                    stats: { pendingBatches: 0, confirmedBatches: 0, rejectedBatches: 0, totalBatches: 0 },
                    recentActivity: [],
                    eventsNeedingAttention: []
                });
                
                if (response.status !== 401) { // Don't show error for auth issues
                    toast.error(`Dashboard error: ${errorData.detail || 'Failed to load dashboard'}`);
                }
            }
        } catch (error) {
            console.error('Error loading dashboard:', error);
            
            // Set fallback data
            setDashboardData({
                stats: { pendingBatches: 0, confirmedBatches: 0, rejectedBatches: 0, totalBatches: 0 },
                recentActivity: [],
                eventsNeedingAttention: []
            });
            
            toast.error('Failed to load dashboard data');
        } finally {
            setLoading(false);
        }
    };

    const loadPendingBatches = async () => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/data-submissions/dm/pending-approvals', {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            if (response.ok) {
                const data = await response.json();
                setPendingBatches(data.pendingBatches || []);
                
                console.log('Pending batches loaded:', data.pendingBatches?.length || 0);
                
                // Show error message if the API returned an error but still provided data
                if (data.error) {
                    console.warn('API warning:', data.error);
                }
            } else {
                const errorData = await response.json();
                console.error('Pending batches API error:', response.status, errorData);
                setPendingBatches([]);
                
                if (response.status !== 401) {
                    toast.error(`Failed to load pending batches: ${errorData.detail || 'Unknown error'}`);
                }
            }
        } catch (error) {
            console.error('Error loading pending batches:', error);
            setPendingBatches([]);
            toast.error('Failed to load pending batches');
        }
    };

    const loadStorageMedia = async () => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/data-submissions/dm/storage-media', {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            if (response.ok) {
                const data = await response.json();
                setStorageMedia(data.storageMedia || []);
            }
        } catch (error) {
            console.error('Error loading storage media:', error);
            toast.error('Failed to load storage media');
        }
    };

    const handleOpenApproval = (batch, action) => {
        setSelectedBatch(batch);
        setApprovalAction(action);
        setApprovalModalOpen(true);
        setApprovalData({
            storageMediumId: '',
            storageLocation: { room: '', shelf: '', bin: '' },
            notes: '',
            rejectionReason: ''
        });
    };

    const handleApprovalSubmit = async () => {
        try {
            // Validation for approval action
            if (approvalAction === 'approve') {
                if (!approvalData.storageMediumId) {
                    toast.error('Please select a storage medium');
                    return;
                }
                if (!approvalData.storageLocation.room || !approvalData.storageLocation.shelf || !approvalData.storageLocation.bin) {
                    toast.error('Please fill in all storage location fields (room, shelf, bin)');
                    return;
                }
            } else if (approvalAction === 'reject') {
                if (!approvalData.rejectionReason.trim()) {
                    toast.error('Please provide a rejection reason');
                    return;
                }
            }

            const idToken = await auth.currentUser.getIdToken();
            
            const requestData = {
                batchId: selectedBatch.id,
                action: approvalAction,
                ...approvalData
            };

            const response = await fetch('/api/data-submissions/dm/approve-batch', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(requestData)
            });

            if (response.ok) {
                toast.success(`Batch ${approvalAction}d successfully!`);
                setApprovalModalOpen(false);
                
                // Refresh data
                loadDashboardData();
                loadPendingBatches();
                
                if (approvalAction === 'approve') {
                    loadStorageMedia(); // Refresh storage media as one might have been assigned
                }
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || `Failed to ${approvalAction} batch`);
            }
        } catch (error) {
            console.error(`Error ${approvalAction}ing batch:`, error);
            toast.error(error.message);
        }
    };

    const handleCreateStorage = async () => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            
            const response = await fetch('/api/data-submissions/dm/storage-media', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(newStorageData)
            });

            if (response.ok) {
                toast.success('Storage medium created successfully!');
                setStorageModalOpen(false);
                setNewStorageData({
                    type: '',
                    capacity: '',
                    room: '',
                    shelf: '',
                    bin: ''
                });
                loadStorageMedia();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to create storage medium');
            }
        } catch (error) {
            console.error('Error creating storage:', error);
            toast.error(error.message);
        }
    };

    const getBatchStatusColor = (status) => {
        switch (status) {
            case 'CONFIRMED': return 'success';
            case 'PENDING': return 'warning';
            case 'REJECTED': return 'error';
            default: return 'default';
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (claims?.role !== 'data-manager' && claims?.role !== 'admin') {
        return (
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                <Alert severity="error">
                    Access denied. This portal is only available to Data Managers and Administrators.
                </Alert>
            </Container>
        );
    }

    if (loading) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4, textAlign: 'center' }}>
                <CircularProgress />
                <Typography variant="h6" sx={{ mt: 2 }}>Loading Data Manager Portal...</Typography>
            </Container>
        );
    }

    return (
        <>
            <AppBar position="static" color="primary">
                <Toolbar>
                    <DashboardIcon sx={{ mr: 2 }} />
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Data Manager Portal
                    </Typography>
                    <Button color="inherit" onClick={() => window.location.href = '/team'}>
                        Back to Team Dashboard
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ mt: 4 }}>
                {/* Welcome message for data managers */}
                {dashboardData && (
                    <Alert severity="info" sx={{ mb: 3 }}>
                        <Typography variant="subtitle1" gutterBottom>
                            Welcome to the Data Manager Portal! 
                        </Typography>
                        <Typography variant="body2">
                            Here you can approve data submissions, manage storage media, and monitor the data intake workflow.
                            {dashboardData.error && (
                                <span style={{ color: 'orange' }}>
                                    <br />Note: Some data may be limited due to: {dashboardData.error}
                                </span>
                            )}
                        </Typography>
                    </Alert>
                )}

                {/* Dashboard Summary Cards */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} md={3}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box>
                                        <Typography color="textSecondary" gutterBottom>
                                            Pending Approval
                                        </Typography>
                                        <Typography variant="h4" color="warning.main">
                                            {dashboardData?.stats?.pendingBatches || 0}
                                        </Typography>
                                    </Box>
                                    <ScheduleIcon color="warning" sx={{ fontSize: 40 }} />
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    
                    <Grid item xs={12} md={3}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box>
                                        <Typography color="textSecondary" gutterBottom>
                                            Confirmed Batches
                                        </Typography>
                                        <Typography variant="h4" color="success.main">
                                            {dashboardData?.stats?.confirmedBatches || 0}
                                        </Typography>
                                    </Box>
                                    <CheckIcon color="success" sx={{ fontSize: 40 }} />
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    
                    <Grid item xs={12} md={3}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box>
                                        <Typography color="textSecondary" gutterBottom>
                                            Rejected Batches
                                        </Typography>
                                        <Typography variant="h4" color="error.main">
                                            {dashboardData?.stats?.rejectedBatches || 0}
                                        </Typography>
                                    </Box>
                                    <RejectIcon color="error" sx={{ fontSize: 40 }} />
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                    
                    <Grid item xs={12} md={3}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Box>
                                        <Typography color="textSecondary" gutterBottom>
                                            Total Batches
                                        </Typography>
                                        <Typography variant="h4" color="primary.main">
                                            {dashboardData?.stats?.totalBatches || 0}
                                        </Typography>
                                    </Box>
                                    <AssignmentIcon color="primary" sx={{ fontSize: 40 }} />
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>

                {/* Tabs */}
                <Paper sx={{ width: '100%' }}>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
                            <Tab 
                                label={
                                    <Badge badgeContent={pendingBatches.length} color="error">
                                        Pending Approvals
                                    </Badge>
                                } 
                            />
                            <Tab label="Storage Media Management" />
                            <Tab label="Recent Activity" />
                        </Tabs>
                    </Box>

                    {/* Pending Approvals Tab */}
                    <TabPanel value={tabValue} index={0}>
                        <Box sx={{ display: 'flex', justifyContent: 'between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6">Data Submissions Pending Approval</Typography>
                            <Button 
                                variant="outlined" 
                                startIcon={<RefreshIcon />}
                                onClick={loadPendingBatches}
                            >
                                Refresh
                            </Button>
                        </Box>
                        
                        {pendingBatches.length === 0 ? (
                            <Alert severity="info">No pending batch approvals at this time.</Alert>
                        ) : (
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Event</TableCell>
                                            <TableCell>Submitted By</TableCell>
                                            <TableCell>Handover Date</TableCell>
                                            <TableCell>Devices</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Submitted</TableCell>
                                            <TableCell align="right">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {pendingBatches.map((batch) => (
                                            <TableRow key={batch.id} hover>
                                                <TableCell>
                                                    <Typography variant="subtitle2">{batch.eventName}</Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Client: {batch.clientName}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>{batch.submittedByName}</TableCell>
                                                <TableCell>{batch.physicalHandoverDate}</TableCell>
                                                <TableCell>
                                                    <Typography variant="body2">
                                                        {batch.totalDevices} devices
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Est: {batch.estimatedDataSize || 'Unknown'}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={batch.status} 
                                                        color={getBatchStatusColor(batch.status)}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell>{formatDate(batch.createdAt)}</TableCell>
                                                <TableCell align="right">
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="success"
                                                        onClick={() => handleOpenApproval(batch, 'approve')}
                                                        sx={{ mr: 1 }}
                                                    >
                                                        Approve
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="error"
                                                        onClick={() => handleOpenApproval(batch, 'reject')}
                                                    >
                                                        Reject
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </TabPanel>

                    {/* Storage Media Tab */}
                    <TabPanel value={tabValue} index={1}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6">Storage Media Management</Typography>
                            <Button 
                                variant="contained" 
                                startIcon={<StorageIcon />}
                                onClick={() => setStorageModalOpen(true)}
                            >
                                Add Storage Medium
                            </Button>
                        </Box>
                        
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Capacity</TableCell>
                                        <TableCell>Location</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Created</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {storageMedia.map((medium) => (
                                        <TableRow key={medium.id}>
                                            <TableCell>{medium.type}</TableCell>
                                            <TableCell>{medium.capacity}</TableCell>
                                            <TableCell>
                                                Room {medium.room}, Shelf {medium.shelf}, Bin {medium.bin}
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={medium.status}
                                                    color={medium.status === 'available' ? 'success' : 'default'}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>{formatDate(medium.createdAt)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </TabPanel>

                    {/* Recent Activity Tab */}
                    <TabPanel value={tabValue} index={2}>
                        <Typography variant="h6" gutterBottom>Recent Activity</Typography>
                        
                        {dashboardData?.recentActivity?.length === 0 ? (
                            <Alert severity="info">No recent activity.</Alert>
                        ) : (
                            <List>
                                {(dashboardData?.recentActivity || []).map((batch, index) => (
                                    <React.Fragment key={batch.id}>
                                        <ListItem>
                                            <ListItemText
                                                primary={`${batch.eventName} - ${batch.submittedByName}`}
                                                secondary={
                                                    <Box>
                                                        <Typography variant="caption" color="text.secondary">
                                                            Status: <Chip 
                                                                label={batch.status} 
                                                                color={getBatchStatusColor(batch.status)}
                                                                size="small"
                                                            />
                                                        </Typography>
                                                        <Typography variant="caption" display="block" color="text.secondary">
                                                            {formatDate(batch.updatedAt)}
                                                        </Typography>
                                                    </Box>
                                                }
                                            />
                                        </ListItem>
                                        {index < (dashboardData?.recentActivity?.length || 0) - 1 && <Divider />}
                                    </React.Fragment>
                                ))}
                            </List>
                        )}
                    </TabPanel>
                </Paper>
            </Container>

            {/* Batch Approval Modal */}
            <Dialog open={approvalModalOpen} onClose={() => setApprovalModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    {approvalAction === 'approve' ? 'Approve' : 'Reject'} Data Batch
                </DialogTitle>
                <DialogContent>
                    {selectedBatch && (
                        <Box sx={{ mb: 3 }}>
                            <Typography variant="h6" gutterBottom>{selectedBatch.eventName}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                Submitted by: {selectedBatch.submittedByName} • 
                                Handover Date: {selectedBatch.physicalHandoverDate} • 
                                Devices: {selectedBatch.totalDevices}
                            </Typography>
                            
                            {/* Storage Devices Details */}
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle2" gutterBottom>Storage Devices:</Typography>
                                {selectedBatch.storageDevices?.map((device, index) => (
                                    <Typography key={index} variant="body2" sx={{ ml: 2 }}>
                                        • {device.type} - {device.brand} {device.model} ({device.capacity})
                                    </Typography>
                                ))}
                            </Box>
                            
                            {selectedBatch.notes && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2">Notes:</Typography>
                                    <Typography variant="body2">{selectedBatch.notes}</Typography>
                                </Box>
                            )}
                        </Box>
                    )}
                    
                    {approvalAction === 'approve' ? (
                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <FormControl fullWidth>
                                    <InputLabel>Storage Medium</InputLabel>
                                    <Select
                                        value={approvalData.storageMediumId}
                                        onChange={(e) => {
                                            const selectedMediumId = e.target.value;
                                            const selectedMedium = storageMedia.find(m => m.id === selectedMediumId);
                                            setApprovalData(prev => ({ 
                                                ...prev, 
                                                storageMediumId: selectedMediumId,
                                                storageLocation: selectedMedium ? {
                                                    room: selectedMedium.room,
                                                    shelf: selectedMedium.shelf,
                                                    bin: selectedMedium.bin
                                                } : { room: '', shelf: '', bin: '' }
                                            }));
                                        }}
                                        label="Storage Medium"
                                        required
                                    >
                                        {storageMedia.filter(m => m.status === 'available').length === 0 ? (
                                            <MenuItem disabled>
                                                No available storage media. Create one in the Storage Media tab first.
                                            </MenuItem>
                                        ) : (
                                            storageMedia.filter(m => m.status === 'available').map((medium) => (
                                                <MenuItem key={medium.id} value={medium.id}>
                                                    {medium.type} ({medium.capacity}) - Room {medium.room}, Shelf {medium.shelf}, Bin {medium.bin}
                                                </MenuItem>
                                            ))
                                        )}
                                    </Select>
                                </FormControl>
                                {storageMedia.filter(m => m.status === 'available').length === 0 && (
                                    <Box sx={{ mt: 1 }}>
                                        <Typography variant="body2" color="warning.main">
                                            ⚠️ No storage media available. You need to create storage devices first.
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            Close this dialog, go to the "Storage Media" tab, and click "Create Storage Medium".
                                        </Typography>
                                    </Box>
                                )}
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Storage location will be auto-populated from the selected medium, but you can modify if needed:
                                </Typography>
                            </Grid>
                            <Grid item xs={4}>
                                <TextField
                                    fullWidth
                                    label="Room"
                                    value={approvalData.storageLocation?.room || ''}
                                    onChange={(e) => setApprovalData(prev => ({ 
                                        ...prev, 
                                        storageLocation: { ...prev.storageLocation, room: e.target.value }
                                    }))}
                                    required
                                />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField
                                    fullWidth
                                    label="Shelf"
                                    value={approvalData.storageLocation?.shelf || ''}
                                    onChange={(e) => setApprovalData(prev => ({ 
                                        ...prev, 
                                        storageLocation: { ...prev.storageLocation, shelf: e.target.value }
                                    }))}
                                    required
                                />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField
                                    fullWidth
                                    label="Bin"
                                    value={approvalData.storageLocation?.bin || ''}
                                    onChange={(e) => setApprovalData(prev => ({ 
                                        ...prev, 
                                        storageLocation: { ...prev.storageLocation, bin: e.target.value }
                                    }))}
                                    required
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Approval Notes"
                                    multiline
                                    rows={3}
                                    value={approvalData.notes}
                                    onChange={(e) => setApprovalData(prev => ({ ...prev, notes: e.target.value }))}
                                    placeholder="Any notes about the approval..."
                                />
                            </Grid>
                        </Grid>
                    ) : (
                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Rejection Reason"
                                    multiline
                                    rows={3}
                                    value={approvalData.rejectionReason}
                                    onChange={(e) => setApprovalData(prev => ({ ...prev, rejectionReason: e.target.value }))}
                                    placeholder="Please provide a reason for rejection..."
                                    required
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Additional Notes"
                                    multiline
                                    rows={2}
                                    value={approvalData.notes}
                                    onChange={(e) => setApprovalData(prev => ({ ...prev, notes: e.target.value }))}
                                    placeholder="Any additional notes..."
                                />
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setApprovalModalOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={handleApprovalSubmit} 
                        variant="contained"
                        color={approvalAction === 'approve' ? 'success' : 'error'}
                    >
                        {approvalAction === 'approve' ? 'Approve Batch' : 'Reject Batch'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Storage Creation Modal */}
            <Dialog open={storageModalOpen} onClose={() => setStorageModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Add New Storage Medium</DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <FormControl fullWidth>
                                <InputLabel>Type</InputLabel>
                                <Select
                                    value={newStorageData.type}
                                    onChange={(e) => setNewStorageData(prev => ({ ...prev, type: e.target.value }))}
                                    label="Type"
                                >
                                    <MenuItem value="HDD">Hard Drive (HDD)</MenuItem>
                                    <MenuItem value="SSD">Solid State Drive (SSD)</MenuItem>
                                    <MenuItem value="Tape">Tape Storage</MenuItem>
                                    <MenuItem value="Cloud">Cloud Storage</MenuItem>
                                    <MenuItem value="Network">Network Storage</MenuItem>
                                    <MenuItem value="Other">Other</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Capacity"
                                value={newStorageData.capacity}
                                onChange={(e) => setNewStorageData(prev => ({ ...prev, capacity: e.target.value }))}
                                placeholder="e.g., 4TB, 500GB"
                            />
                        </Grid>
                        <Grid item xs={4}>
                            <TextField
                                fullWidth
                                label="Room"
                                value={newStorageData.room}
                                onChange={(e) => setNewStorageData(prev => ({ ...prev, room: e.target.value }))}
                                placeholder="Room number"
                            />
                        </Grid>
                        <Grid item xs={4}>
                            <TextField
                                fullWidth
                                label="Shelf"
                                value={newStorageData.shelf}
                                onChange={(e) => setNewStorageData(prev => ({ ...prev, shelf: e.target.value }))}
                                placeholder="Shelf number"
                            />
                        </Grid>
                        <Grid item xs={4}>
                            <TextField
                                fullWidth
                                label="Bin"
                                value={newStorageData.bin}
                                onChange={(e) => setNewStorageData(prev => ({ ...prev, bin: e.target.value }))}
                                placeholder="Bin number"
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setStorageModalOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateStorage} variant="contained">
                        Create Storage Medium
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default DataManagerPortal;
