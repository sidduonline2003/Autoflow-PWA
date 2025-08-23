import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    Grid,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Typography,
    Box,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Divider
} from '@mui/material';
import {
    Add as AddIcon,
    Delete as DeleteIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../firebase';
import toast from 'react-hot-toast';

const InvoiceModal = ({ open, onClose, onSave, invoice = null, clients = [] }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        type: 'FINAL',
        clientId: '',
        eventId: '',
        dueDate: '',
        currency: 'INR',
        items: [{ desc: '', qty: 1, unitPrice: 0, taxRatePct: 18, category: 'Services' }],
        discount: { mode: 'AMOUNT', value: 0 },
        taxMode: 'EXCLUSIVE',
        shipping: 0,
        notes: '',
        internalNotes: ''
    });
    const [totals, setTotals] = useState({
        subTotal: 0,
        discountTotal: 0,
        taxTotal: 0,
        grandTotal: 0,
        amountDue: 0
    });
    const [events, setEvents] = useState([]);

    // Load events for selected client
    const loadClientEvents = async (clientId) => {
        if (!clientId) {
            setEvents([]);
            return;
        }

        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/events?clientId=${clientId}`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });

            if (response.ok) {
                const data = await response.json();
                setEvents(data);
            }
        } catch (error) {
            console.error('Error loading events:', error);
        }
    };

    // Calculate totals whenever items, discount, tax mode, or shipping changes
    useEffect(() => {
        const calculateTotals = () => {
            const subTotal = formData.items.reduce((sum, item) => 
                sum + (item.qty * item.unitPrice), 0
            );

            let discountTotal = 0;
            if (formData.discount.mode === 'PERCENT') {
                discountTotal = subTotal * (formData.discount.value / 100);
            } else {
                discountTotal = Math.min(formData.discount.value, subTotal);
            }

            const discountedSubtotal = subTotal - discountTotal;

            let taxTotal = 0;
            if (formData.taxMode === 'INCLUSIVE') {
                taxTotal = formData.items.reduce((sum, item) => 
                    sum + (item.qty * item.unitPrice * item.taxRatePct / (100 + item.taxRatePct)), 0
                );
            } else {
                taxTotal = formData.items.reduce((sum, item) => 
                    sum + (item.qty * item.unitPrice * item.taxRatePct / 100), 0
                );
                taxTotal = taxTotal * (discountedSubtotal / subTotal);
            }

            const grandTotal = formData.taxMode === 'INCLUSIVE' 
                ? discountedSubtotal + formData.shipping
                : discountedSubtotal + taxTotal + formData.shipping;

            setTotals({
                subTotal: Math.round(subTotal * 100) / 100,
                discountTotal: Math.round(discountTotal * 100) / 100,
                taxTotal: Math.round(taxTotal * 100) / 100,
                grandTotal: Math.round(grandTotal * 100) / 100,
                amountDue: Math.round(grandTotal * 100) / 100
            });
        };

        calculateTotals();
    }, [formData.items, formData.discount, formData.taxMode, formData.shipping]);

    // Initialize form data when invoice prop changes
    useEffect(() => {
        if (invoice) {
            setFormData({
                type: invoice.type || 'FINAL',
                clientId: invoice.clientId || '',
                eventId: invoice.eventId || '',
                dueDate: invoice.dueDate ? invoice.dueDate.split('T')[0] : '',
                currency: invoice.currency || 'INR',
                items: invoice.items || [{ desc: '', qty: 1, unitPrice: 0, taxRatePct: 18, category: 'Services' }],
                discount: invoice.discount || { mode: 'AMOUNT', value: 0 },
                taxMode: invoice.taxMode || 'EXCLUSIVE',
                shipping: invoice.shipping || 0,
                notes: invoice.notes || '',
                internalNotes: invoice.internalNotes || ''
            });

            if (invoice.clientId) {
                loadClientEvents(invoice.clientId);
            }
        } else {
            setFormData({
                type: 'FINAL',
                clientId: '',
                eventId: '',
                dueDate: '',
                currency: 'INR',
                items: [{ desc: '', qty: 1, unitPrice: 0, taxRatePct: 18, category: 'Services' }],
                discount: { mode: 'AMOUNT', value: 0 },
                taxMode: 'EXCLUSIVE',
                shipping: 0,
                notes: '',
                internalNotes: ''
            });
            setEvents([]);
        }
    }, [invoice, open]);

    // Set default due date when type changes to FINAL
    useEffect(() => {
        if (formData.type === 'FINAL' && !formData.dueDate) {
            const defaultDueDate = new Date();
            defaultDueDate.setDate(defaultDueDate.getDate() + 7); // Default to 7 days from now
            setFormData(prev => ({
                ...prev,
                dueDate: defaultDueDate.toISOString().split('T')[0]
            }));
        }
    }, [formData.type, formData.dueDate]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));

        if (field === 'clientId') {
            loadClientEvents(value);
            setFormData(prev => ({ ...prev, eventId: '' }));
        }
    };

    const handleItemChange = (index, field, value) => {
        const newItems = [...formData.items];
        newItems[index] = {
            ...newItems[index],
            [field]: field === 'qty' || field === 'unitPrice' || field === 'taxRatePct' 
                ? parseFloat(value) || 0 
                : value
        };
        setFormData(prev => ({ ...prev, items: newItems }));
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { desc: '', qty: 1, unitPrice: 0, taxRatePct: 18, category: 'Services' }]
        }));
    };

    const removeItem = (index) => {
        if (formData.items.length > 1) {
            const newItems = formData.items.filter((_, i) => i !== index);
            setFormData(prev => ({ ...prev, items: newItems }));
        }
    };

    const handleDiscountChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            discount: {
                ...prev.discount,
                [field]: field === 'value' ? parseFloat(value) || 0 : value
            }
        }));
    };

    const handleSave = async () => {
        if (!formData.clientId) {
            toast.error('Please select a client');
            return;
        }

        if (formData.items.length === 0 || formData.items.every(item => !item.desc.trim())) {
            toast.error('Please add at least one item');
            return;
        }

        if (totals.grandTotal <= 0) {
            toast.error('Invoice total must be positive');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                ...formData,
                dueDate: formData.type === 'FINAL' && formData.dueDate 
                    ? `${formData.dueDate}T23:59:59Z` 
                    : null
            };

            await onSave(payload);
            onClose();
        } catch (error) {
            toast.error(error.message || 'Failed to save invoice');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2
        }).format(amount || 0);
    };

    const getClientName = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client?.profile?.name || client?.displayName || 'Unknown';
    };

    const getEventName = (eventId) => {
        const event = events.find(e => e.id === eventId);
        return event?.eventName || 'Unknown';
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle>
                {invoice ? 'Edit Invoice' : 'Create New Invoice'}
            </DialogTitle>
            <DialogContent>
                <Grid container spacing={3}>
                    {/* Basic Information */}
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                            Basic Information
                        </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth>
                            <InputLabel>Invoice Type</InputLabel>
                            <Select
                                value={formData.type}
                                onChange={(e) => handleInputChange('type', e.target.value)}
                                label="Invoice Type"
                            >
                                <MenuItem value="BUDGET">Budget (Proforma)</MenuItem>
                                <MenuItem value="FINAL">Final (Tax Invoice)</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth>
                            <InputLabel>Client</InputLabel>
                            <Select
                                value={formData.clientId}
                                onChange={(e) => handleInputChange('clientId', e.target.value)}
                                label="Client"
                            >
                                {clients.map((client) => (
                                    <MenuItem key={client.id} value={client.id}>
                                        {getClientName(client.id)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth>
                            <InputLabel>Event (Optional)</InputLabel>
                            <Select
                                value={formData.eventId}
                                onChange={(e) => handleInputChange('eventId', e.target.value)}
                                label="Event (Optional)"
                                disabled={!formData.clientId}
                            >
                                <MenuItem value="">No Event</MenuItem>
                                {events.map((event) => (
                                    <MenuItem key={event.id} value={event.id}>
                                        {getEventName(event.id)}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    {formData.type === 'FINAL' && (
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Due Date"
                                type="date"
                                value={formData.dueDate}
                                onChange={(e) => handleInputChange('dueDate', e.target.value)}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                    )}

                    {/* Items */}
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                            Items
                        </Typography>
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Description</TableCell>
                                        <TableCell>Category</TableCell>
                                        <TableCell width="80px">Qty</TableCell>
                                        <TableCell width="120px">Unit Price</TableCell>
                                        <TableCell width="100px">Tax %</TableCell>
                                        <TableCell width="120px">Total</TableCell>
                                        <TableCell width="60px">Action</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {formData.items.map((item, index) => (
                                        <TableRow key={index}>
                                            <TableCell>
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    value={item.desc}
                                                    onChange={(e) => handleItemChange(index, 'desc', e.target.value)}
                                                    placeholder="Item description"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    value={item.category}
                                                    onChange={(e) => handleItemChange(index, 'category', e.target.value)}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    value={item.qty}
                                                    onChange={(e) => handleItemChange(index, 'qty', e.target.value)}
                                                    inputProps={{ min: 0, step: 0.01 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    value={item.unitPrice}
                                                    onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                                                    inputProps={{ min: 0, step: 0.01 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <TextField
                                                    size="small"
                                                    type="number"
                                                    value={item.taxRatePct}
                                                    onChange={(e) => handleItemChange(index, 'taxRatePct', e.target.value)}
                                                    inputProps={{ min: 0, max: 100, step: 0.01 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {formatCurrency(item.qty * item.unitPrice)}
                                            </TableCell>
                                            <TableCell>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => removeItem(index)}
                                                    disabled={formData.items.length === 1}
                                                >
                                                    <DeleteIcon />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <Button
                            startIcon={<AddIcon />}
                            onClick={addItem}
                            sx={{ mt: 1 }}
                        >
                            Add Item
                        </Button>
                    </Grid>

                    {/* Discount and Tax Settings */}
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                            Discount & Tax Settings
                        </Typography>
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <FormControl fullWidth>
                            <InputLabel>Discount Type</InputLabel>
                            <Select
                                value={formData.discount.mode}
                                onChange={(e) => handleDiscountChange('mode', e.target.value)}
                                label="Discount Type"
                            >
                                <MenuItem value="AMOUNT">Fixed Amount</MenuItem>
                                <MenuItem value="PERCENT">Percentage</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <TextField
                            fullWidth
                            label={formData.discount.mode === 'PERCENT' ? 'Discount (%)' : 'Discount Amount'}
                            type="number"
                            value={formData.discount.value}
                            onChange={(e) => handleDiscountChange('value', e.target.value)}
                            inputProps={{ min: 0, step: 0.01 }}
                        />
                    </Grid>

                    <Grid item xs={12} sm={4}>
                        <FormControl fullWidth>
                            <InputLabel>Tax Mode</InputLabel>
                            <Select
                                value={formData.taxMode}
                                onChange={(e) => handleInputChange('taxMode', e.target.value)}
                                label="Tax Mode"
                            >
                                <MenuItem value="EXCLUSIVE">Tax Exclusive</MenuItem>
                                <MenuItem value="INCLUSIVE">Tax Inclusive</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <TextField
                            fullWidth
                            label="Shipping Amount"
                            type="number"
                            value={formData.shipping}
                            onChange={(e) => handleInputChange('shipping', parseFloat(e.target.value) || 0)}
                            inputProps={{ min: 0, step: 0.01 }}
                        />
                    </Grid>

                    {/* Notes */}
                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Notes (visible to client)"
                            multiline
                            rows={3}
                            value={formData.notes}
                            onChange={(e) => handleInputChange('notes', e.target.value)}
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Internal Notes (not visible to client)"
                            multiline
                            rows={2}
                            value={formData.internalNotes}
                            onChange={(e) => handleInputChange('internalNotes', e.target.value)}
                        />
                    </Grid>

                    {/* Totals */}
                    <Grid item xs={12}>
                        <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Totals
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography>Subtotal:</Typography>
                                        <Typography>{formatCurrency(totals.subTotal)}</Typography>
                                    </Box>
                                </Grid>
                                <Grid item xs={6}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography>Discount:</Typography>
                                        <Typography>-{formatCurrency(totals.discountTotal)}</Typography>
                                    </Box>
                                </Grid>
                                <Grid item xs={6}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography>Tax:</Typography>
                                        <Typography>{formatCurrency(totals.taxTotal)}</Typography>
                                    </Box>
                                </Grid>
                                <Grid item xs={6}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography>Shipping:</Typography>
                                        <Typography>{formatCurrency(formData.shipping)}</Typography>
                                    </Box>
                                </Grid>
                                <Grid item xs={12}>
                                    <Divider sx={{ my: 1 }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="h6">Grand Total:</Typography>
                                        <Typography variant="h6" color="primary">
                                            {formatCurrency(totals.grandTotal)}
                                        </Typography>
                                    </Box>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>
                    Cancel
                </Button>
                <Button 
                    onClick={handleSave} 
                    variant="contained" 
                    disabled={loading}
                >
                    {loading ? 'Saving...' : (invoice ? 'Update' : 'Create')}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default InvoiceModal;
