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
    Checkbox,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    Divider,
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
    CloudUpload as UploadIcon,
    Delete as DeleteIcon,
    Warning as WarningIcon,
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
    const [selectedItems, setSelectedItems] = useState([]);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
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

    // Checkbox handlers
    const handleSelectAll = (event) => {
        if (event.target.checked) {
            const allSelectableIds = filteredEquipment
                .filter(item => item.status !== 'CHECKED_OUT') // Can't delete checked out items
                .map(item => item.assetId);
            setSelectedItems(allSelectableIds);
        } else {
            setSelectedItems([]);
        }
    };

    const handleSelectOne = (assetId) => {
        setSelectedItems(prev => {
            if (prev.includes(assetId)) {
                return prev.filter(id => id !== assetId);
            } else {
                return [...prev, assetId];
            }
        });
    };

    const isSelected = (assetId) => selectedItems.includes(assetId);

    const isItemDeletable = (item) => {
        return item.status !== 'CHECKED_OUT';
    };

    // Delete handlers
    const handleDeleteClick = () => {
        if (selectedItems.length === 0) {
            toast.error('Please select at least one item to delete');
            return;
        }
        setDeleteDialogOpen(true);
    };

    const handleDeleteConfirm = async () => {
        setDeleting(true);
        try {
            const response = await equipmentAPI.bulkDeleteEquipment(selectedItems);
            
            if (response.data.deleted_count > 0) {
                toast.success(`Successfully deleted ${response.data.deleted_count} equipment item(s)`);
                
                // Show errors if any
                if (response.data.failed_count > 0) {
                    toast.error(`${response.data.failed_count} item(s) could not be deleted`);
                }
                
                // Refresh equipment list
                await fetchEquipment();
                setSelectedItems([]);
            } else {
                toast.error('No items were deleted');
            }
        } catch (error) {
            console.error('Error deleting equipment:', error);
            toast.error(error.response?.data?.detail || 'Failed to delete equipment');
        } finally {
            setDeleting(false);
            setDeleteDialogOpen(false);
        }
    };

    const handleDeleteCancel = () => {
        setDeleteDialogOpen(false);
    };

    const getSelectedItemsInfo = () => {
        const selected = equipment.filter(item => selectedItems.includes(item.assetId));
        const checkedOut = selected.filter(item => item.status === 'CHECKED_OUT');
        return {
            total: selected.length,
            checkedOut: checkedOut.length,
            deletable: selected.length - checkedOut.length
        };
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
                        variant="outlined"
                        startIcon={<UploadIcon />}
                        onClick={() => navigate('/equipment/bulk-upload')}
                        sx={{ mr: 1 }}
                    >
                        Bulk Upload
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
                    <Grid item xs={12} md={3}>
                        <Button startIcon={<FilterListIcon />} variant="outlined">
                            Filters
                        </Button>
                    </Grid>
                    <Grid item xs={12} md={3}>
                        {selectedItems.length > 0 && (
                            <Button
                                fullWidth
                                variant="contained"
                                color="error"
                                startIcon={<DeleteIcon />}
                                onClick={handleDeleteClick}
                            >
                                Delete ({selectedItems.length})
                            </Button>
                        )}
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
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        indeterminate={
                                            selectedItems.length > 0 && 
                                            selectedItems.length < filteredEquipment.filter(item => isItemDeletable(item)).length
                                        }
                                        checked={
                                            filteredEquipment.filter(item => isItemDeletable(item)).length > 0 &&
                                            selectedItems.length === filteredEquipment.filter(item => isItemDeletable(item)).length
                                        }
                                        onChange={handleSelectAll}
                                    />
                                </TableCell>
                                <TableCell>Asset ID</TableCell>
                                <TableCell>Name</TableCell>
                                <TableCell>Category</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Location</TableCell>
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredEquipment.map((item) => {
                                const isDeletable = isItemDeletable(item);
                                const itemSelected = isSelected(item.assetId);
                                
                                return (
                                    <TableRow 
                                        key={item.assetId} 
                                        hover
                                        selected={itemSelected}
                                        sx={{ opacity: isDeletable ? 1 : 0.6 }}
                                    >
                                        <TableCell padding="checkbox">
                                            <Checkbox
                                                checked={itemSelected}
                                                onChange={() => handleSelectOne(item.assetId)}
                                                disabled={!isDeletable}
                                            />
                                        </TableCell>
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
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                <Button 
                                                    size="small" 
                                                    variant="text"
                                                    onClick={() => navigate(`/equipment/${item.assetId}`)}
                                                >
                                                    View
                                                </Button>
                                                <Button 
                                                    size="small" 
                                                    variant="outlined"
                                                    onClick={() => navigate(`/equipment/${item.assetId}/history`)}
                                                >
                                                    History
                                                </Button>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
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

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={handleDeleteCancel}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <WarningIcon color="error" />
                        <Typography variant="h6">Confirm Delete</Typography>
                    </Box>
                </DialogTitle>
                <Divider />
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete {selectedItems.length} equipment item(s)?
                        This action cannot be undone.
                    </DialogContentText>
                    
                    {(() => {
                        const info = getSelectedItemsInfo();
                        return (
                            <Box sx={{ mt: 2 }}>
                                <Alert severity="warning" sx={{ mb: 2 }}>
                                    <Typography variant="body2" fontWeight="bold">
                                        Items to be deleted: {info.deletable}
                                    </Typography>
                                    {info.checkedOut > 0 && (
                                        <Typography variant="body2" color="error">
                                            {info.checkedOut} checked-out item(s) will be skipped
                                        </Typography>
                                    )}
                                </Alert>
                                
                                <Typography variant="body2" color="text.secondary">
                                    Selected equipment and all associated data will be permanently removed:
                                </Typography>
                                <Box component="ul" sx={{ mt: 1, pl: 2 }}>
                                    <Typography component="li" variant="body2">Equipment details</Typography>
                                    <Typography component="li" variant="body2">Checkout history</Typography>
                                    <Typography component="li" variant="body2">Maintenance records</Typography>
                                    <Typography component="li" variant="body2">QR codes</Typography>
                                </Box>
                            </Box>
                        );
                    })()}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button 
                        onClick={handleDeleteCancel} 
                        disabled={deleting}
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleDeleteConfirm} 
                        variant="contained"
                        color="error"
                        disabled={deleting}
                        startIcon={deleting ? <CircularProgress size={20} /> : <DeleteIcon />}
                    >
                        {deleting ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminLayout>
    );
};

export default EquipmentDashboardPage;
