import React, { useState } from 'react';
import {
    Box,
    Container,
    Typography,
    Paper,
    Button,
    Alert,
    Card,
    CardContent,
    Stepper,
    Step,
    StepLabel,
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import CheckoutFlow from '../../components/equipment/CheckoutFlow';

const CheckoutFlowPage = () => {
    const navigate = useNavigate();
    const [checkoutComplete, setCheckoutComplete] = useState(false);

    const handleCheckoutComplete = (data) => {
        console.log('Checkout completed:', data);
        setCheckoutComplete(true);
        
        // Redirect after success
        setTimeout(() => {
            navigate('/equipment/my-checkouts');
        }, 2000);
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
                    Checkout Equipment
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Follow the steps below to checkout equipment for your event
                </Typography>

                {!checkoutComplete ? (
                    <CheckoutFlow onComplete={handleCheckoutComplete} />
                ) : (
                    <Alert severity="success">
                        <Typography variant="body1" fontWeight="bold">
                            Checkout Complete!
                        </Typography>
                        <Typography variant="body2">
                            Equipment has been successfully checked out. Redirecting to your equipment list...
                        </Typography>
                    </Alert>
                )}
            </Paper>

            <Alert severity="info" sx={{ mt: 3 }}>
                <Typography variant="body2">
                    <strong>Note:</strong> Make sure your backend API is running to complete the checkout. API
                    endpoint: <code>POST /api/equipment/checkout</code>
                </Typography>
            </Alert>
        </Container>
    );
};

export default CheckoutFlowPage;
