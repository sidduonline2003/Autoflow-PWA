import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    Button,
    IconButton,
    Chip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Switch,
    FormControlLabel,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    LinearProgress,
    Alert,
    Tooltip,
    Badge,
    Divider
} from '@mui/material';
import {
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon,
    AccountBalanceWallet as WalletIcon,
    MonetizationOn as MoneyIcon,
    Receipt as ReceiptIcon,
    Payment as PaymentIcon,
    Schedule as ScheduleIcon,
    Warning as WarningIcon,
    GetApp as DownloadIcon,
    Refresh as RefreshIcon,
    FilterList as FilterIcon,
    PieChart as PieChartIcon,
    Timeline as TimelineIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { 
    LineChart, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip, 
    Legend, 
    ResponsiveContainer,
    PieChart as RechartsPieChart,
    Cell,
    Pie
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

// Sparkline component for KPI cards
const Sparkline = ({ data, color = '#1976d2', width = 60, height = 20 }) => {
    if (!data || data.length === 0) return null;
    
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    
    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');
    
    return (
        <svg width={width} height={height} style={{ verticalAlign: 'middle' }}>
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="1"
                points={points}
            />
        </svg>
    );
};

// KPI Card component
const KPICard = ({ 
    title, 
    value, 
    change, 
    changeLabel = "vs last period", 
    icon: Icon, 
    color = "primary",
    sparklineData = null,
    isLoading = false 
}) => {
    const formatValue = (val) => {
        if (typeof val === 'number') {
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
            }).format(val);
        }
        return val;
    };

    const getChangeColor = (change) => {
        if (change > 0) return 'success.main';
        if (change < 0) return 'error.main';
        return 'text.secondary';
    };

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box>
                        <Typography color="textSecondary" gutterBottom variant="body2">
                            {title}
                        </Typography>
                        <Typography variant="h5" component="div" color={`${color}.main`}>
                            {isLoading ? (
                                <LinearProgress sx={{ width: 80, height: 4 }} />
                            ) : (
                                formatValue(value)
                            )}
                        </Typography>
                    </Box>
                    <Icon color={color} sx={{ fontSize: 40, opacity: 0.7 }} />
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {change !== null && !isLoading && (
                            <>
                                {change > 0 ? (
                                    <TrendingUpIcon sx={{ color: 'success.main', fontSize: 16 }} />
                                ) : change < 0 ? (
                                    <TrendingDownIcon sx={{ color: 'error.main', fontSize: 16 }} />
                                ) : null}
                                <Typography variant="body2" color={getChangeColor(change)}>
                                    {change > 0 ? '+' : ''}{change?.toFixed(1)}%
                                </Typography>
                            </>
                        )}
                        <Typography variant="caption" color="textSecondary">
                            {changeLabel}
                        </Typography>
                    </Box>
                    
                    {sparklineData && !isLoading && (
                        <Sparkline 
                            data={sparklineData} 
                            color={color === 'primary' ? '#1976d2' : 
                                   color === 'success' ? '#2e7d32' : 
                                   color === 'error' ? '#d32f2f' : 
                                   color === 'warning' ? '#ed6c02' : '#1976d2'}
                        />
                    )}
                </Box>
            </CardContent>
        </Card>
    );
};

const FinancialMasterDashboard = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState(null);
    const [filters, setFilters] = useState({
        source: 'All', // All, AR, AP, Salaries
        period: 'This Month',
        customStart: null,
        customEnd: null,
        clientId: '',
        vendorId: '',
        showTax: false
    });

    // Predefined period options
    const periodOptions = [
        'Today',
        'This Week', 
        'This Month',
        'This Quarter',
        'This Year',
        'Last 12 Months',
        'Custom'
    ];

    const callApi = async (endpoint, method = 'GET', body = null) => {
        if (!user) throw new Error('Not authenticated');
        
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
                message = parsed.detail || parsed.message || message;
            } catch {
                message = errorData || message;
            }
            throw new Error(message);
        }

        return response.json();
    };

    const loadDashboardData = useCallback(async () => {
        try {
            setLoading(true);
            
            const params = new URLSearchParams();
            
            // Calculate date range based on period
            const now = new Date();
            let fromDate, toDate;
            
            if (filters.period === 'Custom' && filters.customStart && filters.customEnd) {
                fromDate = filters.customStart;
                toDate = filters.customEnd;
            } else {
                switch (filters.period) {
                    case 'Today':
                        fromDate = toDate = now.toISOString().split('T')[0];
                        break;
                    case 'This Week':
                        const weekStart = new Date(now);
                        weekStart.setDate(now.getDate() - now.getDay());
                        fromDate = weekStart.toISOString().split('T')[0];
                        toDate = now.toISOString().split('T')[0];
                        break;
                    case 'This Month':
                        fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                        toDate = now.toISOString().split('T')[0];
                        break;
                    case 'This Quarter':
                        const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                        fromDate = quarterStart.toISOString().split('T')[0];
                        toDate = now.toISOString().split('T')[0];
                        break;
                    case 'This Year':
                        fromDate = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
                        toDate = now.toISOString().split('T')[0];
                        break;
                    case 'Last 12 Months':
                        const yearAgo = new Date(now);
                        yearAgo.setFullYear(now.getFullYear() - 1);
                        fromDate = yearAgo.toISOString().split('T')[0];
                        toDate = now.toISOString().split('T')[0];
                        break;
                    default:
                        fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                        toDate = now.toISOString().split('T')[0];
                }
            }
            
            if (fromDate) params.append('from', fromDate);
            if (toDate) params.append('to', toDate);
            if (filters.clientId) params.append('clientId', filters.clientId);
            if (filters.showTax) params.append('showTax', 'true');
            
            const data = await callApi(`/financial-hub/reports/overview?${params.toString()}`);
            setDashboardData(data);
            
        } catch (error) {
            console.error('Error loading dashboard data:', error);
            toast.error('Failed to load dashboard data: ' + error.message);
        } finally {
            setLoading(false);
        }
    }, [user, filters]);

    useEffect(() => {
        if (user) {
            loadDashboardData();
        }
    }, [user, loadDashboardData]);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount || 0);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-IN');
    };

    const handleExportCSV = async (type) => {
        try {
            toast.success(`Exporting ${type} data...`);
            // TODO: Implement actual export logic
        } catch (error) {
            toast.error(`Failed to export ${type}: ` + error.message);
        }
    };

    const handleFilterChange = (field, value) => {
        setFilters(prev => ({
            ...prev,
            [field]: value
        }));
    };

    // Chart colors
    const CHART_COLORS = ['#1976d2', '#2e7d32', '#ed6c02', '#d32f2f', '#7b1fa2'];

    if (loading && !dashboardData) {
        return (
            <Box sx={{ p: 3 }}>
                <Typography variant="h4" gutterBottom>Financial Master Dashboard</Typography>
                <LinearProgress />
                <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                    Loading comprehensive financial data...
                </Typography>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1">
                    Financial Master Dashboard
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadDashboardData}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<DownloadIcon />}
                        onClick={() => handleExportCSV('overview')}
                    >
                        Export
                    </Button>
                </Box>
            </Box>

            {/* Filters */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <FilterIcon />
                        <Typography variant="h6" gutterBottom>
                            Filters
                        </Typography>
                    </Box>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={6} md={2}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Source</InputLabel>
                                <Select
                                    value={filters.source}
                                    label="Source"
                                    onChange={(e) => handleFilterChange('source', e.target.value)}
                                >
                                    <MenuItem value="All">All Sources</MenuItem>
                                    <MenuItem value="AR">AR Only</MenuItem>
                                    <MenuItem value="AP">AP Only</MenuItem>
                                    <MenuItem value="Salaries">Salaries Only</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={2}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Period</InputLabel>
                                <Select
                                    value={filters.period}
                                    label="Period"
                                    onChange={(e) => handleFilterChange('period', e.target.value)}
                                >
                                    {periodOptions.map(option => (
                                        <MenuItem key={option} value={option}>{option}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        {filters.period === 'Custom' && (
                            <>
                                <Grid item xs={12} sm={6} md={2}>
                                    <DatePicker
                                        label="Start Date"
                                        value={filters.customStart}
                                        onChange={(date) => handleFilterChange('customStart', date)}
                                        slotProps={{ textField: { size: 'small', fullWidth: true } }}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6} md={2}>
                                    <DatePicker
                                        label="End Date"
                                        value={filters.customEnd}
                                        onChange={(date) => handleFilterChange('customEnd', date)}
                                        slotProps={{ textField: { size: 'small', fullWidth: true } }}
                                    />
                                </Grid>
                            </>
                        )}

                        <Grid item xs={12} sm={6} md={2}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={filters.showTax}
                                        onChange={(e) => handleFilterChange('showTax', e.target.checked)}
                                        size="small"
                                    />
                                }
                                label="Show Tax"
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {dashboardData && (
                <>
                    {/* KPI Cards */}
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        <Grid item xs={12} sm={6} md={3}>
                            <KPICard
                                title="Cash In (Income)"
                                value={dashboardData.kpis?.income}
                                icon={TrendingUpIcon}
                                color="success"
                                isLoading={loading}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <KPICard
                                title="Cash Out (Expenses)"
                                value={dashboardData.kpis?.expenses}
                                icon={TrendingDownIcon}
                                color="error"
                                isLoading={loading}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <KPICard
                                title="Net Cash Flow"
                                value={dashboardData.kpis?.net}
                                icon={WalletIcon}
                                color={dashboardData.kpis?.net >= 0 ? "success" : "error"}
                                isLoading={loading}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <KPICard
                                title="AR Outstanding"
                                value={dashboardData.kpis?.arOutstanding}
                                icon={ReceiptIcon}
                                color="warning"
                                isLoading={loading}
                            />
                        </Grid>
                    </Grid>

                    {/* Second row of KPIs */}
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        <Grid item xs={12} sm={6} md={3}>
                            <KPICard
                                title="AP Outstanding"
                                value={dashboardData.kpis?.apOutstanding}
                                icon={PaymentIcon}
                                color="info"
                                isLoading={loading}
                            />
                        </Grid>
                        {filters.showTax && (
                            <>
                                <Grid item xs={12} sm={6} md={3}>
                                    <KPICard
                                        title="Tax Collected"
                                        value={dashboardData.kpis?.taxCollected}
                                        icon={MoneyIcon}
                                        color="primary"
                                        isLoading={loading}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6} md={3}>
                                    <KPICard
                                        title="Tax Paid"
                                        value={dashboardData.kpis?.taxPaid}
                                        icon={MoneyIcon}
                                        color="secondary"
                                        isLoading={loading}
                                    />
                                </Grid>
                            </>
                        )}
                    </Grid>

                    {/* Charts Row */}
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        {/* Cash Flow Trend */}
                        <Grid item xs={12} lg={8}>
                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <TimelineIcon />
                                            <Typography variant="h6">
                                                Cash Flow Trend (Last 12 Months)
                                            </Typography>
                                        </Box>
                                        <IconButton size="small" onClick={loadDashboardData}>
                                            <RefreshIcon />
                                        </IconButton>
                                    </Box>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <LineChart data={dashboardData.trend?.series?.[0]?.points || []}>
                                            <CartesianGrid strokeDasharray="3 3" />
                                            <XAxis dataKey="x" />
                                            <YAxis tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}K`} />
                                            <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                                            <Legend />
                                            {dashboardData.trend?.series?.map((series, index) => (
                                                <Line
                                                    key={series.key}
                                                    type="monotone"
                                                    dataKey="y"
                                                    data={series.points}
                                                    stroke={CHART_COLORS[index]}
                                                    strokeWidth={2}
                                                    name={series.key === 'cashIn' ? 'Cash In' : 
                                                          series.key === 'cashOut' ? 'Cash Out' : 'Net'}
                                                />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Expense Breakdown */}
                        <Grid item xs={12} lg={4}>
                            <Card>
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                        <PieChartIcon />
                                        <Typography variant="h6" gutterBottom>
                                            Expense Breakdown
                                        </Typography>
                                    </Box>
                                    {dashboardData.expenseByCategory?.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <RechartsPieChart>
                                                <Pie
                                                    data={dashboardData.expenseByCategory}
                                                    cx="50%"
                                                    cy="50%"
                                                    labelLine={false}
                                                    label={({ category, percent }) => `${category} (${(percent * 100).toFixed(0)}%)`}
                                                    outerRadius={80}
                                                    fill="#8884d8"
                                                    dataKey="amount"
                                                >
                                                    {dashboardData.expenseByCategory.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <RechartsTooltip formatter={(value) => formatCurrency(value)} />
                                            </RechartsPieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <Typography color="textSecondary">No expense data available</Typography>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    {/* AR & AP Widgets */}
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        {/* AR Widget */}
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom color="warning.main">
                                        Accounts Receivable
                                    </Typography>
                                    
                                    {/* AR Aging */}
                                    <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                                        Aging Analysis
                                    </Typography>
                                    {Object.entries(dashboardData.ar?.aging || {}).map(([bucket, amount]) => (
                                        <Box key={bucket} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="body2">
                                                {bucket.replace('_', '-')} days:
                                            </Typography>
                                            <Typography 
                                                variant="body2" 
                                                color={amount > 0 ? 'error.main' : 'text.secondary'}
                                                sx={{ fontWeight: amount > 0 ? 'bold' : 'normal' }}
                                            >
                                                {formatCurrency(amount)}
                                            </Typography>
                                        </Box>
                                    ))}

                                    <Divider sx={{ my: 2 }} />

                                    {/* Top Clients */}
                                    <Typography variant="subtitle2" gutterBottom>
                                        Top Clients by Outstanding
                                    </Typography>
                                    {dashboardData.ar?.topClients?.map((client, index) => (
                                        <Box key={client.clientId} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="body2">
                                                {index + 1}. {client.name}
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                                {formatCurrency(client.outstanding)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* AP Widget */}
                        <Grid item xs={12} md={6}>
                            <Card>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom color="info.main">
                                        Accounts Payable
                                    </Typography>
                                    
                                    {/* Due Soon */}
                                    <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                                        <Chip 
                                            label={`Next 7 Days: ${formatCurrency(dashboardData.ap?.dueSoon?.next7)}`}
                                            color="warning"
                                            size="small"
                                        />
                                        <Chip 
                                            label={`Next 30 Days: ${formatCurrency(dashboardData.ap?.dueSoon?.next30)}`}
                                            color="info"
                                            size="small"
                                        />
                                    </Box>

                                    {/* AP Aging */}
                                    <Typography variant="subtitle2" gutterBottom>
                                        Overdue Analysis
                                    </Typography>
                                    {Object.entries(dashboardData.ap?.aging || {}).map(([bucket, amount]) => (
                                        <Box key={bucket} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="body2">
                                                {bucket.replace('_', '-')} days:
                                            </Typography>
                                            <Typography 
                                                variant="body2" 
                                                color={amount > 0 ? 'error.main' : 'text.secondary'}
                                                sx={{ fontWeight: amount > 0 ? 'bold' : 'normal' }}
                                            >
                                                {formatCurrency(amount)}
                                            </Typography>
                                        </Box>
                                    ))}

                                    <Divider sx={{ my: 2 }} />

                                    {/* Top Vendors */}
                                    <Typography variant="subtitle2" gutterBottom>
                                        Top Vendors by Payable
                                    </Typography>
                                    {dashboardData.ap?.topVendors?.map((vendor, index) => (
                                        <Box key={vendor.vendorId} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="body2">
                                                {index + 1}. {vendor.name}
                                            </Typography>
                                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                                {formatCurrency(vendor.payable)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    {/* Recent Transactions Table */}
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6">
                                    Recent Transactions
                                </Typography>
                                <Button
                                    variant="outlined"
                                    startIcon={<DownloadIcon />}
                                    size="small"
                                    onClick={() => handleExportCSV('transactions')}
                                >
                                    Export CSV
                                </Button>
                            </Box>
                            
                            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                                <Table stickyHeader size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Date</TableCell>
                                            <TableCell>Type</TableCell>
                                            <TableCell>Party</TableCell>
                                            <TableCell>Reference</TableCell>
                                            <TableCell align="right">Amount</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {dashboardData.recentTransactions?.map((transaction, index) => (
                                            <TableRow key={`${transaction.type}-${transaction.id}-${index}`}>
                                                <TableCell>{formatDate(transaction.date)}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={transaction.type.replace(/([A-Z])/g, ' $1').trim()}
                                                        size="small"
                                                        color={
                                                            transaction.type === 'ClientPayment' ? 'success' :
                                                            transaction.type === 'BillPayment' ? 'error' :
                                                            'secondary'
                                                        }
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell>{transaction.party}</TableCell>
                                                <TableCell>{transaction.ref || '-'}</TableCell>
                                                <TableCell align="right">
                                                    <Typography
                                                        color={
                                                            transaction.type === 'ClientPayment' ? 'success.main' : 'text.primary'
                                                        }
                                                        sx={{ fontWeight: 'bold' }}
                                                    >
                                                        {transaction.type === 'ClientPayment' ? '+' : '-'}
                                                        {formatCurrency(Math.abs(transaction.amount))}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            
                            {(!dashboardData.recentTransactions || dashboardData.recentTransactions.length === 0) && (
                                <Typography color="textSecondary" sx={{ textAlign: 'center', py: 3 }}>
                                    No recent transactions found
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </Box>
    );
};

export default FinancialMasterDashboard;
