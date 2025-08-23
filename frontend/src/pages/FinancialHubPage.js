import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, Tabs, Tab, Paper, Button, 
    CircularProgress, Alert, Dialog, DialogTitle, 
    DialogContent, DialogActions
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import toast from 'react-hot-toast';
import SalaryRunsTable from '../components/financial/SalaryRunsTable';
import SalaryRunDetails from '../components/financial/SalaryRunDetails';
import SalaryProfilesManager from '../components/financial/SalaryProfilesManager';
import CreateSalaryRunForm from '../components/financial/CreateSalaryRunForm';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`financial-hub-tabpanel-${index}`}
            aria-labelledby={`financial-hub-tab-${index}`}
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

const FinancialHubPage = () => {
    const { claims } = useAuth();
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [salaryRuns, setSalaryRuns] = useState([]);
    const [selectedRunId, setSelectedRunId] = useState(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    
    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    // Check if user is authorized for this page
    const isAuthorized = claims?.role === 'admin' || claims?.role === 'accountant';

    // Fetch salary runs data
    const fetchSalaryRuns = async () => {
        try {
            setLoading(true);
            
            // Check if auth.currentUser exists
            if (!auth.currentUser) {
                throw new Error('You are not authenticated. Please sign in again.');
            }
            
            try {
                const idToken = await auth.currentUser.getIdToken(true);  // Force refresh token
                console.log('Fetching salary runs with token:', idToken.substring(0, 10) + '...');
                
                const response = await fetch('/api/salaries/runs', {
                    headers: { 'Authorization': `Bearer ${idToken}` }
                });
                
                console.log('Response status:', response.status);
                
                if (response.ok) {
                    const data = await response.json();
                    setSalaryRuns(data);
                } else {
                    // Try to read the error response text first
                    const errorText = await response.text();
                    console.error('Error response text:', errorText);
                    
                    // Try to parse it as JSON if possible
                    try {
                        const errorJson = JSON.parse(errorText);
                        throw new Error(errorJson.detail || 'Failed to fetch salary runs');
                    } catch (jsonError) {
                        // If parsing fails, use the raw text
                        throw new Error(`Server error (${response.status}): ${errorText}`);
                    }
                }
            } catch (tokenError) {
                console.error('Error getting ID token:', tokenError);
                
                // Handle Firebase token errors specifically
                if (tokenError.code === 'auth/id-token-expired' || 
                    tokenError.code === 'auth/user-token-expired') {
                    throw new Error('Your session has expired. Please sign in again.');
                } else {
                    throw new Error(`Authentication error: ${tokenError.message}`);
                }
            }
        } catch (error) {
            console.error('Error fetching salary runs:', error);
            
            // Check if this is a Firestore index error
            if (error.message.includes('requires a Firestore index') || 
                error.message.includes('requires an index')) {
                // Show a more helpful error message for missing index
                const errorMsg = 'Database index missing. This usually happens on first use. Please contact the administrator to create the required index.';
                setError(errorMsg);
                toast.error(errorMsg);
            } else {
                setError(error.message);
                toast.error(error.message);
            }
            
            // If this is an authentication error, redirect to login
            if (error.message.includes('authentication') || 
                error.message.includes('not authenticated') ||
                error.message.includes('session has expired')) {
                // Redirect to login page after a short delay
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
        } finally {
            setLoading(false);
        }
    };

    // Handle run selection
    const handleRunSelect = (runId) => {
        setSelectedRunId(runId);
    };

    // Handle run creation
    const handleCreateRun = async (runData) => {
        try {
            // Check if auth.currentUser exists
            if (!auth.currentUser) {
                throw new Error('You are not authenticated. Please sign in again.');
            }
            
            try {
                const idToken = await auth.currentUser.getIdToken(true);  // Force refresh token
                const response = await fetch('/api/salaries/runs', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}` 
                    },
                    body: JSON.stringify(runData)
                });
                
                if (response.ok) {
                    const data = await response.json();
                    toast.success('Salary run created successfully!');
                    setIsCreateModalOpen(false);
                    fetchSalaryRuns(); // Refresh the list
                    setSelectedRunId(data.runId); // Select the new run
                } else {
                    // Try to read the error response text first
                    const errorText = await response.text();
                    console.error('Error response text:', errorText);
                    
                    // Try to parse it as JSON if possible
                    try {
                        const errorJson = JSON.parse(errorText);
                        throw new Error(errorJson.detail || 'Failed to create salary run');
                    } catch (jsonError) {
                        // If parsing fails, use the raw text
                        throw new Error(`Server error (${response.status}): ${errorText}`);
                    }
                }
            } catch (tokenError) {
                console.error('Error getting ID token:', tokenError);
                
                // Handle Firebase token errors specifically
                if (tokenError.code === 'auth/id-token-expired' || 
                    tokenError.code === 'auth/user-token-expired') {
                    throw new Error('Your session has expired. Please sign in again.');
                } else {
                    throw new Error(`Authentication error: ${tokenError.message}`);
                }
            }
        } catch (error) {
            console.error('Error creating salary run:', error);
            toast.error(error.message);
            
            // If this is an authentication error, redirect to login
            if (error.message.includes('authentication') || 
                error.message.includes('not authenticated') ||
                error.message.includes('session has expired')) {
                // Redirect to login page after a short delay
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            }
        }
    };

    // Initial data load
    useEffect(() => {
        if (isAuthorized) {
            fetchSalaryRuns();
        } else {
            setLoading(false);
        }
    }, [isAuthorized]);

    if (!isAuthorized) {
        return (
            <Container maxWidth="lg" sx={{ mt: 4 }}>
                <Alert severity="error" sx={{ mt: 2 }}>
                    You don't have permission to access the Financial Hub.
                </Alert>
            </Container>
        );
    }

    return (
        <Container maxWidth="lg" sx={{ mt: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1">Financial Hub</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                        variant="outlined" 
                        color="primary"
                        onClick={() => window.location.href = '/accounts-receivable'}
                    >
                        Accounts Receivable
                    </Button>
                    {tabValue === 0 && (
                        <Button 
                            variant="contained" 
                            color="primary"
                            onClick={() => setIsCreateModalOpen(true)}
                        >
                            Create Salary Run
                        </Button>
                    )}
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            <Paper sx={{ width: '100%' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleTabChange}>
                        <Tab label="Salary Runs" />
                        <Tab label="Salary Profiles" />
                    </Tabs>
                </Box>

                {/* Salary Runs Tab */}
                <TabPanel value={tabValue} index={0}>
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <Box>
                            {selectedRunId ? (
                                <SalaryRunDetails 
                                    runId={selectedRunId} 
                                    onBack={() => setSelectedRunId(null)}
                                    onRefresh={fetchSalaryRuns}
                                />
                            ) : (
                                <SalaryRunsTable 
                                    runs={salaryRuns} 
                                    onSelect={handleRunSelect}
                                    onRefresh={fetchSalaryRuns}
                                />
                            )}
                        </Box>
                    )}
                </TabPanel>

                {/* Salary Profiles Tab */}
                <TabPanel value={tabValue} index={1}>
                    <SalaryProfilesManager />
                </TabPanel>
            </Paper>

            {/* Create Salary Run Modal */}
            <Dialog open={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create New Salary Run</DialogTitle>
                <DialogContent>
                    <CreateSalaryRunForm onSubmit={handleCreateRun} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default FinancialHubPage;
