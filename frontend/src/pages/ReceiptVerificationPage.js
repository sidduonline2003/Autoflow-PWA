import React, { useState } from 'react';
import {
    Container,
    Typography,
    AppBar,
    Toolbar,
    Button,
    Box,
    Tabs,
    Tab,
    Paper
} from '@mui/material';
import {
    Receipt as ReceiptIcon,
    Dashboard as DashboardIcon,
    Upload as UploadIcon,
    VerifiedUser as VerifyIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CabReceiptUploader from '../components/CabReceiptUploader';
import ReceiptVerificationDashboard from '../components/ReceiptVerificationDashboard';
import { POSTPROD_ENABLED } from '../config';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`receipt-tabpanel-${index}`}
            aria-labelledby={`receipt-tab-${index}`}
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

const ReceiptVerificationPage = () => {
    const { user, claims } = useAuth();
    const navigate = useNavigate();
    const [tabValue, setTabValue] = useState(0);
    
    // Check user role for appropriate access
    const isAdmin = claims?.role === 'admin';
    const isAccountant = claims?.role === 'accountant';
    const isTeamMember = ['crew', 'editor', 'data-manager'].includes(claims?.role);
    
    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };
    
    if (!claims?.orgId) {
        return (
            <Container sx={{ mt: 4 }}>
                <Typography variant="h4" color="error">
                    Access Required
                </Typography>
                <Typography variant="body1" sx={{ mt: 2 }}>
                    You need to be part of an organization to access receipt verification.
                </Typography>
                <Button 
                    variant="contained" 
                    onClick={() => navigate('/dashboard')} 
                    sx={{ mt: 2 }}
                >
                    Back to Dashboard
                </Button>
            </Container>
        );
    }

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <ReceiptIcon sx={{ mr: 2 }} />
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Cab Receipt Verification
                    </Typography>
                    <Button color="inherit" onClick={() => navigate('/dashboard')}>
                        Dashboard
                    </Button>
                    {isAdmin && (
                        <>
                            <Button color="inherit" onClick={() => navigate('/team')}>
                                Team Management
                            </Button>
                            <Button color="inherit" onClick={() => navigate('/financial')}>
                                Financial Hub
                            </Button>
                        </>
                    )}
                    {POSTPROD_ENABLED && (
                        <Button color="inherit" onClick={() => navigate('/postprod')}>
                            Post Production
                        </Button>
                    )}
                </Toolbar>
            </AppBar>

            <Container maxWidth="xl" sx={{ mt: 2 }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tabs value={tabValue} onChange={handleTabChange}>
                        {isTeamMember && (
                            <Tab 
                                label="Upload Receipt" 
                                icon={<UploadIcon />}
                                iconPosition="start"
                            />
                        )}
                        {(isAdmin || isAccountant) && (
                            <>
                                <Tab 
                                    label="Verification Dashboard" 
                                    icon={<DashboardIcon />}
                                    iconPosition="start"
                                />
                                <Tab 
                                    label="Review Receipts" 
                                    icon={<VerifyIcon />}
                                    iconPosition="start"
                                />
                            </>
                        )}
                    </Tabs>
                </Box>

                {/* Upload Tab - For Team Members */}
                {isTeamMember && (
                    <TabPanel value={tabValue} index={0}>
                        <Paper sx={{ p: 3 }}>
                            <Typography variant="h5" gutterBottom>
                                Upload Cab Receipt
                            </Typography>
                            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                                Upload your cab receipts for events you're assigned to. The system will automatically verify and process them.
                            </Typography>
                            
                            {/* For team members, we'll need to integrate with their assigned events */}
                            <CabReceiptUploader 
                                eventId={null} // Will be selected by user from their assigned events
                                onUploadSuccess={(result) => {
                                    console.log('Receipt uploaded successfully:', result);
                                }}
                            />
                        </Paper>
                    </TabPanel>
                )}

                {/* Verification Dashboard Tab - For Admins/Accountants */}
                {(isAdmin || isAccountant) && (
                    <TabPanel value={tabValue} index={isTeamMember ? 1 : 0}>
                        <ReceiptVerificationDashboard />
                    </TabPanel>
                )}

                {/* Review Tab - For Admins/Accountants */}
                {(isAdmin || isAccountant) && (
                    <TabPanel value={tabValue} index={isTeamMember ? 2 : 1}>
                        <Paper sx={{ p: 3 }}>
                            <Typography variant="h5" gutterBottom>
                                Receipt Review
                            </Typography>
                            <Typography variant="body2" color="textSecondary" sx={{ mb: 3 }}>
                                Review and approve/reject submitted receipts. Use the verification dashboard for detailed analysis.
                            </Typography>
                            
                            {/* This would contain a detailed review interface */}
                            <Box sx={{ textAlign: 'center', py: 8 }}>
                                <VerifyIcon sx={{ fontSize: 64, color: 'grey.300', mb: 2 }} />
                                <Typography variant="h6" color="textSecondary">
                                    Detailed Review Interface
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                    Coming soon - Use the Verification Dashboard for now
                                </Typography>
                            </Box>
                        </Paper>
                    </TabPanel>
                )}

                {/* Fallback for unauthorized users */}
                {!isTeamMember && !isAdmin && !isAccountant && (
                    <TabPanel value={tabValue} index={0}>
                        <Paper sx={{ p: 3, textAlign: 'center' }}>
                            <Typography variant="h5" gutterBottom color="error">
                                Access Restricted
                            </Typography>
                            <Typography variant="body1" sx={{ mb: 3 }}>
                                Receipt verification is available for team members, admins, and accountants only.
                            </Typography>
                            <Button 
                                variant="contained" 
                                onClick={() => navigate('/dashboard')}
                            >
                                Back to Dashboard
                            </Button>
                        </Paper>
                    </TabPanel>
                )}
            </Container>
        </>
    );
};

export default ReceiptVerificationPage;
