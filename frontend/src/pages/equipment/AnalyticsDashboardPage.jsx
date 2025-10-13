import React, { useState, useEffect } from 'react';
import {
    Container,
    Typography,
    Paper,
    Alert,
    Box,
    Button,
    Grid,
    Card,
    CardContent,
    CircularProgress,
    Chip,
} from '@mui/material';
import {
    BarChart as BarChartIcon,
    ArrowBack as ArrowBackIcon,
    TrendingUp as TrendingUpIcon,
    CheckCircle as CheckCircleIcon,
    Build as BuildIcon,
    AttachMoney as MoneyIcon,
    Category as CategoryIcon,
    Assessment as AssessmentIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import AdminLayout from '../../components/layout/AdminLayout';
import { equipmentAPI } from '../../services/equipmentApi';
import toast from 'react-hot-toast';

const AnalyticsDashboardPage = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState(null);
    const [crewScores, setCrewScores] = useState([]);
    const [utilizationTrend, setUtilizationTrend] = useState([]);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const fetchAnalytics = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch all endpoints, but don't fail if one fails
            const [summaryRes, crewRes, trendRes] = await Promise.allSettled([
                equipmentAPI.getAnalyticsSummary(),
                equipmentAPI.getCrewScores({ limit: 10 }),
                equipmentAPI.getUtilizationTrend({ days: 30 })
            ]);
            
            // Handle summary
            if (summaryRes.status === 'fulfilled') {
                console.log('Analytics data:', summaryRes.value.data);
                setSummary(summaryRes.value.data);
            } else {
                console.error('Summary error:', summaryRes.reason);
                toast.error('Failed to load summary data');
            }
            
            // Handle crew scores
            if (crewRes.status === 'fulfilled') {
                console.log('Crew scores:', crewRes.value.data);
                setCrewScores(crewRes.value.data || []);
            } else {
                console.error('Crew scores error:', crewRes.reason);
                setCrewScores([]);
            }
            
            // Handle utilization trend
            if (trendRes.status === 'fulfilled') {
                console.log('Utilization trend:', trendRes.value.data);
                setUtilizationTrend(trendRes.value.data || []);
            } else {
                console.error('Utilization trend error:', trendRes.reason);
                setUtilizationTrend([]);
            }
            
            // Only show error if all failed
            if (summaryRes.status === 'rejected' && crewRes.status === 'rejected' && trendRes.status === 'rejected') {
                setError('Failed to load analytics data');
            }
        } catch (error) {
            console.error('Error fetching analytics:', error);
            setError(error.response?.data?.detail || 'Failed to load analytics');
            toast.error('Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(value);
    };

    const getStatusChartData = () => {
        if (!summary) return [];
        return [
            { name: 'Available', value: summary.availableCount, color: '#00C49F' },
            { name: 'Checked Out', value: summary.checkedOutCount, color: '#0088FE' },
            { name: 'Maintenance', value: summary.maintenanceCount, color: '#FFBB28' },
            { name: 'Missing', value: summary.missingCount, color: '#FF8042' },
            { name: 'Retired', value: summary.retiredCount || 0, color: '#8884D8' },
        ].filter(item => item.value > 0);
    };

    const getCategoryChartData = () => {
        if (!summary || !summary.categoryBreakdown) return [];
        return Object.entries(summary.categoryBreakdown).map(([name, value]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            value,
        }));
    };

    if (loading) {
        return (
            <AdminLayout
                appBarTitle="Equipment Analytics"
                pageTitle="Analytics Dashboard"
                pageSubtitle="Equipment utilization, crew scores, and financial insights"
            >
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                    <CircularProgress />
                </Box>
            </AdminLayout>
        );
    }

    if (error) {
        return (
            <AdminLayout
                appBarTitle="Equipment Analytics"
                pageTitle="Analytics Dashboard"
                pageSubtitle="Equipment utilization, crew scores, and financial insights"
            >
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
                <Button variant="outlined" onClick={fetchAnalytics}>
                    Retry
                </Button>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            appBarTitle="Equipment Analytics"
            pageTitle="Analytics Dashboard"
            pageSubtitle="Equipment utilization, crew scores, and financial insights"
        >
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/equipment')}
                >
                    Back to Dashboard
                </Button>
                <Button variant="outlined" onClick={fetchAnalytics}>
                    Refresh
                </Button>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <AssessmentIcon color="primary" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Total Assets
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {summary?.totalAssets || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <MoneyIcon color="success" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Total Value
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {formatCurrency(summary?.totalValue || 0)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    Available
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {summary?.availableCount || 0}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {summary?.totalAssets > 0
                                    ? `${Math.round((summary.availableCount / summary.totalAssets) * 100)}% of total`
                                    : '0% of total'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                                <TrendingUpIcon color="info" sx={{ mr: 1 }} />
                                <Typography variant="body2" color="text.secondary">
                                    In Use
                                </Typography>
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {summary?.checkedOutCount || 0}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {summary?.totalAssets > 0
                                    ? `${Math.round((summary.checkedOutCount / summary.totalAssets) * 100)}% utilization`
                                    : '0% utilization'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Charts */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                {/* Equipment Status Distribution */}
                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" gutterBottom>
                            Equipment Status Distribution
                        </Typography>
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={getStatusChartData()}
                                    cx="50%"
                                    cy="50%"
                                    labelLine={false}
                                    label={({ name, value, percent }) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    dataKey="value"
                                >
                                    {getStatusChartData().map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </Paper>
                </Grid>

                {/* Category Breakdown */}
                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper sx={{ p: 3 }}>
                        <Typography variant="h6" gutterBottom>
                            Equipment by Category
                        </Typography>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={getCategoryChartData()}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="value" fill="#0088FE" />
                            </BarChart>
                        </ResponsiveContainer>
                    </Paper>
                </Grid>
            </Grid>

            {/* Utilization Trend */}
            {utilizationTrend.length > 0 && (
                <Paper sx={{ p: 3, mb: 4 }}>
                    <Typography variant="h6" gutterBottom>
                        Equipment Utilization Trend (Last 30 Days)
                    </Typography>
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={utilizationTrend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                                dataKey="date" 
                                tickFormatter={(date) => new Date(date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
                            />
                            <YAxis 
                                yAxisId="left"
                                label={{ value: 'Utilization Rate (%)', angle: -90, position: 'insideLeft' }}
                            />
                            <YAxis 
                                yAxisId="right" 
                                orientation="right"
                                label={{ value: 'Assets In Use', angle: 90, position: 'insideRight' }}
                            />
                            <Tooltip 
                                labelFormatter={(date) => new Date(date).toLocaleDateString('en-IN', { 
                                    weekday: 'short', 
                                    month: 'short', 
                                    day: 'numeric' 
                                })}
                                formatter={(value, name) => {
                                    if (name === 'utilizationRate') return [value + '%', 'Utilization Rate'];
                                    if (name === 'assetsInUse') return [value, 'Assets In Use'];
                                    return [value, name];
                                }}
                            />
                            <Legend />
                            <Line 
                                yAxisId="left"
                                type="monotone" 
                                dataKey="utilizationRate" 
                                stroke="#8884d8" 
                                name="Utilization Rate"
                                strokeWidth={2}
                            />
                            <Line 
                                yAxisId="right"
                                type="monotone" 
                                dataKey="assetsInUse" 
                                stroke="#82ca9d" 
                                name="Assets In Use"
                                strokeWidth={2}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </Paper>
            )}

            {/* Crew Responsibility Scores */}
            {crewScores.length > 0 && (
                <Paper sx={{ p: 3, mb: 4 }}>
                    <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                        Top Crew Members by Responsibility Score
                    </Typography>
                    <Box sx={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e0e0e0' }}>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Rank</th>
                                    <th style={{ padding: '12px', textAlign: 'left' }}>Name</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Total Checkouts</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>On-Time Return Rate</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Condition Score</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Damage Incidents</th>
                                    <th style={{ padding: '12px', textAlign: 'center' }}>Responsibility Score</th>
                                </tr>
                            </thead>
                            <tbody>
                                {crewScores.map((crew, index) => (
                                    <tr key={crew.uid} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                        <td style={{ padding: '12px', textAlign: 'left' }}>
                                            <Typography variant="body2" fontWeight="bold">
                                                #{index + 1}
                                            </Typography>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'left' }}>
                                            <Typography variant="body2">{crew.name}</Typography>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <Typography variant="body2">{crew.totalCheckouts}</Typography>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <Chip 
                                                label={`${crew.onTimeReturnRate}%`}
                                                color={crew.onTimeReturnRate >= 80 ? 'success' : crew.onTimeReturnRate >= 50 ? 'warning' : 'error'}
                                                size="small"
                                            />
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <Typography variant="body2">{crew.averageConditionScore}/5</Typography>
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <Chip 
                                                label={crew.damageIncidents}
                                                color={crew.damageIncidents === 0 ? 'success' : crew.damageIncidents <= 2 ? 'warning' : 'error'}
                                                size="small"
                                            />
                                        </td>
                                        <td style={{ padding: '12px', textAlign: 'center' }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                                                <Typography variant="body1" fontWeight="bold">
                                                    {crew.responsibilityScore}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    /100
                                                </Typography>
                                            </Box>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Box>
                </Paper>
            )}

            {/* Additional Metrics */}
            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <BuildIcon color="warning" sx={{ mr: 1 }} />
                                <Typography variant="h6">
                                    Maintenance
                                </Typography>
                            </Box>
                            <Typography variant="body1">
                                {summary?.maintenanceCount || 0} items in maintenance
                            </Typography>
                            {summary?.maintenanceCount > 0 && (
                                <Chip
                                    label="Needs attention"
                                    color="warning"
                                    size="small"
                                    sx={{ mt: 1 }}
                                />
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <MoneyIcon color="success" sx={{ mr: 1 }} />
                                <Typography variant="h6">
                                    Rental Revenue
                                </Typography>
                            </Box>
                            <Typography variant="body1">
                                {formatCurrency(summary?.monthlyExternalRentalRevenue || 0)}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                This month
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid size={{ xs: 12, md: 4 }}>
                    <Card>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                                <CategoryIcon color="primary" sx={{ mr: 1 }} />
                                <Typography variant="h6">
                                    Categories
                                </Typography>
                            </Box>
                            <Typography variant="body1">
                                {Object.keys(summary?.categoryBreakdown || {}).length} categories
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Across all equipment
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </AdminLayout>
    );
};

export default AnalyticsDashboardPage;
