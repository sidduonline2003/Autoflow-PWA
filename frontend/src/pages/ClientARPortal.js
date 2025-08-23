import React, { useState, useEffect } from 'react';
import {
    Box, Card, CardContent, Typography, Grid, CircularProgress,
    Table, TableHead, TableBody, TableRow, TableCell, Chip,
    Button, IconButton, Tooltip, Tab, Tabs, Dialog,
    DialogTitle, DialogContent, DialogActions, Divider,
    TextField, Alert, List, ListItem, ListItemText, Avatar,
    Switch, FormControlLabel, Paper, InputAdornment
} from '@mui/material';
import {
    Download as DownloadIcon,
    Visibility as ViewIcon,
    Receipt as ReceiptIcon,
    Description as DescriptionIcon,
    Payment as PaymentIcon,
    Reply as ReplyIcon,
    Send as SendIcon,
    Chat as ChatIcon,
    Search as SearchIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';

const ClientARPortal = () => {
    const { claims, user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [payments, setPayments] = useState([]);
    const [activeTab, setActiveTab] = useState(0);
    const [selectedDocument, setSelectedDocument] = useState(null);
    const [detailModalOpen, setDetailModalOpen] = useState(false);
    
    // Reply functionality
    const [replyModalOpen, setReplyModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [communicationThread, setCommunicationThread] = useState([]);
    const [replyText, setReplyText] = useState('');
    const [sendingReply, setSendingReply] = useState(false);
    
    // Search and filter
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('');

    const callApi = async (endpoint, method = 'GET', body = null) => {
        console.log(`[ClientARPortal] Making API call to ${endpoint}`, { method, body });
        
        if (!auth.currentUser) {
            console.error('[ClientARPortal] No authenticated user found');
            throw new Error('Not authenticated');
        }

        try {
            const idToken = await auth.currentUser.getIdToken();
            console.log('[ClientARPortal] Got ID token, making request...');
            
            const response = await fetch(`/api${endpoint}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                ...(body && { body: JSON.stringify(body) })
            });
            
            console.log(`[ClientARPortal] Response status: ${response.status}`);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
                console.error('[ClientARPortal] API Error:', errorData);
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`[ClientARPortal] Success response:`, data);
            return data;
        } catch (error) {
            console.error('[ClientARPortal] API call failed:', error);
            throw error;
        }
    };

    const loadData = async () => {
        console.log('[ClientARPortal] Starting data load...');
        console.log('[ClientARPortal] User:', user);
        console.log('[ClientARPortal] Claims:', claims);
        
        try {
            setLoading(true);
            setError(null);
            
            // Check authentication
            if (!user) {
                console.error('[ClientARPortal] No user found');
                setError('Please log in to view invoices');
                return;
            }
            
            if (!claims) {
                console.log('[ClientARPortal] No claims yet, waiting...');
                return;
            }
            
            if (claims.role !== 'client') {
                console.error('[ClientARPortal] User is not a client:', claims.role);
                setError('Access denied. Client role required.');
                return;
            }
            
            console.log('[ClientARPortal] Loading invoices...');
            // Load client's invoices
            const invoicesResponse = await callApi('/ar/invoices');
            console.log('[ClientARPortal] Invoices loaded:', invoicesResponse);
            setInvoices(Array.isArray(invoicesResponse) ? invoicesResponse : []);
            
            console.log('[ClientARPortal] Loading quotes...');
            // Load client's quotes
            const quotesResponse = await callApi('/ar/quotes');
            console.log('[ClientARPortal] Quotes loaded:', quotesResponse);
            setQuotes(Array.isArray(quotesResponse) ? quotesResponse : []);
            
            console.log('[ClientARPortal] Loading summary...');
            // Load client's summary
            const summaryResponse = await callApi('/ar/summary');
            console.log('[ClientARPortal] Summary loaded:', summaryResponse);
            
            console.log('[ClientARPortal] Loading payments...');
            // Load client's payments
            const paymentsResponse = await callApi('/ar/payments');
            console.log('[ClientARPortal] Payments loaded:', paymentsResponse);
            setPayments(Array.isArray(paymentsResponse) ? paymentsResponse : []);
            
            console.log('[ClientARPortal] All data loaded successfully');
            
        } catch (error) {
            console.error('[ClientARPortal] Error loading AR data:', error);
            setError(`Failed to load data: ${error.message}`);
            toast.error('Failed to load data: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        console.log('[ClientARPortal] useEffect triggered', { user: !!user, claims: !!claims });
        
        if (user && claims) {
            loadData();
        } else if (user && !claims) {
            console.log('[ClientARPortal] User exists but no claims yet, waiting...');
        } else if (!user) {
            console.log('[ClientARPortal] No user, setting error');
            setError('Please log in to view invoices');
            setLoading(false);
        }
    }, [user, claims]);

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

    const handleOpenReply = async (invoice) => {
        setSelectedInvoice(invoice);
        setReplyModalOpen(true);
        
        // Load communication thread
        try {
            const thread = await callApi(`/ar/invoices/${invoice.id}/messages`);
            setCommunicationThread(thread || []);
        } catch (error) {
            console.error('Error loading communication thread:', error);
            setCommunicationThread([]);
        }
    };

    const handleSendReply = async () => {
        if (!replyText.trim() || !selectedInvoice) return;
        
        setSendingReply(true);
        try {
            await callApi(`/ar/invoices/${selectedInvoice.id}/messages`, 'POST', {
                message: replyText,
                type: 'CLIENT_REPLY',
                sendEmail: true
            });
            
            toast.success('Reply sent successfully');
            setReplyText('');
            
            // Reload communication thread
            const thread = await callApi(`/ar/invoices/${selectedInvoice.id}/messages`);
            setCommunicationThread(thread || []);
        } catch (error) {
            toast.error('Failed to send reply: ' + error.message);
        } finally {
            setSendingReply(false);
        }
    };

    const handleDownloadPDF = async (document, type) => {
        try {
            const endpoint = type === 'invoice' 
                ? `/ar/invoices/${document.id}/pdf`
                : `/ar/quotes/${document.id}/pdf`;
            
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api${endpoint}`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            
            if (!response.ok) {
                throw new Error('Failed to download PDF');
            }
            
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${type === 'invoice' ? 'Invoice' : 'Quote'}-${document.number || document.id}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            toast.error('Failed to download PDF: ' + error.message);
        }
    };

    // Filter functions
    const filteredInvoices = invoices.filter(invoice => {
        const matchesSearch = !searchTerm || 
            invoice.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            invoice.notes?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = !statusFilter || invoice.status === statusFilter;
        
        return matchesSearch && matchesStatus;
    });

    const filteredQuotes = quotes.filter(quote => {
        const matchesSearch = !searchTerm || 
            quote.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            quote.notes?.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesStatus = !statusFilter || quote.status === statusFilter;
        
        return matchesSearch && matchesStatus;
    });

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
            <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: 400, p: 3 }}>
                <CircularProgress />
                <Typography variant="h6" sx={{ ml: 2, mt: 2 }}>
                    Loading your invoices...
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    {!user ? 'Waiting for authentication...' : 
                     !claims ? 'Loading user permissions...' : 
                     'Fetching invoice data...'}
                </Typography>
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
                <Button variant="contained" onClick={loadData}>
                    Retry
                </Button>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Debug Info - Remove in production */}
            {process.env.NODE_ENV === 'development' && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                        <strong>Debug Info:</strong><br/>
                        User: {user ? `${user.email} (${user.uid})` : 'None'}<br/>
                        Role: {claims?.role || 'None'}<br/>
                        Org ID: {claims?.orgId || 'None'}<br/>
                        Client ID: {claims?.clientId || 'None'}
                    </Typography>
                </Alert>
            )}
            
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

            {/* Search and Filter Bar */}
            <Box sx={{ mb: 3 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            placeholder="Search invoices by number or notes..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon />
                                    </InputAdornment>
                                )
                            }}
                        />
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <TextField
                            fullWidth
                            select
                            label="Filter by Status"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            SelectProps={{ native: true }}
                        >
                            <option value="">All Statuses</option>
                            <option value="SENT">Sent</option>
                            <option value="PARTIAL">Partially Paid</option>
                            <option value="PAID">Paid</option>
                            <option value="OVERDUE">Overdue</option>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        <Typography variant="body2" color="text.secondary">
                            Showing {activeTab === 0 ? filteredInvoices.length : 
                                    activeTab === 1 ? filteredQuotes.length : payments.length} items
                        </Typography>
                    </Grid>
                </Grid>
            </Box>

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
                                    {filteredInvoices.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} align="center">
                                                <Typography color="textSecondary">
                                                    {searchTerm || statusFilter ? 'No invoices match your filters' : 'No invoices found'}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredInvoices.map((invoice) => (
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
                                                        <Tooltip title="Send Reply">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleOpenReply(invoice)}
                                                                color="primary"
                                                            >
                                                                <ReplyIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title="Download PDF">
                                                            <IconButton 
                                                                size="small"
                                                                onClick={() => handleDownloadPDF(invoice, 'invoice')}
                                                            >
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
                                    {filteredQuotes.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center">
                                                <Typography color="textSecondary">
                                                    {searchTerm || statusFilter ? 'No quotes match your filters' : 'No quotes found'}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredQuotes.map((quote) => (
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
                                                            <IconButton 
                                                                size="small"
                                                                onClick={() => handleDownloadPDF(quote, 'quote')}
                                                            >
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
                onDownloadPDF={handleDownloadPDF}
            />
            
            {/* Invoice Reply Modal */}
            <InvoiceReplyModal
                open={replyModalOpen}
                onClose={() => {
                    setReplyModalOpen(false);
                    setSelectedInvoice(null);
                    setCommunicationThread([]);
                    setReplyText('');
                }}
                invoice={selectedInvoice}
                communicationThread={communicationThread}
                replyText={replyText}
                onReplyTextChange={setReplyText}
                onSendReply={handleSendReply}
                sendingReply={sendingReply}
            />
        </Box>
    );
};

// Document Detail Modal Component
const DocumentDetailModal = ({ open, onClose, document, onDownloadPDF }) => {
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
                                        <TableCell>{item.description}</TableCell>
                                        <TableCell align="right">{item.quantity}</TableCell>
                                        <TableCell align="right">{formatCurrency(item.unitPrice)}</TableCell>
                                        <TableCell align="right">{item.taxRatePct}%</TableCell>
                                        <TableCell align="right">{formatCurrency(item.quantity * item.unitPrice)}</TableCell>
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
                            
                            {document.shippingAmount > 0 && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography>Shipping:</Typography>
                                    <Typography>{formatCurrency(document.shippingAmount)}</Typography>
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
                <Button 
                    variant="contained" 
                    startIcon={<DownloadIcon />}
                    onClick={() => onDownloadPDF(document, document.type)}
                >
                    Download PDF
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// Invoice Reply Modal Component
const InvoiceReplyModal = ({ 
    open, 
    onClose, 
    invoice, 
    communicationThread, 
    replyText, 
    onReplyTextChange, 
    onSendReply, 
    sendingReply 
}) => {
    if (!invoice) return null;

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    };

    const formatDateTime = (dateString) => {
        return format(new Date(dateString), 'MMM dd, yyyy hh:mm a');
    };

    const getMessageTypeColor = (type) => {
        switch (type) {
            case 'CLIENT_REPLY': return 'info';
            case 'PAYMENT_REMINDER': return 'warning';
            case 'OVERDUE_NOTICE': return 'error';
            default: return 'default';
        }
    };

    const getMessageTypeLabel = (type) => {
        switch (type) {
            case 'CLIENT_REPLY': return 'Client Reply';
            case 'PAYMENT_REMINDER': return 'Payment Reminder';
            case 'OVERDUE_NOTICE': return 'Overdue Notice';
            case 'GENERAL': return 'Message';
            default: return 'Message';
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ChatIcon />
                    Communication - Invoice {invoice.number}
                </Box>
            </DialogTitle>
            
            <DialogContent>
                <Grid container spacing={3}>
                    {/* Invoice Summary */}
                    <Grid item xs={12}>
                        <Paper variant="outlined" sx={{ p: 2, backgroundColor: 'grey.50' }}>
                            <Typography variant="h6" gutterBottom>
                                Invoice Summary
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Status:
                                    </Typography>
                                    <Chip 
                                        label={invoice.status} 
                                        color={
                                            invoice.status === 'PAID' ? 'success' :
                                            invoice.status === 'OVERDUE' ? 'error' :
                                            invoice.status === 'PARTIAL' ? 'warning' : 'default'
                                        }
                                        size="small"
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Amount Due:
                                    </Typography>
                                    <Typography variant="body1" color="primary" sx={{ fontWeight: 'bold' }}>
                                        {formatCurrency(invoice.totals?.amountDue || 0)}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Due Date:
                                    </Typography>
                                    <Typography variant="body1">
                                        {invoice.dueDate ? format(new Date(invoice.dueDate), 'MMM dd, yyyy') : 'Not set'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Total Amount:
                                    </Typography>
                                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                                        {formatCurrency(invoice.totals?.grandTotal || 0)}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </Paper>
                    </Grid>

                    {/* Communication History */}
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                            Communication History
                        </Typography>
                        
                        <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto', p: 1 }}>
                            {communicationThread.length === 0 ? (
                                <Box sx={{ p: 3, textAlign: 'center' }}>
                                    <Typography variant="body2" color="text.secondary">
                                        No communication history found
                                    </Typography>
                                </Box>
                            ) : (
                                <List>
                                    {communicationThread.map((message, index) => (
                                        <React.Fragment key={message.id || index}>
                                            <ListItem alignItems="flex-start">
                                                <Box sx={{ display: 'flex', width: '100%', gap: 2 }}>
                                                    <Avatar sx={{ width: 32, height: 32, fontSize: '0.875rem' }}>
                                                        {message.type === 'CLIENT_REPLY' ? 'C' : 'S'}
                                                    </Avatar>
                                                    <Box sx={{ flexGrow: 1 }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                            <Typography variant="subtitle2">
                                                                {message.type === 'CLIENT_REPLY' ? 
                                                                    'You' : 
                                                                    (message.sentBy || 'AutoStudioFlow')
                                                                }
                                                            </Typography>
                                                            <Chip 
                                                                label={getMessageTypeLabel(message.type)} 
                                                                color={getMessageTypeColor(message.type)}
                                                                size="small"
                                                            />
                                                            <Typography variant="caption" color="text.secondary">
                                                                {formatDateTime(message.sentAt)}
                                                            </Typography>
                                                        </Box>
                                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                                                            {message.message}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                            </ListItem>
                                            {index < communicationThread.length - 1 && <Divider variant="inset" component="li" />}
                                        </React.Fragment>
                                    ))}
                                </List>
                            )}
                        </Paper>
                    </Grid>

                    {/* New Message */}
                    <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>
                            Send New Message
                        </Typography>
                        <TextField
                            fullWidth
                            multiline
                            rows={4}
                            placeholder="Type your message here..."
                            value={replyText}
                            onChange={(e) => onReplyTextChange(e.target.value)}
                            disabled={sendingReply}
                        />
                        
                        {!replyText.trim() && (
                            <Alert severity="info" sx={{ mt: 2 }}>
                                Enter a message to send to AutoStudioFlow team
                            </Alert>
                        )}
                    </Grid>
                </Grid>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} disabled={sendingReply}>
                    Close
                </Button>
                <Button 
                    onClick={onSendReply}
                    variant="contained" 
                    disabled={sendingReply || !replyText.trim()}
                    startIcon={sendingReply ? <CircularProgress size={16} /> : <SendIcon />}
                >
                    {sendingReply ? 'Sending...' : 'Send Message'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ClientARPortal;
