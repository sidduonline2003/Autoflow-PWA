import React, { useState, useEffect } from 'react';
import {
    Box,
    Stack,
    Grid,
    Typography,
    Card,
    CardContent,
    CardHeader,
    Button,
    Chip,
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
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    ListItemSecondaryAction,
    Divider,
    LinearProgress,
    IconButton,
    Tooltip,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow
} from '@mui/material';
import {
    Lock as LockIcon,
    LockOpen as LockOpenIcon,
    Warning as WarningIcon,
    Check as CheckIcon,
    Error as ErrorIcon,
    History as HistoryIcon,
    Edit as EditIcon,
    Close as CloseIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import SectionCard from '../common/SectionCard';

const PeriodClosePage = () => {
    const { user, claims } = useAuth();
    const [loading, setLoading] = useState(true);
    const [periods, setPeriods] = useState([]);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [closeDialog, setCloseDialog] = useState({ open: false, period: null, checks: [] });
    const [reopenDialog, setReopenDialog] = useState({ open: false, period: null });
    const [adjustmentsDialog, setAdjustmentsDialog] = useState({ open: false, period: null, adjustments: [] });
    const [checksLoading, setChecksLoading] = useState(false);
    const [reopenReason, setReopenReason] = useState('');
    const [closeNotes, setCloseNotes] = useState('');
    const [checklistAck, setChecklistAck] = useState(false);

    // Check authorization
    const isAuthorized = claims?.role === 'admin' || claims?.role === 'accountant';

    const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const callApi = async (endpoint, method = 'GET', body = null) => {
        if (!user) {
            console.error('No user found for API call');
            throw new Error('Not authenticated');
        }
        
        try {
            // Force token refresh to prevent expiration issues
            const idToken = await user.getIdToken(true);
            console.log(`Making API call to: ${endpoint}`);
            
            const response = await fetch(`/api${endpoint}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                ...(body && { body: JSON.stringify(body) })
            });
            
            console.log(`API response status: ${response.status}`);
            
            if (!response.ok) {
                // If 401, try one more time with fresh token
                if (response.status === 401) {
                    console.warn('401 Unauthorized, retrying with fresh token...');
                    const freshToken = await user.getIdToken(true);
                    
                    const retryResponse = await fetch(`/api${endpoint}`, {
                        method,
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${freshToken}`
                        },
                        ...(body && { body: JSON.stringify(body) })
                    });
                    
                    if (retryResponse.ok) {
                        return retryResponse.json();
                    }
                }
                
                const errorData = await response.text();
                console.error(`API Error ${response.status}:`, errorData);
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
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    };

    const loadPeriods = async () => {
        try {
            setLoading(true);
            const data = await callApi(`/financial-hub/periods/?year=${selectedYear}`);
            setPeriods(data.periods || []);
        } catch (error) {
            console.error('Error loading periods:', error);
            toast.error('Failed to load periods: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const runPreCloseChecks = async (year, month) => {
        try {
            setChecksLoading(true);
            const data = await callApi(`/financial-hub/periods/${year}-${month.toString().padStart(2, '0')}/checks`);
            return data;
        } catch (error) {
            console.error('Error running checks:', error);
            toast.error('Failed to run pre-close checks: ' + error.message);
            return null;
        } finally {
            setChecksLoading(false);
        }
    };

    const handleOpenCloseDialog = async (year, month) => {
        const checksResult = await runPreCloseChecks(year, month);
        if (checksResult) {
            setCloseDialog({
                open: true,
                period: { year, month, label: checksResult.label },
                checks: checksResult.checks,
                canClose: checksResult.canClose
            });
            setCloseNotes('');
            setChecklistAck(false);
        }
    };

    const handleClosePeriod = async () => {
        try {
            const { period } = closeDialog;
            const payload = {
                year: period.year,
                month: period.month,
                checklistAck,
                notes: closeNotes || null
            };

            await callApi('/financial-hub/periods/close', 'POST', payload);
            toast.success(`Period ${period.label} closed successfully`);
            setCloseDialog({ open: false, period: null, checks: [] });
            
            // Add small delay before reloading to ensure backend state is consistent
            setTimeout(() => {
                loadPeriods();
            }, 1000);
        } catch (error) {
            console.error('Error closing period:', error);
            toast.error('Failed to close period: ' + error.message);
        }
    };

    const handleReopenPeriod = async () => {
        try {
            const { period } = reopenDialog;
            const payload = {
                year: period.year,
                month: period.month,
                reason: reopenReason
            };

            await callApi('/financial-hub/periods/reopen', 'POST', payload);
            toast.success(`Period ${period.label} reopened successfully`);
            setReopenDialog({ open: false, period: null });
            setReopenReason('');
            
            // Add small delay before reloading
            setTimeout(() => {
                loadPeriods();
            }, 1000);
        } catch (error) {
            console.error('Error reopening period:', error);
            toast.error('Failed to reopen period: ' + error.message);
        }
    };

    const loadAdjustments = async (year, month) => {
        try {
            const data = await callApi(`/financial-hub/periods/${year}-${month.toString().padStart(2, '0')}`);
            setAdjustmentsDialog({
                open: true,
                period: { year, month, label: `${months[month-1]} ${year}` },
                adjustments: data.adjustments || []
            });
        } catch (error) {
            console.error('Error loading adjustments:', error);
            toast.error('Failed to load adjustments: ' + error.message);
        }
    };

    useEffect(() => {
        if (user && claims && isAuthorized) {
            loadPeriods();
        }
    }, [user, claims, selectedYear, isAuthorized]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('en-IN');
    };

    const getCheckIcon = (check) => {
        if (check.passed) {
            return <CheckIcon color="success" />;
        } else if (check.key === 'sequence_gaps') {
            return <WarningIcon color="warning" />;
        } else {
            return <ErrorIcon color="error" />;
        }
    };

    const getPeriodStatus = (year, month) => {
        const period = periods.find(p => p.year === year && p.month === month);
        return period ? period.status : 'OPEN';
    };

    const getPeriodDetails = (year, month) => {
        return periods.find(p => p.year === year && p.month === month);
    };

    if (!isAuthorized) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error">
                    You don't have permission to access Period Close & Controls. 
                    Admin or Accountant role required.
                </Alert>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography variant="h4" gutterBottom>Period Close & Controls</Typography>
                <LinearProgress />
                <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                    Loading period data...
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1">
                    Period Close & Controls
                </Typography>
                
                <Stack direction="row" spacing={2} alignItems="center">
                    <FormControl size="small" sx={{ minWidth: 120 }}>
                        <InputLabel>Year</InputLabel>
                        <Select
                            value={selectedYear}
                            label="Year"
                            onChange={(e) => setSelectedYear(e.target.value)}
                        >
                            {[2023, 2024, 2025, 2026].map(year => (
                                <MenuItem key={year} value={year}>{year}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadPeriods}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </Stack>
            </Box>

            {/* Period Grid */}
            <Grid container spacing={2}>
                {months.map((month, index) => {
                    const monthNumber = index + 1;
                    const status = getPeriodStatus(selectedYear, monthNumber);
                    const periodDetails = getPeriodDetails(selectedYear, monthNumber);
                    const isCurrentMonth = selectedYear === new Date().getFullYear() && monthNumber === new Date().getMonth() + 1;
                    
                    return (
                        <Grid item xs={12} sm={6} md={4} lg={3} key={month}>
                            <Card 
                                sx={{ 
                                    height: '100%',
                                    border: isCurrentMonth ? '2px solid' : '1px solid',
                                    borderColor: isCurrentMonth ? 'primary.main' : 'divider',
                                    position: 'relative'
                                }}
                            >
                                <CardHeader
                                    title={`${month} ${selectedYear}`}
                                    titleTypographyProps={{ variant: 'h6' }}
                                    action={
                                        <Chip
                                            label={status}
                                            color={status === 'CLOSED' ? 'error' : 'success'}
                                            size="small"
                                            icon={status === 'CLOSED' ? <LockIcon /> : <LockOpenIcon />}
                                        />
                                    }
                                    sx={{ pb: 1 }}
                                />
                                
                                <CardContent sx={{ pt: 0 }}>
                                    <Stack spacing={2}>
                                        {periodDetails && periodDetails.closedBy && (
                                            <Box>
                                                <Typography variant="caption" color="textSecondary">
                                                    Closed by: {periodDetails.closedBy}
                                                </Typography>
                                                <br />
                                                <Typography variant="caption" color="textSecondary">
                                                    {formatDate(periodDetails.closedAt)}
                                                </Typography>
                                            </Box>
                                        )}
                                        
                                        {periodDetails && periodDetails.reopenedBy && (
                                            <Box>
                                                <Typography variant="caption" color="warning.main">
                                                    Reopened by: {periodDetails.reopenedBy}
                                                </Typography>
                                                <br />
                                                <Typography variant="caption" color="textSecondary">
                                                    {formatDate(periodDetails.reopenedAt)}
                                                </Typography>
                                            </Box>
                                        )}
                                        
                                        <Stack direction="row" spacing={1}>
                                            {status === 'OPEN' ? (
                                                <Button
                                                    variant="contained"
                                                    color="warning"
                                                    size="small"
                                                    startIcon={<LockIcon />}
                                                    onClick={() => handleOpenCloseDialog(selectedYear, monthNumber)}
                                                    fullWidth
                                                >
                                                    Close Period
                                                </Button>
                                            ) : (
                                                <>
                                                    <Button
                                                        variant="outlined"
                                                        color="primary"
                                                        size="small"
                                                        startIcon={<EditIcon />}
                                                        onClick={() => loadAdjustments(selectedYear, monthNumber)}
                                                        sx={{ flex: 1 }}
                                                    >
                                                        Adjustments
                                                    </Button>
                                                    
                                                    {user?.role === 'ADMIN' && (
                                                        <Tooltip title="Reopen (ADMIN only)">
                                                            <IconButton
                                                                color="warning"
                                                                size="small"
                                                                onClick={() => setReopenDialog({
                                                                    open: true,
                                                                    period: { year: selectedYear, month: monthNumber, label: `${month} ${selectedYear}` }
                                                                })}
                                                            >
                                                                <LockOpenIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </>
                                            )}
                                        </Stack>
                                    </Stack>
                                </CardContent>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>

            {/* Close Period Dialog */}
            <Dialog open={closeDialog.open} onClose={() => setCloseDialog({ open: false, period: null, checks: [] })} maxWidth="md" fullWidth>
                <DialogTitle>
                    Close Period: {closeDialog.period?.label}
                </DialogTitle>
                
                <DialogContent>
                    <Stack spacing={3}>
                        <Alert severity="warning">
                            Closing this period will prevent any new transactions or modifications to existing data for this month.
                            Only journal adjustments will be allowed.
                        </Alert>
                        
                        {checksLoading ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <LinearProgress sx={{ flex: 1 }} />
                                <Typography variant="body2">Running pre-close checks...</Typography>
                            </Box>
                        ) : (
                            <SectionCard title="Pre-Close Checklist" sx={{ mt: 2 }}>
                                <List dense>
                                    {closeDialog.checks.map((check, index) => (
                                        <React.Fragment key={check.key}>
                                            <ListItem>
                                                <ListItemIcon>
                                                    {getCheckIcon(check)}
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={check.details}
                                                    secondary={check.count !== undefined ? `Count: ${check.count}` : null}
                                                />
                                            </ListItem>
                                            {index < closeDialog.checks.length - 1 && <Divider />}
                                        </React.Fragment>
                                    ))}
                                </List>
                                
                                {!closeDialog.canClose && (
                                    <Alert severity="error" sx={{ mt: 2 }}>
                                        Some checks failed. You can still close the period by acknowledging these issues below.
                                    </Alert>
                                )}
                            </SectionCard>
                        )}
                        
                        <TextField
                            label="Notes (Optional)"
                            multiline
                            rows={3}
                            value={closeNotes}
                            onChange={(e) => setCloseNotes(e.target.value)}
                            placeholder="Add any notes about this period close..."
                            fullWidth
                        />
                        
                        {!closeDialog.canClose && (
                            <Alert severity="warning">
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <input
                                        type="checkbox"
                                        checked={checklistAck}
                                        onChange={(e) => setChecklistAck(e.target.checked)}
                                        id="checklist-ack"
                                    />
                                    <label htmlFor="checklist-ack">
                                        I acknowledge the failed checks and want to proceed with closing this period
                                    </label>
                                </Box>
                            </Alert>
                        )}
                    </Stack>
                </DialogContent>
                
                <DialogActions>
                    <Button onClick={() => setCloseDialog({ open: false, period: null, checks: [] })}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        color="warning"
                        onClick={handleClosePeriod}
                        disabled={!closeDialog.canClose && !checklistAck}
                        startIcon={<LockIcon />}
                    >
                        Close Period
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Reopen Period Dialog */}
            <Dialog open={reopenDialog.open} onClose={() => setReopenDialog({ open: false, period: null })} maxWidth="sm" fullWidth>
                <DialogTitle>
                    Reopen Period: {reopenDialog.period?.label}
                </DialogTitle>
                
                <DialogContent>
                    <Stack spacing={3}>
                        <Alert severity="warning">
                            Reopening this period will allow modifications to transactions dated in this month.
                            This action will be audited.
                        </Alert>
                        
                        <TextField
                            label="Reason for Reopening"
                            multiline
                            rows={3}
                            value={reopenReason}
                            onChange={(e) => setReopenReason(e.target.value)}
                            placeholder="Provide a detailed reason for reopening this period..."
                            required
                            fullWidth
                            helperText="Minimum 10 characters required"
                        />
                    </Stack>
                </DialogContent>
                
                <DialogActions>
                    <Button onClick={() => setReopenDialog({ open: false, period: null })}>
                        Cancel
                    </Button>
                    <Button
                        variant="contained"
                        color="warning"
                        onClick={handleReopenPeriod}
                        disabled={reopenReason.length < 10}
                        startIcon={<LockOpenIcon />}
                    >
                        Reopen Period
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Adjustments Dialog */}
            <Dialog open={adjustmentsDialog.open} onClose={() => setAdjustmentsDialog({ open: false, period: null, adjustments: [] })} maxWidth="md" fullWidth>
                <DialogTitle>
                    Journal Adjustments: {adjustmentsDialog.period?.label}
                    <IconButton
                        onClick={() => setAdjustmentsDialog({ open: false, period: null, adjustments: [] })}
                        sx={{ position: 'absolute', right: 8, top: 8 }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                
                <DialogContent>
                    <Stack spacing={3}>
                        <Button
                            variant="contained"
                            onClick={() => {
                                // Navigate to create adjustment
                                // This would be implemented based on your routing
                                console.log('Navigate to create adjustment for period:', adjustmentsDialog.period);
                            }}
                        >
                            Create New Adjustment
                        </Button>
                        
                        {adjustmentsDialog.adjustments.length === 0 ? (
                            <Alert severity="info">
                                No adjustments found for this period.
                            </Alert>
                        ) : (
                            <TableContainer component={Paper}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Created</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell align="right">Total</TableCell>
                                            <TableCell>Published</TableCell>
                                            <TableCell>Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {adjustmentsDialog.adjustments.map((adjustment) => (
                                            <TableRow key={adjustment.id}>
                                                <TableCell>{formatDate(adjustment.createdAt)}</TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={adjustment.status} 
                                                        size="small"
                                                        color={adjustment.status === 'PUBLISHED' ? 'success' : 'default'}
                                                    />
                                                </TableCell>
                                                <TableCell align="right">{formatCurrency(adjustment.total)}</TableCell>
                                                <TableCell>{formatDate(adjustment.publishedAt)}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        size="small"
                                                        onClick={() => {
                                                            // Navigate to view/edit adjustment
                                                            console.log('View adjustment:', adjustment.id);
                                                        }}
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
                    </Stack>
                </DialogContent>
            </Dialog>
        </Box>
    );
};

export default PeriodClosePage;
