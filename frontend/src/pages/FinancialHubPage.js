import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    Container, Typography, Box, Tabs, Tab, Paper, Button, 
    CircularProgress, Alert, Card, CardContent, Grid,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, IconButton, Tooltip, FormControl, InputLabel, Select, MenuItem,
    TextField, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { 
    Add as AddIcon, 
    Receipt as ReceiptIcon, 
    Payment as PaymentIcon,
    Send as SendIcon,
    Download as DownloadIcon,
    Email as EmailIcon,
    Visibility as ViewIcon,
    Timeline as TimelineIcon,
    Reply as ReplyIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import InvoiceModal from '../components/financial/InvoiceModal';
import PaymentModal from '../components/financial/PaymentModal';
import InvoiceReplyModal from '../components/financial/InvoiceReplyModal';
import CreateSalaryRunForm from '../components/financial/CreateSalaryRunForm';
import SalaryRunsTable from '../components/financial/SalaryRunsTable';
import SalaryRunDetails from '../components/financial/SalaryRunDetails';
import SalaryProfilesManager from '../components/financial/SalaryProfilesManager';
import APHub from '../components/ap/APHub';
import FinancialMasterDashboard from '../components/financial/FinancialMasterDashboard';
import PeriodClosePage from '../components/financial/PeriodClosePage';
import JournalAdjustmentsPage from '../components/financial/JournalAdjustmentsPage';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`financial-hub-tabpanel-${index}`}
            aria-labelledby={`financial-hub-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

const FinancialHubPage = () => {
    const { user, claims } = useAuth();
    const navigate = useNavigate();
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [payments, setPayments] = useState([]);
    const [clients, setClients] = useState([]);
    const [events, setEvents] = useState([]);
    const [salaryRuns, setSalaryRuns] = useState([]);
    const [teamMembers, setTeamMembers] = useState([]);
    
    // Filter states
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [endDate, setEndDate] = useState(new Date());
    const [statusFilter, setStatusFilter] = useState('');
    const [clientFilter, setClientFilter] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    
    // Modal states
    const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [replyModalOpen, setReplyModalOpen] = useState(false);
    const [salaryRunModalOpen, setSalaryRunModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedSalaryRun, setSelectedSalaryRun] = useState(null);
    const [clientTimeline, setClientTimeline] = useState([]);
    
    // Salary management states
    const [salaryViewMode, setSalaryViewMode] = useState('runs'); // 'runs', 'details', 'profiles'
    const [selectedRunId, setSelectedRunId] = useState(null);
    // Check authorization
    const isAuthorized = claims?.role === 'admin' || claims?.role === 'accountant';

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
            console.error(`API Error ${response.status}:`, errorData); // Debug log
            let message = 'An error occurred';
            try {
                const parsed = JSON.parse(errorData);
                if (parsed.detail && Array.isArray(parsed.detail)) {
                    // Handle FastAPI validation errors
                    message = parsed.detail.map(err => `${err.loc.join('.')}: ${err.msg}`).join(', ');
                } else {
                    message = parsed.detail || parsed.message || message;
                }
            } catch {
                message = errorData || message;
            }
            throw new Error(message);
        }

        return response.json();
    };

    const inFlightRef = useRef(false);

    const loadData = useCallback(async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
            setLoading(true);

            const dashboardReq = callApi(
                `/financial-hub/overview?period=custom&start_date=${startDate.toISOString()}&end_date=${endDate.toISOString()}`
            );
            const invoicesReq = callApi('/financial-hub/invoices');
            const paymentsReq = callApi('/financial-hub/payments');
            const clientsReq = callApi('/clients/');
            const eventsReq = callApi('/events/');
            const salaryRunsReq = callApi('/salaries/runs');
            const teamReq = callApi('/team/');

            const [dashboardRes, invoicesRes, paymentsRes, clientsRes, eventsRes, salaryRunsRes, teamRes] = await Promise.allSettled([
                dashboardReq, invoicesReq, paymentsReq, clientsReq, eventsReq, salaryRunsReq, teamReq
            ]);

            if (dashboardRes.status === 'fulfilled') setDashboardData(dashboardRes.value);
            if (invoicesRes.status === 'fulfilled') setInvoices(invoicesRes.value);
            if (paymentsRes.status === 'fulfilled') setPayments(paymentsRes.value);
            if (clientsRes.status === 'fulfilled') setClients(clientsRes.value);
            if (eventsRes.status === 'fulfilled') setEvents(eventsRes.value);
            if (salaryRunsRes.status === 'fulfilled') setSalaryRuns(salaryRunsRes.value);
            if (teamRes.status === 'fulfilled') setTeamMembers(teamRes.value);

            const firstRej = [dashboardRes, invoicesRes, paymentsRes, clientsRes, eventsRes, salaryRunsRes, teamRes].find(r => r.status === 'rejected');
            if (firstRej) {
                console.warn('Some data failed to load:', firstRej.reason);
                toast.error(`Some data failed to load: ${firstRej.reason?.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error loading Financial Hub data:', error);
            toast.error('Failed to load data: ' + error.message);
        } finally {
            setLoading(false);
            inFlightRef.current = false;
        }
    }, [startDate, endDate, user]);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        if (!isAuthorized) {
            setLoading(false);
            return;
        }
        loadData();
    }, [user, isAuthorized, navigate, loadData]);

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    const getStatusColor = (status) => {
        const colors = {
            'DRAFT': 'default',
            'SENT': 'info',
            'PARTIAL': 'warning',
            'PAID': 'success',
            'OVERDUE': 'error',
            'CANCELLED': 'default'
        };
        return colors[status] || 'default';
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

    const getClientName = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        return client?.profile?.name || client?.displayName || 'Unknown';
    };

    const getEventName = (eventId) => {
        const event = events.find(e => e.id === eventId);
        return event?.eventName || '-';
    };

    const handleCreateInvoice = async (invoiceData) => {
        try {
            console.log('Creating invoice with data:', invoiceData); // Debug log
            await callApi('/financial-hub/invoices', 'POST', invoiceData);
            toast.success('Invoice created successfully');
            setInvoiceModalOpen(false);
            loadData();
        } catch (error) {
            console.error('Invoice creation error:', error); // Debug log
            toast.error('Failed to create invoice: ' + error.message);
        }
    };

    const handleSendInvoice = async (invoiceId) => {
        try {
            await callApi(`/financial-hub/invoices/${invoiceId}/send`, 'POST');
            toast.success('Invoice sent successfully');
            loadData();
        } catch (error) {
            toast.error('Failed to send invoice: ' + error.message);
        }
    };

    const handleRecordPayment = async (paymentData) => {
        try {
            await callApi(`/financial-hub/invoices/${paymentData.invoiceId}/payments`, 'POST', paymentData);
            toast.success('Payment recorded successfully');
            setPaymentModalOpen(false);
            setSelectedInvoice(null);
            loadData();
        } catch (error) {
            toast.error('Failed to record payment: ' + error.message);
        }
    };

    const handleConvertToFinal = async (budgetId) => {
        try {
            await callApi(`/financial-hub/invoices/${budgetId}/convert-to-final`, 'POST');
            toast.success('Budget converted to final invoice successfully');
            loadData();
        } catch (error) {
            toast.error('Failed to convert budget: ' + error.message);
        }
    };

    const handleDownloadPDF = async (invoiceId) => {
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

    const handleLoadClientTimeline = async (clientId) => {
        try {
            const timeline = await callApi(`/financial-hub/clients/${clientId}/timeline`);
            setClientTimeline(timeline);
            setSelectedClient(clientId);
            setTabValue(2); // Switch to Clients tab
        } catch (error) {
            toast.error('Failed to load client timeline: ' + error.message);
        }
    };

    // Salary Management Functions
    const handleCreateSalaryRun = async (runData) => {
        console.log('handleCreateSalaryRun called with:', runData);
        try {
            await callApi('/salaries/runs', 'POST', runData);
            toast.success('Salary run created successfully');
            setSalaryRunModalOpen(false);
            loadData();
        } catch (error) {
            toast.error('Failed to create salary run: ' + error.message);
        }
    };

    const handlePublishSalaryRun = async (runId) => {
        try {
            await callApi(`/salaries/runs/${runId}`, 'PUT', { status: 'PUBLISHED' });
            toast.success('Salary run published successfully');
            loadData();
        } catch (error) {
            toast.error('Failed to publish salary run: ' + error.message);
        }
    };

    const handleMarkRunPaid = async (runId) => {
        try {
            await callApi(`/salaries/runs/${runId}/mark-all-paid`, 'POST', {
                method: 'BANK_TRANSFER',
                date: new Date().toISOString(),
                reference: `Bulk payment for run ${runId}`,
                idempotencyKey: new Date().getTime().toString()
            });
            toast.success('All payslips marked as paid');
            loadData();
        } catch (error) {
            toast.error('Failed to mark payslips as paid: ' + error.message);
        }
    };

    const handleExportPayslips = async (runId) => {
        try {
            const response = await callApi(`/salaries/runs/${runId}/export?format=csv`);
            const blob = new Blob([response.content], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = response.filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Payslips exported successfully');
        } catch (error) {
            toast.error('Failed to export payslips: ' + error.message);
        }
    };

    const getTeamMemberName = (userId) => {
        const member = teamMembers.find(m => m.id === userId);
        return member?.name || 'Unknown';
    };

    const formatPeriod = (period) => {
        if (!period) return '-';
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[period.month - 1]} ${period.year}`;
    };

    const getStatusChipColor = (status) => {
        switch (status) {
            case 'DRAFT': return 'default';
            case 'PUBLISHED': return 'primary';
            case 'PAID': return 'success';
            case 'CLOSED': return 'secondary';
            default: return 'default';
        }
    };

    const filteredInvoices = invoices.filter(invoice => {
        if (statusFilter && invoice.status !== statusFilter) return false;
        if (clientFilter && invoice.clientId !== clientFilter) return false;
        if (typeFilter && invoice.type !== typeFilter) return false;
        return true;
    });

    if (!isAuthorized) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                <Alert severity="error">
                    You don't have permission to access the Financial Hub.
                </Alert>
            </Container>
        );
    }

    return (
        <LocalizationProvider dateAdapter={AdapterDateFns}>
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h4" component="h1">Financial Hub</Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button 
                            variant="outlined"
                            startIcon={<ReceiptIcon />}
                            onClick={() => {
                                setSelectedInvoice(null);
                                setInvoiceModalOpen(true);
                            }}
                        >
                            New Budget
                        </Button>
                        <Button 
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => {
                                setSelectedInvoice(null);
                                setInvoiceModalOpen(true);
                            }}
                        >
                            New Invoice
                        </Button>
                    </Box>
                </Box>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                        <CircularProgress />
                    </Box>
                ) : (
                    <Paper sx={{ width: '100%' }}>
                        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                            <Tabs value={tabValue} onChange={handleTabChange}>
                                <Tab label="Master Dashboard" />
                                <Tab label="Overview" />
                                <Tab label="Invoices" />
                                <Tab label="Salaries" />
                                <Tab label="Vendors & Bills (AP)" />
                                <Tab label="Period Close" />
                                <Tab label="Journal Adjustments" />
                                <Tab label="Clients" />
                                <Tab label="Reports" />
                            </Tabs>
                        </Box>

                        {/* Master Dashboard Tab */}
                        <TabPanel value={tabValue} index={0}>
                            <FinancialMasterDashboard />
                        </TabPanel>

                        {/* Overview Tab */}
                        <TabPanel value={tabValue} index={1}>
                            {dashboardData && (
                                <Grid container spacing={3}>
                                    {/* KPI Cards */}
                                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                        <Card>
                                            <CardContent>
                                                <Typography color="textSecondary" gutterBottom>
                                                    Total Invoiced
                                                </Typography>
                                                <Typography variant="h5" color="primary">
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
                                                    Outstanding
                                                </Typography>
                                                <Typography variant="h5" color="warning.main">
                                                    {formatCurrency(dashboardData.kpis.outstanding)}
                                                </Typography>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                    <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                        <Card>
                                            <CardContent>
                                                <Typography color="textSecondary" gutterBottom>
                                                    Overdue
                                                </Typography>
                                                <Typography variant="h5" color="error.main">
                                                    {formatCurrency(dashboardData.kpis.overdueAmount)}
                                                </Typography>
                                            </CardContent>
                                        </Card>
                                    </Grid>

                                    {/* Date Range Selector */}
                                    <Grid size={{ xs: 12 }}>
                                        <Card>
                                            <CardContent>
                                                <Typography variant="h6" gutterBottom>
                                                    Period Filter
                                                </Typography>
                                                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                                    <DatePicker
                                                        label="Start Date"
                                                        value={startDate}
                                                        onChange={setStartDate}
                                                        slotProps={{ textField: { size: 'small' } }}
                                                    />
                                                    <DatePicker
                                                        label="End Date"
                                                        value={endDate}
                                                        onChange={setEndDate}
                                                        slotProps={{ textField: { size: 'small' } }}
                                                    />
                                                    <Button variant="outlined" onClick={loadData}>
                                                        Update
                                                    </Button>
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    </Grid>

                                    {/* Aging Buckets */}
                                    {dashboardData.aging && (
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <Card>
                                                <CardContent>
                                                    <Typography variant="h6" gutterBottom>
                                                        Aging Analysis
                                                    </Typography>
                                                    {Object.entries(dashboardData.aging).map(([bucket, amount]) => (
                                                        <Box key={bucket} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                            <Typography>{bucket} days:</Typography>
                                                            <Typography color={amount > 0 ? 'error.main' : 'text.secondary'}>
                                                                {formatCurrency(amount)}
                                                            </Typography>
                                                        </Box>
                                                    ))}
                                                </CardContent>
                                            </Card>
                                        </Grid>
                                    )}

                                    {/* Upcoming Due */}
                                    {dashboardData.upcomingDue && dashboardData.upcomingDue.length > 0 && (
                                        <Grid size={{ xs: 12, md: 6 }}>
                                            <Card>
                                                <CardContent>
                                                    <Typography variant="h6" gutterBottom>
                                                        Upcoming Due (Next 30 Days)
                                                    </Typography>
                                                    {dashboardData.upcomingDue.slice(0, 5).map((invoice) => (
                                                        <Box key={invoice.invoiceId} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                            <Typography variant="body2">
                                                                {invoice.number} - {getClientName(invoice.clientId)}
                                                            </Typography>
                                                            <Typography variant="body2" color="warning.main">
                                                                {formatCurrency(invoice.amountDue)}
                                                            </Typography>
                                                        </Box>
                                                    ))}
                                                </CardContent>
                                            </Card>
                                        </Grid>
                                    )}
                                </Grid>
                            )}
                        </TabPanel>

                        {/* Invoices Tab */}
                        <TabPanel value={tabValue} index={2}>
                            {/* Filters */}
                            <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                                <FormControl size="small" sx={{ minWidth: 120 }}>
                                    <InputLabel>Type</InputLabel>
                                    <Select
                                        value={typeFilter}
                                        onChange={(e) => setTypeFilter(e.target.value)}
                                        label="Type"
                                    >
                                        <MenuItem value="">All</MenuItem>
                                        <MenuItem value="BUDGET">Budget</MenuItem>
                                        <MenuItem value="FINAL">Final</MenuItem>
                                    </Select>
                                </FormControl>
                                <FormControl size="small" sx={{ minWidth: 120 }}>
                                    <InputLabel>Status</InputLabel>
                                    <Select
                                        value={statusFilter}
                                        onChange={(e) => setStatusFilter(e.target.value)}
                                        label="Status"
                                    >
                                        <MenuItem value="">All</MenuItem>
                                        <MenuItem value="DRAFT">Draft</MenuItem>
                                        <MenuItem value="SENT">Sent</MenuItem>
                                        <MenuItem value="PARTIAL">Partial</MenuItem>
                                        <MenuItem value="PAID">Paid</MenuItem>
                                        <MenuItem value="OVERDUE">Overdue</MenuItem>
                                        <MenuItem value="CANCELLED">Cancelled</MenuItem>
                                    </Select>
                                </FormControl>
                                <FormControl size="small" sx={{ minWidth: 200 }}>
                                    <InputLabel>Client</InputLabel>
                                    <Select
                                        value={clientFilter}
                                        onChange={(e) => setClientFilter(e.target.value)}
                                        label="Client"
                                    >
                                        <MenuItem value="">All Clients</MenuItem>
                                        {clients.map((client) => (
                                            <MenuItem key={client.id} value={client.id}>
                                                {getClientName(client.id)}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Box>

                            {/* Invoices Table */}
                            <TableContainer component={Paper} variant="outlined">
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Type</TableCell>
                                            <TableCell>Number</TableCell>
                                            <TableCell>Client</TableCell>
                                            <TableCell>Event</TableCell>
                                            <TableCell>Issue Date</TableCell>
                                            <TableCell>Due Date</TableCell>
                                            <TableCell>Total</TableCell>
                                            <TableCell>Amount Due</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell>Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {filteredInvoices.map((invoice) => (
                                            <TableRow key={invoice.id}>
                                                <TableCell>
                                                    <Chip 
                                                        label={invoice.type} 
                                                        color={invoice.type === 'BUDGET' ? 'secondary' : 'primary'}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell>{invoice.number || 'Draft'}</TableCell>
                                                <TableCell>{getClientName(invoice.clientId)}</TableCell>
                                                <TableCell>{getEventName(invoice.eventId)}</TableCell>
                                                <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                                                <TableCell>
                                                    {invoice.type === 'FINAL' ? formatDate(invoice.dueDate) : '-'}
                                                </TableCell>
                                                <TableCell>{formatCurrency(invoice.totals?.grandTotal)}</TableCell>
                                                <TableCell>
                                                    <Typography 
                                                        color={invoice.totals?.amountDue > 0 ? 'warning.main' : 'success.main'}
                                                        sx={{ fontWeight: 'bold' }}
                                                    >
                                                        {formatCurrency(invoice.totals?.amountDue)}
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
                                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                        <Tooltip title="View Details">
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
                                                        
                                                        {invoice.type === 'FINAL' && ['SENT', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && (
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
                                                        
                                                        {invoice.type === 'BUDGET' && invoice.status === 'SENT' && (
                                                            <Tooltip title="Convert to Final">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleConvertToFinal(invoice.id)}
                                                                >
                                                                    <ReceiptIcon />
                                                                </IconButton>
                                                            </Tooltip>
                                                        )}
                                                        
                                                        <Tooltip title="Download PDF">
                                                            <IconButton 
                                                                size="small"
                                                                onClick={() => handleDownloadPDF(invoice.id)}
                                                            >
                                                                <DownloadIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                        
                                                        {['SENT', 'PARTIAL', 'OVERDUE'].includes(invoice.status) && (
                                                            <Tooltip title="Reply/Comments">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => {
                                                                        setSelectedInvoice(invoice);
                                                                        setReplyModalOpen(true);
                                                                    }}
                                                                >
                                                                    <ReplyIcon />
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
                        </TabPanel>

                        {/* Salaries Tab */}
                        <TabPanel value={tabValue} index={3}>
                            {salaryViewMode === 'profiles' ? (
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                        <Typography variant="h6">
                                            Salary Profiles Management
                                        </Typography>
                                        <Button 
                                            variant="outlined" 
                                            onClick={() => setSalaryViewMode('runs')}
                                        >
                                            Back to Salary Runs
                                        </Button>
                                    </Box>
                                    <SalaryProfilesManager />
                                </Box>
                            ) : salaryViewMode === 'details' && selectedRunId ? (
                                <SalaryRunDetails 
                                    runId={selectedRunId}
                                    onBack={() => {
                                        setSalaryViewMode('runs');
                                        setSelectedRunId(null);
                                    }}
                                    onRefresh={loadData}
                                />
                            ) : (
                                <Box>
                                    {/* Header with KPIs */}
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                        <Typography variant="h6">
                                            Salary Management
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <Button
                                                variant="outlined"
                                                onClick={() => setSalaryViewMode('profiles')}
                                            >
                                                Manage Profiles
                                            </Button>
                                            <Button
                                                variant="contained"
                                                startIcon={<AddIcon />}
                                                onClick={() => setSalaryRunModalOpen(true)}
                                            >
                                                New Salary Run
                                            </Button>
                                        </Box>
                                    </Box>

                                    {/* Salary KPIs */}
                                    {salaryRuns.length > 0 && (
                                        <Grid container spacing={2} sx={{ mb: 3 }}>
                                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                                <Card>
                                                    <CardContent sx={{ textAlign: 'center' }}>
                                                        <Typography color="textSecondary" gutterBottom>
                                                            Total Runs
                                                        </Typography>
                                                        <Typography variant="h5">
                                                            {salaryRuns.length}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                                <Card>
                                                    <CardContent sx={{ textAlign: 'center' }}>
                                                        <Typography color="textSecondary" gutterBottom>
                                                            Active Team Members
                                                        </Typography>
                                                        <Typography variant="h5">
                                                            {teamMembers.filter(m => m.availability).length}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                                <Card>
                                                    <CardContent sx={{ textAlign: 'center' }}>
                                                        <Typography color="textSecondary" gutterBottom>
                                                            Published Runs
                                                        </Typography>
                                                        <Typography variant="h5" color="primary">
                                                            {salaryRuns.filter(r => r.status === 'PUBLISHED').length}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                                                <Card>
                                                    <CardContent sx={{ textAlign: 'center' }}>
                                                        <Typography color="textSecondary" gutterBottom>
                                                            This Month's Total
                                                        </Typography>
                                                        <Typography variant="h6" color="success.main">
                                                            {(() => {
                                                                const currentMonth = new Date().getMonth() + 1;
                                                                const currentYear = new Date().getFullYear();
                                                                const currentRun = salaryRuns.find(r => 
                                                                    r.period?.month === currentMonth && 
                                                                    r.period?.year === currentYear
                                                                );
                                                                return currentRun?.totals?.net 
                                                                    ? new Intl.NumberFormat('en-IN', { 
                                                                        style: 'currency', 
                                                                        currency: 'INR',
                                                                        maximumFractionDigits: 0
                                                                    }).format(currentRun.totals.net)
                                                                    : '—';
                                                            })()}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                        </Grid>
                                    )}

                                    {/* Salary Runs Table */}
                                    <SalaryRunsTable 
                                        runs={salaryRuns}
                                        onSelect={(runId) => {
                                            setSelectedRunId(runId);
                                            setSalaryViewMode('details');
                                        }}
                                        onRefresh={loadData}
                                    />
                                </Box>
                            )}
                        </TabPanel>

                        {/* Vendors & Bills (AP) Tab */}
                        <TabPanel value={tabValue} index={4}>
                            <APHub />
                        </TabPanel>

                        {/* Period Close Tab */}
                        <TabPanel value={tabValue} index={5}>
                            <PeriodClosePage />
                        </TabPanel>

                        {/* Journal Adjustments Tab */}
                        <TabPanel value={tabValue} index={6}>
                            <JournalAdjustmentsPage />
                        </TabPanel>

                        {/* Clients Tab */}
                        <TabPanel value={tabValue} index={7}>
                            {selectedClient ? (
                                <Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                        <Typography variant="h6">
                                            Timeline for {getClientName(selectedClient)}
                                        </Typography>
                                        <Button onClick={() => setSelectedClient(null)}>
                                            Back to Client List
                                        </Button>
                                    </Box>
                                    
                                    {clientTimeline.summary && (
                                        <Grid container spacing={2} sx={{ mb: 3 }}>
                                            <Grid size={{ xs: 6, md: 3 }}>
                                                <Card>
                                                    <CardContent sx={{ textAlign: 'center' }}>
                                                        <Typography color="textSecondary" gutterBottom>
                                                            Total Invoiced
                                                        </Typography>
                                                        <Typography variant="h6">
                                                            {formatCurrency(clientTimeline.summary.totalInvoiced)}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                            <Grid size={{ xs: 6, md: 3 }}>
                                                <Card>
                                                    <CardContent sx={{ textAlign: 'center' }}>
                                                        <Typography color="textSecondary" gutterBottom>
                                                            Total Collected
                                                        </Typography>
                                                        <Typography variant="h6" color="success.main">
                                                            {formatCurrency(clientTimeline.summary.totalCollected)}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                            <Grid size={{ xs: 6, md: 3 }}>
                                                <Card>
                                                    <CardContent sx={{ textAlign: 'center' }}>
                                                        <Typography color="textSecondary" gutterBottom>
                                                            Outstanding
                                                        </Typography>
                                                        <Typography variant="h6" color="warning.main">
                                                            {formatCurrency(clientTimeline.summary.outstanding)}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                            <Grid size={{ xs: 6, md: 3 }}>
                                                <Card>
                                                    <CardContent sx={{ textAlign: 'center' }}>
                                                        <Typography color="textSecondary" gutterBottom>
                                                            Lifetime Value
                                                        </Typography>
                                                        <Typography variant="h6" color="primary">
                                                            {formatCurrency(clientTimeline.summary.lifetimeValue)}
                                                        </Typography>
                                                    </CardContent>
                                                </Card>
                                            </Grid>
                                        </Grid>
                                    )}
                                    
                                    {/* Timeline */}
                                    <TableContainer component={Paper} variant="outlined">
                                        <Table>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Date</TableCell>
                                                    <TableCell>Type</TableCell>
                                                    <TableCell>Description</TableCell>
                                                    <TableCell>Amount</TableCell>
                                                    <TableCell>Running Total</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {clientTimeline.timeline?.map((entry, index) => (
                                                    <TableRow key={index}>
                                                        <TableCell>{formatDate(entry.date)}</TableCell>
                                                        <TableCell>
                                                            <Chip 
                                                                label={entry.type.replace('_', ' ')}
                                                                color={entry.type === 'PAYMENT_RECEIVED' ? 'success' : 'primary'}
                                                                size="small"
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            {entry.type === 'INVOICE_SENT' 
                                                                ? `${entry.invoiceType} Invoice ${entry.invoiceNumber}`
                                                                : `Payment via ${entry.method}`
                                                            }
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography 
                                                                color={entry.type === 'PAYMENT_RECEIVED' ? 'success.main' : 'primary'}
                                                                sx={{ fontWeight: 'bold' }}
                                                            >
                                                                {entry.type === 'PAYMENT_RECEIVED' ? '+' : ''}
                                                                {formatCurrency(entry.amount)}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography variant="body2">
                                                                Outstanding: {formatCurrency(entry.runningOutstanding)}
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Box>
                            ) : (
                                <TableContainer component={Paper} variant="outlined">
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Client</TableCell>
                                                <TableCell>Total Invoiced</TableCell>
                                                <TableCell>Total Collected</TableCell>
                                                <TableCell>Outstanding</TableCell>
                                                <TableCell>Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {clients.map((client) => {
                                                const clientInvoices = invoices.filter(inv => inv.clientId === client.id);
                                                const totalInvoiced = clientInvoices.reduce((sum, inv) => sum + (inv.totals?.grandTotal || 0), 0);
                                                const totalCollected = clientInvoices.reduce((sum, inv) => sum + (inv.totals?.amountPaid || 0), 0);
                                                const outstanding = totalInvoiced - totalCollected;
                                                
                                                return (
                                                    <TableRow key={client.id}>
                                                        <TableCell>{getClientName(client.id)}</TableCell>
                                                        <TableCell>{formatCurrency(totalInvoiced)}</TableCell>
                                                        <TableCell>{formatCurrency(totalCollected)}</TableCell>
                                                        <TableCell>
                                                            <Typography 
                                                                color={outstanding > 0 ? 'warning.main' : 'success.main'}
                                                                sx={{ fontWeight: 'bold' }}
                                                            >
                                                                {formatCurrency(outstanding)}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Tooltip title="View Timeline">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleLoadClientTimeline(client.id)}
                                                                >
                                                                    <TimelineIcon />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </TabPanel>

                        {/* Reports Tab */}
                        <TabPanel value={tabValue} index={8}>
                            <Grid container spacing={3}>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <Card>
                                        <CardContent>
                                            <Typography variant="h6" gutterBottom>
                                                Export Options
                                            </Typography>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <Button variant="outlined" startIcon={<DownloadIcon />}>
                                                    Export Invoices CSV
                                                </Button>
                                                <Button variant="outlined" startIcon={<DownloadIcon />}>
                                                    Export Payments CSV
                                                </Button>
                                                <Button variant="outlined" startIcon={<DownloadIcon />}>
                                                    Export Aging Report
                                                </Button>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid size={{ xs: 12, md: 6 }}>
                                    <Card>
                                        <CardContent>
                                            <Typography variant="h6" gutterBottom>
                                                Quick Actions
                                            </Typography>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                                <Button variant="outlined">
                                                    Mark Overdue Invoices
                                                </Button>
                                                <Button variant="outlined">
                                                    Send Payment Reminders
                                                </Button>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </Grid>
                        </TabPanel>
                    </Paper>
                )}

                {/* Modals */}
                <InvoiceModal
                    open={invoiceModalOpen}
                    onClose={() => {
                        setInvoiceModalOpen(false);
                        setSelectedInvoice(null);
                    }}
                    onSave={handleCreateInvoice}
                    invoice={selectedInvoice}
                    clients={clients}
                    events={events}
                />

                <PaymentModal
                    open={paymentModalOpen}
                    onClose={() => {
                        setPaymentModalOpen(false);
                        setSelectedInvoice(null);
                    }}
                    onSave={handleRecordPayment}
                    invoice={selectedInvoice}
                />

                <InvoiceReplyModal
                    open={replyModalOpen}
                    onClose={() => {
                        setReplyModalOpen(false);
                        setSelectedInvoice(null);
                    }}
                    invoice={selectedInvoice}
                    onSendReply={async (replyData) => {
                        try {
                            await callApi(`/financial-hub/invoices/${replyData.invoiceId}/messages`, 'POST', {
                                message: replyData.message,
                                type: 'ADMIN_REPLY',
                                sendEmail: replyData.sendEmail || true
                            });
                            toast.success('Reply sent successfully');
                            // Optionally reload invoice data or refresh the view
                            loadData();
                        } catch (error) {
                            toast.error('Failed to send reply: ' + error.message);
                        }
                    }}
                    onLoadThread={async (invoiceId) => {
                        try {
                            const thread = await callApi(`/financial-hub/invoices/${invoiceId}/messages`);
                            return thread || [];
                        } catch (error) {
                            console.error('Failed to load thread:', error);
                            return [];
                        }
                    }}
                />

                {/* Salary Run Creation Modal */}
                <Dialog 
                    open={salaryRunModalOpen} 
                    onClose={() => setSalaryRunModalOpen(false)}
                    maxWidth="sm"
                    fullWidth
                >
                    <DialogTitle>Create New Salary Run</DialogTitle>
                    <DialogContent>
                        <CreateSalaryRunForm 
                            onSubmit={handleCreateSalaryRun}
                            onCancel={() => setSalaryRunModalOpen(false)}
                        />
                    </DialogContent>
                </Dialog>
            </Container>
        </LocalizationProvider>
    );
};

export default FinancialHubPage;
