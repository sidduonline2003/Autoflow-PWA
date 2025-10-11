import React, { useState, useEffect } from 'react';
import {
    Box,
    Container,
    Typography,
    Paper,
    Grid,
    Card,
    CardContent,
    Button,
    TextField,
    InputAdornment,
    Chip,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Alert,
} from '@mui/material';
import {
    Search as SearchIcon,
    Add as AddIcon,
    QrCodeScanner as QrCodeScannerIcon,
    FilterList as FilterListIcon,
    Inventory as InventoryIcon,
    CheckCircle as CheckCircleIcon,
    Build as BuildIcon,
    Error as ErrorIcon,
    LocalShipping as LocalShippingIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/layout/AdminLayout';
import { equipmentAPI } from '../../services/equipmentApi';
import toast from 'react-hot-toast';

const EquipmentDashboardPage = () => {
    const navigate = useNavigate();
    const { claims } = useAuth();
    const [loading, setLoading] = useState(true);
    const [equipment, setEquipment] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [stats, setStats] = useState({
        total: 0,
        available: 0,
        checkedOut: 0,
        maintenance: 0,
    });

    // Fetch equipment data from backend
    useEffect(() => {
        fetchEquipment();
    }, []);

    const fetchEquipment = async () => {
        setLoading(true);
        try {
            const response = await equipmentAPI.getAll();
            const data = response.data;
            
            setEquipment(data);

            // Calculate stats
            const statsData = {
                total: data.length,
                available: data.filter(e => e.status === 'AVAILABLE').length,
                checkedOut: data.filter(e => e.status === 'CHECKED_OUT').length,
                maintenance: data.filter(e => e.status === 'MAINTENANCE').length,
            };
            setStats(statsData);
        } catch (error) {
            console.error('Error fetching equipment:', error);
            toast.error('Failed to load equipment data');
        } finally {
            setLoading(false);
        }
    };

    const statsCards = [
        { label: 'Total Assets', value: stats.total, icon: InventoryIcon, color: 'primary' },
        { label: 'Available', value: stats.available, icon: CheckCircleIcon, color: 'success' },
        { label: 'Checked Out', value: stats.checkedOut, icon: LocalShippingIcon, color: 'warning' },
        { label: 'In Maintenance', value: stats.maintenance, icon: BuildIcon, color: 'error' },
    ];

    const getStatusChip = (status) => {
        const statusConfig = {
            AVAILABLE: { label: 'Available', color: 'success' },
            CHECKED_OUT: { label: 'Checked Out', color: 'warning' },
            MAINTENANCE: { label: 'Maintenance', color: 'error' },
            MISSING: { label: 'Missing', color: 'error' },
            RETIRED: { label: 'Retired', color: 'default' },
        };

        const config = statusConfig[status] || { label: status, color: 'default' };
        return <Chip label={config.label} color={config.color} size="small" />;
    };

    const filteredEquipment = equipment.filter(item => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            item.assetId?.toLowerCase().includes(query) ||
            item.name?.toLowerCase().includes(query) ||
            item.serialNumber?.toLowerCase().includes(query)
        );
    });

    return (
        <AdminLayout
            appBarTitle="Equipment Management"
            pageTitle="Equipment Dashboard"
            pageSubtitle="Manage your production equipment inventory"
            actions={
                <>
                    <Button
                        variant="outlined"
                        startIcon={<QrCodeScannerIcon />}
                        onClick={() => navigate('/equipment/scan')}
                        sx={{ mr: 1 }}
                    >
                        Scan QR
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={() => navigate('/equipment/create')}
                    >
                        Add Equipment
                    </Button>
                </>
            }
        >
            {/* Stats Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                {statsCards.map((stat) => {
                    const Icon = stat.icon;
                    return (
                        <Grid item xs={12} sm={6} md={3} key={stat.label}>
                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                        <Icon color={stat.color} sx={{ mr: 1 }} />
                                        <Typography variant="body2" color="text.secondary">
                                            {stat.label}
                                        </Typography>
                                    </Box>
                                    <Typography variant="h4" fontWeight="bold">
                                        {stat.value}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>

            {/* Search and Filters */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            placeholder="Search by name, ID, or serial number..."
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
                        <Button startIcon={<FilterListIcon />} variant="outlined">
                            Filters
                        </Button>
                    </Grid>
                </Grid>
            </Paper>

            {/* Equipment Table */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : filteredEquipment.length === 0 ? (
                <Alert severity="info">
                    {searchQuery 
                        ? 'No equipment found matching your search.'
                        : 'No equipment found. Click "Add Equipment" to create your first asset.'}
                </Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Asset ID</TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Category</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Location</TableCell>
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredEquipment.map((item) => (
                                <TableRow key={item.assetId} hover>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="medium">
                                            {item.assetId}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell>
                                        <Chip label={item.category} size="small" variant="outlined" />
                                    </TableCell>
                                    <TableCell>{getStatusChip(item.status)}</TableCell>
                                    <TableCell>{item.currentLocation || item.homeLocation || 'Not set'}</TableCell>
                                    <TableCell>
                                        <Button 
                                            size="small" 
                                            variant="text"
                                            onClick={() => navigate(`/equipment/${item.assetId}`)}
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

            {/* Refresh Button */}
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
                <Button variant="outlined" onClick={fetchEquipment} disabled={loading}>
                    {loading ? 'Loading...' : 'Refresh Data'}
                </Button>
            </Box>
        </AdminLayout>
    );
};

export default EquipmentDashboardPage;
