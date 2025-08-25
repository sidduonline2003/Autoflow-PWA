import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Stack,
    Grid,
    Button,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Switch,
    FormControlLabel,
    LinearProgress,
    Typography,
    Card,
    CardContent,
    CardHeader,
    Chip,
    Divider,
    Skeleton
} from '@mui/material';
import {
    Download as DownloadIcon,
    Refresh as RefreshIcon,
    FilterList as FilterIcon,
    TrendingUp as TrendingUpIcon,
    TrendingDown as TrendingDownIcon,
    AccountBalance as WalletIcon,
    PieChart as PieChartIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { 
    ResponsiveContainer, 
    LineChart, 
    Line, 
    CartesianGrid, 
    XAxis, 
    YAxis, 
    Legend, 
    Tooltip as RechartsTooltip, 
    PieChart, 
    Pie, 
    Cell
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import SectionCard from '../common/SectionCard';
import KpiStat from './KpiStat';

// currency helper
const formatINR = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

// compute KPI deltas from trend
const pctDelta = (series, key) => {
  const s = series.find((s) => s.key === key);
  if (!s || s.points.length < 2) return null;
  const p = s.points[s.points.length - 2].y || 0;
  const c = s.points[s.points.length - 1].y || 0;
  return p ? Number((((c - p) / p) * 100).toFixed(1)) : null;
};

// export overview CSV
const exportOverviewCSV = (data) => {
  if (!data) return;
  const rows = [];
  const k = data.kpis || {};
  rows.push(["KPI", "Amount"]);
  Object.entries({
    Income: k.income, Expenses: k.expenses, Net: k.net,
    "Tax Collected": k.taxCollected, "Tax Paid": k.taxPaid,
    "AR Outstanding": k.arOutstanding, "AP Outstanding": k.apOutstanding,
  }).forEach(([k, v]) => rows.push([k, v || 0]));
  rows.push([]);
  rows.push(["Expense Category", "Amount"]);
  (data.expenseByCategory || []).forEach((e) => rows.push([e.category, e.amount]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'"')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "overview.csv"; a.click(); URL.revokeObjectURL(a.href);
};

const FinancialMasterDashboard = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [dashboardData, setDashboardData] = useState(null);
    const [filters, setFilters] = useState({
        source: 'All',
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
            console.log('Dashboard data received:', data); // Debug log
            console.log('Expense breakdown data:', data?.expenseByCategory); // Debug log
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

    const handleFilterChange = (field, value) => {
        setFilters(prev => ({
            ...prev,
            [field]: value
        }));
    };

    // colors for pie (kept neutral)
    const PIE = ["#1f7aec", "#08a88a", "#f2c94c", "#eb5757", "#7b61ff", "#2c3a4b"];

    // Mock expense data for testing (when no real data exists)
    const getMockExpenseData = () => [
        { category: "Office Supplies", amount: 25000 },
        { category: "Travel", amount: 15000 },
        { category: "Marketing", amount: 35000 },
        { category: "Software", amount: 20000 },
        { category: "Utilities", amount: 10000 }
    ];

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

    const trend = dashboardData?.trend?.series || [];
    const ci = trend.find((s) => s.key === "cashIn")?.points || [];
    const co = trend.find((s) => s.key === "cashOut")?.points || [];
    const nt = trend.find((s) => s.key === "net")?.points || [];
    const k = dashboardData?.kpis || {};

    // Filter bar component
    const FilterBar = (
        <SectionCard title="Filters" sx={{ mb: 3 }}>
            <Grid container spacing={2} alignItems="center">
                <Grid size={{ xs: 12, sm: 6, md: 2 }}>
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
                
                <Grid size={{ xs: 12, sm: 6, md: 2 }}>
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
                        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                            <DatePicker
                                label="Start Date"
                                value={filters.customStart}
                                onChange={(date) => handleFilterChange('customStart', date)}
                                slotProps={{ textField: { size: 'small', fullWidth: true } }}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                            <DatePicker
                                label="End Date"
                                value={filters.customEnd}
                                onChange={(date) => handleFilterChange('customEnd', date)}
                                slotProps={{ textField: { size: 'small', fullWidth: true } }}
                            />
                        </Grid>
                    </>
                )}

                <Grid size={{ xs: 12, sm: 6, md: 2 }}>
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

                <Grid size={{ xs: 12, sm: "auto" }}>
                    <Button
                        variant="outlined"
                        startIcon={<RefreshIcon />}
                        onClick={loadDashboardData}
                        disabled={loading}
                    >
                        Refresh
                    </Button>
                </Grid>
            </Grid>
        </SectionCard>
    );

    return (
        <Stack spacing={2} sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h4" component="h1">
                    Financial Master Dashboard
                </Typography>
            </Box>

            {/* Filter bar */}
            {FilterBar}

            {/* KPIs row */}
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <KpiStat 
                        title="Income (Cash-In)" 
                        value={k.income} 
                        deltaPct={pctDelta(trend, "cashIn")} 
                        trend={ci} 
                        tone="success" 
                        loading={loading} 
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <KpiStat 
                        title="Expenses (Cash-Out)" 
                        value={k.expenses} 
                        deltaPct={pctDelta(trend, "cashOut")} 
                        trend={co} 
                        tone="error" 
                        loading={loading} 
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <KpiStat 
                        title="Net Cash Flow" 
                        value={k.net} 
                        deltaPct={pctDelta(trend, "net")} 
                        trend={nt} 
                        tone="primary" 
                        loading={loading} 
                    />
                </Grid>
            </Grid>

            {/* Trend + Expense breakdown */}
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 8 }}>
                    <SectionCard
                        title="Cash-In vs Cash-Out (Last 12 months)"
                        subheader="IST periods • cash view"
                        action={
                            <Button 
                                size="small" 
                                variant="outlined" 
                                startIcon={<DownloadIcon />} 
                                onClick={() => exportOverviewCSV(dashboardData)}
                            >
                                Export CSV
                            </Button>
                        }
                    >
                        <div style={{ width: "100%", height: 340 }}>
                            <ResponsiveContainer>
                                <LineChart
                                    data={(ci || []).map((p, i) => ({ 
                                        x: p.x, 
                                        cashIn: p.y, 
                                        cashOut: co[i]?.y ?? 0, 
                                        net: nt[i]?.y ?? (p.y - (co[i]?.y ?? 0)) 
                                    }))}
                                    margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                                    <XAxis dataKey="x" />
                                    <YAxis tickFormatter={(v) => new Intl.NumberFormat("en-IN").format(v)} />
                                    <RechartsTooltip formatter={(v) => formatINR(v)} />
                                    <Legend verticalAlign="top" height={32} />
                                    <Line type="monotone" dataKey="cashIn" name="Cash-In" stroke="#08a88a" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="cashOut" name="Cash-Out" stroke="#eb5757" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="net" name="Net" stroke="#1f7aec" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </SectionCard>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <SectionCard title="Expense Breakdown" subheader="by category">
                        <div style={{ width: "100%", height: 340 }}>
                            {loading ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                                    <Skeleton variant="circular" width={200} height={200} />
                                </Box>
                            ) : (
                                <ResponsiveContainer>
                                    <PieChart>
                                        <Pie
                                            dataKey="amount"
                                            nameKey="category"
                                            data={dashboardData?.expenseByCategory?.length > 0 ? 
                                                dashboardData.expenseByCategory : 
                                                getMockExpenseData()
                                            }
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={100}
                                            paddingAngle={2}
                                            label={({ category, percent }) => 
                                                percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''
                                            }
                                        >
                                            {(dashboardData?.expenseByCategory?.length > 0 ? 
                                                dashboardData.expenseByCategory : 
                                                getMockExpenseData()
                                            ).map((_, i) => (
                                                <Cell key={i} fill={PIE[i % PIE.length]} />
                                            ))}
                                        </Pie>
                                        <RechartsTooltip 
                                            formatter={(value, name) => [formatINR(value), name]}
                                            labelFormatter={() => ''}
                                        />
                                        <Legend 
                                            verticalAlign="bottom" 
                                            height={36}
                                            iconType="square"
                                            wrapperStyle={{ fontSize: '12px' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                        {(!dashboardData?.expenseByCategory || dashboardData.expenseByCategory.length === 0) && (
                            <Box sx={{ mt: 1, p: 1, bgcolor: 'info.lighter', borderRadius: 1 }}>
                                <Typography variant="caption" color="info.main">
                                    📊 Showing sample data - connect your expense sources to see real data
                                </Typography>
                            </Box>
                        )}
                    </SectionCard>
                </Grid>
            </Grid>

            {/* AR / AP widgets */}
            <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <SectionCard title="Accounts Receivable" subheader="Outstanding & Aging">
                        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                            <Button size="small" variant="outlined">
                                Outstanding: {formatINR(k.arOutstanding || 0)}
                            </Button>
                            <Button size="small" color="error" variant="contained">
                                Overdue: {formatINR(
                                    (dashboardData?.ar?.aging?.["16_30"] || 0) + 
                                    (dashboardData?.ar?.aging?.["31_60"] || 0) + 
                                    (dashboardData?.ar?.aging?.["61_90"] || 0) + 
                                    (dashboardData?.ar?.aging?.["90_plus"] || 0)
                                )}
                            </Button>
                        </Stack>
                        {/* Tiny aging bars */}
                        <Stack spacing={1}>
                            {["0_15","16_30","31_60","61_90","90_plus"].map((b) => (
                                <Stack key={b} direction="row" alignItems="center" spacing={1}>
                                    <div style={{ width: 96, color: "#6b778c" }}>
                                        {b.replace("_", "–")}d
                                    </div>
                                    <div style={{ 
                                        flex: 1, 
                                        height: 8, 
                                        background: "#eef1f5", 
                                        borderRadius: 8, 
                                        overflow: "hidden" 
                                    }}>
                                        <div style={{
                                            width: `${Math.min(100, ((dashboardData?.ar?.aging?.[b] || 0) / (k.arOutstanding || 1)) * 100)}%`,
                                            height: "100%", 
                                            background: "#1f7aec"
                                        }}/>
                                    </div>
                                    <div style={{ width: 120, textAlign: "right" }}>
                                        {formatINR(dashboardData?.ar?.aging?.[b] || 0)}
                                    </div>
                                </Stack>
                            ))}
                        </Stack>
                    </SectionCard>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                    <SectionCard title="Accounts Payable" subheader="Due soon & Aging">
                        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                            <Button size="small" variant="outlined">
                                AP Outstanding: {formatINR(k.apOutstanding || 0)}
                            </Button>
                            <Button size="small" color="warning" variant="contained">
                                Due next 7/30: {formatINR(
                                    (dashboardData?.ap?.dueSoon?.next7 || 0) + 
                                    (dashboardData?.ap?.dueSoon?.next30 || 0)
                                )}
                            </Button>
                        </Stack>
                        <Stack spacing={1}>
                            {["0_15","16_30","31_60","61_90","90_plus"].map((b) => (
                                <Stack key={b} direction="row" alignItems="center" spacing={1}>
                                    <div style={{ width: 96, color: "#6b778c" }}>
                                        {b.replace("_", "–")}d
                                    </div>
                                    <div style={{ 
                                        flex: 1, 
                                        height: 8, 
                                        background: "#eef1f5", 
                                        borderRadius: 8, 
                                        overflow: "hidden" 
                                    }}>
                                        <div style={{
                                            width: `${Math.min(100, ((dashboardData?.ap?.aging?.[b] || 0) / (k.apOutstanding || 1)) * 100)}%`,
                                            height: "100%", 
                                            background: "#08a88a"
                                        }}/>
                                    </div>
                                    <div style={{ width: 120, textAlign: "right" }}>
                                        {formatINR(dashboardData?.ap?.aging?.[b] || 0)}
                                    </div>
                                </Stack>
                            ))}
                        </Stack>
                    </SectionCard>
                </Grid>
            </Grid>

            {/* Recent transactions */}
            <SectionCard title="Recent Transactions" subheader="last 50 across AR / AP / Salaries">
                <div className="table-responsive">
                    <table className="table" style={{ width: "100%", borderSpacing: 0 }}>
                        <thead>
                            <tr style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
                                <th style={{ padding: 12, textAlign: "left" }}>Date</th>
                                <th>Type</th>
                                <th>Party</th>
                                <th>Reference</th>
                                <th style={{ textAlign: "right", paddingRight: 12 }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(dashboardData?.recentTransactions || []).map((t) => (
                                <tr key={`${t.type}-${t.id}`} style={{ borderTop: "1px solid #eef1f5" }}>
                                    <td style={{ padding: 12 }}>
                                        {new Date(t.date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                                    </td>
                                    <td>
                                        <span style={{ 
                                            padding: "4px 8px", 
                                            borderRadius: "999px", 
                                            fontSize: "12px", 
                                            background: "#eef1f5",
                                            color: "#6b778c"
                                        }}>
                                            {t.type}
                                        </span>
                                    </td>
                                    <td>{t.party}</td>
                                    <td>{t.ref}</td>
                                    <td style={{ textAlign: "right", paddingRight: 12 }}>
                                        {formatINR(t.amount)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        </Stack>
    );
};

export default FinancialMasterDashboard;
