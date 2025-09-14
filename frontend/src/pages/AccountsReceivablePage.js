import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Card, CardContent, Typography, Grid, CircularProgress,
    Table, TableHead, TableBody, TableRow, TableCell, Chip,
    Button, TextField, MenuItem, Select, FormControl, InputLabel,
    Dialog, DialogTitle, DialogContent, DialogActions,
    IconButton, Tooltip, AppBar, Toolbar, Container
} from '@mui/material';
import {
    Add as AddIcon,
    Visibility as ViewIcon,
    Download as DownloadIcon,
    Send as SendIcon,
    Payment as PaymentIcon,
    Receipt as ReceiptIcon,
    Email as EmailIcon,
    ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import InvoiceEditor from '../components/InvoiceEditor';
import QuoteEditor from '../components/QuoteEditor';

const AccountsReceivablePage = () => {
    const { user, claims } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [quotes, setQuotes] = useState([]);
    const [payments, setPayments] = useState([]);
    const [clients, setClients] = useState([]);
    
    // Filter states
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [endDate, setEndDate] = useState(new Date());
    const [statusFilter, setStatusFilter] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    
    // Modal states
    const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
    const [quoteModalOpen, setQuoteModalOpen] = useState(false);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    
    // Tab state
    const [activeTab, setActiveTab] = useState('dashboard');

    const callApi = async (endpoint, method = 'GET', body = null, options = {}) => {
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
                message = parsed.detail || message;
            } catch {
                message = errorData || message;
            }
            throw new Error(message);
        }

        return response.json();
    };    // Redirect to login if not authenticated
    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
    }, [user, navigate]);

    const inFlightRef = useRef(false);

    const loadData = useCallback(async () => {
        if (inFlightRef.current) return; // prevent duplicate concurrent runs
        inFlightRef.current = true;
        try {
            setLoading(true);

            // Build requests with new client revenue endpoints
            const dashboardReq = callApi(
                `/financial/overview?period=custom&start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}`
            );
            const invoicesReq = callApi('/financial/invoices');
            const quotesReq = callApi('/financial/invoices?type=BUDGET');
            const paymentsReq = callApi('/financial/invoices'); // Get all invoices and extract payments
            const clientsReq = callApi('/clients');

            // Execute in parallel and handle individually
            const [dashboardRes, invoicesRes, quotesRes, paymentsRes, clientsRes] = await Promise.allSettled([
                dashboardReq, invoicesReq, quotesReq, paymentsReq, clientsReq
            ]);

            if (dashboardRes.status === 'fulfilled') setDashboardData(dashboardRes.value);
            if (invoicesRes.status === 'fulfilled') setInvoices(invoicesRes.value);
            if (quotesRes.status === 'fulfilled') setQuotes(quotesRes.value);
            if (paymentsRes.status === 'fulfilled') setPayments(paymentsRes.value);
            if (clientsRes.status === 'fulfilled') setClients(clientsRes.value);

            // Surface one meaningful error if any failed (but don't block others from rendering)
            const firstRej = [dashboardRes, invoicesRes, quotesRes, paymentsRes, clientsRes].find(r => r.status === 'rejected');
            if (firstRej) {
                console.warn('Some AR data failed to load:', firstRej.reason);
                toast.error(`Some data failed to load: ${firstRej.reason?.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error loading AR data:', error);
            toast.error('Failed to load data: ' + error.message);
        } finally {
            setLoading(false);
            inFlightRef.current = false;
        }
    }, [startDate, endDate, callApi]);

    // Trigger loads when auth/org ready and when date range changes
    useEffect(() => {
        if (!claims?.orgId) return;
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [claims?.orgId, startDate, endDate]);

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
        return new Date(dateString).toLocaleDateString('en-IN');
    };

    const handleSendInvoice = async (invoiceId) => {
        try {
            await callApi(`/financial/invoices/${invoiceId}/send`, 'POST');
            toast.success('Invoice sent successfully');
            loadData();
        } catch (error) {
            toast.error('Failed to send invoice: ' + error.message);
        }
    };

    const handleCreatePayment = async (paymentData) => {
        try {
            await callApi(`/financial/invoices/${paymentData.invoiceId}/payments`, 'POST', paymentData);
            toast.success('Payment recorded successfully');
            setPaymentModalOpen(false);
            loadData();
        } catch (error) {
            toast.error('Failed to record payment: ' + error.message);
        }
    };

    const handleConvertQuoteToInvoice = async (quoteId) => {
        try {
            await callApi(`/financial/invoices/${quoteId}/convert-to-final`, 'POST');
            toast.success('Quote converted to invoice successfully');
            loadData();
        } catch (error) {
            toast.error('Failed to convert quote: ' + error.message);
        }
    };

    const handleDownloadInvoicePDF = async (invoiceId) => {
        try {
            const token = await user.getIdToken();
            
            const response = await fetch(`/api/financial-hub/invoices/${invoiceId}/pdf`, {
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
        }
    };

    const handleDownloadQuotePDF = async (quoteId) => {
        try {
            const token = await user.getIdToken();
            
            const response = await fetch(`/api/financial-hub/invoices/${quoteId}/pdf`, {
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
            a.download = `Quote-${quoteId}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            toast.success('PDF downloaded successfully');
        } catch (error) {
            toast.error('Failed to download PDF: ' + error.message);
        }
    };

    const handleSendInvoiceEmail = async (invoiceId) => {
        try {
            await callApi(`/financial/invoices/${invoiceId}/send`, 'POST');
            toast.success('Invoice sent via email successfully');
            loadData();
        } catch (error) {
            toast.error('Failed to send email: ' + error.message);
        }
    };

    const handleSendQuoteEmail = async (quoteId) => {
        try {
            await callApi(`/financial/invoices/${quoteId}/send`, 'POST');
            toast.success('Quote sent via email successfully');
            loadData();
        } catch (error) {
            toast.error('Failed to send email: ' + error.message);
        }
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <CircularProgress />
                <Typography variant="h6" sx={{ ml: 2 }}>
                    Loading Accounts Receivable...
                </Typography>
            </Box>
        );
    }

    const filteredInvoices = invoices.filter(invoice => {
        const matchesStatus = !statusFilter || invoice.status === statusFilter;
        const matchesClient = !clientFilter || invoice.clientId === clientFilter;
        return matchesStatus && matchesClient;
    });

    const filteredQuotes = quotes.filter(quote => {
        const matchesClient = !clientFilter || quote.clientId === clientFilter;
        return matchesClient;
    });

    // Show loading spinner while authentication is being resolved
    if (!user) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <>
            <AppBar position="static" sx={{ mb: 3 }}>
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>Accounts Receivable</Typography>
                    <Button color="inherit" onClick={() => navigate('/dashboard')}>Dashboard</Button>
                    <Button color="inherit" onClick={() => navigate('/financial')}>Financial Hub</Button>
                    <Button color="inherit" onClick={() => navigate('/clients')}>Clients</Button>
                    {process.env.REACT_APP_FEATURE_POSTPROD !== 'false' && (
                        <Button color="inherit" onClick={() => navigate('/postprod')}>Post Production</Button>
                    )}
                </Toolbar>
            </AppBar>
            <Container maxWidth="xl" sx={{ mt: 2 }}>
                <LocalizationProvider dateAdapter={AdapterDateFns}>
                    <Box sx={{ p: 3 }}>
                        {/* Header */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Typography variant="h4" gutterBottom>
                                Accounts Receivable Dashboard
                            </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => setQuoteModalOpen(true)}
                        >
                            New Quote
                        </Button>
                        <Button
                            variant="contained"
                            startIcon={<ReceiptIcon />}
                            onClick={() => setInvoiceModalOpen(true)}
                        >
                            New Invoice
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<PaymentIcon />}
                            onClick={() => setPaymentModalOpen(true)}
                        >
                            Record Payment
                        </Button>
                    </Box>
                </Box>

                {/* Filters */}
                <Card sx={{ mb: 3 }}>
                    <CardContent>
                    <Grid container spacing={2} alignItems="center">
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <DatePicker
                                label="Start Date"
                                value={startDate}
                                onChange={setStartDate}
                                slotProps={{ textField: { fullWidth: true } }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <DatePicker
                                label="End Date"
                                value={endDate}
                                onChange={setEndDate}
                                slotProps={{ textField: { fullWidth: true } }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                                <FormControl fullWidth>
                                    <InputLabel>Status</InputLabel>
                                    <Select
                                        value={statusFilter}
                                        label="Status"
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                    >
                                        <MenuItem value="">All Statuses</MenuItem>
                                        <MenuItem value="DRAFT">Draft</MenuItem>
                                        <MenuItem value="SENT">Sent</MenuItem>
                                        <MenuItem value="PARTIAL">Partial</MenuItem>
                                        <MenuItem value="PAID">Paid</MenuItem>
                                        <MenuItem value="OVERDUE">Overdue</MenuItem>
                                        <MenuItem value="CANCELLED">Cancelled</MenuItem>
                                    </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <FormControl fullWidth>
                                <InputLabel>Client</InputLabel>
                                <Select
                                    value={clientFilter}
                                    label="Client"
                                    onChange={(e) => setClientFilter(e.target.value)}
                                >
                                    <MenuItem value="">All Clients</MenuItem>
                                    {clients.map(client => (
                                        <MenuItem key={client.id} value={client.id}>
                                            {client.profile?.name || 'Unknown Client'}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                    </CardContent>
                </Card>

                {/* Dashboard KPIs */}
                {dashboardData && (
                    <Grid container spacing={3} sx={{ mb: 3 }}>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                            <Card>
                                <CardContent>
                                    <Typography color="textSecondary" gutterBottom>
                                        Total Invoiced
                                    </Typography>
                                    <Typography variant="h5">
                                        {formatCurrency(dashboardData.kpis.totalInvoiced)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                            <Card>
                                <CardContent>
                                    <Typography color="textSecondary" gutterBottom>
                                        Total Collected
                                    </Typography>
                                    <Typography variant="h5" color="success.main">
                                        {formatCurrency(dashboardData.kpis.totalCollected)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                            <Card>
                                <CardContent>
                                    <Typography color="textSecondary" gutterBottom>
                                        Amount Due
                                    </Typography>
                                    <Typography variant="h5" color="warning.main">
                                        {formatCurrency(dashboardData.kpis.amountDue)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                            <Card>
                                <CardContent>
                                    <Typography color="textSecondary" gutterBottom>
                                        Overdue Amount
                                    </Typography>
                                    <Typography variant="h5" color="error.main">
                                        {formatCurrency(dashboardData.kpis.overdueAmount)}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>
                )}

                {/* Aging Report */}
                {dashboardData && (
                    <Card sx={{ mb: 3 }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Aging Report
                            </Typography>
                            <Grid container spacing={2}>
                                {Object.entries(dashboardData.agingBuckets).map(([bucket, amount]) => (
                                    <Grid size={{ xs: 12, sm: 6, md: 2.4 }} key={bucket}>
                                        <Box sx={{ textAlign: 'center', p: 2, border: '1px solid #ddd', borderRadius: 1 }}>
                                            <Typography variant="subtitle2" color="textSecondary">
                                                {bucket} days
                                            </Typography>
                                            <Typography variant="h6">
                                                {formatCurrency(amount)}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                ))}
                            </Grid>
                        </CardContent>
                    </Card>
                )}

                {/* Tabs */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        {['invoices', 'quotes', 'payments'].map((tab) => (
                            <Button
                                key={tab}
                                variant={activeTab === tab ? 'contained' : 'text'}
                                onClick={() => setActiveTab(tab)}
                                sx={{ textTransform: 'capitalize' }}
                            >
                                {tab}
                            </Button>
                        ))}
                    </Box>
                </Box>

                {/* Invoices Tab */}
                {activeTab === 'invoices' && (
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Invoices
                            </Typography>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Invoice #</TableCell>
                                        <TableCell>Client</TableCell>
                                        <TableCell>Issue Date</TableCell>
                                        <TableCell>Due Date</TableCell>
                                        <TableCell>Amount</TableCell>
                                        <TableCell>Amount Due</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredInvoices.map((invoice) => {
                                        const client = clients.find(c => c.id === invoice.clientId);
                                        return (
                                            <TableRow key={invoice.id}>
                                                <TableCell>{invoice.number || 'Draft'}</TableCell>
                                                <TableCell>{client?.profile?.name || 'Unknown'}</TableCell>
                                                <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                                                <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                                                <TableCell>{formatCurrency(invoice.totals?.grandTotal || 0)}</TableCell>
                                                <TableCell>{formatCurrency(invoice.totals?.amountDue || 0)}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={invoice.status}
                                                        color={getStatusColor(invoice.status)}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell>
                                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                                        <Tooltip title="View">
                                                            <IconButton size="small">
                                                                <ViewIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        {invoice.status === 'DRAFT' && (
                                                            <Tooltip title="Send">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleSendInvoice(invoice.id)}
                                                                >
                                                                    <SendIcon />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        {['SENT', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && (
                                                            <Tooltip title="Record Payment">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => {
                                                                        setSelectedInvoice(invoice);
                                                                        setPaymentModalOpen(true);
                                                                    }}
                                                                >
                                                                    <PaymentIcon />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        <Tooltip title="Download PDF">
                                                            <IconButton 
                                                                size="small"
                                                                onClick={() => handleDownloadInvoicePDF(invoice.id)}
                                                            >
                                                                <DownloadIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        {['SENT', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && (
                                                            <Tooltip title="Send Email">
                                                                <IconButton 
                                                                    size="small"
                                                                    onClick={() => handleSendInvoiceEmail(invoice.id)}
                                                                >
                                                                    <EmailIcon />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {/* Quotes Tab */}
                {activeTab === 'quotes' && (
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Quotes
                            </Typography>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Quote #</TableCell>
                                        <TableCell>Client</TableCell>
                                        <TableCell>Issue Date</TableCell>
                                        <TableCell>Valid Until</TableCell>
                                        <TableCell>Amount</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filteredQuotes.map((quote) => {
                                        const client = clients.find(c => c.id === quote.clientId);
                                        return (
                                            <TableRow key={quote.id}>
                                                <TableCell>{quote.number || 'Draft'}</TableCell>
                                                <TableCell>{client?.profile?.name || 'Unknown'}</TableCell>
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
                                                        <Tooltip title="View">
                                                            <IconButton size="small">
                                                                <ViewIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        {quote.status === 'ACCEPTED' && (
                                                            <Tooltip title="Convert to Invoice">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleConvertQuoteToInvoice(quote.id)}
                                                                >
                                                                    <ReceiptIcon />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        <Tooltip title="Download PDF">
                                                            <IconButton 
                                                                size="small"
                                                                onClick={() => handleDownloadQuotePDF(quote.id)}
                                                            >
                                                                <DownloadIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        {['SENT', 'ACCEPTED'].includes(quote.status) && (
                                                            <Tooltip title="Send Email">
                                                                <IconButton 
                                                                    size="small"
                                                                    onClick={() => handleSendQuoteEmail(quote.id)}
                                                                >
                                                                    <EmailIcon />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {/* Payments Tab */}
                {activeTab === 'payments' && (
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Payments
                            </Typography>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Client</TableCell>
                                        <TableCell>Invoice #</TableCell>
                                        <TableCell>Amount</TableCell>
                                        <TableCell>Method</TableCell>
                                        <TableCell>Reference</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {payments.map((payment) => {
                                        const client = clients.find(c => c.id === payment.clientId);
                                        const invoice = invoices.find(i => i.id === payment.invoiceId);
                                        return (
                                            <TableRow key={payment.id}>
                                                <TableCell>{formatDate(payment.paidAt)}</TableCell>
                                                <TableCell>{client?.profile?.name || 'Unknown'}</TableCell>
                                                <TableCell>{invoice?.number || 'Unknown'}</TableCell>
                                                <TableCell>{formatCurrency(payment.amount)}</TableCell>
                                                <TableCell>{payment.method}</TableCell>
                                                <TableCell>{payment.reference || '-'}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}
            </Box>

            {/* Payment Modal */}
            <PaymentModal
                open={paymentModalOpen}
                onClose={() => {
                    setPaymentModalOpen(false);
                    setSelectedInvoice(null);
                }}
                onSubmit={handleCreatePayment}
                invoice={selectedInvoice}
                invoices={invoices}
                clients={clients}
            />

            {/* Invoice Editor */}
            <InvoiceEditor
                open={invoiceModalOpen}
                onClose={() => setInvoiceModalOpen(false)}
            />

            {/* Quote Editor */}
            <QuoteEditor
                open={quoteModalOpen}
                onClose={() => setQuoteModalOpen(false)}
            />
                </LocalizationProvider>
            </Container>
        </>
    );
};

// Payment Modal Component
const PaymentModal = ({ open, onClose, onSubmit, invoice, invoices, clients }) => {
    const [formData, setFormData] = useState({
        invoiceId: '',
        amount: '',
        paidAt: new Date().toISOString().slice(0, 16),
        method: 'BANK',
        reference: ''
    });

    useEffect(() => {
        if (invoice) {
            setFormData(prev => ({
                ...prev,
                invoiceId: invoice.id,
                amount: invoice.totals?.amountDue || 0
            }));
        }
    }, [invoice]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({
            ...formData,
            amount: parseFloat(formData.amount)
        });
    };

    const selectedInvoice = invoices.find(inv => inv.id === formData.invoiceId);
    const maxAmount = selectedInvoice?.totals?.amountDue || 0;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle>Record Payment</DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <Grid container spacing={2}>
                        <Grid size={12}>
                            <FormControl fullWidth>
                                <InputLabel>Invoice</InputLabel>
                                <Select
                                    value={formData.invoiceId}
                                    label="Invoice"
                                    onChange={(e) => setFormData(prev => ({ ...prev, invoiceId: e.target.value }))}
                                    required
                                >
                                    {invoices
                                        .filter(inv => ['SENT', 'PARTIAL', 'OVERDUE'].includes(inv.status))
                                        .map(inv => {
                                            const client = clients.find(c => c.id === inv.clientId);
                                            return (
                                                <MenuItem key={inv.id} value={inv.id}>
                                                    {inv.number} - {client?.profile?.name} (Due: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(inv.totals?.amountDue || 0)})
                                                </MenuItem>
                                            );
                                        })}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label="Amount"
                                type="number"
                                value={formData.amount}
                                onChange={(e) => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                                inputProps={{ max: maxAmount, min: 0, step: 0.01 }}
                                helperText={`Max: ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(maxAmount)}`}
                                required
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label="Payment Date & Time"
                                type="datetime-local"
                                value={formData.paidAt}
                                onChange={(e) => setFormData(prev => ({ ...prev, paidAt: e.target.value }))}
                                required
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <FormControl fullWidth>
                                <InputLabel>Payment Method</InputLabel>
                                <Select
                                    value={formData.method}
                                    label="Payment Method"
                                    onChange={(e) => setFormData(prev => ({ ...prev, method: e.target.value }))}
                                >
                                    <MenuItem value="BANK">Bank Transfer</MenuItem>
                                    <MenuItem value="UPI">UPI</MenuItem>
                                    <MenuItem value="CASH">Cash</MenuItem>
                                    <MenuItem value="CARD">Card</MenuItem>
                                    <MenuItem value="OTHER">Other</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6 }}>
                            <TextField
                                fullWidth
                                label="Reference Number"
                                value={formData.reference}
                                onChange={(e) => setFormData(prev => ({ ...prev, reference: e.target.value }))}
                                placeholder="UTR/Transaction ID"
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button type="submit" variant="contained">
                        Record Payment
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default AccountsReceivablePage;
