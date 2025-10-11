import React, { useState, useEffect } from 'react';
import {
    Box,
    Container,
    Typography,
    Paper,
    Button,
    Card,
    CardContent,
    Grid,
    Chip,
    Alert,
    CircularProgress,
    Stack,
} from '@mui/material';
import {
    ArrowBack as ArrowBackIcon,
    QrCodeScanner as QrCodeScannerIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { equipmentAPI } from '../../services/equipmentApi';
import toast from 'react-hot-toast';

const MyEquipmentPage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [checkouts, setCheckouts] = useState([]);

    // Fetch checkouts from backend
    useEffect(() => {
        fetchCheckouts();
    }, [user]);

    const fetchCheckouts = async () => {
        if (!user) return;
        
        setLoading(true);
        try {
            const response = await equipmentAPI.getMyCheckouts();
            setCheckouts(response.data);
        } catch (error) {
            console.error('Error fetching checkouts:', error);
            toast.error('Failed to load your equipment');
        } finally {
            setLoading(false);
        }
    };

    const getDaysRemaining = (returnDate) => {
        const today = new Date();
        // Handle both Date objects and Firestore timestamps
        const returnDateTime = returnDate instanceof Date ? returnDate : 
                              (returnDate?._seconds ? new Date(returnDate._seconds * 1000) : new Date(returnDate));
        const diffTime = returnDateTime - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    };

    const getStatusChip = (checkout) => {
        const daysRemaining = getDaysRemaining(checkout.expectedReturnDate);

        if (daysRemaining < 0) {
            return (
                <Chip
                    label={`Overdue by ${Math.abs(daysRemaining)} days`}
                    color="error"
                    size="small"
                    icon={<WarningIcon />}
                />
            );
        } else if (daysRemaining === 0) {
            return <Chip label="Due Today" color="warning" size="small" />;
        } else if (daysRemaining <= 2) {
            return <Chip label={`Due in ${daysRemaining} days`} color="warning" size="small" />;
        } else {
            return (
                <Chip
                    label={`${daysRemaining} days remaining`}
                    color="success"
                    size="small"
                    icon={<CheckCircleIcon />}
                />
            );
        }
    };

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }}>
                Back
            </Button>

            <Paper sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Box>
                        <Typography variant="h5" fontWeight="bold">
                            My Equipment
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Equipment currently checked out to you
                        </Typography>
                    </Box>
                    <Button
                        variant="contained"
                        startIcon={<QrCodeScannerIcon />}
                        onClick={() => navigate('/equipment/checkin')}
                    >
                        Check-in
                    </Button>
                </Box>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                        <CircularProgress />
                    </Box>
                ) : checkouts.length === 0 ? (
                    <Alert severity="info">
                        You don't have any equipment checked out. Click the button below to checkout equipment.
                        <Box sx={{ mt: 2 }}>
                            <Button variant="contained" onClick={() => navigate('/equipment/checkout')}>
                                Checkout Equipment
                            </Button>
                        </Box>
                    </Alert>
                ) : (
                    <Grid container spacing={3}>
                        {checkouts.map((checkout) => {
                            // Handle Firestore timestamp format
                            const parseDate = (date) => {
                                if (date instanceof Date) return date;
                                if (date?._seconds) return new Date(date._seconds * 1000);
                                return new Date(date);
                            };
                            
                            const expectedReturn = parseDate(checkout.expectedReturnDate);
                            const checkedOut = parseDate(checkout.checkedOutAt);
                            
                            return (
                                <Grid item xs={12} md={6} key={checkout.checkoutId || checkout.id}>
                                    <Card
                                        sx={{
                                            border:
                                                getDaysRemaining(expectedReturn) < 0
                                                    ? '2px solid'
                                                    : 'none',
                                            borderColor: 'error.main',
                                        }}
                                    >
                                        <CardContent>
                                            <Stack spacing={2}>
                                                <Box>
                                                    <Typography variant="h6" fontWeight="bold">
                                                        {checkout.equipmentName || 'Equipment'}
                                                    </Typography>
                                                    <Typography variant="body2" color="text.secondary">
                                                        {checkout.assetId}
                                                    </Typography>
                                                </Box>

                                                <Box>
                                                    <Chip
                                                        label={checkout.category || 'misc'}
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{ mr: 1 }}
                                                    />
                                                    {getStatusChip(checkout)}
                                                </Box>

                                                <Box>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        Event:
                                                    </Typography>
                                                    <Typography variant="body2">
                                                        {checkout.eventName || 'N/A'}
                                                    </Typography>
                                                </Box>

                                                <Box>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        Checked out:
                                                    </Typography>
                                                    <Typography variant="body2">
                                                        {format(checkedOut, 'MMM d, yyyy h:mm a')}
                                                    </Typography>
                                                </Box>

                                                <Box>
                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                        Expected return:
                                                    </Typography>
                                                    <Typography variant="body2" fontWeight="medium">
                                                        {format(expectedReturn, 'MMM d, yyyy h:mm a')}
                                                    </Typography>
                                                </Box>

                                                <Button
                                                    variant="outlined"
                                                    fullWidth
                                                    onClick={() => navigate(`/equipment/checkin?checkout=${checkout.checkoutId || checkout.id}`)}
                                                >
                                                    Check-in Now
                                                </Button>
                                            </Stack>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            );
                        })}
                    </Grid>
                )}
            </Paper>

            {/* Refresh Button */}
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                <Button variant="outlined" onClick={fetchCheckouts} disabled={loading}>
                    {loading ? 'Loading...' : 'Refresh'}
                </Button>
            </Box>
        </Container>
    );
};

export default MyEquipmentPage;
