import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Tabs, Tab, Paper, Button, CircularProgress, Alert,
    Card, CardContent, Grid, Chip, IconButton, Tooltip
} from '@mui/material';
import {
    Add as AddIcon,
    Business as VendorIcon,
    Receipt as BillIcon,
    Autorenew as SubscriptionIcon,
    Dashboard as DashboardIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import APDashboard from './APDashboard';
import VendorManagement from './VendorManagement';
import BillManagement from './BillManagement';
import SubscriptionManagement from './SubscriptionManagement';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`ap-tabpanel-${index}`}
            aria-labelledby={`ap-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ p: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

const APHub = () => {
    const { user, claims } = useAuth();
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState(null);
    const [vendors, setVendors] = useState([]);
    const [bills, setBills] = useState([]);
    const [subscriptions, setSubscriptions] = useState([]);

    // Check authorization
    const isAuthorized = claims?.role === 'admin' || claims?.role === 'accountant';

    const callApi = async (endpoint, method = 'GET', body = null) => {
        if (!user) {
            throw new Error('Not authenticated');
        }
        
        const idToken = await user.getIdToken();
        const response = await fetch(`/api${endpoint}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            ...(body && { body: JSON.stringify(body) })
        });
        
        if (!response.ok) {
            const errorData = await response.text();
            let message = 'An error occurred';
            try {
                const parsed = JSON.parse(errorData);
                if (parsed.detail && Array.isArray(parsed.detail)) {
                    message = parsed.detail.map(err => `${err.loc.join('.')}: ${err.msg}`).join(', ');
                } else {
                    message = parsed.detail || parsed.message || message;
                }
            } catch {
                message = errorData || message;
            }
            throw new Error(message);
        }

        return response.json();
    };

    const loadData = useCallback(async () => {
        try {
            setLoading(true);

            const dashboardReq = callApi('/ap/dashboard');
            const vendorsReq = callApi('/ap/vendors');
            const billsReq = callApi('/ap/bills');
            const subscriptionsReq = callApi('/ap/subscriptions');

            const [dashboardRes, vendorsRes, billsRes, subscriptionsRes] = await Promise.allSettled([
                dashboardReq, vendorsReq, billsReq, subscriptionsReq
            ]);

            if (dashboardRes.status === 'fulfilled') setDashboardData(dashboardRes.value);
            if (vendorsRes.status === 'fulfilled') setVendors(vendorsRes.value);
            if (billsRes.status === 'fulfilled') setBills(billsRes.value);
            if (subscriptionsRes.status === 'fulfilled') setSubscriptions(subscriptionsRes.value);

            const firstRej = [dashboardRes, vendorsRes, billsRes, subscriptionsRes].find(r => r.status === 'rejected');
            if (firstRej) {
                console.warn('Some AP data failed to load:', firstRej.reason);
                toast.error(`Some data failed to load: ${firstRej.reason?.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('Error loading AP data:', error);
            toast.error('Failed to load AP data: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (!user || !isAuthorized) {
            setLoading(false);
            return;
        }
        loadData();
    }, [user, isAuthorized, loadData]);

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    if (!isAuthorized) {
        return (
            <Alert severity="error">
                You don't have permission to access the Accounts Payable module.
            </Alert>
        );
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" component="h2">
                    Vendor & Operating Expenses (AP)
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                        variant="outlined"
                        startIcon={<VendorIcon />}
                        onClick={() => setTabValue(1)}
                    >
                        Add Vendor
                    </Button>
                    <Button 
                        variant="contained"
                        startIcon={<BillIcon />}
                        onClick={() => setTabValue(2)}
                    >
                        New Bill
                    </Button>
                </Box>
            </Box>

            <Paper sx={{ width: '100%' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleTabChange}>
                        <Tab 
                            label="Dashboard" 
                            icon={<DashboardIcon />}
                            iconPosition="start"
                        />
                        <Tab 
                            label="Vendors" 
                            icon={<VendorIcon />}
                            iconPosition="start"
                        />
                        <Tab 
                            label="Bills" 
                            icon={<BillIcon />}
                            iconPosition="start"
                        />
                        <Tab 
                            label="Subscriptions" 
                            icon={<SubscriptionIcon />}
                            iconPosition="start"
                        />
                    </Tabs>
                </Box>

                {/* Dashboard Tab */}
                <TabPanel value={tabValue} index={0}>
                    <APDashboard 
                        data={dashboardData}
                        onRefresh={loadData}
                        onNavigate={setTabValue}
                    />
                </TabPanel>

                {/* Vendors Tab */}
                <TabPanel value={tabValue} index={1}>
                    <VendorManagement 
                        vendors={vendors}
                        onRefresh={loadData}
                    />
                </TabPanel>

                {/* Bills Tab */}
                <TabPanel value={tabValue} index={2}>
                    <BillManagement 
                        bills={bills}
                        vendors={vendors}
                        onRefresh={loadData}
                    />
                </TabPanel>

                {/* Subscriptions Tab */}
                <TabPanel value={tabValue} index={3}>
                    <SubscriptionManagement 
                        subscriptions={subscriptions}
                        vendors={vendors}
                        onRefresh={loadData}
                    />
                </TabPanel>
            </Paper>
        </Box>
    );
};

export default APHub;
