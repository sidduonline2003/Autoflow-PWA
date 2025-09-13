import React, { useState } from 'react';
import { Box, Tabs, Tab, Paper } from '@mui/material';
import ReceiptVerificationDashboard from '../components/ReceiptVerificationDashboard';
import AiAdminDashboard from '../components/AiAdminDashboard';

const AdminReceiptPage = () => {
    const [activeTab, setActiveTab] = useState(0);

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Paper sx={{ mb: 2 }}>
                <Tabs 
                    value={activeTab} 
                    onChange={handleTabChange}
                    variant="fullWidth"
                    indicatorColor="primary"
                    textColor="primary"
                >
                    <Tab label="Standard Verification" />
                    <Tab label="AI-Enhanced Admin" />
                </Tabs>
            </Paper>

            {activeTab === 0 && <ReceiptVerificationDashboard />}
            {activeTab === 1 && <AiAdminDashboard />}
        </Box>
    );
};

export default AdminReceiptPage;
