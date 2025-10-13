import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Container,
    Paper,
    Typography,
    Chip,
    Button,
    Card,
    CardContent,
    CardMedia,
    Grid,
    CircularProgress,
    Alert,
    TextField,
    InputAdornment,
    MenuItem,
    Stack,
    Divider,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    History as HistoryIcon,
    CheckCircle as CheckCircleIcon,
    Schedule as ScheduleIcon,
    Warning as WarningIcon,
    Error as ErrorIcon,
    Search as SearchIcon,
    FilterList as FilterListIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { equipmentAPI } from '../../services/equipmentApi';
import toast from 'react-hot-toast';

const MyHistoryPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState([]);
    const [filteredHistory, setFilteredHistory] = useState([]);
    const [filterStatus, setFilterStatus] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        returned: 0,
        overdue: 0,
    });

    const fetchHistory = useCallback(async () => {
        if (!user?.uid) return;
        
        setLoading(true);
        try {
            const response = await equipmentAPI.getUserHistory(user.uid, { limit: 100 });
            setHistory(response.data);
            calculateStats(response.data);
        } catch (error) {
            console.error('Error fetching history:', error);
            toast.error('Failed to load checkout history');
        } finally {
            setLoading(false);
        }
    }, [user?.uid]);

    const applyFilters = useCallback(() => {
        let filtered = [...history];

        // Filter by status
        if (filterStatus !== 'all') {
            filtered = filtered.filter(h => h.status === filterStatus);
        }

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(h =>
                h.equipment?.name?.toLowerCase().includes(query) ||
                h.equipment?.assetId?.toLowerCase().includes(query) ||
                h.equipment?.category?.toLowerCase().includes(query) ||
                h.eventName?.toLowerCase().includes(query)
            );
        }

        setFilteredHistory(filtered);
    }, [history, filterStatus, searchQuery]);

    useEffect(() => {
        if (user?.uid) {
            fetchHistory();
        }
    }, [user?.uid, fetchHistory]);

    useEffect(() => {
        applyFilters();
    }, [applyFilters]);

    const calculateStats = (historyData) => {
        const active = historyData.filter(h => h.status === 'active').length;
        const returned = historyData.filter(h => h.status === 'returned').length;
        const overdue = historyData.filter(h => h.isOverdue && h.status === 'active').length;

        setStats({
            total: historyData.length,
            active,
            returned,
            overdue,
        });
    };

    const formatDateTime = (timestamp) => {
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

    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const getStatusColor = (item) => {
        if (item.isOverdue && item.status === 'active') return 'error';
        if (item.status === 'active') return 'primary';
        if (item.hasDamage) return 'warning';
        return 'success';
    };

    const getStatusLabel = (item) => {
        if (item.isOverdue && item.status === 'active') return 'Overdue';
        if (item.status === 'active') return 'Active Checkout';
        if (item.hasDamage) return 'Returned (Damage)';
        return 'Returned';
    };

    const getDaysCheckedOut = (checkoutDate, returnDate) => {
        const checkout = checkoutDate?.toDate ? checkoutDate.toDate() : new Date(checkoutDate);
        const returnDateObj = returnDate ? (returnDate.toDate ? returnDate.toDate() : new Date(returnDate)) : new Date();
        const days = Math.ceil((returnDateObj - checkout) / (1000 * 60 * 60 * 24));
        return days;
    };

    if (loading) {
        return (
            <Container maxWidth="xl" sx={{ py: 4 }}>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                    <CircularProgress />
                </Box>
            </Container>
        );
    }

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/equipment/my-checkouts')}
                    sx={{ mr: 2 }}
                >
                    Back
                </Button>
                <HistoryIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                <Box>
                    <Typography variant="h4" fontWeight="bold">
                        My Checkout History
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        View all your equipment checkouts and returns
                    </Typography>
                </Box>
            </Box>

            {/* Stats Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <HistoryIcon color="primary" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Total
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {stats.total}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={6} sm={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <ScheduleIcon color="info" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Active
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {stats.active}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={6} sm={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Returned
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {stats.returned}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={6} sm={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <WarningIcon color="error" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Overdue
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {stats.overdue}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Filters */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            placeholder="Search equipment..."
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
                            label="Filter by Status"
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <FilterListIcon />
                                    </InputAdornment>
                                ),
                            }}
                        >
                            <MenuItem value="all">All Checkouts</MenuItem>
                            <MenuItem value="active">Active</MenuItem>
                            <MenuItem value="returned">Returned</MenuItem>
                        </TextField>
                    </Grid>
                </Grid>
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                        Showing {filteredHistory.length} of {history.length} checkouts
                    </Typography>
                    {(filterStatus !== 'all' || searchQuery) && (
                        <Button
                            size="small"
                            onClick={() => {
                                setFilterStatus('all');
                                setSearchQuery('');
                            }}
                        >
                            Clear Filters
                        </Button>
                    )}
                </Box>
            </Paper>

            {/* History List */}
            {filteredHistory.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                    <HistoryIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary" gutterBottom>
                        No checkout history found
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {history.length === 0 
                            ? "You haven't checked out any equipment yet"
                            : "Try adjusting your filters"}
                    </Typography>
                </Paper>
            ) : (
                <Grid container spacing={3}>
                    {filteredHistory.map((item) => (
                        <Grid item xs={12} key={item.id}>
                            <Card
                                sx={{
                                    transition: 'all 0.3s',
                                    '&:hover': {
                                        transform: 'translateY(-4px)',
                                        boxShadow: 4,
                                    },
                                }}
                            >
                                <CardContent>
                                    <Grid container spacing={2}>
                                        {/* Equipment Image */}
                                        <Grid item xs={12} sm={3}>
                                            {item.equipment?.imageUrl ? (
                                                <CardMedia
                                                    component="img"
                                                    image={item.equipment.imageUrl}
                                                    alt={item.equipment.name}
                                                    sx={{
                                                        height: 150,
                                                        objectFit: 'cover',
                                                        borderRadius: 1,
                                                    }}
                                                />
                                            ) : (
                                                <Box
                                                    sx={{
                                                        height: 150,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        bgcolor: 'grey.200',
                                                        borderRadius: 1,
                                                    }}
                                                >
                                                    <Typography variant="h6" color="text.secondary">
                                                        No Image
                                                    </Typography>
                                                </Box>
                                            )}
                                        </Grid>

                                        {/* Equipment Details */}
                                        <Grid item xs={12} sm={9}>
                                            <Box>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                                                    <Box>
                                                        <Typography variant="h6" fontWeight="bold" gutterBottom>
                                                            {item.equipment?.name}
                                                        </Typography>
                                                        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                                                            <Chip
                                                                label={item.equipment?.category}
                                                                size="small"
                                                                variant="outlined"
                                                            />
                                                            <Chip
                                                                label={item.equipment?.assetId}
                                                                size="small"
                                                                variant="outlined"
                                                            />
                                                        </Stack>
                                                    </Box>
                                                    <Chip
                                                        label={getStatusLabel(item)}
                                                        color={getStatusColor(item)}
                                                        icon={
                                                            item.isOverdue && item.status === 'active' ? <WarningIcon /> :
                                                            item.status === 'active' ? <ScheduleIcon /> :
                                                            item.hasDamage ? <ErrorIcon /> : <CheckCircleIcon />
                                                        }
                                                    />
                                                </Box>

                                                <Divider sx={{ my: 1 }} />

                                                {/* Checkout Details */}
                                                <Grid container spacing={2} sx={{ mt: 1 }}>
                                                    <Grid item xs={12} sm={6}>
                                                        <Typography variant="body2" color="text.secondary">
                                                            <strong>Checked Out:</strong>
                                                        </Typography>
                                                        <Typography variant="body2">
                                                            {formatDateTime(item.checkoutDate)}
                                                        </Typography>
                                                    </Grid>

                                                    <Grid item xs={12} sm={6}>
                                                        <Typography variant="body2" color="text.secondary">
                                                            <strong>Expected Return:</strong>
                                                        </Typography>
                                                        <Typography variant="body2">
                                                            {formatDate(item.expectedReturnDate)}
                                                        </Typography>
                                                    </Grid>

                                                    {item.actualReturnDate && (
                                                        <Grid item xs={12} sm={6}>
                                                            <Typography variant="body2" color="text.secondary">
                                                                <strong>Actual Return:</strong>
                                                            </Typography>
                                                            <Typography variant="body2">
                                                                {formatDateTime(item.actualReturnDate)}
                                                            </Typography>
                                                        </Grid>
                                                    )}

                                                    <Grid item xs={12} sm={6}>
                                                        <Typography variant="body2" color="text.secondary">
                                                            <strong>Duration:</strong>
                                                        </Typography>
                                                        <Typography variant="body2">
                                                            {getDaysCheckedOut(item.checkoutDate, item.actualReturnDate)} days
                                                        </Typography>
                                                    </Grid>

                                                    {item.eventName && (
                                                        <Grid item xs={12}>
                                                            <Typography variant="body2" color="text.secondary">
                                                                <strong>Event:</strong> {item.eventName}
                                                            </Typography>
                                                        </Grid>
                                                    )}

                                                    {item.returnCondition && (
                                                        <Grid item xs={12} sm={6}>
                                                            <Typography variant="body2" color="text.secondary">
                                                                <strong>Return Condition:</strong>
                                                            </Typography>
                                                            <Chip
                                                                label={item.returnCondition}
                                                                size="small"
                                                                color={
                                                                    item.returnCondition === 'excellent' ? 'success' :
                                                                    item.returnCondition === 'good' ? 'primary' :
                                                                    item.returnCondition === 'fair' ? 'warning' : 'error'
                                                                }
                                                                sx={{ mt: 0.5 }}
                                                            />
                                                        </Grid>
                                                    )}

                                                    {item.hasDamage && (
                                                        <Grid item xs={12}>
                                                            <Alert severity="error" sx={{ mt: 1 }}>
                                                                <Typography variant="body2" fontWeight="bold">
                                                                    Damage Reported
                                                                </Typography>
                                                                {item.damageDescription && (
                                                                    <Typography variant="body2">
                                                                        {item.damageDescription}
                                                                    </Typography>
                                                                )}
                                                            </Alert>
                                                        </Grid>
                                                    )}

                                                    {item.notes && (
                                                        <Grid item xs={12}>
                                                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                                <strong>Notes:</strong> "{item.notes}"
                                                            </Typography>
                                                        </Grid>
                                                    )}

                                                    {item.returnNotes && (
                                                        <Grid item xs={12}>
                                                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                                                <strong>Return Notes:</strong> "{item.returnNotes}"
                                                            </Typography>
                                                        </Grid>
                                                    )}
                                                </Grid>
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
                </Grid>
            )}
        </Container>
    );
};

export default MyHistoryPage;
