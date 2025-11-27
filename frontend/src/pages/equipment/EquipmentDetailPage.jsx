import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Container,
    Typography,
    Paper,
    Grid,
    Card,
    CardContent,
    Button,
    Chip,
    Divider,
    Alert,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    ListItemAvatar,
    IconButton,
    Tooltip,
    Stack,
    Avatar,
    Tabs,
    Tab,
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
    ArrowBack as ArrowBackIcon,
    QrCode2 as QrCodeIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Build as BuildIcon,
    CheckCircle as CheckCircleIcon,
    LocalShipping as LocalShippingIcon,
    Download as DownloadIcon,
    Print as PrintIcon,
    History as HistoryIcon,
    Place as PlaceIcon,
    CalendarMonth as CalendarIcon,
    AttachMoney as MoneyIcon,
    Info as InfoIcon,
    Dashboard as DashboardIcon,
    Timeline as TimelineIcon,
    Description as DescriptionIcon,
    ShoppingCart as CheckoutIcon,
    AssignmentReturn as CheckinIcon,
    AddCircle as CreatedIcon,
    Refresh as RefreshIcon,
    Search as SearchIcon,
    FilterList as FilterListIcon,
    Warning as WarningIcon,
    Error as ErrorIcon,
    Schedule as ScheduleIcon,
    TrendingUp as TrendingUpIcon,
    FolderOpen as FolderIcon,
    InsertDriveFile as FileIcon,
    Gavel as WarrantyIcon,
    Security as InsuranceIcon,
    MenuBook as ManualIcon,
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/layout/AdminLayout';
import { equipmentAPI } from '../../services/equipmentApi';
import toast from 'react-hot-toast';

// Custom TabPanel component
function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`equipment-tabpanel-${index}`}
            aria-labelledby={`equipment-tab-${index}`}
            {...other}
        >
            {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
        </div>
    );
}

function a11yProps(index) {
    return {
        id: `equipment-tab-${index}`,
        'aria-controls': `equipment-tabpanel-${index}`,
    };
}

const EquipmentDetailPage = () => {
    const { assetId } = useParams();
    const navigate = useNavigate();
    const { claims } = useAuth();
    const [loading, setLoading] = useState(true);
    const [equipment, setEquipment] = useState(null);
    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    
    // History state
    const [historyLoading, setHistoryLoading] = useState(false);
    const [history, setHistory] = useState([]);
    const [filteredHistory, setFilteredHistory] = useState([]);
    const [recentActivity, setRecentActivity] = useState([]);
    const [filterType, setFilterType] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [historyStats, setHistoryStats] = useState({
        totalCheckouts: 0,
        totalMaintenance: 0,
        totalDamages: 0,
        avgCheckoutDuration: 0,
    });

    useEffect(() => {
        fetchEquipmentDetails();
    }, [assetId]);

    // Fetch history when Timeline tab is selected
    useEffect(() => {
        if (activeTab === 1 && history.length === 0 && !historyLoading) {
            fetchHistory();
        }
    }, [activeTab]);

    // Apply filters when history or filter changes
    useEffect(() => {
        applyFilters();
    }, [history, filterType, searchQuery]);

    const fetchEquipmentDetails = async () => {
        setLoading(true);
        try {
            const response = await equipmentAPI.getById(assetId);
            setEquipment(response.data);
            // Also fetch recent activity for the Overview tab
            fetchRecentActivity();
        } catch (error) {
            console.error('Error fetching equipment details:', error);
            toast.error('Failed to load equipment details');
        } finally {
            setLoading(false);
        }
    };

    const fetchRecentActivity = async () => {
        try {
            const historyRes = await equipmentAPI.getEquipmentHistory(assetId, { limit: 5 });
            console.log('Recent Activity API Response:', historyRes);
            // Handle both response formats: { data: [...] } or direct array
            const historyData = Array.isArray(historyRes.data) ? historyRes.data : 
                               Array.isArray(historyRes) ? historyRes : [];
            console.log('Recent Activity Data:', historyData);
            setRecentActivity(historyData);
        } catch (error) {
            console.error('Error fetching recent activity:', error);
        }
    };

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const historyRes = await equipmentAPI.getEquipmentHistory(assetId, { limit: 100 });
            console.log('Full History API Response:', historyRes);
            // Handle both response formats: { data: [...] } or direct array
            const historyData = Array.isArray(historyRes.data) ? historyRes.data : 
                               Array.isArray(historyRes) ? historyRes : [];
            console.log('Full History Data:', historyData);
            setHistory(historyData);
            calculateStats(historyData);
        } catch (error) {
            console.error('Error fetching history:', error);
            toast.error('Failed to load equipment history');
        } finally {
            setHistoryLoading(false);
        }
    };

    const applyFilters = useCallback(() => {
        let filtered = [...history];

        if (filterType !== 'all') {
            filtered = filtered.filter(item => item.type === filterType);
        }

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

    const calculateStats = (historyData) => {
        const checkouts = historyData.filter(h => h.type === 'checkout');
        const maintenance = historyData.filter(h => h.type.includes('maintenance'));
        const damages = historyData.filter(h => h.details?.hasDamage === true);

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

        setHistoryStats({
            totalCheckouts: checkouts.length,
            totalMaintenance: maintenance.length,
            totalDamages: damages.length,
            avgCheckoutDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
        });
    };

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    const handleDownloadQR = () => {
        if (!equipment?.qrCodeUrl) return;

        // If it's a base64 data URL, create download link
        if (equipment.qrCodeUrl.startsWith('data:image')) {
            const link = document.createElement('a');
            link.href = equipment.qrCodeUrl;
            link.download = `${equipment.assetId}_QR.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            toast.success('QR code downloaded');
        } else {
            // If it's a Firebase URL, open in new tab
            window.open(equipment.qrCodeUrl, '_blank');
        }
    };

    const handlePrintQR = () => {
        if (!equipment?.qrCodeUrl) return;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Print QR Code - ${equipment.assetId}</title>
                    <style>
                        body {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            padding: 20px;
                            font-family: Arial, sans-serif;
                        }
                        img {
                            max-width: 400px;
                            margin: 20px 0;
                        }
                        .info {
                            text-align: center;
                            margin: 10px 0;
                        }
                        @media print {
                            button { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="info">
                        <h2>${equipment.name}</h2>
                        <p><strong>Asset ID:</strong> ${equipment.assetId}</p>
                        <p><strong>Category:</strong> ${equipment.category}</p>
                    </div>
                    <img src="${equipment.qrCodeUrl}" alt="QR Code" />
                    <button onclick="window.print()">Print</button>
                </body>
            </html>
        `);
        printWindow.document.close();
    };

    const handleRetire = async () => {
        try {
            await equipmentAPI.retire(assetId);
            toast.success('Equipment retired successfully');
            setDeleteDialogOpen(false);
            fetchEquipmentDetails();
        } catch (error) {
            console.error('Error retiring equipment:', error);
            toast.error('Failed to retire equipment');
        }
    };

    const getStatusChip = (status) => {
        const statusConfig = {
            AVAILABLE: { label: 'Available', color: 'success', icon: <CheckCircleIcon /> },
            CHECKED_OUT: { label: 'Checked Out', color: 'warning', icon: <LocalShippingIcon /> },
            MAINTENANCE: { label: 'Maintenance', color: 'error', icon: <BuildIcon /> },
            MISSING: { label: 'Missing', color: 'error', icon: <InfoIcon /> },
            RETIRED: { label: 'Retired', color: 'default', icon: <InfoIcon /> },
        };

        const config = statusConfig[status] || { label: status, color: 'default', icon: <InfoIcon /> };
        return (
            <Chip 
                label={config.label} 
                color={config.color} 
                icon={config.icon}
                sx={{ fontWeight: 600 }}
            />
        );
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
        }).format(amount || 0);
    };

    // Timeline helper functions
    const getEventIcon = (type) => {
        switch (type) {
            case 'checkout':
                return <CheckoutIcon />;
            case 'checkin':
                return <CheckinIcon />;
            case 'maintenance_scheduled':
            case 'maintenance_completed':
                return <BuildIcon />;
            case 'created':
                return <CreatedIcon />;
            default:
                return <ScheduleIcon />;
        }
    };

    const getEventColor = (type, status) => {
        if (type === 'checkin' && status === 'completed') return 'success';
        if (type === 'checkout') return 'primary';
        if (type.includes('maintenance')) return 'warning';
        if (type === 'created') return 'info';
        return 'grey';
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

    const getRelativeTime = (timestamp) => {
        if (!timestamp) return '';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return formatDate(timestamp);
    };

    if (loading) {
        return (
            <AdminLayout appBarTitle="Equipment Details">
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            </AdminLayout>
        );
    }

    if (!equipment) {
        return (
            <AdminLayout appBarTitle="Equipment Details">
                <Alert severity="error">Equipment not found</Alert>
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/equipment')}
                    sx={{ mt: 2 }}
                >
                    Back to Dashboard
                </Button>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            appBarTitle="Equipment Details"
            pageTitle={equipment.name}
            pageSubtitle={`Asset ID: ${equipment.assetId}`}
            actions={
                <>
                    <Button
                        variant="outlined"
                        startIcon={<ArrowBackIcon />}
                        onClick={() => navigate('/equipment')}
                        sx={{ mr: 1 }}
                    >
                        Back
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<EditIcon />}
                        onClick={() => navigate(`/equipment/${assetId}/edit`)}
                        sx={{ mr: 1 }}
                    >
                        Edit
                    </Button>
                    {claims?.role === 'admin' && (
                        <Button
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteIcon />}
                            onClick={() => setDeleteDialogOpen(true)}
                        >
                            Retire
                        </Button>
                    )}
                </>
            }
        >
            {/* Tabs Navigation */}
            <Paper sx={{ mb: 3, borderRadius: 2 }}>
                <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        borderBottom: 1,
                        borderColor: 'divider',
                        '& .MuiTab-root': {
                            minHeight: 64,
                            textTransform: 'none',
                            fontWeight: 500,
                        },
                    }}
                >
                    <Tab 
                        icon={<DashboardIcon />} 
                        label="Overview" 
                        iconPosition="start"
                        {...a11yProps(0)} 
                    />
                    <Tab 
                        icon={<TimelineIcon />} 
                        label="Timeline" 
                        iconPosition="start"
                        {...a11yProps(1)} 
                    />
                    <Tab 
                        icon={<BuildIcon />} 
                        label="Maintenance" 
                        iconPosition="start"
                        {...a11yProps(2)} 
                    />
                    <Tab 
                        icon={<DescriptionIcon />} 
                        label="Documents" 
                        iconPosition="start"
                        {...a11yProps(3)} 
                    />
                </Tabs>
            </Paper>

            {/* ============== TAB 0: OVERVIEW ============== */}
            <TabPanel value={activeTab} index={0}>
                <Grid container spacing={3}>
                    {/* Left Column - QR Code and Status */}
                    <Grid item xs={12} md={4}>
                        {/* QR Code Card */}
                        <Card sx={{ mb: 3 }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    QR Code
                                </Typography>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        bgcolor: 'grey.100',
                                        p: 3,
                                        borderRadius: 2,
                                        mb: 2,
                                    }}
                                >
                                    {equipment.qrCodeUrl ? (
                                        <img
                                            src={equipment.qrCodeUrl}
                                            alt={`QR Code for ${equipment.assetId}`}
                                            style={{
                                                width: '100%',
                                                maxWidth: 200,
                                                height: 'auto',
                                            }}
                                        />
                                    ) : (
                                        <QrCodeIcon sx={{ fontSize: 100, color: 'grey.400' }} />
                                    )}
                                </Box>
                                <Stack spacing={1}>
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        size="small"
                                        startIcon={<QrCodeIcon />}
                                        onClick={() => setQrDialogOpen(true)}
                                    >
                                        View Full Size
                                    </Button>
                                    <Stack direction="row" spacing={1}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            startIcon={<DownloadIcon />}
                                            onClick={handleDownloadQR}
                                        >
                                            Download
                                        </Button>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            startIcon={<PrintIcon />}
                                            onClick={handlePrintQR}
                                        >
                                            Print
                                        </Button>
                                    </Stack>
                                </Stack>
                            </CardContent>
                        </Card>

                        {/* Status Card */}
                        <Card sx={{ mb: 3 }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Current Status
                                </Typography>
                                <Box sx={{ mb: 2 }}>
                                    {getStatusChip(equipment.status)}
                                </Box>
                                {equipment.currentHolder && (
                                    <Box sx={{ 
                                        p: 2, 
                                        bgcolor: 'warning.lighter', 
                                        borderRadius: 2,
                                        border: '1px solid',
                                        borderColor: 'warning.light'
                                    }}>
                                        <Typography variant="body2" color="text.secondary" gutterBottom>
                                            Current Holder:
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Avatar sx={{ width: 32, height: 32, bgcolor: 'warning.main' }}>
                                                {equipment.currentHolder.name?.charAt(0)}
                                            </Avatar>
                                            <Box>
                                                <Typography variant="body1" fontWeight="medium">
                                                    {equipment.currentHolder.name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {equipment.currentHolder.email}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Box>
                                )}
                            </CardContent>
                        </Card>

                        {/* Recent Activity Widget - THE KEY FIX! */}
                        <Card sx={{ 
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white'
                        }}>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <HistoryIcon /> Recent Activity
                                    </Typography>
                                    <Chip 
                                        label={`${recentActivity.length} events`} 
                                        size="small" 
                                        sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                                    />
                                </Box>
                                
                                {recentActivity.length === 0 ? (
                                    <Box sx={{ textAlign: 'center', py: 2, opacity: 0.8 }}>
                                        <ScheduleIcon sx={{ fontSize: 40, mb: 1 }} />
                                        <Typography variant="body2">No activity yet</Typography>
                                    </Box>
                                ) : (
                                    <List dense sx={{ p: 0 }}>
                                        {recentActivity.slice(0, 5).map((event, index) => (
                                            <ListItem 
                                                key={event.id || index} 
                                                sx={{ 
                                                    px: 0, 
                                                    py: 1,
                                                    borderBottom: index < recentActivity.length - 1 ? '1px solid rgba(255,255,255,0.1)' : 'none'
                                                }}
                                            >
                                                <ListItemIcon sx={{ minWidth: 36 }}>
                                                    <Avatar sx={{ 
                                                        width: 28, 
                                                        height: 28, 
                                                        bgcolor: 'rgba(255,255,255,0.2)',
                                                        color: 'white'
                                                    }}>
                                                        {getEventIcon(event.type)}
                                                    </Avatar>
                                                </ListItemIcon>
                                                <ListItemText
                                                    primary={
                                                        <Typography variant="body2" sx={{ color: 'white', fontWeight: 500 }}>
                                                            {getEventTitle(event)}
                                                        </Typography>
                                                    }
                                                    secondary={
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                                            {event.user?.name && `${event.user.name} • `}
                                                            {getRelativeTime(event.timestamp)}
                                                        </Typography>
                                                    }
                                                />
                                            </ListItem>
                                        ))}
                                    </List>
                                )}
                                
                                <Button 
                                    fullWidth 
                                    variant="outlined" 
                                    size="small"
                                    onClick={() => setActiveTab(1)}
                                    sx={{ 
                                        mt: 2, 
                                        color: 'white', 
                                        borderColor: 'rgba(255,255,255,0.5)',
                                        '&:hover': {
                                            borderColor: 'white',
                                            bgcolor: 'rgba(255,255,255,0.1)'
                                        }
                                    }}
                                >
                                    View Full Timeline →
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Right Column - Details */}
                    <Grid item xs={12} md={8}>
                        {/* Basic Information */}
                        <Card sx={{ mb: 3 }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Basic Information
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="body2" color="text.secondary">Category</Typography>
                                        <Typography variant="body1" fontWeight="medium">{equipment.category}</Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="body2" color="text.secondary">Model</Typography>
                                        <Typography variant="body1" fontWeight="medium">{equipment.model || 'N/A'}</Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="body2" color="text.secondary">Serial Number</Typography>
                                        <Typography variant="body1" fontWeight="medium">{equipment.serialNumber || 'N/A'}</Typography>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="body2" color="text.secondary">Manufacturer</Typography>
                                        <Typography variant="body1" fontWeight="medium">{equipment.manufacturer || 'N/A'}</Typography>
                                    </Grid>
                                    {equipment.description && (
                                        <Grid item xs={12}>
                                            <Typography variant="body2" color="text.secondary">Description</Typography>
                                            <Typography variant="body1">{equipment.description}</Typography>
                                        </Grid>
                                    )}
                                </Grid>
                            </CardContent>
                        </Card>

                        {/* Financial Information */}
                        <Card sx={{ mb: 3 }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <MoneyIcon color="success" /> Financial Details
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={6} sm={3}>
                                        <Typography variant="body2" color="text.secondary">Purchase Date</Typography>
                                        <Typography variant="body1" fontWeight="medium">{formatDate(equipment.purchaseDate)}</Typography>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <Typography variant="body2" color="text.secondary">Purchase Price</Typography>
                                        <Typography variant="body1" fontWeight="medium" color="primary">{formatCurrency(equipment.purchasePrice)}</Typography>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <Typography variant="body2" color="text.secondary">Book Value</Typography>
                                        <Typography variant="body1" fontWeight="medium">{formatCurrency(equipment.bookValue)}</Typography>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <Typography variant="body2" color="text.secondary">Daily Rental</Typography>
                                        <Typography variant="body1" fontWeight="medium" color="success.main">{formatCurrency(equipment.dailyRentalRate)}</Typography>
                                    </Grid>
                                </Grid>
                            </CardContent>
                        </Card>

                        {/* Location & Usage Stats */}
                        <Grid container spacing={3}>
                            <Grid item xs={12} sm={6}>
                                <Card sx={{ height: '100%' }}>
                                    <CardContent>
                                        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <PlaceIcon color="error" /> Location
                                        </Typography>
                                        <Box sx={{ mb: 2 }}>
                                            <Typography variant="body2" color="text.secondary">Home Location</Typography>
                                            <Typography variant="body1" fontWeight="medium">{equipment.homeLocation || 'N/A'}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="body2" color="text.secondary">Current Location</Typography>
                                            <Typography variant="body1" fontWeight="medium">{equipment.currentLocation || equipment.homeLocation || 'N/A'}</Typography>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <Card sx={{ height: '100%' }}>
                                    <CardContent>
                                        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <TrendingUpIcon color="primary" /> Usage Statistics
                                        </Typography>
                                        <Grid container spacing={1}>
                                            <Grid item xs={4} sx={{ textAlign: 'center' }}>
                                                <Typography variant="h4" fontWeight="bold" color="primary">
                                                    {equipment.utilizationRate?.toFixed(0) || 0}%
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">Utilization</Typography>
                                            </Grid>
                                            <Grid item xs={4} sx={{ textAlign: 'center' }}>
                                                <Typography variant="h4" fontWeight="bold">
                                                    {equipment.totalDaysUsed || 0}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">Days Used</Typography>
                                            </Grid>
                                            <Grid item xs={4} sx={{ textAlign: 'center' }}>
                                                <Typography variant="h4" fontWeight="bold">
                                                    {equipment.totalCheckouts || 0}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">Checkouts</Typography>
                                            </Grid>
                                        </Grid>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </Grid>
                </Grid>
            </TabPanel>

            {/* ============== TAB 1: TIMELINE ============== */}
            <TabPanel value={activeTab} index={1}>
                {/* Stats Cards */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={6} sm={3}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <CheckoutIcon color="primary" sx={{ fontSize: 32, mb: 1 }} />
                                <Typography variant="h4" fontWeight="bold">{historyStats.totalCheckouts}</Typography>
                                <Typography variant="body2" color="text.secondary">Total Checkouts</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <BuildIcon color="warning" sx={{ fontSize: 32, mb: 1 }} />
                                <Typography variant="h4" fontWeight="bold">{historyStats.totalMaintenance}</Typography>
                                <Typography variant="body2" color="text.secondary">Maintenance Events</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <ErrorIcon color="error" sx={{ fontSize: 32, mb: 1 }} />
                                <Typography variant="h4" fontWeight="bold">{historyStats.totalDamages}</Typography>
                                <Typography variant="body2" color="text.secondary">Damage Reports</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Card>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <ScheduleIcon color="info" sx={{ fontSize: 32, mb: 1 }} />
                                <Typography variant="h4" fontWeight="bold">{historyStats.avgCheckoutDuration}</Typography>
                                <Typography variant="body2" color="text.secondary">Avg. Days/Checkout</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>

                {/* Filters */}
                <Paper sx={{ p: 2, mb: 3 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} md={5}>
                            <TextField
                                fullWidth
                                size="small"
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
                        <Grid item xs={12} md={4}>
                            <TextField
                                select
                                fullWidth
                                size="small"
                                label="Filter by Type"
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value)}
                            >
                                <MenuItem value="all">All Events</MenuItem>
                                <MenuItem value="checkout">Checkouts</MenuItem>
                                <MenuItem value="checkin">Check-ins</MenuItem>
                                <MenuItem value="maintenance_scheduled">Maintenance</MenuItem>
                                <MenuItem value="created">Created</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={12} md={3}>
                            <Button
                                fullWidth
                                variant="outlined"
                                startIcon={<RefreshIcon />}
                                onClick={fetchHistory}
                                disabled={historyLoading}
                            >
                                Refresh
                            </Button>
                        </Grid>
                    </Grid>
                    <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary">
                            Showing {filteredHistory.length} of {history.length} events
                        </Typography>
                        {(filterType !== 'all' || searchQuery) && (
                            <Button size="small" onClick={() => { setFilterType('all'); setSearchQuery(''); }}>
                                Clear Filters
                            </Button>
                        )}
                    </Box>
                </Paper>

                {/* Timeline Content */}
                {historyLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                        <CircularProgress />
                    </Box>
                ) : filteredHistory.length === 0 ? (
                    <Paper sx={{ p: 6, textAlign: 'center' }}>
                        <HistoryIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
                        <Typography variant="h6" color="text.secondary">No events found</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {history.length === 0 ? 'This equipment has no recorded history yet.' : 'Try adjusting your filters.'}
                        </Typography>
                    </Paper>
                ) : (
                    <Timeline position="alternate">
                        {filteredHistory.map((event, index) => (
                            <TimelineItem key={event.id || index}>
                                <TimelineOppositeContent color="text.secondary">
                                    <Typography variant="caption" display="block">
                                        {formatDateTime(event.timestamp)}
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
                                                        <strong>Expected Return:</strong> {formatDateTime(event.details.expectedReturnDate)}
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
                                            </Box>
                                        )}

                                        {/* Maintenance Details */}
                                        {(event.type === 'maintenance_scheduled' || event.type === 'maintenance_completed') && (
                                            <Box>
                                                {event.details?.issueType && (
                                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                                        <strong>Issue:</strong> {event.details.issueType.replace('_', ' ')}
                                                    </Typography>
                                                )}
                                                {event.details?.priority && (
                                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                                        <strong>Priority:</strong> {event.details.priority}
                                                    </Typography>
                                                )}
                                                {event.details?.totalCost && (
                                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                                        <strong>Cost:</strong> {formatCurrency(event.details.totalCost)}
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
                                            </Box>
                                        )}
                                    </Paper>
                                </TimelineContent>
                            </TimelineItem>
                        ))}
                    </Timeline>
                )}
            </TabPanel>

            {/* ============== TAB 2: MAINTENANCE ============== */}
            <TabPanel value={activeTab} index={2}>
                <Grid container spacing={3}>
                    {/* Maintenance Overview */}
                    <Grid item xs={12} md={4}>
                        <Card sx={{ height: '100%' }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <BuildIcon color="warning" /> Equipment Health
                                </Typography>
                                <Box sx={{ textAlign: 'center', py: 3 }}>
                                    <Box sx={{
                                        width: 120,
                                        height: 120,
                                        borderRadius: '50%',
                                        border: '8px solid',
                                        borderColor: equipment.status === 'MAINTENANCE' ? 'warning.main' : 'success.main',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        mx: 'auto',
                                        mb: 2
                                    }}>
                                        <Typography variant="h3" fontWeight="bold" color={equipment.status === 'MAINTENANCE' ? 'warning.main' : 'success.main'}>
                                            {equipment.status === 'MAINTENANCE' ? '!' : '✓'}
                                        </Typography>
                                    </Box>
                                    <Typography variant="h6" color={equipment.status === 'MAINTENANCE' ? 'warning.main' : 'success.main'}>
                                        {equipment.status === 'MAINTENANCE' ? 'Under Maintenance' : 'Healthy'}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Last checked: {formatDate(equipment.lastMaintenanceDate) || 'Never'}
                                    </Typography>
                                </Box>
                                <Divider sx={{ my: 2 }} />
                                <Stack spacing={1}>
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        color="warning"
                                        startIcon={<BuildIcon />}
                                        onClick={() => navigate(`/equipment/${assetId}/maintenance/schedule`)}
                                    >
                                        Schedule Maintenance
                                    </Button>
                                </Stack>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Maintenance History */}
                    <Grid item xs={12} md={8}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Maintenance History
                                </Typography>
                                {historyStats.totalMaintenance === 0 ? (
                                    <Box sx={{ textAlign: 'center', py: 6 }}>
                                        <BuildIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
                                        <Typography variant="h6" color="text.secondary">No maintenance records</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            This equipment has not required any maintenance yet.
                                        </Typography>
                                    </Box>
                                ) : (
                                    <List>
                                        {history
                                            .filter(h => h.type.includes('maintenance'))
                                            .slice(0, 5)
                                            .map((event, index) => (
                                                <ListItem key={event.id || index} divider>
                                                    <ListItemAvatar>
                                                        <Avatar sx={{ bgcolor: event.type === 'maintenance_completed' ? 'success.main' : 'warning.main' }}>
                                                            <BuildIcon />
                                                        </Avatar>
                                                    </ListItemAvatar>
                                                    <ListItemText
                                                        primary={getEventTitle(event)}
                                                        secondary={
                                                            <>
                                                                {event.details?.issueType && `${event.details.issueType} • `}
                                                                {formatDateTime(event.timestamp)}
                                                                {event.details?.totalCost && ` • ${formatCurrency(event.details.totalCost)}`}
                                                            </>
                                                        }
                                                    />
                                                    <Chip
                                                        label={event.status || 'completed'}
                                                        size="small"
                                                        color={event.status === 'completed' ? 'success' : 'warning'}
                                                    />
                                                </ListItem>
                                            ))}
                                    </List>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </TabPanel>

            {/* ============== TAB 3: DOCUMENTS ============== */}
            <TabPanel value={activeTab} index={3}>
                <Grid container spacing={3}>
                    {/* Warranty */}
                    <Grid item xs={12} md={4}>
                        <Card sx={{ height: '100%' }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <WarrantyIcon color="primary" /> Warranty
                                </Typography>
                                <Box sx={{ textAlign: 'center', py: 3 }}>
                                    <FileIcon sx={{ fontSize: 48, color: 'grey.300', mb: 2 }} />
                                    <Typography variant="body1" color="text.secondary">
                                        {equipment.warrantyExpiry ? (
                                            <>
                                                Expires: {formatDate(equipment.warrantyExpiry)}
                                                <Chip 
                                                    label={new Date(equipment.warrantyExpiry) > new Date() ? 'Active' : 'Expired'}
                                                    size="small"
                                                    color={new Date(equipment.warrantyExpiry) > new Date() ? 'success' : 'error'}
                                                    sx={{ ml: 1 }}
                                                />
                                            </>
                                        ) : (
                                            'No warranty information'
                                        )}
                                    </Typography>
                                </Box>
                                <Button fullWidth variant="outlined" startIcon={<DownloadIcon />} disabled>
                                    Upload Warranty Document
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Insurance */}
                    <Grid item xs={12} md={4}>
                        <Card sx={{ height: '100%' }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <InsuranceIcon color="success" /> Insurance
                                </Typography>
                                <Box sx={{ textAlign: 'center', py: 3 }}>
                                    <FileIcon sx={{ fontSize: 48, color: 'grey.300', mb: 2 }} />
                                    <Typography variant="body1" color="text.secondary">
                                        {equipment.insurancePolicy ? (
                                            <>Policy: {equipment.insurancePolicy}</>
                                        ) : (
                                            'No insurance information'
                                        )}
                                    </Typography>
                                </Box>
                                <Button fullWidth variant="outlined" startIcon={<DownloadIcon />} disabled>
                                    Upload Insurance Document
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Manuals */}
                    <Grid item xs={12} md={4}>
                        <Card sx={{ height: '100%' }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <ManualIcon color="info" /> Manuals & Docs
                                </Typography>
                                <Box sx={{ textAlign: 'center', py: 3 }}>
                                    <FolderIcon sx={{ fontSize: 48, color: 'grey.300', mb: 2 }} />
                                    <Typography variant="body1" color="text.secondary">
                                        No documents uploaded
                                    </Typography>
                                </Box>
                                <Button fullWidth variant="outlined" startIcon={<DownloadIcon />} disabled>
                                    Upload Document
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Document Upload Info */}
                    <Grid item xs={12}>
                        <Alert severity="info" icon={<InfoIcon />}>
                            <Typography variant="body2">
                                <strong>Coming Soon:</strong> Document management feature is under development. 
                                You'll be able to upload warranties, insurance papers, user manuals, and other equipment-related documents here.
                            </Typography>
                        </Alert>
                    </Grid>
                </Grid>
            </TabPanel>

            {/* QR Code Dialog */}
            <Dialog
                open={qrDialogOpen}
                onClose={() => setQrDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    QR Code - {equipment.assetId}
                </DialogTitle>
                <DialogContent>
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            p: 3,
                        }}
                    >
                        {equipment.qrCodeUrl ? (
                            <img
                                src={equipment.qrCodeUrl}
                                alt={`QR Code for ${equipment.assetId}`}
                                style={{
                                    width: '100%',
                                    maxWidth: 400,
                                    height: 'auto',
                                }}
                            />
                        ) : (
                            <Typography color="text.secondary">
                                QR Code not available
                            </Typography>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleDownloadQR} startIcon={<DownloadIcon />}>
                        Download
                    </Button>
                    <Button onClick={handlePrintQR} startIcon={<PrintIcon />}>
                        Print
                    </Button>
                    <Button onClick={() => setQrDialogOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
            >
                <DialogTitle>Retire Equipment?</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to retire <strong>{equipment.name}</strong>?
                        This will mark it as retired and it will no longer be available for checkout.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleRetire} color="error" variant="contained">
                        Retire Equipment
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminLayout>
    );
};

export default EquipmentDetailPage;
