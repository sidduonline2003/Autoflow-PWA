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
    Alert,
    Card,
    CardContent,
    Divider,
    Chip,
    FormControlLabel,
    Switch
} from '@mui/material';
import toast from 'react-hot-toast';

const PaymentModal = ({ open, onClose, onSave, invoice = null }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        amount: 0,
        method: 'BANK',
        reference: '',
        paidDate: new Date().toISOString().split('T')[0],
        notes: '',
        sendConfirmation: true
    });

    const paymentMethods = [
        { value: 'BANK', label: 'Bank Transfer' },
        { value: 'UPI', label: 'UPI' },
        { value: 'CARD', label: 'Card Payment' },
        { value: 'CASH', label: 'Cash' },
        { value: 'OTHER', label: 'Other' }
    ];

    // Initialize form data when invoice changes
    useEffect(() => {
        if (invoice && open) {
            setFormData({
                amount: Math.round((invoice.totals?.amountDue || 0) * 100) / 100,
                method: 'BANK',
                reference: '',
                paidDate: new Date().toISOString().split('T')[0],
                notes: '',
                sendConfirmation: true
            });
        }
    }, [invoice, open]);

    const handleInputChange = (field, value) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSave = async () => {
        if (!invoice) {
            toast.error('No invoice selected');
            return;
        }

        if (!formData.amount || formData.amount <= 0) {
            toast.error('Please enter a valid payment amount');
            return;
        }

        if (formData.amount > invoice.totals?.amountDue) {
            toast.error('Payment amount cannot exceed the amount due');
            return;
        }

        setLoading(true);
        try {
            const amountValue = parseFloat(formData.amount);
            const paidAtIso = `${formData.paidDate}T00:00:00Z`;
            await onSave({
                invoiceId: invoice.id,
                amount: amountValue,
                method: formData.method,
                reference: formData.reference.trim() || undefined,
                paidAt: paidAtIso,
                idempotencyKey: `${invoice.id}-${Date.now()}`,
                sendConfirmation: formData.sendConfirmation
            });
            onClose();
            toast.success('Payment recorded successfully');
        } catch (error) {
            toast.error(error.message || 'Failed to record payment');
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: invoice?.currency || 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const getStatusChip = (status) => {
        const statusColors = {
            DRAFT: 'default',
            SENT: 'info',
            VIEWED: 'warning',
            PAID: 'success',
            PARTIAL: 'warning',
            OVERDUE: 'error',
            CANCELLED: 'error'
        };

        return (
            <Chip 
                label={status} 
                color={statusColors[status] || 'default'}
                size="small"
            />
        );
    };

    if (!invoice) {
        return null;
    }

    const remainingAfterPayment = (invoice.totals?.amountDue || 0) - (formData.amount || 0);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                Record Payment
            </DialogTitle>
            <DialogContent>
                <Grid container spacing={3}>
                    {/* Invoice Summary */}
                    <Grid item xs={12}>
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Invoice Details
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <Typography variant="body2" color="text.secondary">
                                            Invoice Number:
                                        </Typography>
                                        <Typography variant="body1">
                                            {invoice.number || 'Draft'}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="body2" color="text.secondary">
                                            Status:
                                        </Typography>
                                        {getStatusChip(invoice.status)}
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="body2" color="text.secondary">
                                            Total Amount:
                                        </Typography>
                                        <Typography variant="body1">
                                            {formatCurrency(invoice.totals?.grandTotal)}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="body2" color="text.secondary">
                                            Amount Due:
                                        </Typography>
                                        <Typography variant="body1" color="primary">
                                            {formatCurrency(invoice.totals?.amountDue)}
                                        </Typography>
                                    </Grid>
                                    {invoice.totals?.amountPaid > 0 && (
                                        <Grid item xs={6}>
                                            <Typography variant="body2" color="text.secondary">
                                                Amount Paid:
                                            </Typography>
                                            <Typography variant="body1" color="success.main">
                                                {formatCurrency(invoice.totals?.amountPaid)}
                                            </Typography>
                                        </Grid>
                                    )}
                                </Grid>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Payment Information */}
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                            Payment Information
                        </Typography>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <TextField
                            fullWidth
                            label="Payment Amount"
                            type="number"
                            value={formData.amount}
                            onChange={(e) => handleInputChange('amount', e.target.value)}
                            inputProps={{ 
                                min: 0, 
                                max: invoice.totals?.amountDue,
                                step: 0.01 
                            }}
                            helperText={`Maximum: ${formatCurrency(invoice.totals?.amountDue)}`}
                        />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                        <FormControl fullWidth>
                            <InputLabel>Payment Method</InputLabel>
                            <Select
                                value={formData.method}
                                onChange={(e) => handleInputChange('method', e.target.value)}
                                label="Payment Method"
                            >
                                {paymentMethods.map((method) => (
                                    <MenuItem key={method.value} value={method.value}>
                                        {method.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Payment Reference"
                            value={formData.reference}
                            onChange={(e) => handleInputChange('reference', e.target.value)}
                            placeholder="Transaction ID, Cheque number, etc. (optional)"
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Payment Date"
                            type="date"
                            value={formData.paidDate}
                            onChange={(e) => handleInputChange('paidDate', e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <TextField
                            fullWidth
                            label="Notes (Optional)"
                            multiline
                            rows={3}
                            value={formData.notes}
                            onChange={(e) => handleInputChange('notes', e.target.value)}
                            placeholder="Additional notes about this payment"
                        />
                    </Grid>

                    <Grid item xs={12}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={formData.sendConfirmation}
                                    onChange={(e) => handleInputChange('sendConfirmation', e.target.checked)}
                                />
                            }
                            label="Send payment confirmation email to client"
                        />
                    </Grid>

                    {/* Payment Summary */}
                    {formData.amount > 0 && (
                        <Grid item xs={12}>
                            <Card variant="outlined" sx={{ bgcolor: 'background.default' }}>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>
                                        Payment Summary
                                    </Typography>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography>Payment Amount:</Typography>
                                        <Typography color="primary">
                                            {formatCurrency(formData.amount)}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography>Remaining Balance:</Typography>
                                        <Typography color={remainingAfterPayment === 0 ? 'success.main' : 'text.primary'}>
                                            {formatCurrency(remainingAfterPayment)}
                                        </Typography>
                                    </Box>
                                    <Divider sx={{ my: 1 }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="subtitle1">New Invoice Status:</Typography>
                                        <Typography variant="subtitle1" color="primary">
                                            {remainingAfterPayment === 0 ? 'PAID' : 'PARTIAL'}
                                        </Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    )}

                    {/* Validation Alerts */}
                    {formData.amount > (invoice.totals?.amountDue || 0) && (
                        <Grid item xs={12}>
                            <Alert severity="error">
                                Payment amount cannot exceed the amount due
                            </Alert>
                        </Grid>
                    )}

                    {formData.amount === (invoice.totals?.amountDue || 0) && (
                        <Grid item xs={12}>
                            <Alert severity="success">
                                This payment will fully settle the invoice
                            </Alert>
                        </Grid>
                    )}

                    {formData.amount > 0 && formData.amount < (invoice.totals?.amountDue || 0) && (
                        <Grid item xs={12}>
                            <Alert severity="info">
                                This is a partial payment. The invoice will remain open for the remaining balance.
                            </Alert>
                        </Grid>
                    )}
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>
                    Cancel
                </Button>
                <Button 
                    onClick={handleSave} 
                    variant="contained" 
                    disabled={loading || !formData.amount || formData.amount <= 0 || formData.amount > (invoice.totals?.amountDue || 0)}
                >
                    {loading ? 'Recording...' : 'Record Payment'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default PaymentModal;
