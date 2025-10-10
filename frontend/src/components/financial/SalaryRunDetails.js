import React, { useState, useEffect } from 'react';
import {
    Box, Button, Typography, Paper, CircularProgress, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Grid, Divider, Card, CardContent
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    AttachMoney as AttachMoneyIcon,
    Block as BlockIcon,
    Check as CheckIcon
} from '@mui/icons-material';
import { auth } from '../../firebase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

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

// Helper to format currency
const formatCurrency = (amount, currency = 'INR') => {
    return new Intl.NumberFormat('en-IN', { 
        style: 'currency', 
        currency: currency,
        maximumFractionDigits: 2
    }).format(amount);
};

// Helper to format period
const formatPeriod = (period) => {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${months[period.month - 1]} ${period.year}`;
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

const SalaryRunDetails = ({ runId, onBack, onRefresh }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [runData, setRunData] = useState(null);
    const [payslips, setPayslips] = useState([]);
    const [publishing, setPublishing] = useState(false);
    
    // Modals state
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedPayslip, setSelectedPayslip] = useState(null);
    const [paymentInfo, setPaymentInfo] = useState({
        method: 'BANK',
        date: new Date().toISOString().split('T')[0],
        reference: '',
        remarks: ''
    });
    
    const [voidModalOpen, setVoidModalOpen] = useState(false);
    const [voidReason, setVoidReason] = useState('');

    // Fetch run details and payslips
    const fetchRunDetails = async () => {
        try {
            setLoading(true);
            setError('');
            
            const idToken = await auth.currentUser.getIdToken();
            
            // Fetch run details and payslips in parallel
            const [runResponse, payslipsResponse] = await Promise.all([
                fetch(`/api/salaries/runs/${runId}`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                }),
                fetch(`/api/salaries/runs/${runId}/payslips`, {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                })
            ]);
            
            if (runResponse.ok && payslipsResponse.ok) {
                const [runData, payslipsData] = await Promise.all([
                    runResponse.json(),
                    payslipsResponse.json()
                ]);
                
                setRunData(runData);
                setPayslips(payslipsData);
            } else {
                if (!runResponse.ok) {
                    const error = await runResponse.json();
                    throw new Error(error.detail || 'Failed to fetch run details');
                }
                if (!payslipsResponse.ok) {
                    const error = await payslipsResponse.json();
                    throw new Error(error.detail || 'Failed to fetch payslips');
                }
            }
        } catch (error) {
            console.error('Error fetching run details:', error);
            setError(error.message);
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle marking a payslip as paid
    const handleMarkPaid = async () => {
        if (!selectedPayslip) return;
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/salaries/payslips/${selectedPayslip.id}/payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    method: paymentInfo.method,
                    paidAt: new Date(paymentInfo.date).toISOString(),
                    reference: paymentInfo.reference,
                    remarks: paymentInfo.remarks,
                    idempotencyKey: `${selectedPayslip.id}-${new Date().getTime()}`
                })
            });
            
            if (response.ok) {
                toast.success('Payslip marked as paid!');
                setPaymentModalOpen(false);
                await fetchRunDetails(); // Refresh data
                if (typeof onRefresh === 'function') {
                    await onRefresh();
                }
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to mark payslip as paid');
            }
        } catch (error) {
            console.error('Error marking payslip as paid:', error);
            toast.error(error.message);
        }
    };

    // Handle voiding a payslip
    const handleVoidPayslip = async () => {
        if (!selectedPayslip || !voidReason) return;
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/salaries/payslips/${selectedPayslip.id}/void`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ reason: voidReason })
            });
            
            if (response.ok) {
                toast.success('Payslip voided successfully!');
                setVoidModalOpen(false);
                setVoidReason('');
                await fetchRunDetails(); // Refresh data
                if (typeof onRefresh === 'function') {
                    await onRefresh();
                }
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to void payslip');
            }
        } catch (error) {
            console.error('Error voiding payslip:', error);
            toast.error(error.message);
        }
    };

    // Handle publishing the run
    const handlePublishRun = async () => {
        if (publishing) return; // Prevent multiple clicks
        
        if (!window.confirm('Are you sure you want to publish this salary run? This will make payslips visible to team members.')) {
            return;
        }
        
        setPublishing(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/salaries/runs/${runId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    status: 'PUBLISHED',
                    remarks: 'Published for team review'
                })
            });
            
            if (response.ok) {
                toast.success('Salary run published successfully!');
                fetchRunDetails(); // Refresh data
                onRefresh(); // Refresh parent list
            } else {
                // Get error details
                const errorText = await response.text();
                console.error('Server error response:', errorText);
                let errorMessage = 'Failed to publish salary run';
                
                try {
                    // Try to parse as JSON
                    const errorJson = JSON.parse(errorText);
                    errorMessage = errorJson.detail || errorMessage;
                    console.error('Parsed error:', errorJson);
                    
                    // Check if it's a Firestore index error
                    if (errorMessage.includes('The query requires an index') || 
                        errorMessage.includes('requires a Firestore index')) {
                        
                        // Extract the URL if present
                        const indexUrlMatch = errorMessage.match(/https:\/\/console\.firebase\.google\.com[^ "]*/);
                        const indexUrl = indexUrlMatch ? indexUrlMatch[0] : null;
                        
                        if (indexUrl) {
                            // Show a dialog with a link to create the index
                            const shouldCreateIndex = window.confirm(
                                'This operation requires a Firestore database index that has not been created yet. ' +
                                'Would you like to open the Firebase console to create this index now?'
                            );
                            
                            if (shouldCreateIndex) {
                                window.open(indexUrl, '_blank');
                                toast('After creating the index, please try again in a few minutes.');
                                return;
                            }
                        } else {
                            toast.error('Database index missing. Please contact your administrator.');
                        }
                    } else {
                        toast.error(errorMessage);
                    }
                } catch (e) {
                    // If JSON parsing fails, use the raw text
                    console.error('Error parsing response:', e);
                    toast.error(`Server error (${response.status}): ${errorText.substring(0, 200)}`);
                }
            }
        } catch (error) {
            console.error('Error publishing salary run:', error);
            toast.error(`Error: ${error.message}`);
        } finally {
            setPublishing(false);
        }
    };

    // Initialize data fetch
    useEffect(() => {
        if (runId) {
            fetchRunDetails();
        }
    }, [runId]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return (
            <Box>
                <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 2 }}>
                    Back to List
                </Button>
                <Alert severity="error">{error}</Alert>
            </Box>
        );
    }

    if (!runData) {
        return (
            <Box>
                <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 2 }}>
                    Back to List
                </Button>
                <Alert severity="error">Salary run not found</Alert>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Button startIcon={<ArrowBackIcon />} onClick={onBack}>
                    Back to List
                </Button>
                
                {runData.status === 'DRAFT' && (
                    <Button 
                        variant="contained" 
                        color="primary"
                        startIcon={<CheckIcon />}
                        onClick={handlePublishRun}
                        disabled={publishing}
                    >
                        {publishing ? 'Publishing...' : 'Publish Salary Run'}
                    </Button>
                )}
            </Box>

            {/* Salary Run Summary */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Salary Run Details
                            </Typography>
                            <Divider sx={{ mb: 2 }} />
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">Period:</Typography>
                                <Typography variant="body1" fontWeight="medium">
                                    {formatPeriod(runData.period)}
                                </Typography>
                            </Box>
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">Status:</Typography>
                                <StatusChip status={runData.status} />
                            </Box>
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="body2" color="text.secondary">Created:</Typography>
                                <Typography variant="body2">{formatDate(runData.createdAt)}</Typography>
                            </Box>
                            
                            {runData.publishedAt && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="body2" color="text.secondary">Published:</Typography>
                                    <Typography variant="body2">{formatDate(runData.publishedAt)}</Typography>
                                </Box>
                            )}
                            
                            {runData.paidAt && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="body2" color="text.secondary">Paid:</Typography>
                                    <Typography variant="body2">{formatDate(runData.paidAt)}</Typography>
                                </Box>
                            )}
                            
                            {runData.closedAt && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="body2" color="text.secondary">Closed:</Typography>
                                    <Typography variant="body2">{formatDate(runData.closedAt)}</Typography>
                                </Box>
                            )}
                            
                            {runData.remarks && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="body2" color="text.secondary">Remarks:</Typography>
                                    <Typography variant="body2">{runData.remarks}</Typography>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
                
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Salary Run Summary
                            </Typography>
                            <Divider sx={{ mb: 2 }} />
                            
                            {runData.summary ? (
                                <>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" color="text.secondary">Total Payslips:</Typography>
                                        <Typography variant="body1" fontWeight="medium">
                                            {runData.summary.countTotal}
                                        </Typography>
                                    </Box>
                                    
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" color="text.secondary">Paid:</Typography>
                                        <Typography variant="body1" color="success.main">
                                            {runData.summary.countPaid}
                                        </Typography>
                                    </Box>
                                    
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" color="text.secondary">Unpaid:</Typography>
                                        <Typography variant="body1" color="warning.main">
                                            {runData.summary.countUnpaid}
                                        </Typography>
                                    </Box>
                                    
                                    <Divider sx={{ my: 2 }} />
                                    
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" color="text.secondary">Total Gross:</Typography>
                                        <Typography variant="body1">
                                            {formatCurrency(runData.summary.totalGross)}
                                        </Typography>
                                    </Box>
                                    
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" color="text.secondary">Total Deductions:</Typography>
                                        <Typography variant="body1">
                                            {formatCurrency(runData.summary.totalDeductions)}
                                        </Typography>
                                    </Box>
                                    
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" color="text.secondary">Total Tax:</Typography>
                                        <Typography variant="body1">
                                            {formatCurrency(runData.summary.totalTax)}
                                        </Typography>
                                    </Box>
                                    
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
                                        <Typography variant="body1" fontWeight="medium" color="text.secondary">
                                            Total Net Pay:
                                        </Typography>
                                        <Typography variant="body1" fontWeight="bold">
                                            {formatCurrency(runData.summary.totalNet)}
                                        </Typography>
                                    </Box>
                                </>
                            ) : (
                                <Typography variant="body2" color="text.secondary">
                                    Summary not available
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Payslips Table */}
            <Typography variant="h6" gutterBottom>Payslips</Typography>
            {payslips.length === 0 ? (
                <Alert severity="info">No payslips found in this salary run.</Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Employee</TableCell>
                                <TableCell>Payslip #</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="right">Gross</TableCell>
                                <TableCell align="right">Deductions</TableCell>
                                <TableCell align="right">Tax</TableCell>
                                <TableCell align="right">Net Pay</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {payslips.map((payslip) => (
                                <TableRow key={payslip.id}>
                                    <TableCell component="th" scope="row">
                                        {payslip.userName}
                                    </TableCell>
                                    <TableCell>{payslip.number || '—'}</TableCell>
                                    <TableCell>
                                        <StatusChip status={payslip.status} />
                                    </TableCell>
                                    <TableCell align="right">
                                        {formatCurrency(payslip.grossAmount || 0, payslip.currency)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {formatCurrency(payslip.totalDeductions || 0, payslip.currency)}
                                    </TableCell>
                                    <TableCell align="right">
                                        {formatCurrency(payslip.totalTax || 0, payslip.currency)}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                                        {formatCurrency(payslip.netPay || 0, payslip.currency)}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                            {/* Mark as paid button (only for published payslips) */}
                                            {payslip.status === 'PUBLISHED' && (
                                                <IconButton 
                                                    size="small" 
                                                    color="success"
                                                    onClick={() => {
                                                        setSelectedPayslip(payslip);
                                                        setPaymentModalOpen(true);
                                                    }}
                                                >
                                                    <AttachMoneyIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                            
                                            {/* Void button (for published or paid payslips) */}
                                            {(payslip.status === 'PUBLISHED' || payslip.status === 'PAID') && (
                                                <IconButton 
                                                    size="small" 
                                                    color="error"
                                                    onClick={() => {
                                                        setSelectedPayslip(payslip);
                                                        setVoidModalOpen(true);
                                                    }}
                                                >
                                                    <BlockIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Payment Modal */}
            <Dialog open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Mark Payslip as Paid</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                            Employee: {selectedPayslip?.userName}
                        </Typography>
                        <Typography variant="subtitle2" gutterBottom>
                            Amount: {selectedPayslip ? formatCurrency(selectedPayslip.netPay || 0, selectedPayslip.currency) : ''}
                        </Typography>
                        
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12}>
                                <TextField
                                    select
                                    label="Payment Method"
                                    fullWidth
                                    value={paymentInfo.method}
                                    onChange={(e) => setPaymentInfo({ ...paymentInfo, method: e.target.value })}
                                    SelectProps={{
                                        native: true
                                    }}
                                >
                                    <option value="BANK">Bank Transfer</option>
                                    <option value="CASH">Cash</option>
                                    <option value="UPI">UPI</option>
                                    <option value="OTHER">Other</option>
                                </TextField>
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    label="Payment Date"
                                    type="date"
                                    fullWidth
                                    value={paymentInfo.date}
                                    onChange={(e) => setPaymentInfo({ ...paymentInfo, date: e.target.value })}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    label="Reference Number"
                                    fullWidth
                                    value={paymentInfo.reference}
                                    onChange={(e) => setPaymentInfo({ ...paymentInfo, reference: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    label="Remarks"
                                    fullWidth
                                    multiline
                                    rows={2}
                                    value={paymentInfo.remarks}
                                    onChange={(e) => setPaymentInfo({ ...paymentInfo, remarks: e.target.value })}
                                />
                            </Grid>
                        </Grid>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPaymentModalOpen(false)}>Cancel</Button>
                    <Button 
                        variant="contained" 
                        color="success"
                        onClick={handleMarkPaid}
                    >
                        Mark as Paid
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Void Payslip Modal */}
            <Dialog open={voidModalOpen} onClose={() => setVoidModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Void Payslip</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                            Employee: {selectedPayslip?.userName}
                        </Typography>
                        <Typography variant="subtitle2" gutterBottom>
                            Amount: {selectedPayslip ? formatCurrency(selectedPayslip.netPay || 0, selectedPayslip.currency) : ''}
                        </Typography>
                        
                        <Alert severity="warning" sx={{ my: 2 }}>
                            Voiding a payslip is irreversible. This action should only be used for correcting serious errors.
                        </Alert>
                        
                        <TextField
                            label="Reason for Voiding"
                            fullWidth
                            multiline
                            rows={3}
                            value={voidReason}
                            onChange={(e) => setVoidReason(e.target.value)}
                            required
                            sx={{ mt: 2 }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setVoidModalOpen(false)}>Cancel</Button>
                    <Button 
                        variant="contained" 
                        color="error"
                        disabled={!voidReason}
                        onClick={handleVoidPayslip}
                    >
                        Void Payslip
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SalaryRunDetails;
