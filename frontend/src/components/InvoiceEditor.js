import React, { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Grid, TextField, Button,
    FormControl, InputLabel, Select, MenuItem, IconButton,
    Table, TableHead, TableBody, TableRow, TableCell,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Divider, Chip
} from '@mui/material';
import {
    Add as AddIcon,
    Delete as DeleteIcon,
    Save as SaveIcon,
    Send as SendIcon,
    Preview as PreviewIcon,
    GetApp as DownloadIcon,
    Email as EmailIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';

const InvoiceEditor = ({ open, onClose, invoiceId = null, quoteId = null }) => {
    const { user, claims } = useAuth();
    const [loading, setLoading] = useState(false);
    const [clients, setClients] = useState([]);
    const [events, setEvents] = useState([]);
    
    const [formData, setFormData] = useState({
        clientId: '',
        eventId: '',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
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
        amountPaid: 0,
        amountDue: 0
    });

    const callApi = async (endpoint, method = 'GET', body = null) => {
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
            const errorData = await response.json();
            throw new Error(errorData.detail || 'An error occurred');
        }
        
        return response.json();
    };

    const loadData = async () => {
        try {
            // Load clients
            const clientsResponse = await callApi('/clients');
            setClients(clientsResponse);
            
            // Load events
            const eventsResponse = await callApi('/events');
            setEvents(eventsResponse);
            
            // Load existing invoice if editing
            if (invoiceId) {
                const invoiceResponse = await callApi(`/ar/invoices/${invoiceId}`);
                setFormData({
                    ...invoiceResponse,
                    dueDate: new Date(invoiceResponse.dueDate)
                });
                setTotals(invoiceResponse.totals);
            }
            
            // Load quote if converting
            if (quoteId) {
                const quoteResponse = await callApi(`/ar/quotes/${quoteId}`);
                setFormData({
                    clientId: quoteResponse.clientId,
                    eventId: quoteResponse.eventId || '',
                    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    currency: quoteResponse.currency,
                    items: quoteResponse.items,
                    discount: quoteResponse.discount,
                    taxMode: quoteResponse.taxMode,
                    shipping: quoteResponse.shipping,
                    notes: quoteResponse.notes || '',
                    internalNotes: ''
                });
                calculateTotals(quoteResponse.items, quoteResponse.discount, quoteResponse.taxMode, quoteResponse.shipping);
            }
            
        } catch (error) {
            console.error('Error loading data:', error);
            toast.error('Failed to load data: ' + error.message);
        }
    };

    useEffect(() => {
        if (open && claims?.orgId) {
            loadData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, claims, invoiceId, quoteId]);

    const calculateTotals = (items, discount, taxMode, shipping) => {
        const subTotal = items.reduce((sum, item) => sum + (item.qty * item.unitPrice), 0);
        
        let discountTotal = 0;
        if (discount.mode === 'PERCENT') {
            discountTotal = subTotal * (discount.value / 100);
        } else {
            discountTotal = Math.min(discount.value, subTotal);
        }
        
        const discountedSubtotal = subTotal - discountTotal;
        
        let taxTotal = 0;
        if (taxMode === 'INCLUSIVE') {
            // Tax is included in the prices
            taxTotal = items.reduce((sum, item) => 
                sum + (item.qty * item.unitPrice * item.taxRatePct / (100 + item.taxRatePct)), 0
            );
        } else {
            // Tax is exclusive
            taxTotal = items.reduce((sum, item) => 
                sum + ((item.qty * item.unitPrice) * (item.taxRatePct / 100)), 0
            );
            // Apply discount to tax calculation
            taxTotal = taxTotal * (discountedSubtotal / subTotal) || 0;
        }
        
        const grandTotal = taxMode === 'INCLUSIVE' 
            ? discountedSubtotal + shipping
            : discountedSubtotal + taxTotal + shipping;
        
        const newTotals = {
            subTotal: Math.round(subTotal * 100) / 100,
            discountTotal: Math.round(discountTotal * 100) / 100,
            taxTotal: Math.round(taxTotal * 100) / 100,
            grandTotal: Math.round(grandTotal * 100) / 100,
            amountPaid: totals.amountPaid || 0,
            amountDue: Math.round(grandTotal * 100) / 100 - (totals.amountPaid || 0)
        };
        
        setTotals(newTotals);
        return newTotals;
    };

    useEffect(() => {
        calculateTotals(formData.items, formData.discount, formData.taxMode, formData.shipping);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.items, formData.discount, formData.taxMode, formData.shipping]);

    const addLineItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { desc: '', qty: 1, unitPrice: 0, taxRatePct: 18, category: 'Services' }]
        }));
    };

    const removeLineItem = (index) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.filter((_, i) => i !== index)
        }));
    };

    const updateLineItem = (index, field, value) => {
        setFormData(prev => ({
            ...prev,
            items: prev.items.map((item, i) => 
                i === index ? { ...item, [field]: value } : item
            )
        }));
    };

    const handleSave = async (sendImmediately = false) => {
        try {
            setLoading(true);
            
            const saveData = {
                ...formData,
                dueDate: formData.dueDate.toISOString(),
                ...(sendImmediately && { status: 'SENT' })
            };
            
            if (invoiceId) {
                await callApi(`/ar/invoices/${invoiceId}`, 'PUT', saveData);
                toast.success(sendImmediately ? 'Invoice sent successfully' : 'Invoice updated successfully');
            } else {
                const response = await callApi('/ar/invoices', 'POST', saveData);
                if (sendImmediately) {
                    await callApi(`/ar/invoices/${response.invoiceId}`, 'PUT', { status: 'SENT' });
                    toast.success('Invoice created and sent successfully');
                } else {
                    toast.success('Invoice created successfully');
                }
            }
            
            onClose();
        } catch (error) {
            toast.error('Failed to save invoice: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!invoiceId) {
            toast.error('Please save the invoice first');
            return;
        }

        try {
            setLoading(true);
            const token = await user.getIdToken();
            
            const response = await fetch(`${process.env.REACT_APP_API_URL}/ar/invoices/${invoiceId}/pdf`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to generate PDF');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Invoice-${invoiceId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            toast.success('PDF downloaded successfully');
        } catch (error) {
            toast.error('Failed to download PDF: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSendEmail = async () => {
        if (!invoiceId) {
            toast.error('Please save the invoice first');
            return;
        }

        try {
            setLoading(true);
            const response = await callApi(`/ar/invoices/${invoiceId}/send`, 'POST');
            toast.success('Invoice sent via email successfully');
            onClose(); // Refresh parent component
        } catch (error) {
            toast.error('Failed to send email: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    };

    const clientEvents = events.filter(event => event.clientId === formData.clientId);

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
                <DialogTitle>
                    {invoiceId ? 'Edit Invoice' : 'Create Invoice'}
                    {quoteId && <Chip label="From Quote" color="info" size="small" sx={{ ml: 1 }} />}
                </DialogTitle>
                
                <DialogContent>
                    <Grid container spacing={3}>
                        {/* Client & Event Selection */}
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth>
                                <InputLabel>Client *</InputLabel>
                                <Select
                                    value={formData.clientId}
                                    label="Client *"
                                    onChange={(e) => setFormData(prev => ({ ...prev, clientId: e.target.value, eventId: '' }))}
                                    required
                                >
                                    {clients.map(client => (
                                        <MenuItem key={client.id} value={client.id}>
                                            {client.profile?.name || 'Unknown Client'}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth>
                                <InputLabel>Event (Optional)</InputLabel>
                                <Select
                                    value={formData.eventId}
                                    label="Event (Optional)"
                                    onChange={(e) => setFormData(prev => ({ ...prev, eventId: e.target.value }))}
                                    disabled={!formData.clientId}
                                >
                                    <MenuItem value="">No Event</MenuItem>
                                    {clientEvents.map(event => (
                                        <MenuItem key={event.id} value={event.id}>
                                            {event.eventName}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        {/* Due Date & Currency */}
                        <Grid item xs={12} md={6}>
                            <DatePicker
                                label="Due Date"
                                value={formData.dueDate}
                                onChange={(date) => setFormData(prev => ({ ...prev, dueDate: date }))}
                                renderInput={(params) => <TextField {...params} fullWidth />}
                            />
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth>
                                <InputLabel>Tax Mode</InputLabel>
                                <Select
                                    value={formData.taxMode}
                                    label="Tax Mode"
                                    onChange={(e) => setFormData(prev => ({ ...prev, taxMode: e.target.value }))}
                                >
                                    <MenuItem value="EXCLUSIVE">Tax Exclusive</MenuItem>
                                    <MenuItem value="INCLUSIVE">Tax Inclusive</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        {/* Line Items */}
                        <Grid item xs={12}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6">Line Items</Typography>
                                <Button
                                    startIcon={<AddIcon />}
                                    onClick={addLineItem}
                                    variant="outlined"
                                    size="small"
                                >
                                    Add Item
                                </Button>
                            </Box>
                            
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Description *</TableCell>
                                        <TableCell width={80}>Qty</TableCell>
                                        <TableCell width={120}>Unit Price</TableCell>
                                        <TableCell width={100}>Tax %</TableCell>
                                        <TableCell width={120}>Amount</TableCell>
                                        <TableCell width={50}>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {formData.items.map((item, index) => (
                                        <TableRow key={index}>
                                            <TableCell>
                                                <TextField
                                                    fullWidth
                                                    placeholder="Item description"
                                                    value={item.desc}
                                                    onChange={(e) => updateLineItem(index, 'desc', e.target.value)}
                                                    required
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <TextField
                                                    type="number"
                                                    value={item.qty}
                                                    onChange={(e) => updateLineItem(index, 'qty', parseFloat(e.target.value) || 0)}
                                                    inputProps={{ min: 0, step: 0.01 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <TextField
                                                    type="number"
                                                    value={item.unitPrice}
                                                    onChange={(e) => updateLineItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                                                    inputProps={{ min: 0, step: 0.01 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <TextField
                                                    type="number"
                                                    value={item.taxRatePct}
                                                    onChange={(e) => updateLineItem(index, 'taxRatePct', parseFloat(e.target.value) || 0)}
                                                    inputProps={{ min: 0, max: 100, step: 0.01 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {formatCurrency(item.qty * item.unitPrice)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <IconButton
                                                    size="small"
                                                    onClick={() => removeLineItem(index)}
                                                    disabled={formData.items.length === 1}
                                                >
                                                    <DeleteIcon />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </Grid>

                        {/* Discount & Shipping */}
                        <Grid item xs={12} md={4}>
                            <Typography variant="subtitle1" gutterBottom>Discount</Typography>
                            <Grid container spacing={1}>
                                <Grid item xs={6}>
                                    <FormControl fullWidth size="small">
                                        <Select
                                            value={formData.discount.mode}
                                            onChange={(e) => setFormData(prev => ({
                                                ...prev,
                                                discount: { ...prev.discount, mode: e.target.value }
                                            }))}
                                        >
                                            <MenuItem value="AMOUNT">Amount</MenuItem>
                                            <MenuItem value="PERCENT">Percent</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="number"
                                        value={formData.discount.value}
                                        onChange={(e) => setFormData(prev => ({
                                            ...prev,
                                            discount: { ...prev.discount, value: parseFloat(e.target.value) || 0 }
                                        }))}
                                        inputProps={{ min: 0, step: 0.01 }}
                                    />
                                </Grid>
                            </Grid>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Shipping"
                                type="number"
                                value={formData.shipping}
                                onChange={(e) => setFormData(prev => ({ ...prev, shipping: parseFloat(e.target.value) || 0 }))}
                                inputProps={{ min: 0, step: 0.01 }}
                            />
                        </Grid>

                        {/* Totals */}
                        <Grid item xs={12} md={4}>
                            <Card variant="outlined">
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom>Totals</Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography>Subtotal:</Typography>
                                        <Typography>{formatCurrency(totals.subTotal)}</Typography>
                                    </Box>
                                    {totals.discountTotal > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography>Discount:</Typography>
                                            <Typography>-{formatCurrency(totals.discountTotal)}</Typography>
                                        </Box>
                                    )}
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography>Tax:</Typography>
                                        <Typography>{formatCurrency(totals.taxTotal)}</Typography>
                                    </Box>
                                    {totals.shipping > 0 && (
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography>Shipping:</Typography>
                                            <Typography>{formatCurrency(formData.shipping)}</Typography>
                                        </Box>
                                    )}
                                    <Divider sx={{ my: 1 }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="subtitle1">Grand Total:</Typography>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                            {formatCurrency(totals.grandTotal)}
                                        </Typography>
                                    </Box>
                                    {totals.amountPaid > 0 && (
                                        <>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography>Paid:</Typography>
                                                <Typography>{formatCurrency(totals.amountPaid)}</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="subtitle1">Amount Due:</Typography>
                                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                                    {formatCurrency(totals.amountDue)}
                                                </Typography>
                                            </Box>
                                        </>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Notes */}
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Notes (visible to client)"
                                multiline
                                rows={3}
                                value={formData.notes}
                                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                            />
                        </Grid>

                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Internal Notes (staff only)"
                                multiline
                                rows={3}
                                value={formData.internalNotes}
                                onChange={(e) => setFormData(prev => ({ ...prev, internalNotes: e.target.value }))}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>

                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    
                    {invoiceId && (
                        <>
                            <Button
                                startIcon={<DownloadIcon />}
                                onClick={handleDownloadPDF}
                                disabled={loading}
                            >
                                Download PDF
                            </Button>
                            <Button
                                startIcon={<EmailIcon />}
                                onClick={handleSendEmail}
                                disabled={loading}
                                color="info"
                            >
                                Send Email
                            </Button>
                        </>
                    )}
                    
                    <Button
                        startIcon={<PreviewIcon />}
                        onClick={() => {}}
                        disabled={loading}
                    >
                        Preview
                    </Button>
                    <Button
                        startIcon={<SaveIcon />}
                        onClick={() => handleSave(false)}
                        disabled={loading || !formData.clientId || formData.items.length === 0}
                    >
                        Save Draft
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<SendIcon />}
                        onClick={() => handleSave(true)}
                        disabled={loading || !formData.clientId || formData.items.length === 0}
                    >
                        Save & Send
                    </Button>
                </DialogActions>
            </Dialog>
        </LocalizationProvider>
    );
};

export default InvoiceEditor;
