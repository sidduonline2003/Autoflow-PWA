import React, { useState } from 'react';
import {
    Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Chip, IconButton, Tooltip, Dialog,
    DialogTitle, DialogContent, DialogActions, TextField, FormControl,
    InputLabel, Select, MenuItem, Alert, Grid, Card, CardContent
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    PlayArrow as RunIcon,
    Pause as PauseIcon,
    Visibility as ViewIcon,
    Delete as DeleteIcon,
    PlayArrow
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const SubscriptionManagement = ({ subscriptions, vendors, onRefresh }) => {
    const { user } = useAuth();
    const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
    const [selectedSubscription, setSelectedSubscription] = useState(null);
    const [formData, setFormData] = useState({
        vendorId: '',
        name: '',
        cadence: 'MONTHLY',
        nextRunAt: new Date(),
        amountTemplate: {
            items: [{ description: '', quantity: 1, unitPrice: 0, taxRatePct: 0, category: 'Subscriptions' }],
            taxMode: 'EXCLUSIVE'
        },
        dueInDays: 7,
        active: true,
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

    const formatDate = (dateString) => {
        return dateString ? new Date(dateString).toLocaleDateString('en-IN') : '-';
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const getVendorName = (vendorId) => {
        const vendor = vendors.find(v => v.id === vendorId);
        return vendor?.name || 'Unknown Vendor';
    };

    const getCadenceColor = (cadence) => {
        const colors = {
            'MONTHLY': 'primary',
            'QUARTERLY': 'secondary',
            'YEARLY': 'info'
        };
        return colors[cadence] || 'default';
    };

    const calculateEstimatedAmount = (template) => {
        if (!template.items || template.items.length === 0) return 0;
        
        const subtotal = template.items.reduce((sum, item) => {
            return sum + (item.quantity * item.unitPrice);
        }, 0);
        
        if (template.taxMode === 'EXCLUSIVE') {
            const tax = template.items.reduce((sum, item) => {
                return sum + (item.quantity * item.unitPrice * (item.taxRatePct / 100));
            }, 0);
            return subtotal + tax;
        }
        
        return subtotal;
    };

    const handleOpenModal = (subscription = null) => {
        if (subscription) {
            setSelectedSubscription(subscription);
            setFormData({
                vendorId: subscription.vendorId,
                name: subscription.name,
                cadence: subscription.cadence,
                nextRunAt: new Date(subscription.nextRunAt),
                amountTemplate: subscription.amountTemplate || {
                    items: [{ description: '', quantity: 1, unitPrice: 0, taxRatePct: 0, category: 'Subscriptions' }],
                    taxMode: 'EXCLUSIVE'
                },
                dueInDays: subscription.dueInDays || 7,
                active: subscription.active,
                notes: subscription.notes || ''
            });
        } else {
            setSelectedSubscription(null);
            setFormData({
                vendorId: '',
                name: '',
                cadence: 'MONTHLY',
                nextRunAt: new Date(),
                amountTemplate: {
                    items: [{ description: '', quantity: 1, unitPrice: 0, taxRatePct: 0, category: 'Subscriptions' }],
                    taxMode: 'EXCLUSIVE'
                },
                dueInDays: 7,
                active: true,
                notes: ''
            });
        }
        setSubscriptionModalOpen(true);
    };

    const handleCloseModal = () => {
        setSubscriptionModalOpen(false);
        setSelectedSubscription(null);
    };

    const handleSaveSubscription = async () => {
        try {
            if (!formData.vendorId) {
                toast.error('Please select a vendor');
                return;
            }

            if (!formData.name.trim()) {
                toast.error('Subscription name is required');
                return;
            }

            if (!formData.amountTemplate.items[0].description) {
                toast.error('Please add at least one item');
                return;
            }

            const subscriptionData = {
                ...formData,
                nextRunAt: formData.nextRunAt.toISOString()
            };

            if (selectedSubscription) {
                await callApi(`/ap/subscriptions/${selectedSubscription.id}`, 'PUT', subscriptionData);
                toast.success('Subscription updated successfully');
            } else {
                await callApi('/ap/subscriptions', 'POST', subscriptionData);
                toast.success('Subscription created successfully');
            }

            handleCloseModal();
            onRefresh();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleRunSubscription = async (subscriptionId) => {
        try {
            await callApi(`/ap/subscriptions/${subscriptionId}/run`, 'POST');
            toast.success('Subscription run successfully - bill created');
            onRefresh();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleToggleSubscription = async (subscriptionId, currentStatus) => {
        try {
            await callApi(`/ap/subscriptions/${subscriptionId}`, 'PUT', { active: !currentStatus });
            toast.success(`Subscription ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
            onRefresh();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const addItemRow = () => {
        const newItems = [...formData.amountTemplate.items, 
            { description: '', quantity: 1, unitPrice: 0, taxRatePct: 0, category: 'Subscriptions' }
        ];
        setFormData({
            ...formData,
            amountTemplate: { ...formData.amountTemplate, items: newItems }
        });
    };

    const removeItemRow = (index) => {
        if (formData.amountTemplate.items.length > 1) {
            const newItems = formData.amountTemplate.items.filter((_, i) => i !== index);
            setFormData({
                ...formData,
                amountTemplate: { ...formData.amountTemplate, items: newItems }
            });
        }
    };

    const updateItem = (index, field, value) => {
        const newItems = [...formData.amountTemplate.items];
        newItems[index] = { ...newItems[index], [field]: value };
        setFormData({
            ...formData,
            amountTemplate: { ...formData.amountTemplate, items: newItems }
        });
    };

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6">
                        Subscription Management
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenModal()}
                    >
                        New Subscription
                    </Button>
                </Box>

                {subscriptions.length === 0 ? (
                    <Alert severity="info">
                        No subscriptions found. Click "New Subscription" to create your first recurring bill.
                    </Alert>
                ) : (
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Vendor</TableCell>
                                    <TableCell>Cadence</TableCell>
                                    <TableCell>Next Run</TableCell>
                                    <TableCell>Last Run</TableCell>
                                    <TableCell>Est. Amount</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {subscriptions.map((subscription) => (
                                    <TableRow key={subscription.id}>
                                        <TableCell>
                                            <Typography sx={{ fontWeight: 'bold' }}>
                                                {subscription.name}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{getVendorName(subscription.vendorId)}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={subscription.cadence}
                                                color={getCadenceColor(subscription.cadence)}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>{formatDate(subscription.nextRunAt)}</TableCell>
                                        <TableCell>{formatDate(subscription.lastRunAt) || 'Never'}</TableCell>
                                        <TableCell>
                                            {formatCurrency(calculateEstimatedAmount(subscription.amountTemplate))}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={subscription.active ? 'Active' : 'Inactive'}
                                                color={subscription.active ? 'success' : 'default'}
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
                                                
                                                <Tooltip title="Edit Subscription">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleOpenModal(subscription)}
                                                    >
                                                        <EditIcon />
                                                    </IconButton>
                                                </Tooltip>

                                                {subscription.active && (
                                                    <Tooltip title="Run Now">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleRunSubscription(subscription.id)}
                                                            color="primary"
                                                        >
                                                            <RunIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}

                                                <Tooltip title={subscription.active ? 'Deactivate' : 'Activate'}>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleToggleSubscription(subscription.id, subscription.active)}
                                                        color={subscription.active ? 'warning' : 'success'}
                                                    >
                                                        {subscription.active ? <PauseIcon /> : <PlayArrow />}
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}

                {/* Subscription Modal */}
                <Dialog 
                    open={subscriptionModalOpen} 
                    onClose={handleCloseModal}
                    maxWidth="lg"
                    fullWidth
                >
                    <DialogTitle>
                        {selectedSubscription ? 'Edit Subscription' : 'Create New Subscription'}
                    </DialogTitle>
                    <DialogContent>
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Vendor *</InputLabel>
                                    <Select
                                        value={formData.vendorId}
                                        onChange={(e) => setFormData({ ...formData, vendorId: e.target.value })}
                                        label="Vendor *"
                                    >
                                        {vendors.filter(v => v.status === 'ACTIVE').map((vendor) => (
                                            <MenuItem key={vendor.id} value={vendor.id}>
                                                {vendor.name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Subscription Name *"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Cadence</InputLabel>
                                    <Select
                                        value={formData.cadence}
                                        onChange={(e) => setFormData({ ...formData, cadence: e.target.value })}
                                        label="Cadence"
                                    >
                                        <MenuItem value="MONTHLY">Monthly</MenuItem>
                                        <MenuItem value="QUARTERLY">Quarterly</MenuItem>
                                        <MenuItem value="YEARLY">Yearly</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <DatePicker
                                    label="Next Run Date"
                                    value={formData.nextRunAt}
                                    onChange={(date) => setFormData({ ...formData, nextRunAt: date })}
                                    slotProps={{ textField: { fullWidth: true } }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Due in Days"
                                    type="number"
                                    value={formData.dueInDays}
                                    onChange={(e) => setFormData({ ...formData, dueInDays: parseInt(e.target.value) || 7 })}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Tax Mode</InputLabel>
                                    <Select
                                        value={formData.amountTemplate.taxMode}
                                        onChange={(e) => setFormData({ 
                                            ...formData, 
                                            amountTemplate: { ...formData.amountTemplate, taxMode: e.target.value }
                                        })}
                                        label="Tax Mode"
                                    >
                                        <MenuItem value="EXCLUSIVE">Tax Exclusive</MenuItem>
                                        <MenuItem value="INCLUSIVE">Tax Inclusive</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>

                            {/* Items Section */}
                            <Grid item xs={12}>
                                <Typography variant="h6" gutterBottom>
                                    Item Template
                                </Typography>
                                {formData.amountTemplate.items.map((item, index) => (
                                    <Card key={index} sx={{ mb: 2 }}>
                                        <CardContent>
                                            <Grid container spacing={2}>
                                                <Grid item xs={12} sm={4}>
                                                    <TextField
                                                        fullWidth
                                                        label="Description *"
                                                        value={item.description}
                                                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                                                    />
                                                </Grid>
                                                <Grid item xs={6} sm={2}>
                                                    <TextField
                                                        fullWidth
                                                        label="Quantity"
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                                                    />
                                                </Grid>
                                                <Grid item xs={6} sm={2}>
                                                    <TextField
                                                        fullWidth
                                                        label="Unit Price"
                                                        type="number"
                                                        value={item.unitPrice}
                                                        onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                                                    />
                                                </Grid>
                                                <Grid item xs={6} sm={2}>
                                                    <TextField
                                                        fullWidth
                                                        label="Tax %"
                                                        type="number"
                                                        value={item.taxRatePct}
                                                        onChange={(e) => updateItem(index, 'taxRatePct', parseFloat(e.target.value) || 0)}
                                                    />
                                                </Grid>
                                                <Grid item xs={6} sm={2}>
                                                    <FormControl fullWidth>
                                                        <InputLabel>Category</InputLabel>
                                                        <Select
                                                            value={item.category}
                                                            onChange={(e) => updateItem(index, 'category', e.target.value)}
                                                            label="Category"
                                                        >
                                                            <MenuItem value="Subscriptions">Subscriptions</MenuItem>
                                                            <MenuItem value="Utilities">Utilities</MenuItem>
                                                            <MenuItem value="Travel">Travel</MenuItem>
                                                            <MenuItem value="Equipment">Equipment</MenuItem>
                                                            <MenuItem value="Other">Other</MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                </Grid>
                                                {formData.amountTemplate.items.length > 1 && (
                                                    <Grid item xs={12}>
                                                        <Button
                                                            size="small"
                                                            color="error"
                                                            onClick={() => removeItemRow(index)}
                                                        >
                                                            Remove Item
                                                        </Button>
                                                    </Grid>
                                                )}
                                            </Grid>
                                        </CardContent>
                                    </Card>
                                ))}
                                <Button onClick={addItemRow} startIcon={<AddIcon />}>
                                    Add Item
                                </Button>
                            </Grid>

                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={3}
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
                            onClick={handleSaveSubscription}
                            variant="contained"
                        >
                            {selectedSubscription ? 'Update' : 'Create'}
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </LocalizationProvider>
    );
};

export default SubscriptionManagement;
