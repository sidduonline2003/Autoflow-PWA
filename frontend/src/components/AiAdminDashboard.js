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
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Avatar,
    Stack,
    ButtonGroup
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
    Speed as SpeedIcon,
    Security as SecurityIcon,
    TrendingUp as TrendingUpIcon,
    ExpandMore as ExpandMoreIcon,
    AutoAwesome as AutoAwesomeIcon,
    Lightbulb as LightbulbIcon,
    Assignment as AssignmentIcon,
    Timeline as TimelineIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import toast from 'react-hot-toast';

const AiAdminDashboard = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [receipts, setReceipts] = useState([]);
    const [aiQueue, setAiQueue] = useState([]);
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [aiAnalysis, setAiAnalysis] = useState(null);
    const [organizationalInsights, setOrganizationalInsights] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [insightsOpen, setInsightsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const [filters, setFilters] = useState({
        priority: '',
        riskLevel: '',
        status: ''
    });
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [decisionLoading, setDecisionLoading] = useState(false);

    // Fetch AI priority queue
    const fetchAiQueue = async () => {
        setLoading(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const queryParams = new URLSearchParams();
            
            if (filters.priority) queryParams.append('priority', filters.priority);
            queryParams.append('limit', '50');
            
            const response = await fetch(`/api/receipts/admin/ai-queue?${queryParams.toString()}`, {
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setAiQueue(data.prioritized_queue || []);
            } else {
                throw new Error('Failed to fetch AI queue');
            }
        } catch (error) {
            console.error('Error fetching AI queue:', error);
            toast.error('Failed to fetch AI priority queue');
        } finally {
            setLoading(false);
        }
    };

    // Fetch organizational insights
    const fetchOrganizationalInsights = async (timeframe = '30d') => {
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/receipts/admin/ai-insights?timeframe=${timeframe}`, {
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setOrganizationalInsights(data);
            }
        } catch (error) {
            console.error('Error fetching organizational insights:', error);
            toast.error('Failed to fetch organizational insights');
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

    // Make AI-assisted decision
    const makeAiAssistedDecision = async (receiptId, decision, notes = '') => {
        setDecisionLoading(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/receipts/admin/ai-assisted-decision/${receiptId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    decision,
                    admin_notes: notes,
                    consider_ai_recommendation: true
                })
            });

            if (response.ok) {
                const result = await response.json();
                toast.success(`Receipt ${decision.toLowerCase()} with AI assistance`);
                fetchAiQueue(); // Refresh queue
                setDetailsOpen(false);
                return result;
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Decision failed');
            }
        } catch (error) {
            console.error('AI-assisted decision error:', error);
            toast.error(error.message);
        } finally {
            setDecisionLoading(false);
        }
    };

    useEffect(() => {
        fetchAiQueue();
        fetchOrganizationalInsights();
    }, [filters]);

    const openReceiptDetails = async (receipt) => {
        setSelectedReceipt(receipt);
        setDetailsOpen(true);
        
        // Get AI analysis for this receipt
        await getAiAnalysis(receipt.id);
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'critical': return 'error';
            case 'high': return 'warning';
            case 'medium': return 'info';
            case 'low': return 'success';
            default: return 'default';
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount || 0);
    };

    const SummaryCard = ({ title, value, icon, color = 'primary', subtitle = '' }) => (
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
                        {subtitle && (
                            <Typography variant="body2" color="textSecondary">
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{ color: `${color}.main` }}>
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );

    const AiInsightCard = ({ insight, onAction }) => (
        <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                    <Avatar sx={{ bgcolor: 'primary.main' }}>
                        <AiIcon />
                    </Avatar>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="h6" gutterBottom>
                            {insight.title}
                        </Typography>
                        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                            {insight.description}
                        </Typography>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Chip
                                label={`${Math.round(insight.confidence)}% Confidence`}
                                size="small"
                                color="primary"
                                variant="outlined"
                            />
                            <Chip
                                label={insight.severity?.toUpperCase()}
                                size="small"
                                color={getPriorityColor(insight.severity)}
                            />
                        </Box>
                        
                        {insight.suggested_action && (
                            <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                💡 {insight.suggested_action}
                            </Typography>
                        )}
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

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
                <CircularProgress />
                <Typography sx={{ ml: 2 }}>Loading AI Dashboard...</Typography>
            </Box>
        );
    }

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <AiIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                    <Typography variant="h5">
                        AI-Enhanced Admin Dashboard
                    </Typography>
                    <Chip 
                        label="AI Powered" 
                        color="primary" 
                        icon={<AutoAwesomeIcon />} 
                        variant="outlined"
                    />
                </Box>
                <ButtonGroup>
                    <Button
                        startIcon={<RefreshIcon />}
                        onClick={() => {
                            fetchAiQueue();
                            fetchOrganizationalInsights();
                        }}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                    <Button
                        startIcon={<TimelineIcon />}
                        onClick={() => setInsightsOpen(true)}
                        variant="contained"
                    >
                        View Insights
                    </Button>
                </ButtonGroup>
            </Box>

            {/* AI Summary Cards */}
            {organizationalInsights && (
                <Grid container spacing={3} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6} md={3}>
                        <SummaryCard
                            title="AI Priority Queue"
                            value={aiQueue.length}
                            subtitle="Items requiring attention"
                            icon={<SpeedIcon sx={{ fontSize: 40 }} />}
                            color="primary"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <SummaryCard
                            title="High Risk Items"
                            value={organizationalInsights.key_metrics?.high_risk_count || 0}
                            subtitle="Requires immediate review"
                            icon={<SecurityIcon sx={{ fontSize: 40 }} />}
                            color="error"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <SummaryCard
                            title="AI Confidence"
                            value="85%"
                            subtitle="Average analysis confidence"
                            icon={<PsychologyIcon sx={{ fontSize: 40 }} />}
                            color="success"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <SummaryCard
                            title="Total Value"
                            value={formatCurrency(organizationalInsights.key_metrics?.total_amount || 0)}
                            subtitle="Under AI analysis"
                            icon={<TrendingUpIcon sx={{ fontSize: 40 }} />}
                            color="info"
                        />
                    </Grid>
                </Grid>
            )}

            {/* Filters */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <FilterIcon />
                        <Typography variant="h6">AI Priority Filters</Typography>
                    </Box>
                    
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Priority Level</InputLabel>
                                <Select
                                    value={filters.priority}
                                    onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                                    label="Priority Level"
                                >
                                    <MenuItem value="">All Priorities</MenuItem>
                                    <MenuItem value="critical">Critical</MenuItem>
                                    <MenuItem value="high">High</MenuItem>
                                    <MenuItem value="medium">Medium</MenuItem>
                                    <MenuItem value="low">Low</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Status</InputLabel>
                                <Select
                                    value={filters.status}
                                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                                    label="Status"
                                >
                                    <MenuItem value="">All Status</MenuItem>
                                    <MenuItem value="PENDING">Pending</MenuItem>
                                    <MenuItem value="VERIFIED">Verified</MenuItem>
                                    <MenuItem value="REJECTED">Rejected</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Search"
                                placeholder="Search by submitter or details..."
                                // Add search functionality here
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* AI Priority Queue */}
            <Card>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <AiIcon color="primary" />
                        <Typography variant="h6">
                            AI-Prioritized Receipt Queue ({aiQueue.length})
                        </Typography>
                    </Box>

                    {aiQueue.length === 0 ? (
                        <Alert severity="info" icon={<AiIcon />}>
                            No receipts in AI priority queue. All items may be processed or no high-priority items detected.
                        </Alert>
                    ) : (
                        <TableContainer component={Paper}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>AI Priority</TableCell>
                                        <TableCell>Submitter</TableCell>
                                        <TableCell>Amount</TableCell>
                                        <TableCell>Risk Score</TableCell>
                                        <TableCell>AI Reason</TableCell>
                                        <TableCell>Confidence</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {aiQueue.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <Chip
                                                    label={item.priority?.toUpperCase()}
                                                    color={getPriorityColor(item.priority)}
                                                    icon={<SpeedIcon />}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {item.submittedByName}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="medium">
                                                    {formatCurrency(item.amount)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <LinearProgress
                                                        variant="determinate"
                                                        value={item.risk_score}
                                                        sx={{ width: 60, height: 8 }}
                                                        color={item.risk_score >= 70 ? 'error' : item.risk_score >= 40 ? 'warning' : 'success'}
                                                    />
                                                    <Typography variant="caption">
                                                        {item.risk_score}/100
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="textSecondary">
                                                    {item.priority_reason}
                                                </Typography>
                                                {item.risk_factors?.length > 0 && (
                                                    <Box sx={{ mt: 0.5 }}>
                                                        {item.risk_factors.slice(0, 2).map((factor, index) => (
                                                            <Chip
                                                                key={index}
                                                                label={factor}
                                                                size="small"
                                                                variant="outlined"
                                                                sx={{ mr: 0.5, mb: 0.5 }}
                                                            />
                                                        ))}
                                                    </Box>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <AiIcon fontSize="small" color="primary" />
                                                    <Typography variant="body2">
                                                        {item.ai_confidence}%
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={item.status || 'PENDING'}
                                                    color={item.status === 'VERIFIED' ? 'success' : item.status === 'REJECTED' ? 'error' : 'warning'}
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    startIcon={<AiIcon />}
                                                    onClick={() => openReceiptDetails(item)}
                                                    size="small"
                                                    variant="contained"
                                                >
                                                    AI Analysis
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </CardContent>
            </Card>

            {/* AI Analysis Dialog */}
            <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <AiIcon color="primary" />
                        AI-Enhanced Receipt Analysis
                        {selectedReceipt && (
                            <Chip
                                label={`Priority: ${selectedReceipt.priority?.toUpperCase()}`}
                                color={getPriorityColor(selectedReceipt.priority)}
                                size="small"
                            />
                        )}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedReceipt && (
                        <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)}>
                            <Tab label="AI Analysis" />
                            <Tab label="Receipt Details" />
                            <Tab label="Risk Assessment" />
                        </Tabs>
                    )}

                    <TabPanel value={activeTab} index={0}>
                        {analysisLoading ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
                                <CircularProgress />
                                <Typography sx={{ ml: 2 }}>AI is analyzing the receipt...</Typography>
                            </Box>
                        ) : aiAnalysis ? (
                            <Box sx={{ mt: 2 }}>
                                {/* AI Summary */}
                                <Card variant="outlined" sx={{ mb: 3, bgcolor: 'primary.50' }}>
                                    <CardContent>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                            <AiIcon color="primary" />
                                            <Typography variant="h6">AI Natural Language Summary</Typography>
                                        </Box>
                                        <Typography variant="body1" sx={{ mb: 2, fontStyle: 'italic' }}>
                                            "{aiAnalysis.natural_language_summary}"
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <Chip
                                                label={`Risk: ${aiAnalysis.risk_level}`}
                                                color={aiAnalysis.risk_level === 'HIGH' ? 'error' : aiAnalysis.risk_level === 'MEDIUM' ? 'warning' : 'success'}
                                                icon={<SecurityIcon />}
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
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                            <LightbulbIcon color="warning" />
                                            <Typography variant="h6">AI Recommendation</Typography>
                                        </Box>
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
                                            <AiInsightCard key={index} insight={concern} />
                                        ))}
                                    </Box>
                                )}

                                {/* Contextual Insights */}
                                {aiAnalysis.contextual_insights?.length > 0 && (
                                    <Box sx={{ mb: 3 }}>
                                        <Typography variant="h6" gutterBottom>
                                            💡 Contextual Insights
                                        </Typography>
                                        {aiAnalysis.contextual_insights.map((insight, index) => (
                                            <AiInsightCard key={index} insight={insight} />
                                        ))}
                                    </Box>
                                )}

                                {/* Evidence Highlights */}
                                {aiAnalysis.evidence_highlights?.length > 0 && (
                                    <Accordion>
                                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                            <Typography variant="h6">🔍 Evidence Highlights</Typography>
                                        </AccordionSummary>
                                        <AccordionDetails>
                                            <List>
                                                {aiAnalysis.evidence_highlights.map((evidence, index) => (
                                                    <ListItem key={index}>
                                                        <ListItemText
                                                            primary={evidence}
                                                            primaryTypographyProps={{ variant: 'body2' }}
                                                        />
                                                    </ListItem>
                                                ))}
                                            </List>
                                        </AccordionDetails>
                                    </Accordion>
                                )}
                            </Box>
                        ) : (
                            <Alert severity="info">
                                Click "Get AI Analysis" to analyze this receipt with AI.
                            </Alert>
                        )}
                    </TabPanel>

                    <TabPanel value={activeTab} index={1}>
                        {selectedReceipt && (
                            <Grid container spacing={3}>
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

                                <Grid item xs={12} md={6}>
                                    <Typography variant="h6" gutterBottom>
                                        Extracted Information
                                    </Typography>
                                    <List dense>
                                        <ListItem>
                                            <ListItemText
                                                primary="Submitter"
                                                secondary={selectedReceipt.submittedByName}
                                            />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText
                                                primary="Amount"
                                                secondary={formatCurrency(selectedReceipt.amount)}
                                            />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText
                                                primary="Risk Score"
                                                secondary={`${selectedReceipt.risk_score}/100`}
                                            />
                                        </ListItem>
                                        <ListItem>
                                            <ListItemText
                                                primary="AI Priority"
                                                secondary={selectedReceipt.priority?.toUpperCase()}
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
                                </Grid>
                            </Grid>
                        )}
                    </TabPanel>

                    <TabPanel value={activeTab} index={2}>
                        {selectedReceipt && (
                            <Box>
                                <Typography variant="h6" gutterBottom>
                                    Risk Assessment Details
                                </Typography>
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="body2" gutterBottom>
                                        Overall Risk Score: {selectedReceipt.risk_score}/100
                                    </Typography>
                                    <LinearProgress
                                        variant="determinate"
                                        value={selectedReceipt.risk_score}
                                        color={selectedReceipt.risk_score >= 70 ? 'error' : selectedReceipt.risk_score >= 40 ? 'warning' : 'success'}
                                        sx={{ height: 10, borderRadius: 5 }}
                                    />
                                </Box>

                                {selectedReceipt.risk_factors?.length > 0 && (
                                    <Box>
                                        <Typography variant="subtitle2" gutterBottom>
                                            Risk Factors Detected:
                                        </Typography>
                                        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                                            {selectedReceipt.risk_factors.map((factor, index) => (
                                                <Chip
                                                    key={index}
                                                    label={factor}
                                                    color="warning"
                                                    variant="outlined"
                                                    size="small"
                                                />
                                            ))}
                                        </Stack>
                                    </Box>
                                )}
                            </Box>
                        )}
                    </TabPanel>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailsOpen(false)}>
                        Close
                    </Button>
                    {!aiAnalysis && (
                        <Button
                            onClick={() => getAiAnalysis(selectedReceipt?.id)}
                            disabled={analysisLoading}
                            variant="outlined"
                            startIcon={<AiIcon />}
                        >
                            Get AI Analysis
                        </Button>
                    )}
                    {selectedReceipt?.status === 'PENDING' && aiAnalysis && (
                        <>
                            <Button
                                color="error"
                                onClick={() => makeAiAssistedDecision(selectedReceipt.id, 'REJECTED')}
                                disabled={decisionLoading}
                                startIcon={<RejectIcon />}
                            >
                                AI Reject
                            </Button>
                            <Button
                                color="success"
                                variant="contained"
                                onClick={() => makeAiAssistedDecision(selectedReceipt.id, 'VERIFIED')}
                                disabled={decisionLoading}
                                startIcon={<ApproveIcon />}
                            >
                                AI Approve
                            </Button>
                        </>
                    )}
                </DialogActions>
            </Dialog>

            {/* Organizational Insights Dialog */}
            <Dialog open={insightsOpen} onClose={() => setInsightsOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <TimelineIcon color="primary" />
                        Organizational AI Insights
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {organizationalInsights ? (
                        <Box>
                            <Card variant="outlined" sx={{ mb: 3, bgcolor: 'info.50' }}>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>
                                        📊 Executive Summary
                                    </Typography>
                                    <Typography variant="body1">
                                        {organizationalInsights.executive_summary}
                                    </Typography>
                                </CardContent>
                            </Card>

                            {organizationalInsights.spending_patterns?.length > 0 && (
                                <Box sx={{ mb: 3 }}>
                                    <Typography variant="h6" gutterBottom>
                                        💰 Spending Patterns
                                    </Typography>
                                    {organizationalInsights.spending_patterns.map((pattern, index) => (
                                        <Card key={index} variant="outlined" sx={{ mb: 1 }}>
                                            <CardContent sx={{ py: 1 }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Typography variant="body2">
                                                        {pattern.category}
                                                    </Typography>
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {formatCurrency(pattern.amount)} ({pattern.percentage?.toFixed(1)}%)
                                                    </Typography>
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </Box>
                            )}

                            {organizationalInsights.recommendations?.length > 0 && (
                                <Box>
                                    <Typography variant="h6" gutterBottom>
                                        🎯 AI Recommendations
                                    </Typography>
                                    {organizationalInsights.recommendations.map((rec, index) => (
                                        <Card key={index} variant="outlined" sx={{ mb: 2 }}>
                                            <CardContent>
                                                <Typography variant="subtitle1" gutterBottom>
                                                    {rec.title}
                                                </Typography>
                                                <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
                                                    {rec.description}
                                                </Typography>
                                                <Box sx={{ display: 'flex', gap: 1 }}>
                                                    <Chip
                                                        label={rec.priority?.toUpperCase()}
                                                        color={getPriorityColor(rec.priority)}
                                                        size="small"
                                                    />
                                                    <Chip
                                                        label={rec.expected_impact}
                                                        variant="outlined"
                                                        size="small"
                                                    />
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </Box>
                            )}
                        </Box>
                    ) : (
                        <Alert severity="info">
                            Loading organizational insights...
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setInsightsOpen(false)}>
                        Close
                    </Button>
                    <Button
                        onClick={() => fetchOrganizationalInsights('7d')}
                        variant="outlined"
                    >
                        7 Days
                    </Button>
                    <Button
                        onClick={() => fetchOrganizationalInsights('30d')}
                        variant="outlined"
                    >
                        30 Days
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AiAdminDashboard;
