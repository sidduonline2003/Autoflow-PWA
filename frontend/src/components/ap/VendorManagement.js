import React, { useState } from 'react';
import {
    Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Chip, IconButton, Tooltip, Dialog,
    DialogTitle, DialogContent, DialogActions, TextField, FormControl,
    InputLabel, Select, MenuItem, Alert, Grid
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Business as BusinessIcon,
    Delete as DeleteIcon,
    Visibility as ViewIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const VendorManagement = ({ vendors, onRefresh }) => {
    const { user } = useAuth();
    const [vendorModalOpen, setVendorModalOpen] = useState(false);
    const [selectedVendor, setSelectedVendor] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        billingAddress: '',
        taxId: '',
        defaultCategory: 'Other',
        status: 'ACTIVE',
        notes: ''
    });

    const callApi = async (endpoint, method = 'GET', body = null) => {
        if (!user) {
            throw new Error('Not authenticated');
        }
        
        const idToken = await user.getIdToken();
        const response = await fetch(`/api${endpoint}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            ...(body && { body: JSON.stringify(body) })
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            let message = 'An error occurred';
            try {
                const parsed = JSON.parse(errorData);
                message = parsed.detail || parsed.message || message;
            } catch {
                message = errorData || message;
            }
            throw new Error(message);
        }

        return response.json();
    };

    const handleOpenModal = (vendor = null) => {
        if (vendor) {
            setSelectedVendor(vendor);
            setFormData({
                name: vendor.name || '',
                email: vendor.email || '',
                phone: vendor.phone || '',
                billingAddress: vendor.billingAddress || '',
                taxId: vendor.taxId || '',
                defaultCategory: vendor.defaultCategory || 'Other',
                status: vendor.status || 'ACTIVE',
                notes: vendor.notes || ''
            });
        } else {
            setSelectedVendor(null);
            setFormData({
                name: '',
                email: '',
                phone: '',
                billingAddress: '',
                taxId: '',
                defaultCategory: 'Other',
                status: 'ACTIVE',
                notes: ''
            });
        }
        setVendorModalOpen(true);
    };

    const handleCloseModal = () => {
        setVendorModalOpen(false);
        setSelectedVendor(null);
        setFormData({
            name: '',
            email: '',
            phone: '',
            billingAddress: '',
            taxId: '',
            defaultCategory: 'Other',
            status: 'ACTIVE',
            notes: ''
        });
    };

    const handleSaveVendor = async () => {
        try {
            if (!formData.name.trim()) {
                toast.error('Vendor name is required');
                return;
            }

            if (selectedVendor) {
                // Update existing vendor
                await callApi(`/ap/vendors/${selectedVendor.id}`, 'PUT', formData);
                toast.success('Vendor updated successfully');
            } else {
                // Create new vendor
                await callApi('/ap/vendors', 'POST', formData);
                toast.success('Vendor created successfully');
            }

            handleCloseModal();
            onRefresh();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleDeleteVendor = async (vendorId) => {
        if (!window.confirm('Are you sure you want to delete this vendor?')) {
            return;
        }

        try {
            // Instead of deleting, we'll mark as inactive
            await callApi(`/ap/vendors/${vendorId}`, 'PUT', { status: 'INACTIVE' });
            toast.success('Vendor deactivated successfully');
            onRefresh();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const getStatusColor = (status) => {
        return status === 'ACTIVE' ? 'success' : 'default';
    };

    const getCategoryColor = (category) => {
        const colors = {
            'Subscriptions': 'primary',
            'Utilities': 'secondary',
            'Travel': 'info',
            'Equipment': 'warning',
            'Other': 'default'
        };
        return colors[category] || 'default';
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6">
                    Vendor Management
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenModal()}
                >
                    Add Vendor
                </Button>
            </Box>

            {vendors.length === 0 ? (
                <Alert severity="info">
                    No vendors found. Click "Add Vendor" to create your first vendor.
                </Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Email</TableCell>
                                <TableCell>Phone</TableCell>
                                <TableCell>Default Category</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {vendors.map((vendor) => (
                                <TableRow key={vendor.id}>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <BusinessIcon color="primary" />
                                            <Typography sx={{ fontWeight: 'bold' }}>
                                                {vendor.name}
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>{vendor.email || '-'}</TableCell>
                                    <TableCell>{vendor.phone || '-'}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={vendor.defaultCategory}
                                            color={getCategoryColor(vendor.defaultCategory)}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={vendor.status}
                                            color={getStatusColor(vendor.status)}
                                            size="small"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <Tooltip title="View Details">
                                                <IconButton size="small">
                                                    <ViewIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Edit Vendor">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => handleOpenModal(vendor)}
                                                >
                                                    <EditIcon />
                                                </IconButton>
                                            </Tooltip>
                                            {vendor.status === 'ACTIVE' && (
                                                <Tooltip title="Deactivate Vendor">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleDeleteVendor(vendor.id)}
                                                        color="error"
                                                    >
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Vendor Modal */}
            <Dialog 
                open={vendorModalOpen} 
                onClose={handleCloseModal}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    {selectedVendor ? 'Edit Vendor' : 'Add New Vendor'}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Vendor Name *"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Phone"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Tax ID"
                                value={formData.taxId}
                                onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel>Default Category</InputLabel>
                                <Select
                                    value={formData.defaultCategory}
                                    onChange={(e) => setFormData({ ...formData, defaultCategory: e.target.value })}
                                    label="Default Category"
                                >
                                    <MenuItem value="Subscriptions">Subscriptions</MenuItem>
                                    <MenuItem value="Utilities">Utilities</MenuItem>
                                    <MenuItem value="Travel">Travel</MenuItem>
                                    <MenuItem value="Equipment">Equipment</MenuItem>
                                    <MenuItem value="Other">Other</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel>Status</InputLabel>
                                <Select
                                    value={formData.status}
                                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    label="Status"
                                >
                                    <MenuItem value="ACTIVE">Active</MenuItem>
                                    <MenuItem value="INACTIVE">Inactive</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                label="Billing Address"
                                value={formData.billingAddress}
                                onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={2}
                                label="Notes"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseModal}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSaveVendor}
                        variant="contained"
                    >
                        {selectedVendor ? 'Update' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default VendorManagement;
