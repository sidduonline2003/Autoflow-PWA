import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Paper,
    Typography,
    Chip,
    Avatar,
    Button,
    Card,
    CardContent,
    CircularProgress,
    Alert,
    Grid,
    TextField,
    InputAdornment,
    MenuItem,
} from '@mui/material';
import {
    Timeline,
    TimelineItem,
    TimelineSeparator,
    TimelineConnector,
    TimelineContent,
    TimelineDot,
    TimelineOppositeContent,
} from '@mui/lab';
import {
    ShoppingCart as CheckoutIcon,
    AssignmentReturn as CheckinIcon,
    Build as MaintenanceIcon,
    AddCircle as CreatedIcon,
    ArrowBack as ArrowBackIcon,
    Refresh as RefreshIcon,
    Search as SearchIcon,
    FilterList as FilterListIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Error as ErrorIcon,
    Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import { equipmentAPI } from '../../services/equipmentApi';
import toast from 'react-hot-toast';

const EquipmentHistoryPage = () => {
    const navigate = useNavigate();
    const { assetId } = useParams();
    const [loading, setLoading] = useState(true);
    const [equipment, setEquipment] = useState(null);
    const [history, setHistory] = useState([]);
    const [filteredHistory, setFilteredHistory] = useState([]);
    const [filterType, setFilterType] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState({
        totalCheckouts: 0,
        totalMaintenance: 0,
        totalDamages: 0,
        avgCheckoutDuration: 0,
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [equipmentRes, historyRes] = await Promise.all([
                equipmentAPI.getById(assetId),
                equipmentAPI.getEquipmentHistory(assetId, { limit: 100 })
            ]);

            setEquipment(equipmentRes.data);
            setHistory(historyRes.data);
            calculateStats(historyRes.data);
        } catch (error) {
            console.error('Error fetching history:', error);
            toast.error('Failed to load equipment history');
        } finally {
            setLoading(false);
        }
    }, [assetId]);

    const applyFilters = useCallback(() => {
        let filtered = [...history];

        // Filter by event type
        if (filterType !== 'all') {
            filtered = filtered.filter(item => item.type === filterType);
        }

        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(item => {
                const userName = item.user?.name?.toLowerCase() || '';
                const userEmail = item.user?.email?.toLowerCase() || '';
                const eventType = item.type.toLowerCase();
                const description = JSON.stringify(item.details).toLowerCase();
                
                return userName.includes(query) || 
                       userEmail.includes(query) || 
                       eventType.includes(query) ||
                       description.includes(query);
            });
        }

        setFilteredHistory(filtered);
    }, [history, filterType, searchQuery]);

    useEffect(() => {
        if (assetId) {
            fetchData();
        }
    }, [assetId, fetchData]);

    useEffect(() => {
        applyFilters();
    }, [applyFilters]);

    const calculateStats = (historyData) => {
        const checkouts = historyData.filter(h => h.type === 'checkout');
        const maintenance = historyData.filter(h => h.type.includes('maintenance'));
        const damages = historyData.filter(h => h.details?.hasDamage === true);

        // Calculate average checkout duration
        const returnedCheckouts = historyData.filter(h => 
            h.type === 'checkin' && h.details?.checkoutId
        );
        let totalDuration = 0;
        let durationCount = 0;

        returnedCheckouts.forEach(checkin => {
            const checkout = historyData.find(h => 
                h.type === 'checkout' && h.details?.checkoutId === checkin.details?.checkoutId
            );
            if (checkout && checkout.timestamp && checkin.timestamp) {
                const duration = (new Date(checkin.timestamp) - new Date(checkout.timestamp)) / (1000 * 60 * 60 * 24);
                totalDuration += duration;
                durationCount++;
            }
        });

        setStats({
            totalCheckouts: checkouts.length,
            totalMaintenance: maintenance.length,
            totalDamages: damages.length,
            avgCheckoutDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
        });
    };

    const getEventIcon = (type) => {
        switch (type) {
            case 'checkout':
                return <CheckoutIcon />;
            case 'checkin':
                return <CheckinIcon />;
            case 'maintenance_scheduled':
            case 'maintenance_completed':
                return <MaintenanceIcon />;
            case 'created':
                return <CreatedIcon />;
            default:
                return <ScheduleIcon />;
        }
    };

    const getEventColor = (type, status) => {
        if (type === 'checkin' && status === 'completed') {
            return 'success';
        }
        if (type === 'checkout') {
            return 'primary';
        }
        if (type.includes('maintenance')) {
            return 'warning';
        }
        if (type === 'created') {
            return 'info';
        }
        return 'default';
    };

    const getEventTitle = (event) => {
        switch (event.type) {
            case 'checkout':
                return 'Equipment Checked Out';
            case 'checkin':
                return event.details?.hasDamage ? 'Checked In (Damage Reported)' : 'Equipment Checked In';
            case 'maintenance_scheduled':
                return 'Maintenance Scheduled';
            case 'maintenance_completed':
                return 'Maintenance Completed';
            case 'created':
                return 'Equipment Added to Inventory';
            default:
                return 'Event';
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleString('en-IN', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(value || 0);
    };

    if (loading) {
        return (
            <AdminLayout
                appBarTitle="Equipment History"
                pageTitle="Loading..."
                pageSubtitle="Fetching equipment history"
            >
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                    <CircularProgress />
                </Box>
            </AdminLayout>
        );
    }

    if (!equipment) {
        return (
            <AdminLayout
                appBarTitle="Equipment History"
                pageTitle="Not Found"
                pageSubtitle="Equipment not found"
            >
                <Alert severity="error" sx={{ mb: 3 }}>
                    Equipment not found
                </Alert>
                <Button variant="outlined" onClick={() => navigate('/equipment')}>
                    Back to Dashboard
                </Button>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            appBarTitle="Equipment History"
            pageTitle={equipment.name}
            pageSubtitle={`${equipment.category} • ${equipment.assetId}`}
        >
            {/* Header Actions */}
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/equipment')}
                >
                    Back to Dashboard
                </Button>
                <Button
                    variant="outlined"
                    startIcon={<RefreshIcon />}
                    onClick={fetchData}
                >
                    Refresh
                </Button>
            </Box>

            {/* Stats Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <CheckoutIcon color="primary" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Total Checkouts
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {stats.totalCheckouts}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <MaintenanceIcon color="warning" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Maintenance Events
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {stats.totalMaintenance}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <ErrorIcon color="error" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Damage Reports
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {stats.totalDamages}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <ScheduleIcon color="info" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Avg. Checkout Duration
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {stats.avgCheckoutDuration} <Typography component="span" variant="body2">days</Typography>
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Filters */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            placeholder="Search by user, event, or description..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon />
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            select
                            fullWidth
                            label="Filter by Type"
                            value={filterType}
                            onChange={(e) => setFilterType(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <FilterListIcon />
                                    </InputAdornment>
                                ),
                            }}
                        >
                            <MenuItem value="all">All Events</MenuItem>
                            <MenuItem value="checkout">Checkouts</MenuItem>
                            <MenuItem value="checkin">Check-ins</MenuItem>
                            <MenuItem value="maintenance">Maintenance</MenuItem>
                            <MenuItem value="created">Created</MenuItem>
                        </TextField>
                    </Grid>
                </Grid>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                        Showing {filteredHistory.length} of {history.length} events
                    </Typography>
                    {(filterType !== 'all' || searchQuery) && (
                        <Button
                            size="small"
                            onClick={() => {
                                setFilterType('all');
                                setSearchQuery('');
                            }}
                        >
                            Clear Filters
                        </Button>
                    )}
                </Box>
            </Paper>

            {/* Timeline */}
            {filteredHistory.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h6" color="text.secondary">
                        No events found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Try adjusting your filters
                    </Typography>
                </Paper>
            ) : (
                <Timeline position="alternate">
                    {filteredHistory.map((event, index) => (
                        <TimelineItem key={event.id}>
                            <TimelineOppositeContent color="text.secondary">
                                <Typography variant="caption" display="block">
                                    {formatDate(event.timestamp)}
                                </Typography>
                                {event.user?.name && (
                                    <Chip
                                        label={event.user.name}
                                        size="small"
                                        avatar={<Avatar>{event.user.name.charAt(0)}</Avatar>}
                                        sx={{ mt: 1 }}
                                    />
                                )}
                            </TimelineOppositeContent>
                            <TimelineSeparator>
                                <TimelineDot color={getEventColor(event.type, event.status)}>
                                    {getEventIcon(event.type)}
                                </TimelineDot>
                                {index < filteredHistory.length - 1 && <TimelineConnector />}
                            </TimelineSeparator>
                            <TimelineContent>
                                <Paper elevation={3} sx={{ p: 2 }}>
                                    <Typography variant="h6" component="div" gutterBottom>
                                        {getEventTitle(event)}
                                    </Typography>

                                    {/* Checkout Details */}
                                    {event.type === 'checkout' && (
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                                <strong>Type:</strong> {event.details?.checkoutType?.replace('_', ' ')}
                                            </Typography>
                                            {event.details?.eventName && (
                                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                                    <strong>Event:</strong> {event.details.eventName}
                                                </Typography>
                                            )}
                                            {event.details?.expectedReturnDate && (
                                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                                    <strong>Expected Return:</strong> {formatDate(event.details.expectedReturnDate)}
                                                </Typography>
                                            )}
                                            {event.details?.notes && (
                                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                                                    "{event.details.notes}"
                                                </Typography>
                                            )}
                                        </Box>
                                    )}

                                    {/* Check-in Details */}
                                    {event.type === 'checkin' && (
                                        <Box>
                                            <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                                                {event.details?.returnCondition && (
                                                    <Chip
                                                        label={event.details.returnCondition}
                                                        size="small"
                                                        color={event.details.returnCondition === 'excellent' ? 'success' : 
                                                               event.details.returnCondition === 'good' ? 'primary' : 'warning'}
                                                    />
                                                )}
                                                {event.details?.isOverdue && (
                                                    <Chip label="Overdue" size="small" color="error" icon={<WarningIcon />} />
                                                )}
                                                {event.details?.hasDamage && (
                                                    <Chip label="Damage Reported" size="small" color="error" icon={<ErrorIcon />} />
                                                )}
                                            </Box>
                                            {event.details?.damageDescription && (
                                                <Alert severity="error" sx={{ mt: 1 }}>
                                                    <strong>Damage:</strong> {event.details.damageDescription}
                                                </Alert>
                                            )}
                                            {event.details?.returnNotes && (
                                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                                                    "{event.details.returnNotes}"
                                                </Typography>
                                            )}
                                        </Box>
                                    )}

                                    {/* Maintenance Details */}
                                    {event.type === 'maintenance_scheduled' && (
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                                <strong>Issue:</strong> {event.details?.issueType?.replace('_', ' ')}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                                <strong>Priority:</strong> {event.details?.priority}
                                            </Typography>
                                            {event.details?.estimatedCost && (
                                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                                    <strong>Estimated Cost:</strong> {formatCurrency(event.details.estimatedCost)}
                                                </Typography>
                                            )}
                                            {event.details?.description && (
                                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                                    {event.details.description}
                                                </Typography>
                                            )}
                                            <Chip
                                                label={event.status}
                                                size="small"
                                                color={event.status === 'completed' ? 'success' : 'warning'}
                                                sx={{ mt: 1 }}
                                            />
                                        </Box>
                                    )}

                                    {event.type === 'maintenance_completed' && (
                                        <Box>
                                            {event.details?.totalCost && (
                                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                                    <strong>Total Cost:</strong> {formatCurrency(event.details.totalCost)}
                                                </Typography>
                                            )}
                                            {event.details?.workPerformed && event.details.workPerformed.length > 0 && (
                                                <Box sx={{ mt: 1 }}>
                                                    <Typography variant="body2" fontWeight="bold">
                                                        Work Performed:
                                                    </Typography>
                                                    <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                                                        {event.details.workPerformed.map((work, i) => (
                                                            <li key={i}>
                                                                <Typography variant="body2" color="text.secondary">
                                                                    {work}
                                                                </Typography>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </Box>
                                            )}
                                            {event.details?.partsReplaced && event.details.partsReplaced.length > 0 && (
                                                <Box sx={{ mt: 1 }}>
                                                    <Typography variant="body2" fontWeight="bold">
                                                        Parts Replaced:
                                                    </Typography>
                                                    <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                                                        {event.details.partsReplaced.map((part, i) => (
                                                            <li key={i}>
                                                                <Typography variant="body2" color="text.secondary">
                                                                    {part}
                                                                </Typography>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </Box>
                                            )}
                                            {event.details?.completionNotes && (
                                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontStyle: 'italic' }}>
                                                    "{event.details.completionNotes}"
                                                </Typography>
                                            )}
                                        </Box>
                                    )}

                                    {/* Created Details */}
                                    {event.type === 'created' && (
                                        <Box>
                                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                                <strong>Category:</strong> {event.details?.category}
                                            </Typography>
                                            {event.details?.purchasePrice && (
                                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                                    <strong>Purchase Price:</strong> {formatCurrency(event.details.purchasePrice)}
                                                </Typography>
                                            )}
                                            {event.details?.purchaseDate && (
                                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                                    <strong>Purchase Date:</strong> {formatDate(event.details.purchaseDate)}
                                                </Typography>
                                            )}
                                        </Box>
                                    )}
                                </Paper>
                            </TimelineContent>
                        </TimelineItem>
                    ))}
                </Timeline>
            )}
        </AdminLayout>
    );
};

export default EquipmentHistoryPage;
