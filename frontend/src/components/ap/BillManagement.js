import React, { useState } from 'react';
import {
    Box, Typography, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Chip, IconButton, Tooltip, Dialog,
    DialogTitle, DialogContent, DialogActions, TextField, FormControl,
    InputLabel, Select, MenuItem, Alert, Grid, Card, CardContent,
    Divider, List, ListItem, ListItemText
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Receipt as ReceiptIcon,
    Payment as PaymentIcon,
    Visibility as ViewIcon,
    Delete as DeleteIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

const BillManagement = ({ bills, vendors, onRefresh }) => {
    const { user } = useAuth();
    const [billModalOpen, setBillModalOpen] = useState(false);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [detailsModalOpen, setDetailsModalOpen] = useState(false);
    const [selectedBill, setSelectedBill] = useState(null);
    const [billFormData, setBillFormData] = useState({
        vendorId: '',
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        currency: 'INR',
        taxMode: 'EXCLUSIVE',
        items: [{ description: '', quantity: 1, unitPrice: 0, taxRatePct: 0, category: 'Other' }],
        notes: '',
        internalNotes: ''
    });
    const [paymentFormData, setPaymentFormData] = useState({
        amount: 0,
        paidAt: new Date().toISOString(),
        method: 'BANK',
        reference: ''
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

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatDate = (dateString) => {
        return dateString ? new Date(dateString).toLocaleDateString('en-IN') : '-';
    };

    const getVendorName = (vendorId) => {
        const vendor = vendors.find(v => v.id === vendorId);
        return vendor?.name || 'Unknown Vendor';
    };

    const getStatusColor = (status) => {
        const colors = {
            'DRAFT': 'default',
            'SCHEDULED': 'info',
            'PARTIAL': 'warning',
            'PAID': 'success',
            'OVERDUE': 'error',
            'CANCELLED': 'default'
        };
        return colors[status] || 'default';
    };

    const handleOpenBillModal = (bill = null) => {
        if (bill) {
            setSelectedBill(bill);
            setBillFormData({
                vendorId: bill.vendorId,
                issueDate: new Date(bill.issueDate),
                dueDate: new Date(bill.dueDate),
                currency: bill.currency || 'INR',
                taxMode: bill.taxMode || 'EXCLUSIVE',
                items: bill.items || [{ description: '', quantity: 1, unitPrice: 0, taxRatePct: 0, category: 'Other' }],
                notes: bill.notes || '',
                internalNotes: bill.internalNotes || ''
            });
        } else {
            setSelectedBill(null);
            setBillFormData({
                vendorId: '',
                issueDate: new Date(),
                dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                currency: 'INR',
                taxMode: 'EXCLUSIVE',
                items: [{ description: '', quantity: 1, unitPrice: 0, taxRatePct: 0, category: 'Other' }],
                notes: '',
                internalNotes: ''
            });
        }
        setBillModalOpen(true);
    };

    const handleOpenPaymentModal = (bill) => {
        setSelectedBill(bill);
        setPaymentFormData({
            amount: bill.totals?.amountDue || 0,
            paidAt: new Date().toISOString(),
            method: 'BANK',
            reference: ''
        });
        setPaymentModalOpen(true);
    };

    const handleOpenDetailsModal = (bill) => {
        setSelectedBill(bill);
        setDetailsModalOpen(true);
    };

    const handleSaveBill = async () => {
        try {
            if (!billFormData.vendorId) {
                toast.error('Please select a vendor');
                return;
            }

            if (billFormData.items.length === 0 || !billFormData.items[0].description) {
                toast.error('Please add at least one item');
                return;
            }

            const billData = {
                ...billFormData,
                issueDate: billFormData.issueDate.toISOString(),
                dueDate: billFormData.dueDate.toISOString()
            };

            if (selectedBill) {
                await callApi(`/ap/bills/${selectedBill.id}`, 'PUT', billData);
                toast.success('Bill updated successfully');
            } else {
                await callApi('/ap/bills', 'POST', billData);
                toast.success('Bill created successfully');
            }

            setBillModalOpen(false);
            onRefresh();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleRecordPayment = async () => {
        try {
            if (paymentFormData.amount <= 0) {
                toast.error('Payment amount must be greater than zero');
                return;
            }

            const paymentData = {
                ...paymentFormData,
                idempotencyKey: Date.now().toString()
            };

            await callApi(`/ap/bills/${selectedBill.id}/payments`, 'POST', paymentData);
            toast.success('Payment recorded successfully');
            setPaymentModalOpen(false);
            onRefresh();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const handleUpdateBillStatus = async (billId, newStatus) => {
        try {
            await callApi(`/ap/bills/${billId}/status`, 'PUT', { new_status: newStatus });
            toast.success(`Bill ${newStatus.toLowerCase()} successfully`);
            onRefresh();
        } catch (error) {
            toast.error(error.message);
        }
    };

    const addItemRow = () => {
        setBillFormData({
            ...billFormData,
            items: [...billFormData.items, { description: '', quantity: 1, unitPrice: 0, taxRatePct: 0, category: 'Other' }]
        });
    };

    const removeItemRow = (index) => {
        if (billFormData.items.length > 1) {
            setBillFormData({
                ...billFormData,
                items: billFormData.items.filter((_, i) => i !== index)
            });
        }
    };

    const updateItem = (index, field, value) => {
        const newItems = [...billFormData.items];
        newItems[index] = { ...newItems[index], [field]: value };
        setBillFormData({ ...billFormData, items: newItems });
    };

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h6">
                        Bill Management
                    </Typography>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenBillModal()}
                    >
                        New Bill
                    </Button>
                </Box>

                {bills.length === 0 ? (
                    <Alert severity="info">
                        No bills found. Click "New Bill" to create your first bill.
                    </Alert>
                ) : (
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Bill #</TableCell>
                                    <TableCell>Vendor</TableCell>
                                    <TableCell>Issue Date</TableCell>
                                    <TableCell>Due Date</TableCell>
                                    <TableCell>Total</TableCell>
                                    <TableCell>Amount Due</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {bills.map((bill) => (
                                    <TableRow key={bill.id}>
                                        <TableCell>
                                            <Typography sx={{ fontWeight: 'bold' }}>
                                                {bill.number || 'Draft'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{getVendorName(bill.vendorId)}</TableCell>
                                        <TableCell>{formatDate(bill.issueDate)}</TableCell>
                                        <TableCell>{formatDate(bill.dueDate)}</TableCell>
                                        <TableCell>{formatCurrency(bill.totals?.grandTotal)}</TableCell>
                                        <TableCell>
                                            <Typography
                                                color={bill.totals?.amountDue > 0 ? 'warning.main' : 'success.main'}
                                                sx={{ fontWeight: 'bold' }}
                                            >
                                                {formatCurrency(bill.totals?.amountDue)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={bill.status}
                                                color={getStatusColor(bill.status)}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                <Tooltip title="View Details">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => handleOpenDetailsModal(bill)}
                                                    >
                                                        <ViewIcon />
                                                    </IconButton>
                                                </Tooltip>

                                                {bill.status === 'DRAFT' && (
                                                    <>
                                                        <Tooltip title="Edit Bill">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleOpenBillModal(bill)}
                                                            >
                                                                <EditIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Schedule Bill">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleUpdateBillStatus(bill.id, 'SCHEDULED')}
                                                                color="primary"
                                                            >
                                                                <CheckCircleIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </>
                                                )}

                                                {['SCHEDULED', 'PARTIAL', 'OVERDUE'].includes(bill.status) && (
                                                    <Tooltip title="Record Payment">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleOpenPaymentModal(bill)}
                                                            color="success"
                                                        >
                                                            <PaymentIcon />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}

                                                {['DRAFT', 'SCHEDULED'].includes(bill.status) && (
                                                    <Tooltip title="Cancel Bill">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleUpdateBillStatus(bill.id, 'CANCELLED')}
                                                            color="error"
                                                        >
                                                            <CancelIcon />
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

                {/* Bill Modal */}
                <Dialog 
                    open={billModalOpen} 
                    onClose={() => setBillModalOpen(false)}
                    maxWidth="lg"
                    fullWidth
                >
                    <DialogTitle>
                        {selectedBill ? 'Edit Bill' : 'Create New Bill'}
                    </DialogTitle>
                    <DialogContent>
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Vendor *</InputLabel>
                                    <Select
                                        value={billFormData.vendorId}
                                        onChange={(e) => setBillFormData({ ...billFormData, vendorId: e.target.value })}
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
                                <FormControl fullWidth>
                                    <InputLabel>Tax Mode</InputLabel>
                                    <Select
                                        value={billFormData.taxMode}
                                        onChange={(e) => setBillFormData({ ...billFormData, taxMode: e.target.value })}
                                        label="Tax Mode"
                                    >
                                        <MenuItem value="EXCLUSIVE">Tax Exclusive</MenuItem>
                                        <MenuItem value="INCLUSIVE">Tax Inclusive</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <DatePicker
                                    label="Issue Date"
                                    value={billFormData.issueDate}
                                    onChange={(date) => setBillFormData({ ...billFormData, issueDate: date })}
                                    slotProps={{ textField: { fullWidth: true } }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <DatePicker
                                    label="Due Date"
                                    value={billFormData.dueDate}
                                    onChange={(date) => setBillFormData({ ...billFormData, dueDate: date })}
                                    slotProps={{ textField: { fullWidth: true } }}
                                />
                            </Grid>

                            {/* Items Section */}
                            <Grid item xs={12}>
                                <Typography variant="h6" gutterBottom>
                                    Items
                                </Typography>
                                {billFormData.items.map((item, index) => (
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
                                                {billFormData.items.length > 1 && (
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

                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={3}
                                    label="Notes"
                                    value={billFormData.notes}
                                    onChange={(e) => setBillFormData({ ...billFormData, notes: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={3}
                                    label="Internal Notes"
                                    value={billFormData.internalNotes}
                                    onChange={(e) => setBillFormData({ ...billFormData, internalNotes: e.target.value })}
                                />
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setBillModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleSaveBill}
                            variant="contained"
                        >
                            {selectedBill ? 'Update' : 'Create'}
                        </Button>
                    </DialogActions>
                </Dialog>

                {/* Payment Modal */}
                <Dialog 
                    open={paymentModalOpen} 
                    onClose={() => setPaymentModalOpen(false)}
                    maxWidth="sm"
                    fullWidth
                >
                    <DialogTitle>
                        Record Payment
                    </DialogTitle>
                    <DialogContent>
                        {selectedBill && (
                            <Box sx={{ mb: 2 }}>
                                <Typography variant="body2" color="textSecondary">
                                    Bill: {selectedBill.number} - {getVendorName(selectedBill.vendorId)}
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                    Amount Due: {formatCurrency(selectedBill.totals?.amountDue)}
                                </Typography>
                            </Box>
                        )}
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    label="Payment Amount *"
                                    type="number"
                                    value={paymentFormData.amount}
                                    onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: parseFloat(e.target.value) || 0 })}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Payment Method</InputLabel>
                                    <Select
                                        value={paymentFormData.method}
                                        onChange={(e) => setPaymentFormData({ ...paymentFormData, method: e.target.value })}
                                        label="Payment Method"
                                    >
                                        <MenuItem value="BANK">Bank Transfer</MenuItem>
                                        <MenuItem value="UPI">UPI</MenuItem>
                                        <MenuItem value="CASH">Cash</MenuItem>
                                        <MenuItem value="CARD">Card</MenuItem>
                                        <MenuItem value="OTHER">Other</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    fullWidth
                                    label="Reference"
                                    value={paymentFormData.reference}
                                    onChange={(e) => setPaymentFormData({ ...paymentFormData, reference: e.target.value })}
                                />
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setPaymentModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleRecordPayment}
                            variant="contained"
                        >
                            Record Payment
                        </Button>
                    </DialogActions>
                </Dialog>

                {/* Bill Details Modal */}
                <Dialog 
                    open={detailsModalOpen} 
                    onClose={() => setDetailsModalOpen(false)}
                    maxWidth="md"
                    fullWidth
                >
                    <DialogTitle>
                        Bill Details
                    </DialogTitle>
                    <DialogContent>
                        {selectedBill && (
                            <Box>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="body2" color="textSecondary">Bill Number</Typography>
                                        <Typography variant="body1">{selectedBill.number || 'Draft'}</Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="body2" color="textSecondary">Vendor</Typography>
                                        <Typography variant="body1">{getVendorName(selectedBill.vendorId)}</Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="body2" color="textSecondary">Issue Date</Typography>
                                        <Typography variant="body1">{formatDate(selectedBill.issueDate)}</Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="body2" color="textSecondary">Due Date</Typography>
                                        <Typography variant="body1">{formatDate(selectedBill.dueDate)}</Typography>
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Divider sx={{ my: 2 }} />
                                        <Typography variant="h6" gutterBottom>Items</Typography>
                                        <TableContainer component={Paper} variant="outlined">
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow>
                                                        <TableCell>Description</TableCell>
                                                        <TableCell>Qty</TableCell>
                                                        <TableCell>Rate</TableCell>
                                                        <TableCell>Category</TableCell>
                                                        <TableCell>Total</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {selectedBill.items?.map((item, index) => (
                                                        <TableRow key={index}>
                                                            <TableCell>{item.description}</TableCell>
                                                            <TableCell>{item.quantity}</TableCell>
                                                            <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                                                            <TableCell>
                                                                <Chip label={item.category} size="small" />
                                                            </TableCell>
                                                            <TableCell>{formatCurrency(item.quantity * item.unitPrice)}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Divider sx={{ my: 2 }} />
                                        <Typography variant="h6" gutterBottom>Totals</Typography>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography>Subtotal:</Typography>
                                            <Typography>{formatCurrency(selectedBill.totals?.subTotal)}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography>Tax:</Typography>
                                            <Typography>{formatCurrency(selectedBill.totals?.taxTotal)}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="h6">Grand Total:</Typography>
                                            <Typography variant="h6">{formatCurrency(selectedBill.totals?.grandTotal)}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography>Amount Paid:</Typography>
                                            <Typography color="success.main">{formatCurrency(selectedBill.totals?.amountPaid)}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="h6">Amount Due:</Typography>
                                            <Typography variant="h6" color="warning.main">{formatCurrency(selectedBill.totals?.amountDue)}</Typography>
                                        </Box>
                                    </Grid>
                                </Grid>
                            </Box>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setDetailsModalOpen(false)}>
                            Close
                        </Button>
                    </DialogActions>
                </Dialog>
            </Box>
        </LocalizationProvider>
    );
};

export default BillManagement;
