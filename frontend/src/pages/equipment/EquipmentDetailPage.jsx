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
    IconButton,
    Tooltip,
    Stack,
    Avatar,
} from '@mui/material';
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
} from '@mui/icons-material';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from '../../components/layout/AdminLayout';
import { equipmentAPI } from '../../services/equipmentApi';
import toast from 'react-hot-toast';

const EquipmentDetailPage = () => {
    const { assetId } = useParams();
    const navigate = useNavigate();
    const { claims } = useAuth();
    const [loading, setLoading] = useState(true);
    const [equipment, setEquipment] = useState(null);
    const [qrDialogOpen, setQrDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    useEffect(() => {
        fetchEquipmentDetails();
    }, [assetId]);

    const fetchEquipmentDetails = async () => {
        setLoading(true);
        try {
            const response = await equipmentAPI.getById(assetId);
            setEquipment(response.data);
        } catch (error) {
            console.error('Error fetching equipment details:', error);
            toast.error('Failed to load equipment details');
        } finally {
            setLoading(false);
        }
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
            <Grid container spacing={3}>
                {/* Left Column - QR Code and Basic Info */}
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
                                            maxWidth: 250,
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
                                    startIcon={<QrCodeIcon />}
                                    onClick={() => setQrDialogOpen(true)}
                                >
                                    View Full Size
                                </Button>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    startIcon={<DownloadIcon />}
                                    onClick={handleDownloadQR}
                                >
                                    Download QR
                                </Button>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    startIcon={<PrintIcon />}
                                    onClick={handlePrintQR}
                                >
                                    Print QR
                                </Button>
                            </Stack>
                        </CardContent>
                    </Card>

                    {/* Status Card */}
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Status
                            </Typography>
                            <Box sx={{ mb: 2 }}>
                                {getStatusChip(equipment.status)}
                            </Box>
                            {equipment.currentHolder && (
                                <Box>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Current Holder:
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
                                        {equipment.currentHolder.name}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {equipment.currentHolder.email}
                                    </Typography>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Right Column - Detailed Information */}
                <Grid item xs={12} md={8}>
                    {/* Basic Information */}
                    <Card sx={{ mb: 3 }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Basic Information
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Category
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
                                        {equipment.category}
                                    </Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Model
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
                                        {equipment.model || 'N/A'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Serial Number
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
                                        {equipment.serialNumber || 'N/A'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Manufacturer
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
                                        {equipment.manufacturer || 'N/A'}
                                    </Typography>
                                </Grid>
                                {equipment.description && (
                                    <Grid item xs={12}>
                                        <Typography variant="body2" color="text.secondary">
                                            Description
                                        </Typography>
                                        <Typography variant="body1">
                                            {equipment.description}
                                        </Typography>
                                    </Grid>
                                )}
                            </Grid>
                        </CardContent>
                    </Card>

                    {/* Financial Information */}
                    <Card sx={{ mb: 3 }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Financial Details
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Purchase Date
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
                                        {formatDate(equipment.purchaseDate)}
                                    </Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Purchase Price
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
                                        {formatCurrency(equipment.purchasePrice)}
                                    </Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Current Book Value
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
                                        {formatCurrency(equipment.bookValue)}
                                    </Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Daily Rental Rate
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
                                        {formatCurrency(equipment.dailyRentalRate)}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>

                    {/* Location Information */}
                    <Card sx={{ mb: 3 }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Location
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Home Location
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
                                        {equipment.homeLocation || 'N/A'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography variant="body2" color="text.secondary">
                                        Current Location
                                    </Typography>
                                    <Typography variant="body1" fontWeight="medium">
                                        {equipment.currentLocation || equipment.homeLocation || 'N/A'}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>

                    {/* Usage Statistics */}
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Usage Statistics
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={4}>
                                    <Typography variant="body2" color="text.secondary">
                                        Utilization Rate
                                    </Typography>
                                    <Typography variant="h5" fontWeight="bold" color="primary">
                                        {equipment.utilizationRate?.toFixed(1) || 0}%
                                    </Typography>
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <Typography variant="body2" color="text.secondary">
                                        Total Days Used
                                    </Typography>
                                    <Typography variant="h5" fontWeight="bold">
                                        {equipment.totalDaysUsed || 0}
                                    </Typography>
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <Typography variant="body2" color="text.secondary">
                                        Total Checkouts
                                    </Typography>
                                    <Typography variant="h5" fontWeight="bold">
                                        {equipment.totalCheckouts || 0}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

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
