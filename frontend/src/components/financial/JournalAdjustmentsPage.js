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
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Tooltip,
    Divider,
    LinearProgress,
    Autocomplete
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Publish as PublishIcon,
    Visibility as ViewIcon,
    Cancel as CancelIcon,
    Save as SaveIcon,
    Close as CloseIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import SectionCard from '../common/SectionCard';

const JournalAdjustmentsPage = ({ initialAdjustmentId = null }) => {
    const { user, claims } = useAuth();
    const [loading, setLoading] = useState(true);
    const [adjustments, setAdjustments] = useState([]);
    const [selectedPeriod, setSelectedPeriod] = useState(null);
    const [closedPeriods, setClosedPeriods] = useState([]);
    const [adjustmentDialog, setAdjustmentDialog] = useState({ open: false, adjustment: null, mode: 'view' });
    const [previewData, setPreviewData] = useState(null);
    const [clients, setClients] = useState([]);
    const [vendors, setVendors] = useState([]); // Fixed typo in state declaration
    const [events, setEvents] = useState([]);

    const bucketOptions = [
        { value: 'Revenue', label: 'Revenue', description: 'Client payments and income' },
        { value: 'DirectCost', label: 'Direct Cost', description: 'Project-specific costs' },
        { value: 'Opex', label: 'Operating Expenses', description: 'General business expenses' },
        { value: 'TaxCollected', label: 'Tax Collected', description: 'GST/Tax collected from clients' },
        { value: 'TaxPaid', label: 'Tax Paid', description: 'GST/Tax paid to vendors' }
    ];

    // Check authorization
    const isAuthorized = claims?.role === 'admin' || claims?.role === 'accountant';

    const [formData, setFormData] = useState({
        period: null,
        lines: [
            {
                bucket: '',
                amount: 0,
                currency: 'INR',
                clientId: '',
                eventId: '',
                vendorId: '',
                memo: ''
            }
        ],
        total: 0
    });

    const callApi = async (endpoint, method = 'GET', body = null) => {
        if (!user) throw new Error('Not authenticated');

        const idToken = await user.getIdToken(); // Use cached token
        const response = await fetch(`/api${endpoint}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            ...(body && { body: JSON.stringify(body) })
        });

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

    const loadClosedPeriods = async () => {
        try {
            const currentYear = new Date().getFullYear();
            // ✅ collection endpoint with trailing slash
            const data = await callApi(`/financial-hub/periods/?year=${currentYear}`);
            const closed = data.periods?.filter(p => p.status === 'CLOSED') || [];
            setClosedPeriods(closed);

            if (closed.length > 0 && !selectedPeriod) {
                setSelectedPeriod(closed[0]);
            }
        } catch (error) {
            console.error('Error loading closed periods:', error);
            toast.error('Failed to load closed periods: ' + error.message);
        }
    };

    const loadAdjustments = async () => {
        if (!selectedPeriod) return;

        try {
            setLoading(true);
            // ✅ remove double /api, add trailing slash on collection
            const data = await callApi(`/financial-hub/adjustments/?year=${selectedPeriod.year}&month=${selectedPeriod.month}`);
            setAdjustments(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error loading adjustments:', error);
            toast.error('Failed to load adjustments: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const loadReferenceData = async () => {
        try {
            console.log('Fetching reference data from endpoints: /clients/, /ap/vendors, /events/');

            const [clientsData, vendorsData, eventsData] = await Promise.all([
                callApi('/clients/'),
                callApi('/ap/vendors'), // Note: no trailing slash for this endpoint
                callApi('/events/')
            ]);

            console.log('Vendors data received:', vendorsData);
            console.log('Clients data received:', clientsData);
            console.log('Events data received:', eventsData);

            // The AP vendors endpoint returns an array directly, not wrapped in { vendors: [...] }
            setClients(clientsData.clients || []);
            setVendors(Array.isArray(vendorsData) ? vendorsData : []);
            setEvents(eventsData.events || []);
        } catch (error) {
            console.error('Error loading reference data:', error);
            toast.error('Failed to load reference data: ' + error.message);

            // Fallback to empty data to prevent application crash
            setClients([]);
            setVendors([]);
            setEvents([]);
        }
    };

    const calculateTotal = (lines) => {
        return lines.reduce((sum, line) => sum + (parseFloat(line.amount) || 0), 0);
    };

    const updateFormTotal = (lines) => {
        const total = calculateTotal(lines);
        setFormData(prev => ({ ...prev, lines, total }));
    };

    const addLine = () => {
        const newLine = {
            bucket: '',
            amount: 0,
            currency: 'INR',
            clientId: '',
            eventId: '',
            vendorId: '',
            memo: ''
        };
        updateFormTotal([...formData.lines, newLine]);
    };

    const removeLine = (index) => {
        if (formData.lines.length === 1) {
            toast.error('At least one line is required');
            return;
        }
        const newLines = formData.lines.filter((_, i) => i !== index);
        updateFormTotal(newLines);
    };

    const updateLine = (index, field, value) => {
        const newLines = [...formData.lines];
        newLines[index] = { ...newLines[index], [field]: value };
        updateFormTotal(newLines);
    };

    const handleOpenDialog = (adjustment = null, mode = 'create') => {
        if (mode === 'create') {
            setFormData({
                period: selectedPeriod,
                lines: [
                    {
                        bucket: '',
                        amount: 0,
                        currency: 'INR',
                        clientId: '',
                        eventId: '',
                        vendorId: '',
                        memo: ''
                    }
                ],
                total: 0
            });
        } else if (adjustment) {
            setFormData({
                period: adjustment.period,
                lines: adjustment.lines || [],
                total: adjustment.total || 0
            });
        }

        setAdjustmentDialog({ open: true, adjustment, mode });
        setPreviewData(null);
    };

    const generatePreview = async () => {
        try {
            const payload = {
                year: formData.period.year,
                month: formData.period.month,
                lines: formData.lines.filter(line => line.bucket && line.amount !== 0)
            };

            // ✅ no double /api, trailing slash for action routes
            const data = await callApi('/financial-hub/adjustments/preview/', 'POST', payload);
            setPreviewData(data);
        } catch (error) {
            console.error('Error generating preview:', error);
            toast.error('Failed to generate preview: ' + error.message);
        }
    };

    const saveAdjustment = async () => {
        try {
            // Validate that we have a selected period
            if (!formData.period || !formData.period.year || !formData.period.month) {
                toast.error('Please select a valid period');
                return;
            }

            const payload = {
                year: formData.period.year,
                month: formData.period.month,
                lines: formData.lines.filter(line => line.bucket && line.amount !== 0).map(line => ({
                    bucket: line.bucket,
                    amount: parseFloat(line.amount) || 0,
                    currency: line.currency || 'INR',
                    clientId: line.clientId || null,
                    eventId: line.eventId || null,
                    vendorId: line.vendorId || null,
                    memo: line.memo || null
                })),
                notes: null
            };

            if (payload.lines.length === 0) {
                toast.error('At least one line with bucket and amount is required');
                return;
            }

            // Validate that all lines have valid amounts
            const invalidLines = payload.lines.filter(line => isNaN(line.amount) || line.amount === 0);
            if (invalidLines.length > 0) {
                toast.error('All lines must have valid, non-zero amounts');
                return;
            }

            console.log('Saving adjustment with payload:', JSON.stringify(payload, null, 2)); // Log the payload

            let data;
            if (adjustmentDialog.mode === 'create') {
                // ✅ POST to collection with trailing slash
                data = await callApi('/financial-hub/adjustments/', 'POST', payload);
                toast.success('Adjustment created successfully');
            } else {
                // ✅ PUT to resource with trailing slash
                data = await callApi(`/financial-hub/adjustments/${adjustmentDialog.adjustment.id}/`, 'PUT', payload);
                toast.success('Adjustment updated successfully');
            }

            console.log('Adjustment saved successfully:', data); // Log the successful response

            setAdjustmentDialog({ open: false, adjustment: null, mode: 'view' });
            await loadAdjustments(); // Ensure adjustments list is refreshed
        } catch (error) {
            console.error('Error saving adjustment:', error);
            
            // Better error handling to see the actual server response
            let errorMessage = 'An error occurred';
            if (error.response?.data) {
                console.error('Server response data:', error.response.data);
                if (typeof error.response.data === 'object') {
                    errorMessage = error.response.data.detail || error.response.data.message || JSON.stringify(error.response.data);
                } else {
                    errorMessage = error.response.data;
                }
            } else if (error.message) {
                errorMessage = error.message;
            }
            
            console.error('Parsed error message:', errorMessage);
            toast.error('Failed to save adjustment: ' + errorMessage);
        }
    };

    const publishAdjustment = async (adjustmentId) => {
        try {
            // ✅ action route with trailing slash
            await callApi(`/financial-hub/adjustments/${adjustmentId}/publish/`, 'POST');
            toast.success('Adjustment published successfully');
            loadAdjustments();
        } catch (error) {
            console.error('Error publishing adjustment:', error);
            toast.error('Failed to publish adjustment: ' + error.message);
        }
    };

    const voidAdjustment = async (adjustmentId, reason) => {
        try {
            // ✅ action route with trailing slash
            await callApi(`/financial-hub/adjustments/${adjustmentId}/void/`, 'POST', { reason });
            toast.success('Adjustment voided successfully');
            loadAdjustments();
        } catch (error) {
            console.error('Error voiding adjustment:', error);
            toast.error('Failed to void adjustment: ' + error.message);
        }
    };

    useEffect(() => {
        if (user && claims && isAuthorized) {
            loadClosedPeriods();
            loadReferenceData();
        }
    }, [user, claims, isAuthorized]);

    useEffect(() => {
        if (selectedPeriod) {
            loadAdjustments();
        }
    }, [selectedPeriod]);

    // Handle initial adjustment selection
    useEffect(() => {
        if (initialAdjustmentId && adjustments.length > 0) {
            const adjustment = adjustments.find(adj => adj.id === initialAdjustmentId);
            if (adjustment) {
                setAdjustmentDialog({ open: true, adjustment, mode: 'view' });
            }
        }
    }, [initialAdjustmentId, adjustments]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
        }).format(amount || 0);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleString('en-IN');
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'PUBLISHED': return 'success';
            case 'VOID': return 'error';
            default: return 'default';
        }
    };

    const canEdit = (adjustment) => {
        return adjustment.status === 'DRAFT';
    };

    const canPublish = (adjustment) => {
        return adjustment.status === 'DRAFT';
    };

    const canVoid = (adjustment) => {
        return adjustment.status === 'PUBLISHED';
    };

    if (loading && !selectedPeriod) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography variant="h4" gutterBottom>Journal Adjustments</Typography>
                <LinearProgress />
                <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                    Loading closed periods...
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1">
                    Journal Adjustments
                </Typography>

                <Stack direction="row" spacing={2} alignItems="center">
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Period</InputLabel>
                        <Select
                            value={selectedPeriod?.label || ''}
                            label="Period"
                            onChange={(e) => {
                                const period = closedPeriods.find(p => p.label === e.target.value);
                                setSelectedPeriod(period);
                            }}
                        >
                            {closedPeriods.map(period => (
                                <MenuItem key={`${period.year}-${period.month}`} value={period.label}>
                                    {period.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadAdjustments}
                        disabled={loading}
                    >
                        Refresh
                    </Button>

                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => handleOpenDialog(null, 'create')}
                        disabled={!selectedPeriod}
                    >
                        New Adjustment
                    </Button>
                </Stack>
            </Box>

            {!selectedPeriod ? (
                <Alert severity="info">
                    No closed periods available. Close a period first to create adjustments.
                </Alert>
            ) : (
                <SectionCard
                    title={`Adjustments for ${selectedPeriod.label}`}
                    subheader={`Period Status: CLOSED`}
                >
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <LinearProgress sx={{ width: '100%' }} />
                        </Box>
                    ) : adjustments.length === 0 ? (
                        <Alert severity="info">
                            No adjustments found for this period. Create your first adjustment to modify the financial figures.
                        </Alert>
                    ) : (
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Created</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Lines</TableCell>
                                        <TableCell align="right">Total</TableCell>
                                        <TableCell>Published</TableCell>
                                        <TableCell>Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {adjustments.map((adjustment) => (
                                        <TableRow key={adjustment.id}>
                                            <TableCell>
                                                <Box>
                                                    <Typography variant="body2">
                                                        {formatDate(adjustment.createdAt)}
                                                    </Typography>
                                                    <Typography variant="caption" color="textSecondary">
                                                        by {adjustment.createdBy}
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={adjustment.status}
                                                    size="small"
                                                    color={getStatusColor(adjustment.status)}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2">
                                                    {adjustment.lines?.length || 0} line(s)
                                                </Typography>
                                                <Typography variant="caption" color="textSecondary">
                                                    {adjustment.lines?.map(line => line.bucket).join(', ')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography
                                                    variant="body2"
                                                    color={adjustment.total >= 0 ? 'success.main' : 'error.main'}
                                                    fontWeight="medium"
                                                >
                                                    {formatCurrency(adjustment.total)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                {adjustment.publishedAt && (
                                                    <Box>
                                                        <Typography variant="body2">
                                                            {formatDate(adjustment.publishedAt)}
                                                        </Typography>
                                                        <Typography variant="caption" color="textSecondary">
                                                            by {adjustment.publishedBy}
                                                        </Typography>
                                                    </Box>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Stack direction="row" spacing={1}>
                                                    <Tooltip title="View Details">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleOpenDialog(adjustment, 'view')}
                                                        >
                                                            <ViewIcon />
                                                        </IconButton>
                                                    </Tooltip>

                                                    {canEdit(adjustment) && (
                                                        <Tooltip title="Edit">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleOpenDialog(adjustment, 'edit')}
                                                            >
                                                                <EditIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}

                                                    {canPublish(adjustment) && (
                                                        <Tooltip title="Publish">
                                                            <IconButton
                                                                size="small"
                                                                color="success"
                                                                onClick={() => publishAdjustment(adjustment.id)}
                                                            >
                                                                <PublishIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}

                                                    {canVoid(adjustment) && (
                                                        <Tooltip title="Void">
                                                            <IconButton
                                                                size="small"
                                                                color="error"
                                                                onClick={() => {
                                                                    const reason = prompt('Enter reason for voiding:');
                                                                    if (reason && reason.length >= 10) {
                                                                        voidAdjustment(adjustment.id, reason);
                                                                    } else {
                                                                        toast.error('Reason must be at least 10 characters');
                                                                    }
                                                                }}
                                                            >
                                                                <CancelIcon />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </SectionCard>
            )}

            {/* Adjustment Dialog */}
            <Dialog
                open={adjustmentDialog.open}
                onClose={() => setAdjustmentDialog({ open: false, adjustment: null, mode: 'view' })}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle>
                    {adjustmentDialog.mode === 'create' ? 'Create' : adjustmentDialog.mode === 'edit' ? 'Edit' : 'View'} Journal Adjustment
                    {formData.period && ` - ${formData.period.label}`}
                </DialogTitle>

                <DialogContent>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        {adjustmentDialog.mode !== 'view' && (
                            <Alert severity="info">
                                Adjustments can only be made to closed periods. Use positive amounts to increase and negative amounts to decrease bucket values.
                            </Alert>
                        )}

                        {/* Lines Section */}
                        <SectionCard title="Adjustment Lines">
                            <Stack spacing={2}>
                                {formData.lines.map((line, index) => (
                                    <Paper key={index} sx={{ p: 2, bgcolor: 'grey.50' }}>
                                        <Grid container spacing={2} alignItems="center">
                                            <Grid size={{ xs: 12, sm: 3 }}>
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>Bucket</InputLabel>
                                                    <Select
                                                        value={line.bucket}
                                                        label="Bucket"
                                                        onChange={(e) => updateLine(index, 'bucket', e.target.value)}
                                                        disabled={adjustmentDialog.mode === 'view'}
                                                    >
                                                        {bucketOptions.map(bucket => (
                                                            <MenuItem key={bucket.value} value={bucket.value}>
                                                                <Box>
                                                                    <Typography variant="body2">{bucket.label}</Typography>
                                                                    <Typography variant="caption" color="textSecondary">
                                                                        {bucket.description}
                                                                    </Typography>
                                                                </Box>
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>
                                            </Grid>

                                            <Grid size={{ xs: 12, sm: 2 }}>
                                                <TextField
                                                    label="Amount"
                                                    type="number"
                                                    value={line.amount}
                                                    onChange={(e) => updateLine(index, 'amount', parseFloat(e.target.value) || 0)}
                                                    size="small"
                                                    fullWidth
                                                    disabled={adjustmentDialog.mode === 'view'}
                                                    helperText="+/-"
                                                />
                                            </Grid>

                                            <Grid size={{ xs: 12, sm: 2 }}>
                                                <Autocomplete
                                                    size="small"
                                                    options={clients}
                                                    getOptionLabel={(option) => option.name || ''}
                                                    value={clients.find(c => c.id === line.clientId) || null}
                                                    onChange={(_, value) => updateLine(index, 'clientId', value?.id || '')}
                                                    renderInput={(params) => (
                                                        <TextField {...params} label="Client" />
                                                    )}
                                                    disabled={adjustmentDialog.mode === 'view'}
                                                />
                                            </Grid>

                                            <Grid size={{ xs: 12, sm: 3 }}>
                                                <TextField
                                                    label="Memo"
                                                    value={line.memo}
                                                    onChange={(e) => updateLine(index, 'memo', e.target.value)}
                                                    size="small"
                                                    fullWidth
                                                    disabled={adjustmentDialog.mode === 'view'}
                                                />
                                            </Grid>

                                            <Grid size={{ xs: 12, sm: 2 }}>
                                                {adjustmentDialog.mode !== 'view' && (
                                                    <IconButton
                                                        color="error"
                                                        onClick={() => removeLine(index)}
                                                        disabled={formData.lines.length === 1}
                                                    >
                                                        <DeleteIcon />
                                                    </IconButton>
                                                )}
                                            </Grid>
                                        </Grid>
                                    </Paper>
                                ))}

                                {adjustmentDialog.mode !== 'view' && (
                                    <Button
                                        variant="outlined"
                                        startIcon={<AddIcon />}
                                        onClick={addLine}
                                    >
                                        Add Line
                                    </Button>
                                )}

                                <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 2 }}>
                                    <Typography variant="h6">
                                        Total: {formatCurrency(formData.total)}
                                    </Typography>
                                </Box>
                            </Stack>
                        </SectionCard>

                        {/* Preview Section */}
                        {adjustmentDialog.mode !== 'view' && (
                            <Box>
                                <Button
                                    variant="outlined"
                                    onClick={generatePreview}
                                    disabled={formData.lines.every(line => !line.bucket || line.amount === 0)}
                                >
                                    Generate Impact Preview
                                </Button>

                                {previewData && (
                                    <Alert severity="info" sx={{ mt: 2 }}>
                                        <Typography variant="body2" fontWeight="medium">
                                            Impact on {formData.period?.label}:
                                        </Typography>
                                        <ul>
                                            {Object.entries(previewData.bucketImpact || {}).map(([bucket, amount]) => (
                                                <li key={bucket}>
                                                    {bucket}: {formatCurrency(amount)}
                                                </li>
                                            ))}
                                        </ul>
                                    </Alert>
                                )}
                            </Box>
                        )}
                    </Stack>
                </DialogContent>

                <DialogActions>
                    <Button onClick={() => setAdjustmentDialog({ open: false, adjustment: null, mode: 'view' })}>
                        {adjustmentDialog.mode === 'view' ? 'Close' : 'Cancel'}
                    </Button>

                    {adjustmentDialog.mode !== 'view' && (
                        <Button
                            variant="contained"
                            onClick={saveAdjustment}
                            startIcon={<SaveIcon />}
                            disabled={formData.lines.every(line => !line.bucket || line.amount === 0)}
                        >
                            {adjustmentDialog.mode === 'create' ? 'Create' : 'Update'}
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default JournalAdjustmentsPage;