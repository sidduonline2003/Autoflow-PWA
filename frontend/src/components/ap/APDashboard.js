import React from 'react';
import {
    Box, Typography, Card, CardContent, Grid, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, Paper, Button, Alert
} from '@mui/material';
import {
    TrendingUp as TrendingUpIcon,
    Warning as WarningIcon,
    Schedule as ScheduleIcon,
    CheckCircle as CheckCircleIcon
} from '@mui/icons-material';

const APDashboard = ({ data, onRefresh, onNavigate }) => {
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatDate = (dateString) => {
        return dateString ? new Date(dateString).toLocaleDateString('en-IN') : '-';
    };

    if (!data) {
        return (
            <Alert severity="info">
                Loading dashboard data...
            </Alert>
        );
    }

    const { kpis, dueNext7Days, dueNext30Days, agingBuckets, categoryBreakdown, activeSubscriptions } = data;

    return (
        <Box>
            {/* KPI Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography color="textSecondary" gutterBottom>
                                        Total Bills
                                    </Typography>
                                    <Typography variant="h4" color="primary">
                                        {kpis?.totalBills || 0}
                                    </Typography>
                                </Box>
                                <TrendingUpIcon color="primary" sx={{ fontSize: 40 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography color="textSecondary" gutterBottom>
                                        Total Paid
                                    </Typography>
                                    <Typography variant="h6" color="success.main">
                                        {formatCurrency(kpis?.totalPaidAmount)}
                                    </Typography>
                                </Box>
                                <CheckCircleIcon color="success" sx={{ fontSize: 40 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography color="textSecondary" gutterBottom>
                                        Outstanding
                                    </Typography>
                                    <Typography variant="h6" color="warning.main">
                                        {formatCurrency(kpis?.outstandingAmount)}
                                    </Typography>
                                </Box>
                                <ScheduleIcon color="warning" sx={{ fontSize: 40 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box>
                                    <Typography color="textSecondary" gutterBottom>
                                        Overdue
                                    </Typography>
                                    <Typography variant="h6" color="error.main">
                                        {formatCurrency(kpis?.overdueAmount)}
                                    </Typography>
                                </Box>
                                <WarningIcon color="error" sx={{ fontSize: 40 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Grid container spacing={3}>
                {/* Due Next 7 Days */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom color="warning.main">
                                Due Next 7 Days
                            </Typography>
                            {dueNext7Days && dueNext7Days.length > 0 ? (
                                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Bill</TableCell>
                                                <TableCell>Due Date</TableCell>
                                                <TableCell>Amount</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {dueNext7Days.map((bill) => (
                                                <TableRow key={bill.billId}>
                                                    <TableCell>{bill.billNumber}</TableCell>
                                                    <TableCell>{formatDate(bill.dueDate)}</TableCell>
                                                    <TableCell>
                                                        <Typography color="warning.main" sx={{ fontWeight: 'bold' }}>
                                                            {formatCurrency(bill.amountDue)}
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : (
                                <Typography color="textSecondary">
                                    No bills due in the next 7 days
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Due Next 30 Days */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom color="info.main">
                                Due Next 30 Days
                            </Typography>
                            {dueNext30Days && dueNext30Days.length > 0 ? (
                                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Bill</TableCell>
                                                <TableCell>Due Date</TableCell>
                                                <TableCell>Amount</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {dueNext30Days.slice(0, 5).map((bill) => (
                                                <TableRow key={bill.billId}>
                                                    <TableCell>{bill.billNumber}</TableCell>
                                                    <TableCell>{formatDate(bill.dueDate)}</TableCell>
                                                    <TableCell>
                                                        <Typography color="info.main" sx={{ fontWeight: 'bold' }}>
                                                            {formatCurrency(bill.amountDue)}
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : (
                                <Typography color="textSecondary">
                                    No bills due in the next 30 days
                                </Typography>
                            )}
                            {dueNext30Days && dueNext30Days.length > 5 && (
                                <Button 
                                    size="small" 
                                    onClick={() => onNavigate(2)}
                                    sx={{ mt: 1 }}
                                >
                                    View All ({dueNext30Days.length})
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Aging Buckets */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom color="error.main">
                                Aging Analysis
                            </Typography>
                            {agingBuckets && Object.keys(agingBuckets).some(key => agingBuckets[key] > 0) ? (
                                <Box>
                                    {Object.entries(agingBuckets).map(([bucket, amount]) => (
                                        <Box key={bucket} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography>{bucket} days:</Typography>
                                            <Typography 
                                                color={amount > 0 ? 'error.main' : 'text.secondary'}
                                                sx={{ fontWeight: amount > 0 ? 'bold' : 'normal' }}
                                            >
                                                {formatCurrency(amount)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            ) : (
                                <Typography color="textSecondary">
                                    No overdue bills
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Category Breakdown */}
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Spending by Category
                            </Typography>
                            {categoryBreakdown && Object.keys(categoryBreakdown).length > 0 ? (
                                <Box>
                                    {Object.entries(categoryBreakdown)
                                        .sort(([,a], [,b]) => b - a)
                                        .slice(0, 5)
                                        .map(([category, amount]) => (
                                        <Box key={category} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography>
                                                <Chip 
                                                    label={category} 
                                                    size="small" 
                                                    color="primary" 
                                                    variant="outlined"
                                                />
                                            </Typography>
                                            <Typography sx={{ fontWeight: 'bold' }}>
                                                {formatCurrency(amount)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            ) : (
                                <Typography color="textSecondary">
                                    No spending data available
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Active Subscriptions */}
                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Active Subscriptions
                            </Typography>
                            {activeSubscriptions && activeSubscriptions.length > 0 ? (
                                <TableContainer component={Paper} variant="outlined">
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Name</TableCell>
                                                <TableCell>Cadence</TableCell>
                                                <TableCell>Next Run</TableCell>
                                                <TableCell>Last Run</TableCell>
                                                <TableCell>Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {activeSubscriptions.slice(0, 5).map((subscription) => (
                                                <TableRow key={subscription.id}>
                                                    <TableCell>{subscription.name}</TableCell>
                                                    <TableCell>
                                                        <Chip 
                                                            label={subscription.cadence} 
                                                            size="small"
                                                            color="secondary"
                                                        />
                                                    </TableCell>
                                                    <TableCell>{formatDate(subscription.nextRunAt)}</TableCell>
                                                    <TableCell>{formatDate(subscription.lastRunAt) || 'Never'}</TableCell>
                                                    <TableCell>
                                                        <Button 
                                                            size="small" 
                                                            onClick={() => onNavigate(3)}
                                                        >
                                                            Manage
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            ) : (
                                <Typography color="textSecondary">
                                    No active subscriptions
                                </Typography>
                            )}
                            {activeSubscriptions && activeSubscriptions.length > 5 && (
                                <Button 
                                    size="small" 
                                    onClick={() => onNavigate(3)}
                                    sx={{ mt: 1 }}
                                >
                                    View All ({activeSubscriptions.length})
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};

export default APDashboard;
