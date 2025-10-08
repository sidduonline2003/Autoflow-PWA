import React from 'react';
import {
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Chip, IconButton, Typography, Box, Button
} from '@mui/material';
import { 
    Visibility as VisibilityIcon,
    CloudDownload as CloudDownloadIcon,
    Check as CheckIcon,
    Lock as LockIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { auth } from '../../firebase';
import toast from 'react-hot-toast';

// Helper to format the period
const formatPeriod = (period) => {
    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return `${months[period.month - 1]} ${period.year}`;
};

// Helper to format Firestore timestamp
const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    
    // If it's a Firestore timestamp
    if (timestamp.seconds) {
        return format(new Date(timestamp.seconds * 1000), 'MMM dd, yyyy');
    }
    
    // If it's already a string date
    return format(new Date(timestamp), 'MMM dd, yyyy');
};

// Status chip helper
const StatusChip = ({ status }) => {
    const statusConfig = {
        'DRAFT': { color: 'default', label: 'Draft' },
        'PUBLISHED': { color: 'primary', label: 'Published' },
        'PAID': { color: 'success', label: 'Paid' },
        'CLOSED': { color: 'error', label: 'Closed' }
    };
    
    const config = statusConfig[status] || { color: 'default', label: status };
    
    return <Chip size="small" label={config.label} color={config.color} />;
};

// Helper to format currency
const formatCurrency = (amount, currency = 'INR') => {
    return new Intl.NumberFormat('en-IN', { 
        style: 'currency', 
        currency: currency,
        maximumFractionDigits: 2
    }).format(amount);
};

const SalaryRunsTable = ({ runs, onSelect, onRefresh }) => {
    // Export salary run as CSV
    const handleExport = async (runId, e) => {
        e.stopPropagation(); // Prevent row click
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/salaries/runs/${runId}/export?format=csv`, {
                headers: { 'Authorization': `Bearer ${idToken}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Create a blob and download it
                const blob = new Blob([data.content], { type: 'text/csv' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                toast.success('Exported successfully!');
            } else {
                throw new Error('Failed to export salary run');
            }
        } catch (error) {
            console.error('Error exporting salary run:', error);
            toast.error(error.message);
        }
    };

    // Mark all payslips as paid
    const handleMarkAllPaid = async (runId, e) => {
        e.stopPropagation(); // Prevent row click
        
        // Ask for confirmation
        if (!window.confirm('Are you sure you want to mark all payslips as paid?')) {
            return;
        }
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/salaries/runs/${runId}/mark-all-paid`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    method: 'BANK',
                    paidAt: new Date().toISOString(),
                    reference: `BULK-${new Date().getTime()}`,
                    remarks: 'Bulk payment for salary run',
                    idempotencyKey: `${runId}-${new Date().getTime()}`
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.payslipsMarked > 0) {
                    toast.success(`${data.payslipsMarked} payslips marked as paid!`);
                } else {
                    toast('No payslips were eligible to mark as paid.', { icon: 'ℹ️' });
                }
                if (typeof onRefresh === 'function') {
                    await onRefresh();
                }
            } else {
                let errorMessage = 'Failed to mark payslips as paid';
                try {
                    const error = await response.json();
                    if (error.detail) {
                        errorMessage = error.detail;
                    } else if (error.message) {
                        errorMessage = error.message;
                    } else if (typeof error === 'string') {
                        errorMessage = error;
                    }
                } catch (parseError) {
                    errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                }
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error('Error marking payslips as paid:', error);
            const message = error.message || error.toString() || 'Failed to mark payslips as paid';
            toast.error(message);
        }
    };

    // Close salary run
    const handleCloseRun = async (runId, e) => {
        e.stopPropagation(); // Prevent row click
        
        // Ask for confirmation
        if (!window.confirm('Are you sure you want to close this salary run? This action cannot be undone.')) {
            return;
        }
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/salaries/runs/${runId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    status: 'CLOSED',
                    remarks: 'Closed manually by administrator'
                })
            });
            
            if (response.ok) {
                toast.success('Salary run closed successfully!');
                if (typeof onRefresh === 'function') {
                    await onRefresh();
                }
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to close salary run');
            }
        } catch (error) {
            console.error('Error closing salary run:', error);
            toast.error(error.message);
        }
    };

    // Publish salary run
    const handlePublish = async (runId, e) => {
        e.stopPropagation(); // Prevent row click
        
        // Ask for confirmation
        if (!window.confirm('Are you sure you want to publish this salary run? All payslips will be visible to team members.')) {
            return;
        }
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/salaries/runs/${runId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    status: 'PUBLISHED',
                    remarks: 'Published for team review'
                })
            });
            
            if (response.ok) {
                toast.success('Salary run published successfully!');
                if (typeof onRefresh === 'function') {
                    await onRefresh();
                }
            } else {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to publish salary run');
            }
        } catch (error) {
            console.error('Error publishing salary run:', error);
            toast.error(error.message);
        }
    };

    // Action buttons based on status
    const getActionButtons = (run) => {
        const status = run.status;
        
        switch (status) {
            case 'DRAFT':
                return (
                    <Button 
                        size="small" 
                        variant="outlined" 
                        color="primary"
                        startIcon={<CheckIcon />}
                        onClick={(e) => handlePublish(run.id, e)}
                    >
                        Publish
                    </Button>
                );
            case 'PUBLISHED':
                return (
                    <Button 
                        size="small" 
                        variant="outlined" 
                        color="success"
                        startIcon={<CheckIcon />}
                        onClick={(e) => handleMarkAllPaid(run.id, e)}
                    >
                        Mark All Paid
                    </Button>
                );
            case 'PAID':
                return (
                    <Button 
                        size="small" 
                        variant="outlined" 
                        color="error"
                        startIcon={<LockIcon />}
                        onClick={(e) => handleCloseRun(run.id, e)}
                    >
                        Close
                    </Button>
                );
            default:
                return null;
        }
    };

    return (
        <>
            {runs.length === 0 ? (
                <Box sx={{ textAlign: 'center', my: 4 }}>
                    <Typography variant="body1" color="text.secondary">
                        No salary runs found. Create a new salary run to get started.
                    </Typography>
                </Box>
            ) : (
                <TableContainer component={Paper} sx={{ mt: 2 }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Period</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Payslips</TableCell>
                                <TableCell align="right">Total Amount</TableCell>
                                <TableCell>Created On</TableCell>
                                <TableCell>Last Updated</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {runs.map((run) => (
                                <TableRow 
                                    key={run.id} 
                                    hover 
                                    onClick={() => onSelect(run.id)}
                                    sx={{ cursor: 'pointer' }}
                                >
                                    <TableCell component="th" scope="row">
                                        <Typography variant="body1" fontWeight="medium">
                                            {formatPeriod(run.period)}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <StatusChip status={run.status} />
                                    </TableCell>
                                    <TableCell>{run.payslipsCount || 0}</TableCell>
                                    <TableCell align="right">
                                        <Typography variant="body2" fontWeight="medium">
                                            {run.totals?.net 
                                                ? formatCurrency(run.totals.net) 
                                                : '—'
                                            }
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{formatDate(run.createdAt)}</TableCell>
                                    <TableCell>{formatDate(run.updatedAt)}</TableCell>
                                    <TableCell align="right">
                                        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                                            <IconButton 
                                                size="small" 
                                                color="info"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelect(run.id);
                                                }}
                                            >
                                                <VisibilityIcon fontSize="small" />
                                            </IconButton>
                                            
                                            {/* Export only available for published/paid/closed runs */}
                                            {run.status !== 'DRAFT' && (
                                                <IconButton 
                                                    size="small" 
                                                    color="secondary"
                                                    onClick={(e) => handleExport(run.id, e)}
                                                >
                                                    <CloudDownloadIcon fontSize="small" />
                                                </IconButton>
                                            )}
                                            
                                            {getActionButtons(run)}
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </>
    );
};

export default SalaryRunsTable;
