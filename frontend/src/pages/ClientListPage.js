import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import {
    Box, Typography, Button, TextField, Table,
    TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, CircularProgress,
    IconButton, Menu, MenuItem, Link, Grid, FormControl, InputLabel, Select, Checkbox, Toolbar, Tooltip
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import toast from 'react-hot-toast';
import Papa from 'papaparse'; 

import AddClientModal from '../components/AddClientModal';
import EditClientModal from '../components/EditClientModal';
import DeleteConfirmationDialog from '../components/DeleteConfirmationDialog';
import AdminLayout from '../components/layout/AdminLayout';

const EnhancedTableToolbar = ({ numSelected, onDeactivate, onExport }) => {
    return (
        <Toolbar sx={{ pl: { sm: 2 }, pr: { xs: 1, sm: 1 }, ...(numSelected > 0 && { bgcolor: 'primary.lighter' }) }}>
            {numSelected > 0 ? (
                <Typography sx={{ flex: '1 1 100%' }} color="inherit" variant="subtitle1" component="div">
                    {numSelected} selected
                </Typography>
            ) : (
                <Typography sx={{ flex: '1 1 100%' }} variant="h6" id="tableTitle" component="div">
                    Clients
                </Typography>
            )}

            {numSelected > 0 && (
                <>
                    <Tooltip title="Export Selected">
                        <IconButton onClick={onExport}><FileDownloadIcon /></IconButton>
                    </Tooltip>
                    <Tooltip title="Deactivate Selected">
                        <IconButton onClick={onDeactivate}><DeleteIcon /></IconButton>
                    </Tooltip>
                </>
            )}
        </Toolbar>
    );
};


const ClientListPage = () => {
    const { claims } = useAuth();
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selected, setSelected] = useState([]);

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    
    const [selectedClient, setSelectedClient] = useState(null);
    const [anchorEl, setAnchorEl] = useState(null);

    useEffect(() => {
        if (!claims?.orgId) { setLoading(false); return; }
        const unsubscribe = onSnapshot(collection(db, 'organizations', claims.orgId, 'clients'), (snapshot) => {
            setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data().profile })));
            setLoading(false);
        }, (error) => {
            toast.error("Failed to fetch clients.");
            setLoading(false);
        });
        return () => unsubscribe();
    }, [claims]);

    const handleMenuClick = (event, client) => { setAnchorEl(event.currentTarget); setSelectedClient(client); };
    const handleMenuClose = () => { setAnchorEl(null); setSelectedClient(null); };
    
    const callApi = async (endpoint, method, body = null) => {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch(`/api${endpoint}`, {
            method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
            ...(body && { body: JSON.stringify(body) }),
        });
        if (!response.ok) throw new Error((await response.json()).detail || 'An error occurred.');
        return response.json();
    };
    
    const handleAddClient = (data) => callApi('/clients/', 'POST', data);
    const handleUpdateClient = (id, data) => toast.promise(callApi(`/clients/${id}`, 'PUT', data), { loading: 'Updating...', success: 'Client updated!', error: (err) => err.message });
    const handleDeleteClient = () => toast.promise(callApi(`/clients/${selectedClient.id}`, 'DELETE'), { loading: 'Deactivating...', success: 'Client deactivated.', error: (err) => err.message }).finally(() => setIsDeleteDialogOpen(false));
    
    const handleBulkDeactivate = () => {
        toast.promise(callApi('/clients/bulk-update', 'POST', { clientIds: selected, action: 'deactivate' }), {
            loading: `Deactivating ${selected.length} clients...`,
            success: 'Clients deactivated!',
            error: (err) => err.message,
        }).then(() => setSelected([]));
    };
    
    const handleExportCsv = () => {
        const dataToExport = clients.filter(client => selected.includes(client.id));
        const csv = Papa.unparse(dataToExport);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        link.setAttribute('download', `clients-export-${new Date().toISOString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`Exported ${dataToExport.length} clients.`);
        setSelected([]);
    };

    const handleSelectAllClick = (event) => setSelected(event.target.checked ? filteredClients.map((n) => n.id) : []);
    const handleCheckboxClick = (event, id) => {
        const selectedIndex = selected.indexOf(id);
        let newSelected = [];
        if (selectedIndex === -1) newSelected = newSelected.concat(selected, id);
        else if (selectedIndex === 0) newSelected = newSelected.concat(selected.slice(1));
        else if (selectedIndex === selected.length - 1) newSelected = newSelected.concat(selected.slice(0, -1));
        else if (selectedIndex > 0) newSelected = newSelected.concat(selected.slice(0, selectedIndex), selected.slice(selectedIndex + 1));
        setSelected(newSelected);
    };

    const filteredClients = useMemo(() => clients.filter(client => {
        const matchesSearchTerm = (client.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (client.email?.toLowerCase() || '').includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
        return matchesSearchTerm && matchesStatus;
    }), [clients, searchTerm, statusFilter]);
    
    const headerActions = (
        <Button variant="contained" onClick={() => setIsAddModalOpen(true)}>
            Add New Client
        </Button>
    );

    return (
        <AdminLayout pageTitle="Client Management" actions={headerActions} maxWidth="lg">
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <>
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid xs={12} sm={8}>
                            <TextField
                                fullWidth
                                label="Search Clients..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </Grid>
                        <Grid xs={12} sm={4}>
                            <FormControl fullWidth>
                                <InputLabel>Status</InputLabel>
                                <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
                                    <MenuItem value="all">All</MenuItem>
                                    <MenuItem value="active">Active</MenuItem>
                                    <MenuItem value="inactive">Inactive</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>

                    <Paper sx={{ width: '100%', mb: 2 }}>
                        <EnhancedTableToolbar
                            numSelected={selected.length}
                            onDeactivate={handleBulkDeactivate}
                            onExport={handleExportCsv}
                        />
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                indeterminate={selected.length > 0 && selected.length < filteredClients.length}
                                                checked={filteredClients.length > 0 && selected.length === filteredClients.length}
                                                onChange={handleSelectAllClick}
                                            />
                                        </TableCell>
                                        <TableCell>Name</TableCell>
                                        <TableCell>Email</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredClients.map((client) => {
                                        const isItemSelected = selected.indexOf(client.id) !== -1;
                                        return (
                                            <TableRow
                                                hover
                                                onClick={(event) => handleCheckboxClick(event, client.id)}
                                                role="checkbox"
                                                aria-checked={isItemSelected}
                                                tabIndex={-1}
                                                key={client.id}
                                                selected={isItemSelected}
                                            >
                                                <TableCell padding="checkbox">
                                                    <Checkbox checked={isItemSelected} />
                                                </TableCell>
                                                <TableCell>
                                                    <Link component={RouterLink} to={`/client/${client.id}`}>
                                                        {client.name}
                                                    </Link>
                                                </TableCell>
                                                <TableCell>{client.email}</TableCell>
                                                <TableCell>
                                                    <Typography
                                                        sx={{
                                                            fontWeight: 'bold',
                                                            color: client.status === 'active' ? 'success.main' : 'error.main',
                                                        }}
                                                    >
                                                        {client.status}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <IconButton
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleMenuClick(e, client);
                                                        }}
                                                    >
                                                        <MoreVertIcon />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </>
            )}

            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
                <MenuItem onClick={() => setIsEditModalOpen(true)}>Edit</MenuItem>
                <MenuItem onClick={() => setIsDeleteDialogOpen(true)} sx={{ color: 'error.main' }}>
                    Deactivate
                </MenuItem>
            </Menu>
            <AddClientModal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onSubmit={handleAddClient} />
            {selectedClient && (
                <EditClientModal
                    open={isEditModalOpen}
                    onClose={() => {
                        handleMenuClose();
                        setIsEditModalOpen(false);
                    }}
                    onSubmit={handleUpdateClient}
                    client={selectedClient}
                />
            )}
            {selectedClient && (
                <DeleteConfirmationDialog
                    open={isDeleteDialogOpen}
                    onClose={() => {
                        handleMenuClose();
                        setIsDeleteDialogOpen(false);
                    }}
                    onConfirm={handleDeleteClient}
                    clientName={selectedClient.name}
                />
            )}
        </AdminLayout>
    );
};

export default ClientListPage;
