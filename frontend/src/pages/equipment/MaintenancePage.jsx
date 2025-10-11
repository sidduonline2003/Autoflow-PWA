import React from 'react';
import {
    Container,
    Typography,
    Paper,
    Alert,
    Box,
    Button,
} from '@mui/material';
import { Construction as ConstructionIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';

const MaintenancePage = () => {
    const navigate = useNavigate();

    return (
        <AdminLayout
            appBarTitle="Equipment Maintenance"
            pageTitle="Maintenance Management"
            pageSubtitle="Schedule and track equipment maintenance"
        >
            <Paper sx={{ p: 4, textAlign: 'center' }}>
                <ConstructionIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h5" gutterBottom>
                    Maintenance Module
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    This feature is under development
                </Typography>

                <Alert severity="info" sx={{ mt: 3, textAlign: 'left' }}>
                    <Typography variant="subtitle2" gutterBottom>
                        Coming Soon:
                    </Typography>
                    <ul>
                        <li>Schedule preventive maintenance</li>
                        <li>Track maintenance history</li>
                        <li>Vendor management</li>
                        <li>Parts inventory</li>
                        <li>Cost tracking</li>
                        <li>Maintenance calendar view</li>
                    </ul>
                </Alert>

                <Box sx={{ mt: 3 }}>
                    <Button variant="outlined" onClick={() => navigate('/equipment')}>
                        Back to Dashboard
                    </Button>
                </Box>
            </Paper>
        </AdminLayout>
    );
};

export default MaintenancePage;
