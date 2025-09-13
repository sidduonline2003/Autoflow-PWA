import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    Grid,
    CircularProgress,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Chip,
    Divider,
    List,
    ListItem,
    ListItemText,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Tooltip,
    Badge,
    Tabs,
    Tab,
    LinearProgress,
    ToggleButton,
    ToggleButtonGroup
} from '@mui/material';
import {
    Dashboard as DashboardIcon,
    Receipt as ReceiptIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Error as ErrorIcon,
    Visibility as ViewIcon,
    ThumbUp as ApproveIcon,
    ThumbDown as RejectIcon,
    Compare as CompareIcon,
    Refresh as RefreshIcon,
    FilterList as FilterIcon,
    Info as InfoIcon,
    SmartToy as AiIcon,
    Psychology as PsychologyIcon,
    AutoAwesome as AutoAwesomeIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import toast from 'react-hot-toast';

const ReceiptVerificationDashboard = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [receipts, setReceipts] = useState([]);
    const [dashboardSummary, setDashboardSummary] = useState(null);
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [compareOpen, setCompareOpen] = useState(false);
    const [compareReceipts, setCompareReceipts] = useState([]);
    const [activeTab, setActiveTab] = useState(0);
    const [filters, setFilters] = useState({
        status: '',
        riskLevel: '',
        eventId: ''
    });
    const [verificationNotes, setVerificationNotes] = useState('');
    const [processing, setProcessing] = useState(false);
    const [viewMode, setViewMode] = useState('standard'); // 'standard' or 'ai'
    const [aiAnalysis, setAiAnalysis] = useState(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);

    // Fetch dashboard summary
    const fetchDashboardSummary = async () => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch('/api/receipts/dashboard/summary', {
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setDashboardSummary(data);
            }
        } catch (error) {
            console.error('Error fetching dashboard summary:', error);
        }
    };

    // Fetch receipts with filters
    const fetchReceipts = async () => {
        setLoading(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const queryParams = new URLSearchParams();
            
            if (filters.status) queryParams.append('status', filters.status);
            if (filters.eventId) queryParams.append('eventId', filters.eventId);
            
            const response = await fetch(`/api/receipts/?${queryParams.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                let filteredReceipts = data.receipts || [];
                
                // Apply client-side risk level filter
                if (filters.riskLevel) {
                    filteredReceipts = filteredReceipts.filter(receipt => 
                        receipt.riskAssessment?.riskLevel === filters.riskLevel
                    );
                }
                
                setReceipts(filteredReceipts);
            }
        } catch (error) {
            console.error('Error fetching receipts:', error);
            toast.error('Failed to fetch receipts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardSummary();
        fetchReceipts();
    }, [filters]);

    const handleVerifyReceipt = async (receiptId, status, notes = '') => {
        setProcessing(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/receipts/${receiptId}/verify`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    status,
                    verificationNotes: notes
                })
            });

            if (response.ok) {
                toast.success(`Receipt ${status.toLowerCase()} successfully`);
                fetchReceipts();
                fetchDashboardSummary();
                setDetailsOpen(false);
                setVerificationNotes('');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Verification failed');
            }
        } catch (error) {
            console.error('Verification error:', error);
            toast.error(error.message);
        } finally {
            setProcessing(false);
        }
    };

    // Get AI analysis for specific receipt
    const getAiAnalysis = async (receiptId) => {
        setAnalysisLoading(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/receipts/admin/ai-analysis/${receiptId}`, {
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setAiAnalysis(data);
                return data;
            } else {
                throw new Error('Failed to get AI analysis');
            }
        } catch (error) {
            console.error('Error getting AI analysis:', error);
            toast.error('Failed to get AI analysis');
            return null;
        } finally {
            setAnalysisLoading(false);
        }
    };

    const getRiskLevelColor = (riskLevel) => {
        switch (riskLevel) {
            case 'LOW_RISK': return 'success';
            case 'MEDIUM_RISK': return 'warning';
            case 'HIGH_RISK': return 'error';
            default: return 'default';
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'VERIFIED': return 'success';
            case 'PENDING': return 'warning';
            case 'REJECTED': return 'error';
            case 'SUSPICIOUS': return 'error';
            default: return 'default';
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount || 0);
    };

    const openDetails = (receipt) => {
        setSelectedReceipt(receipt);
        setVerificationNotes('');
        setAiAnalysis(null); // Reset AI analysis
        setDetailsOpen(true);
        
        // Auto-load AI analysis if in AI mode
        if (viewMode === 'ai') {
            getAiAnalysis(receipt.id);
        }
    };

    const openCompare = (receipt) => {
        // Find similar receipts for comparison
        const similar = receipts.filter(r => 
            r.id !== receipt.id && 
            (r.extractedData?.rideId === receipt.extractedData?.rideId ||
             r.riskAssessment?.verificationDetails?.duplicateCheck?.hasDuplicates)
        );
        setCompareReceipts([receipt, ...similar.slice(0, 2)]);
        setCompareOpen(true);
    };

    const SummaryCard = ({ title, value, icon, color = 'primary' }) => (
        <Card>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                        <Typography color="textSecondary" gutterBottom variant="h6">
                            {title}
                        </Typography>
                        <Typography variant="h4">
                            {value}
                        </Typography>
                    </Box>
                    <Box sx={{ color: `${color}.main` }}>
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );

    const TabPanel = ({ children, value, index }) => (
        <div hidden={value !== index}>
            {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
        </div>
    );

    if (loading && !dashboardSummary) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">
                    Receipt Verification Dashboard
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <ToggleButtonGroup
                        value={viewMode}
                        exclusive
                        onChange={(e, newMode) => newMode && setViewMode(newMode)}
                        size="small"
                    >
                        <ToggleButton value="standard">
                            <ReceiptIcon sx={{ mr: 1 }} />
                            Standard
                        </ToggleButton>
                        <ToggleButton value="ai">
                            <AiIcon sx={{ mr: 1 }} />
                            AI Enhanced
                        </ToggleButton>
                    </ToggleButtonGroup>
                    <Button
                        startIcon={<RefreshIcon />}
                        onClick={() => {
                            fetchReceipts();
                            fetchDashboardSummary();
                        }}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </Box>
            </Box>

            {/* Dashboard Summary */}
            {dashboardSummary && (
                <Grid container spacing={3} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6} md={3}>
                        <SummaryCard
                            title="Total Receipts"
                            value={dashboardSummary.totalReceipts}
                            icon={<ReceiptIcon sx={{ fontSize: 40 }} />}
                            color="primary"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <SummaryCard
                            title="Pending Review"
                            value={dashboardSummary.pendingVerification}
                            icon={<WarningIcon sx={{ fontSize: 40 }} />}
                            color="warning"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <SummaryCard
                            title="High Risk"
                            value={dashboardSummary.highRiskCount}
                            icon={<ErrorIcon sx={{ fontSize: 40 }} />}
                            color="error"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <SummaryCard
                            title="Total Amount"
                            value={formatCurrency(dashboardSummary.totalAmount)}
                            icon={<DashboardIcon sx={{ fontSize: 40 }} />}
                            color="success"
                        />
                    </Grid>
                </Grid>
            )}

            {/* Filters and Tabs */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <FilterIcon />
                        <Typography variant="h6">Filters</Typography>
                    </Box>
                    
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Status</InputLabel>
                                <Select
                                    value={filters.status}
                                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                    label="Status"
                                >
                                    <MenuItem value="">All</MenuItem>
                                    <MenuItem value="PENDING">Pending</MenuItem>
                                    <MenuItem value="VERIFIED">Verified</MenuItem>
                                    <MenuItem value="REJECTED">Rejected</MenuItem>
                                    <MenuItem value="SUSPICIOUS">Suspicious</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Risk Level</InputLabel>
                                <Select
                                    value={filters.riskLevel}
                                    onChange={(e) => setFilters({ ...filters, riskLevel: e.target.value })}
                                    label="Risk Level"
                                >
                                    <MenuItem value="">All</MenuItem>
                                    <MenuItem value="LOW_RISK">Low Risk</MenuItem>
                                    <MenuItem value="MEDIUM_RISK">Medium Risk</MenuItem>
                                    <MenuItem value="HIGH_RISK">High Risk</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Event ID"
                                value={filters.eventId}
                                onChange={(e) => setFilters({ ...filters, eventId: e.target.value })}
                                placeholder="Filter by event ID"
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Receipts Table */}
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Receipt Submissions ({receipts.length})
                    </Typography>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : receipts.length === 0 ? (
                        <Alert severity="info">
                            No receipts found matching the current filters.
                        </Alert>
                    ) : (
                        <TableContainer component={Paper}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Submitter</TableCell>
                                        <TableCell>Event</TableCell>
                                        <TableCell>Provider</TableCell>
                                        <TableCell>Amount</TableCell>
                                        <TableCell>Risk Level</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Submitted</TableCell>
                                        <TableCell>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {receipts.map((receipt) => (
                                        <TableRow key={receipt.id}>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {receipt.submittedByName}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {receipt.eventId}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={receipt.provider?.toUpperCase() || 'UNKNOWN'}
                                                    variant="outlined"
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {receipt.extractedData?.amount
                                                        ? formatCurrency(receipt.extractedData.amount)
                                                        : 'N/A'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={receipt.riskAssessment?.riskLevel?.replace('_', ' ') || 'Unknown'}
                                                    color={getRiskLevelColor(receipt.riskAssessment?.riskLevel)}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={receipt.status || 'PENDING'}
                                                    color={getStatusColor(receipt.status)}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="textSecondary">
                                                    {receipt.createdAt
                                                        ? new Date(receipt.createdAt).toLocaleDateString()
                                                        : 'N/A'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    <Tooltip title="View Details">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => openDetails(receipt)}
                                                        >
                                                            {viewMode === 'ai' ? <AiIcon color="primary" /> : <ViewIcon />}
                                                        </IconButton>
                                                    </Tooltip>
                                                    
                                                    {receipt.riskAssessment?.verificationDetails?.duplicateCheck?.hasDuplicates && (
                                                        <Tooltip title="Compare with Similar">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => openCompare(receipt)}
                                                                color="warning"
                                                            >
                                                                <CompareIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}

                                                    {receipt.status === 'PENDING' && (
                                                        <>
                                                            <Tooltip title="Quick Approve">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleVerifyReceipt(receipt.id, 'VERIFIED')}
                                                                    color="success"
                                                                    disabled={processing}
                                                                >
                                                                    <ApproveIcon />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Quick Reject">
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => handleVerifyReceipt(receipt.id, 'REJECTED')}
                                                                    color="error"
                                                                    disabled={processing}
                                                                >
                                                                    <RejectIcon />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </>
                                                    )}
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </CardContent>
            </Card>

            {/* Receipt Details Dialog */}
            <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    Receipt Verification Details
                    {selectedReceipt && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                            <Chip
                                label={selectedReceipt.riskAssessment?.riskLevel?.replace('_', ' ') || 'Unknown Risk'}
                                color={getRiskLevelColor(selectedReceipt.riskAssessment?.riskLevel)}
                                size="small"
                            />
                            {viewMode === 'ai' && (
                                <Chip
                                    label="AI Enhanced"
                                    color="primary"
                                    icon={<AutoAwesomeIcon />}
                                    size="small"
                                />
                            )}
                        </Box>
                    )}
                </DialogTitle>
                <DialogContent>
                    {selectedReceipt && (
                        <>
                            {viewMode === 'ai' && (
                                <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 2 }}>
                                    <Tab label="AI Analysis" icon={<AiIcon />} />
                                    <Tab label="Receipt Details" icon={<ReceiptIcon />} />
                                    <Tab label="Risk Assessment" icon={<WarningIcon />} />
                                </Tabs>
                            )}

                            {viewMode === 'ai' && activeTab === 0 && (
                                <Box>
                                    {analysisLoading ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
                                            <CircularProgress />
                                            <Typography sx={{ ml: 2 }}>AI is analyzing the receipt...</Typography>
                                        </Box>
                                    ) : aiAnalysis ? (
                                        <Box>
                                            {/* AI Summary */}
                                            <Card variant="outlined" sx={{ mb: 3, bgcolor: 'primary.50' }}>
                                                <CardContent>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                                        <AiIcon color="primary" />
                                                        <Typography variant="h6">AI Analysis Summary</Typography>
                                                    </Box>
                                                    <Typography variant="body1" sx={{ mb: 2, fontStyle: 'italic' }}>
                                                        "{aiAnalysis.natural_language_summary}"
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                                        <Chip
                                                            label={`Risk: ${aiAnalysis.risk_level}`}
                                                            color={aiAnalysis.risk_level === 'HIGH' ? 'error' : aiAnalysis.risk_level === 'MEDIUM' ? 'warning' : 'success'}
                                                            icon={<WarningIcon />}
                                                        />
                                                        <Chip
                                                            label={`Confidence: ${aiAnalysis.overall_confidence}%`}
                                                            color="primary"
                                                            icon={<PsychologyIcon />}
                                                        />
                                                    </Box>
                                                </CardContent>
                                            </Card>

                                            {/* AI Recommendation */}
                                            <Card variant="outlined" sx={{ mb: 3, bgcolor: 'warning.50' }}>
                                                <CardContent>
                                                    <Typography variant="h6" gutterBottom>
                                                        🤖 AI Recommendation
                                                    </Typography>
                                                    <Typography variant="body1" sx={{ mb: 1 }}>
                                                        {aiAnalysis.recommendation}
                                                    </Typography>
                                                    <Typography variant="body2" color="textSecondary">
                                                        Confidence: {aiAnalysis.recommendation_confidence}%
                                                    </Typography>
                                                </CardContent>
                                            </Card>

                                            {/* Primary Concerns */}
                                            {aiAnalysis.primary_concerns?.length > 0 && (
                                                <Box sx={{ mb: 3 }}>
                                                    <Typography variant="h6" gutterBottom>
                                                        🚨 Primary Concerns
                                                    </Typography>
                                                    {aiAnalysis.primary_concerns.map((concern, index) => (
                                                        <Alert key={index} severity="warning" sx={{ mb: 1 }}>
                                                            <Typography variant="body2">
                                                                {concern}
                                                            </Typography>
                                                        </Alert>
                                                    ))}
                                                </Box>
                                            )}

                                            {/* Evidence Highlights */}
                                            {aiAnalysis.evidence_highlights?.length > 0 && (
                                                <Box>
                                                    <Typography variant="h6" gutterBottom>
                                                        🔍 Evidence Highlights
                                                    </Typography>
                                                    <List dense>
                                                        {aiAnalysis.evidence_highlights.map((evidence, index) => (
                                                            <ListItem key={index}>
                                                                <ListItemText
                                                                    primary={evidence}
                                                                    primaryTypographyProps={{ variant: 'body2' }}
                                                                />
                                                            </ListItem>
                                                        ))}
                                                    </List>
                                                </Box>
                                            )}
                                        </Box>
                                    ) : (
                                        <Box sx={{ textAlign: 'center', py: 4 }}>
                                            <Button
                                                variant="contained"
                                                startIcon={<AiIcon />}
                                                onClick={() => getAiAnalysis(selectedReceipt.id)}
                                            >
                                                Get AI Analysis
                                            </Button>
                                        </Box>
                                    )}
                                </Box>
                            )}

                            {(viewMode === 'standard' || activeTab === 1) && (
                        <Grid container spacing={3}>
                            {/* Receipt Image */}
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" gutterBottom>
                                    Receipt Image
                                </Typography>
                                {selectedReceipt.imageUrl ? (
                                    <Box
                                        component="img"
                                        src={selectedReceipt.imageUrl}
                                        alt="Receipt"
                                        sx={{
                                            width: '100%',
                                            maxHeight: 400,
                                            objectFit: 'contain',
                                            border: 1,
                                            borderColor: 'grey.300',
                                            borderRadius: 1
                                        }}
                                    />
                                ) : (
                                    <Alert severity="warning">Receipt image not available</Alert>
                                )}
                            </Grid>

                            {/* Receipt Information */}
                            <Grid item xs={12} md={6}>
                                <Typography variant="h6" gutterBottom>
                                    Extracted Information
                                </Typography>
                                <List dense>
                                    <ListItem>
                                        <ListItemText
                                            primary="Provider"
                                            secondary={selectedReceipt.provider?.toUpperCase() || 'Unknown'}
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemText
                                            primary="Amount"
                                            secondary={selectedReceipt.extractedData?.amount
                                                ? formatCurrency(selectedReceipt.extractedData.amount)
                                                : 'Not detected'}
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemText
                                            primary="Ride ID"
                                            secondary={selectedReceipt.extractedData?.rideId || 'Not detected'}
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemText
                                            primary="Date/Time"
                                            secondary={selectedReceipt.extractedData?.timestamp || 'Not detected'}
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemText
                                            primary="Submitted By"
                                            secondary={selectedReceipt.submittedByName}
                                        />
                                    </ListItem>
                                    <ListItem>
                                        <ListItemText
                                            primary="Submission Date"
                                            secondary={selectedReceipt.createdAt
                                                ? new Date(selectedReceipt.createdAt).toLocaleString()
                                                : 'Unknown'}
                                        />
                                    </ListItem>
                                </List>

                                <Divider sx={{ my: 2 }} />

                                <Typography variant="h6" gutterBottom>
                                    Risk Assessment
                                </Typography>
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="body2" gutterBottom>
                                        Risk Score: {selectedReceipt.riskAssessment?.riskScore || 0}/100
                                    </Typography>
                                    <LinearProgress
                                        variant="determinate"
                                        value={selectedReceipt.riskAssessment?.riskScore || 0}
                                        color={getRiskLevelColor(selectedReceipt.riskAssessment?.riskLevel)}
                                    />
                                </Box>

                                {selectedReceipt.riskAssessment?.issues?.length > 0 && (
                                    <Box>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Issues Detected:
                                        </Typography>
                                        <List dense>
                                            {selectedReceipt.riskAssessment.issues.map((issue, index) => (
                                                <ListItem key={index}>
                                                    <ListItemText
                                                        primary={issue}
                                                        primaryTypographyProps={{ variant: 'body2' }}
                                                    />
                                                </ListItem>
                                            ))}
                                        </List>
                                    </Box>
                                )}
                            </Grid>

                            {/* Verification Notes */}
                            {selectedReceipt.status === 'PENDING' && (
                                <Grid item xs={12}>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={3}
                                        label="Verification Notes"
                                        placeholder="Add notes about your verification decision..."
                                        value={verificationNotes}
                                        onChange={(e) => setVerificationNotes(e.target.value)}
                                    />
                                </Grid>
                            )}
                        </Grid>
                            )}

                            {viewMode === 'ai' && activeTab === 2 && (
                                <Box>
                                    <Typography variant="h6" gutterBottom>
                                        Advanced Risk Assessment
                                    </Typography>
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="body2" gutterBottom>
                                            Risk Score: {selectedReceipt.riskAssessment?.riskScore || 0}/100
                                        </Typography>
                                        <LinearProgress
                                            variant="determinate"
                                            value={selectedReceipt.riskAssessment?.riskScore || 0}
                                            color={getRiskLevelColor(selectedReceipt.riskAssessment?.riskLevel)}
                                            sx={{ height: 10, borderRadius: 5 }}
                                        />
                                    </Box>

                                    {selectedReceipt.riskAssessment?.issues?.length > 0 && (
                                        <Box>
                                            <Typography variant="subtitle2" gutterBottom>
                                                Risk Factors Detected:
                                            </Typography>
                                            <List dense>
                                                {selectedReceipt.riskAssessment.issues.map((issue, index) => (
                                                    <ListItem key={index}>
                                                        <ListItemText
                                                            primary={issue}
                                                            primaryTypographyProps={{ variant: 'body2' }}
                                                        />
                                                    </ListItem>
                                                ))}
                                            </List>
                                        </Box>
                                    )}

                                    {aiAnalysis && aiAnalysis.risk_explanation && (
                                        <Box sx={{ mt: 2 }}>
                                            <Typography variant="subtitle2" gutterBottom>
                                                AI Risk Explanation:
                                            </Typography>
                                            <Alert severity="info">
                                                {aiAnalysis.risk_explanation}
                                            </Alert>
                                        </Box>
                                    )}
                                </Box>
                            )}
                        </>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailsOpen(false)}>
                        Close
                    </Button>
                    {viewMode === 'ai' && !aiAnalysis && (
                        <Button
                            onClick={() => getAiAnalysis(selectedReceipt?.id)}
                            disabled={analysisLoading}
                            variant="outlined"
                            startIcon={<AiIcon />}
                        >
                            Get AI Analysis
                        </Button>
                    )}
                    {selectedReceipt?.status === 'PENDING' && (
                        <>
                            <Button
                                color="error"
                                onClick={() => handleVerifyReceipt(selectedReceipt.id, 'REJECTED', verificationNotes)}
                                disabled={processing}
                                startIcon={processing ? <CircularProgress size={20} /> : <RejectIcon />}
                            >
                                {viewMode === 'ai' && aiAnalysis ? 'AI Reject' : 'Reject'}
                            </Button>
                            <Button
                                color="success"
                                variant="contained"
                                onClick={() => handleVerifyReceipt(selectedReceipt.id, 'VERIFIED', verificationNotes)}
                                disabled={processing}
                                startIcon={processing ? <CircularProgress size={20} /> : <ApproveIcon />}
                            >
                                {viewMode === 'ai' && aiAnalysis ? 'AI Approve' : 'Approve'}
                            </Button>
                        </>
                    )}
                </DialogActions>
            </Dialog>

            {/* Comparison Dialog */}
            <Dialog open={compareOpen} onClose={() => setCompareOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>
                    Receipt Comparison
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2}>
                        {compareReceipts.map((receipt, index) => (
                            <Grid item xs={12} md={6} lg={4} key={receipt.id}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="h6" gutterBottom>
                                            Receipt {index + 1}
                                            {index === 0 && (
                                                <Chip label="Current" color="primary" size="small" sx={{ ml: 1 }} />
                                            )}
                                        </Typography>
                                        
                                        {receipt.imageUrl && (
                                            <Box
                                                component="img"
                                                src={receipt.imageUrl}
                                                alt="Receipt"
                                                sx={{
                                                    width: '100%',
                                                    height: 200,
                                                    objectFit: 'contain',
                                                    border: 1,
                                                    borderColor: 'grey.300',
                                                    borderRadius: 1,
                                                    mb: 2
                                                }}
                                            />
                                        )}

                                        <List dense>
                                            <ListItem disablePadding>
                                                <ListItemText
                                                    primary="Submitter"
                                                    secondary={receipt.submittedByName}
                                                />
                                            </ListItem>
                                            <ListItem disablePadding>
                                                <ListItemText
                                                    primary="Amount"
                                                    secondary={receipt.extractedData?.amount
                                                        ? formatCurrency(receipt.extractedData.amount)
                                                        : 'N/A'}
                                                />
                                            </ListItem>
                                            <ListItem disablePadding>
                                                <ListItemText
                                                    primary="Ride ID"
                                                    secondary={receipt.extractedData?.rideId || 'N/A'}
                                                />
                                            </ListItem>
                                            <ListItem disablePadding>
                                                <ListItemText
                                                    primary="Status"
                                                    secondary={
                                                        <Chip
                                                            label={receipt.status || 'PENDING'}
                                                            color={getStatusColor(receipt.status)}
                                                            size="small"
                                                        />
                                                    }
                                                />
                                            </ListItem>
                                        </List>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCompareOpen(false)}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ReceiptVerificationDashboard;
