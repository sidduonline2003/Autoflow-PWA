import React, { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Grid, CircularProgress,
    Table, TableHead, TableBody, TableRow, TableCell, Chip,
    Button, IconButton, Tooltip, Tab, Tabs, Dialog,
    DialogTitle, DialogContent, DialogActions, Divider
} from '@mui/material';
import {
    Download as DownloadIcon,
    Visibility as ViewIcon,
    Receipt as ReceiptIcon,
    Description as DescriptionIcon,
    Payment as PaymentIcon
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';

const ClientARPortal = () => {
    const { claims } = useAuth();
    const [loading, setLoading] = useState(true);
    const [invoices, setInvoices] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [payments, setPayments] = useState([]);
    const [activeTab, setActiveTab] = useState(0);
    const [selectedDocument, setSelectedDocument] = useState(null);
    const [detailModalOpen, setDetailModalOpen] = useState(false);

    const callApi = async (endpoint, method = 'GET', body = null) => {
        const idToken = await auth.currentUser.getIdToken();
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
            setLoading(true);
            
            // Load client's invoices
            const invoicesResponse = await callApi('/ar/invoices');
            setInvoices(invoicesResponse);
            
            // Load client's quotes
            const quotesResponse = await callApi('/ar/quotes');
            setQuotes(quotesResponse);
            
            // Load client's payments
            const paymentsResponse = await callApi('/ar/payments');
            setPayments(paymentsResponse);
            
        } catch (error) {
            console.error('Error loading AR data:', error);
            toast.error('Failed to load data: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (claims?.uid) {
            loadData();
        }
    }, [claims]);

    const getStatusColor = (status) => {
        const colors = {
            'DRAFT': 'default',
            'SENT': 'info',
            'PARTIAL': 'warning',
            'PAID': 'success',
            'OVERDUE': 'error',
            'CANCELLED': 'default',
            'ACCEPTED': 'success',
            'EXPIRED': 'error',
            'REJECTED': 'error'
        };
        return colors[status] || 'default';
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const handleViewDocument = (document, type) => {
        setSelectedDocument({ ...document, type });
        setDetailModalOpen(true);
    };

    const handleAcceptQuote = async (quoteId) => {
        try {
            await callApi(`/ar/quotes/${quoteId}`, 'PUT', { status: 'ACCEPTED' });
            toast.success('Quote accepted successfully');
            loadData();
        } catch (error) {
            toast.error('Failed to accept quote: ' + error.message);
        }
    };

    const handleRejectQuote = async (quoteId) => {
        try {
            await callApi(`/ar/quotes/${quoteId}`, 'PUT', { status: 'REJECTED' });
            toast.success('Quote rejected');
            loadData();
        } catch (error) {
            toast.error('Failed to reject quote: ' + error.message);
        }
    };

    // Calculate summary stats
    const totalOutstanding = invoices
        .filter(inv => ['SENT', 'PARTIAL', 'OVERDUE'].includes(inv.status))
        .reduce((sum, inv) => sum + (inv.totals?.amountDue || 0), 0);

    const overdueAmount = invoices
        .filter(inv => inv.status === 'OVERDUE')
        .reduce((sum, inv) => sum + (inv.totals?.amountDue || 0), 0);

    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

    const pendingQuotes = quotes.filter(quote => quote.status === 'SENT').length;

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress />
                <Typography variant="h6" sx={{ ml: 2 }}>
                    Loading your invoices...
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Typography variant="h4" gutterBottom>
                My Invoices & Quotes
            </Typography>

            {/* Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Outstanding Amount
                            </Typography>
                            <Typography variant="h5" color="warning.main">
                                {formatCurrency(totalOutstanding)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Overdue Amount
                            </Typography>
                            <Typography variant="h5" color="error.main">
                                {formatCurrency(overdueAmount)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Total Paid
                            </Typography>
                            <Typography variant="h5" color="success.main">
                                {formatCurrency(totalPaid)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="textSecondary" gutterBottom>
                                Pending Quotes
                            </Typography>
                            <Typography variant="h5" color="info.main">
                                {pendingQuotes}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Tabs */}
            <Card>
                <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
                    <Tab label="Invoices" icon={<ReceiptIcon />} />
                    <Tab label="Quotes" icon={<DescriptionIcon />} />
                    <Tab label="Payments" icon={<PaymentIcon />} />
                </Tabs>

                <CardContent>
                    {/* Invoices Tab */}
                    {activeTab === 0 && (
                        <Box>
                            <Typography variant="h6" gutterBottom>
                                My Invoices
                            </Typography>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Invoice #</TableCell>
                                        <TableCell>Issue Date</TableCell>
                                        <TableCell>Due Date</TableCell>
                                        <TableCell>Amount</TableCell>
                                        <TableCell>Amount Due</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {invoices.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} align="center">
                                                <Typography color="textSecondary">
                                                    No invoices found
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        invoices.map((invoice) => (
                                            <TableRow key={invoice.id}>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                                        {invoice.number}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                                                <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                                                <TableCell>{formatCurrency(invoice.totals?.grandTotal || 0)}</TableCell>
                                                <TableCell>
                                                    <Typography 
                                                        color={invoice.totals?.amountDue > 0 ? 'warning.main' : 'success.main'}
                                                        sx={{ fontWeight: 'bold' }}
                                                    >
                                                        {formatCurrency(invoice.totals?.amountDue || 0)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={invoice.status}
                                                        color={getStatusColor(invoice.status)}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                                        <Tooltip title="View Details">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleViewDocument(invoice, 'invoice')}
                                                            >
                                                                <ViewIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Download PDF">
                                                            <IconButton size="small">
                                                                <DownloadIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </Box>
                    )}

                    {/* Quotes Tab */}
                    {activeTab === 1 && (
                        <Box>
                            <Typography variant="h6" gutterBottom>
                                My Quotes
                            </Typography>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Quote #</TableCell>
                                        <TableCell>Issue Date</TableCell>
                                        <TableCell>Valid Until</TableCell>
                                        <TableCell>Amount</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {quotes.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center">
                                                <Typography color="textSecondary">
                                                    No quotes found
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        quotes.map((quote) => (
                                            <TableRow key={quote.id}>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                                        {quote.number}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>{formatDate(quote.issueDate)}</TableCell>
                                                <TableCell>{formatDate(quote.validUntil)}</TableCell>
                                                <TableCell>{formatCurrency(quote.totals?.grandTotal || 0)}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={quote.status}
                                                        color={getStatusColor(quote.status)}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                                        <Tooltip title="View Details">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleViewDocument(quote, 'quote')}
                                                            >
                                                                <ViewIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        {quote.status === 'SENT' && (
                                                            <>
                                                                <Button
                                                                    size="small"
                                                                    variant="contained"
                                                                    color="success"
                                                                    onClick={() => handleAcceptQuote(quote.id)}
                                                                >
                                                                    Accept
                                                                </Button>
                                                                <Button
                                                                    size="small"
                                                                    variant="outlined"
                                                                    color="error"
                                                                    onClick={() => handleRejectQuote(quote.id)}
                                                                >
                                                                    Reject
                                                                </Button>
                                                            </>
                                                        )}
                                                        <Tooltip title="Download PDF">
                                                            <IconButton size="small">
                                                                <DownloadIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </Box>
                    )}

                    {/* Payments Tab */}
                    {activeTab === 2 && (
                        <Box>
                            <Typography variant="h6" gutterBottom>
                                Payment History
                            </Typography>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Invoice #</TableCell>
                                        <TableCell>Amount</TableCell>
                                        <TableCell>Method</TableCell>
                                        <TableCell>Reference</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {payments.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center">
                                                <Typography color="textSecondary">
                                                    No payments found
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        payments.map((payment) => {
                                            const invoice = invoices.find(inv => inv.id === payment.invoiceId);
                                            return (
                                                <TableRow key={payment.id}>
                                                    <TableCell>{formatDate(payment.paidAt)}</TableCell>
                                                    <TableCell>{invoice?.number || 'Unknown'}</TableCell>
                                                    <TableCell>
                                                        <Typography color="success.main" sx={{ fontWeight: 'bold' }}>
                                                            {formatCurrency(payment.amount)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>{payment.method}</TableCell>
                                                    <TableCell>{payment.reference || '-'}</TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </Box>
                    )}
                </CardContent>
            </Card>

            {/* Document Detail Modal */}
            <DocumentDetailModal
                open={detailModalOpen}
                onClose={() => {
                    setDetailModalOpen(false);
                    setSelectedDocument(null);
                }}
                document={selectedDocument}
            />
        </Box>
    );
};

// Document Detail Modal Component
const DocumentDetailModal = ({ open, onClose, document }) => {
    if (!document) return null;

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                {document.type === 'invoice' ? 'Invoice' : 'Quote'} Details
                {document.number && ` - ${document.number}`}
            </DialogTitle>
            
            <DialogContent>
                <Grid container spacing={3}>
                    {/* Header Info */}
                    <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" color="textSecondary">
                            {document.type === 'invoice' ? 'Issue Date' : 'Issue Date'}
                        </Typography>
                        <Typography variant="body1" gutterBottom>
                            {formatDate(document.issueDate)}
                        </Typography>
                        
                        <Typography variant="subtitle2" color="textSecondary">
                            {document.type === 'invoice' ? 'Due Date' : 'Valid Until'}
                        </Typography>
                        <Typography variant="body1" gutterBottom>
                            {formatDate(document.type === 'invoice' ? document.dueDate : document.validUntil)}
                        </Typography>
                    </Grid>
                    
                    <Grid item xs={12} md={6}>
                        <Typography variant="subtitle2" color="textSecondary">
                            Status
                        </Typography>
                        <Chip
                            label={document.status}
                            color={document.status === 'PAID' || document.status === 'ACCEPTED' ? 'success' : 
                                   document.status === 'OVERDUE' || document.status === 'REJECTED' ? 'error' : 'default'}
                            sx={{ mb: 2 }}
                        />
                    </Grid>

                    {/* Line Items */}
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                            Items
                        </Typography>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Description</TableCell>
                                    <TableCell align="right">Qty</TableCell>
                                    <TableCell align="right">Unit Price</TableCell>
                                    <TableCell align="right">Tax %</TableCell>
                                    <TableCell align="right">Amount</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {document.items?.map((item, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{item.desc}</TableCell>
                                        <TableCell align="right">{item.qty}</TableCell>
                                        <TableCell align="right">{formatCurrency(item.unitPrice)}</TableCell>
                                        <TableCell align="right">{item.taxRatePct}%</TableCell>
                                        <TableCell align="right">{formatCurrency(item.qty * item.unitPrice)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Grid>

                    {/* Totals */}
                    <Grid item xs={12} md={6} sx={{ ml: 'auto' }}>
                        <Box sx={{ border: '1px solid #ddd', borderRadius: 1, p: 2 }}>
                            <Typography variant="h6" gutterBottom>
                                Summary
                            </Typography>
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography>Subtotal:</Typography>
                                <Typography>{formatCurrency(document.totals?.subTotal || 0)}</Typography>
                            </Box>
                            
                            {document.totals?.discountTotal > 0 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography>Discount:</Typography>
                                    <Typography>-{formatCurrency(document.totals.discountTotal)}</Typography>
                                </Box>
                            )}
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography>Tax:</Typography>
                                <Typography>{formatCurrency(document.totals?.taxTotal || 0)}</Typography>
                            </Box>
                            
                            {document.shipping > 0 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography>Shipping:</Typography>
                                    <Typography>{formatCurrency(document.shipping)}</Typography>
                                </Box>
                            )}
                            
                            <Divider sx={{ my: 1 }} />
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                    Grand Total:
                                </Typography>
                                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                    {formatCurrency(document.totals?.grandTotal || 0)}
                                </Typography>
                            </Box>
                            
                            {document.type === 'invoice' && document.totals?.amountPaid > 0 && (
                                <>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography>Amount Paid:</Typography>
                                        <Typography color="success.main">
                                            {formatCurrency(document.totals.amountPaid)}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                            Amount Due:
                                        </Typography>
                                        <Typography 
                                            variant="subtitle1" 
                                            sx={{ fontWeight: 'bold' }}
                                            color={document.totals.amountDue > 0 ? 'warning.main' : 'success.main'}
                                        >
                                            {formatCurrency(document.totals.amountDue)}
                                        </Typography>
                                    </Box>
                                </>
                            )}
                        </Box>
                    </Grid>

                    {/* Notes */}
                    {document.notes && (
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" color="textSecondary" gutterBottom>
                                Notes
                            </Typography>
                            <Typography variant="body2">
                                {document.notes}
                            </Typography>
                        </Grid>
                    )}
                </Grid>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose}>Close</Button>
                <Button variant="contained" startIcon={<DownloadIcon />}>
                    Download PDF
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ClientARPortal;
