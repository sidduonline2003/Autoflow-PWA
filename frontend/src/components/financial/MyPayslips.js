import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, CircularProgress, Alert, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, Dialog, DialogTitle, DialogContent, Grid, Card, CardContent,
    Divider
} from '@mui/material';
import { 
    ReceiptLong as ReceiptIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import { auth } from '../../firebase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

// Helper to format currency
const formatCurrency = (amount, currency = 'INR') => {
    return new Intl.NumberFormat('en-IN', { 
        style: 'currency', 
        currency: currency,
        maximumFractionDigits: 2
    }).format(amount);
};

// Status chip helper
const StatusChip = ({ status }) => {
    const statusConfig = {
        'DRAFT': { color: 'default', label: 'Draft' },
        'PUBLISHED': { color: 'primary', label: 'Published' },
        'PAID': { color: 'success', label: 'Paid' },
        'CLOSED': { color: 'error', label: 'Closed' },
        'VOID': { color: 'error', label: 'Void' }
    };
    
    const config = statusConfig[status] || { color: 'default', label: status };
    
    return <Chip size="small" label={config.label} color={config.color} />;
};

// Helper to format period
const formatPeriod = (period) => {
    if (!period || !period.month || !period.year) {
        return 'Unknown Period';
    }
    
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    
    const monthIndex = period.month - 1;
    if (monthIndex < 0 || monthIndex >= 12) {
        return 'Unknown Period';
    }
    
    return `${months[monthIndex]} ${period.year}`;
};

// Helper to format Firestore timestamp
const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    
    // If it's a Firestore timestamp
    if (timestamp.seconds) {
        return format(new Date(timestamp.seconds * 1000), 'MMM dd, yyyy');
    }
    
    // If it's already a string date
    return format(new Date(timestamp), 'MMM dd, yyyy');
};

const MyPayslips = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [payslips, setPayslips] = useState([]);
    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedPayslip, setSelectedPayslip] = useState(null);
    const [payslipDetails, setPayslipDetails] = useState(null);
    
    // Fetch payslips
    const fetchPayslips = async () => {
        try {
            setLoading(true);
            setError('');
            
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/salaries/my-payslips', {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                setPayslips(data);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to fetch payslips');
            }
        } catch (error) {
            console.error('Error fetching payslips:', error);
            setError(error.message);
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };
    
    // View payslip details
    const handleViewPayslip = async (payslip) => {
        setSelectedPayslip(payslip);
        setDetailOpen(true);
        
        try {
            setPayslipDetails(null); // Reset previous details
            
            const idToken = await auth.currentUser.getIdToken();
            // Use the direct payslip endpoint instead of the run-nested one
            const response = await fetch(`/api/salaries/payslips/${payslip.id}`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                setPayslipDetails(data);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to fetch payslip details');
            }
        } catch (error) {
            console.error('Error fetching payslip details:', error);
            toast.error(error.message);
        }
    };
    
    // Initialize
    useEffect(() => {
        fetchPayslips();
    }, []);
    
    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
                <CircularProgress />
            </Box>
        );
    }
    
    return (
        <Box>
            <Typography variant="h6" gutterBottom>My Payslips</Typography>
            
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            
            {payslips.length === 0 ? (
                <Alert severity="info">You don't have any payslips yet.</Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Period</TableCell>
                                <TableCell>Payslip #</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="right">Amount</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {payslips.map((payslip) => (
                                <TableRow key={`${payslip.runId}-${payslip.id}`}>
                                    <TableCell>
                                        {formatPeriod(payslip.period)}
                                    </TableCell>
                                    <TableCell>{payslip.number || '—'}</TableCell>
                                    <TableCell>
                                        <StatusChip status={payslip.status} />
                                    </TableCell>
                                    <TableCell align="right">
                                        {formatCurrency(payslip.netPay, payslip.currency)}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button
                                            startIcon={<ReceiptIcon />}
                                            size="small"
                                            variant="outlined"
                                            onClick={() => handleViewPayslip(payslip)}
                                        >
                                            View
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
            
            {/* Payslip Detail Dialog */}
            <Dialog 
                open={detailOpen} 
                onClose={() => setDetailOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">
                            Payslip: {selectedPayslip ? formatPeriod(selectedPayslip.period) : ''}
                        </Typography>
                        <Button 
                            startIcon={<CloseIcon />}
                            onClick={() => setDetailOpen(false)}
                        >
                            Close
                        </Button>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {!payslipDetails ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Box sx={{ mt: 2 }}>
                            <Paper sx={{ p: 3, mb: 3, border: '1px solid', borderColor: 'divider' }}>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">Employee Name</Typography>
                                            <Typography variant="body1">{payslipDetails.userName}</Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">Payslip Number</Typography>
                                            <Typography variant="body1">{payslipDetails.number || '—'}</Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">Period</Typography>
                                            <Typography variant="body1">{formatPeriod(payslipDetails.period)}</Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">Status</Typography>
                                            <StatusChip status={payslipDetails.status} />
                                        </Box>
                                    </Grid>
                                </Grid>
                            </Paper>
                            
                            <Grid container spacing={3}>
                                <Grid item xs={12} md={6}>
                                    <Card>
                                        <CardContent>
                                            <Typography variant="h6" gutterBottom>Earnings</Typography>
                                            <Divider sx={{ mb: 2 }} />
                                            
                            <Box sx={{ mb: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="body1">{payslipDetails.lines?.base?.label || 'Base Salary'}</Typography>
                                    <Typography variant="body1">
                                        {formatCurrency(payslipDetails.lines?.base?.amount || 0, payslipDetails.currency)}
                                    </Typography>
                                </Box>
                                
                                {(payslipDetails.lines?.allowances || []).map((allowance, index) => (
                                    <Box 
                                        key={`allowance-${index}`}
                                        sx={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between',
                                            mb: 1
                                        }}
                                    >
                                        <Typography variant="body2">{allowance?.label || 'Allowance'}</Typography>
                                        <Typography variant="body2">
                                            {formatCurrency(allowance?.amount || 0, payslipDetails.currency)}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>                                            <Divider sx={{ my: 2 }} />
                                            
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body1" fontWeight="bold">
                                                    Total Gross
                                                </Typography>
                                                <Typography variant="body1" fontWeight="bold">
                                                    {formatCurrency(payslipDetails.grossAmount, payslipDetails.currency)}
                                                </Typography>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                
                                <Grid item xs={12} md={6}>
                                    <Card>
                                        <CardContent>
                                            <Typography variant="h6" gutterBottom>Deductions</Typography>
                                            <Divider sx={{ mb: 2 }} />
                                            
                            <Box sx={{ mb: 2 }}>
                                {(payslipDetails.lines?.deductions || []).map((deduction, index) => (
                                    <Box 
                                        key={`deduction-${index}`}
                                        sx={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between',
                                            mb: 1
                                        }}
                                    >
                                        <Typography variant="body2">{deduction?.label || 'Deduction'}</Typography>
                                        <Typography variant="body2" color="error.main">
                                            -{formatCurrency(deduction?.amount || 0, payslipDetails.currency)}
                                        </Typography>
                                    </Box>
                                ))}
                                
                                {/* Tax */}
                                {payslipDetails.lines?.tax && payslipDetails.lines.tax.amount > 0 && (
                                    <Box 
                                        sx={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between',
                                            mb: 1
                                        }}
                                    >
                                        <Typography variant="body2">{payslipDetails.lines.tax?.label || 'Tax'}</Typography>
                                        <Typography variant="body2" color="error.main">
                                            -{formatCurrency(payslipDetails.lines.tax?.amount || 0, payslipDetails.currency)}
                                        </Typography>
                                    </Box>
                                )}
                            </Box>                                            <Divider sx={{ my: 2 }} />
                                            
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                <Typography variant="body1" fontWeight="bold">
                                                    Total Deductions
                                                </Typography>
                                                <Typography variant="body1" fontWeight="bold" color="error.main">
                                                    -{formatCurrency(
                                                        (payslipDetails.totalDeductions || 0) + (payslipDetails.totalTax || 0),
                                                        payslipDetails.currency
                                                    )}
                                                </Typography>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </Grid>
                            
                            {/* Net Pay */}
                            <Paper 
                                sx={{ 
                                    p: 2, 
                                    mt: 3, 
                                    bgcolor: 'primary.main', 
                                    color: 'primary.contrastText',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <Typography variant="h6">Net Pay</Typography>
                                <Typography variant="h5" fontWeight="bold">
                                    {formatCurrency(payslipDetails.netPay, payslipDetails.currency)}
                                </Typography>
                            </Paper>
                            
                            {/* Payment Information */}
                            {payslipDetails.status === 'PAID' && payslipDetails.payment && (
                                <Paper sx={{ p: 2, mt: 3 }}>
                                    <Typography variant="h6" gutterBottom>Payment Information</Typography>
                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <Typography variant="body2" color="text.secondary">Method</Typography>
                                            <Typography variant="body1">{payslipDetails.payment.method}</Typography>
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Typography variant="body2" color="text.secondary">Date</Typography>
                                            <Typography variant="body1">{payslipDetails.payment.date}</Typography>
                                        </Grid>
                                        {payslipDetails.payment.reference && (
                                            <Grid item xs={12}>
                                                <Typography variant="body2" color="text.secondary">Reference</Typography>
                                                <Typography variant="body1">{payslipDetails.payment.reference}</Typography>
                                            </Grid>
                                        )}
                                        {payslipDetails.payment.remarks && (
                                            <Grid item xs={12}>
                                                <Typography variant="body2" color="text.secondary">Remarks</Typography>
                                                <Typography variant="body1">{payslipDetails.payment.remarks}</Typography>
                                            </Grid>
                                        )}
                                    </Grid>
                                </Paper>
                            )}
                            
                            {/* Remarks */}
                            {payslipDetails.remarks && (
                                <Paper sx={{ p: 2, mt: 3 }}>
                                    <Typography variant="body2" color="text.secondary">Remarks</Typography>
                                    <Typography variant="body1">{payslipDetails.remarks}</Typography>
                                </Paper>
                            )}
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
};

export default MyPayslips;
