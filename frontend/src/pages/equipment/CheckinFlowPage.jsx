import React, { useState, useEffect } from 'react';
import {
    Box,
    Container,
    Typography,
    Paper,
    Button,
    Alert,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CheckinFlow from '../../components/equipment/CheckinFlow';

const CheckinFlowPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [checkinComplete, setCheckinComplete] = useState(false);
    
    // Get checkout ID from URL params if coming from "My Equipment" page
    const preloadedCheckoutId = searchParams.get('checkout');

    const handleCheckinComplete = (data) => {
        console.log('Check-in completed:', data);
        setCheckinComplete(true);
        
        // Redirect after success
        setTimeout(() => {
            navigate('/equipment/my-checkouts');
        }, 2000);
    };

    const handleCancel = () => {
        navigate(-1);
    };

    return (
        <Container maxWidth="md" sx={{ py: 4 }}>
            <Button
                startIcon={<ArrowBackIcon />}
                onClick={() => navigate(-1)}
                sx={{ mb: 2 }}
            >
                Back
            </Button>

            <Paper sx={{ p: 3 }}>
                <Typography variant="h5" gutterBottom fontWeight="bold">
                    Check-in Equipment
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Follow the steps below to return equipment
                </Typography>

                {!checkinComplete ? (
                    <CheckinFlow 
                        onComplete={handleCheckinComplete}
                        onCancel={handleCancel}
                        preloadedCheckoutId={preloadedCheckoutId}
                    />
                ) : (
                    <Alert severity="success">
                        <Typography variant="body1" fontWeight="bold">
                            Check-in Complete!
                        </Typography>
                        <Typography variant="body2">
                            Equipment has been successfully returned. Redirecting to your equipment list...
                        </Typography>
                    </Alert>
                )}
            </Paper>

            <Alert severity="info" sx={{ mt: 3 }}>
                <Typography variant="body2">
                    <strong>Note:</strong> Make sure your backend API is running to complete the check-in. API
                    endpoint: <code>POST /api/equipment/checkin</code>
                </Typography>
            </Alert>
        </Container>
    );
};

export default CheckinFlowPage;
