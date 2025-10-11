import React from 'react';
import {
    Container,
    Typography,
    Paper,
    Alert,
    Box,
    Button,
} from '@mui/material';
import { BarChart as BarChartIcon, ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';

const AnalyticsDashboardPage = () => {
    const navigate = useNavigate();

    return (
        <AdminLayout
            appBarTitle="Equipment Analytics"
            pageTitle="Analytics Dashboard"
            pageSubtitle="Equipment utilization, crew scores, and financial insights"
        >
            <Paper sx={{ p: 4, textAlign: 'center' }}>
                <BarChartIcon sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
                <Typography variant="h5" gutterBottom>
                    Analytics Dashboard
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    This feature is under development
                </Typography>

                <Alert severity="info" sx={{ mt: 3, textAlign: 'left' }}>
                    <Typography variant="subtitle2" gutterBottom>
                        Coming Soon:
                    </Typography>
                    <ul>
                        <li>Equipment utilization heatmap</li>
                        <li>Crew responsibility scores</li>
                        <li>Revenue tracking from external rentals</li>
                        <li>Maintenance cost analysis</li>
                        <li>Top/bottom performing assets</li>
                        <li>Downtime analysis</li>
                        <li>Utilization trends over time</li>
                        <li>Export reports to PDF/Excel</li>
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

export default AnalyticsDashboardPage;
