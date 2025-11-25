import React from 'react';
import { Grid, Card, CardContent, Typography, Box, Avatar } from '@mui/material';
import { People, EventAvailable, WarningAmber, TrendingUp } from '@mui/icons-material';

const StatCard = ({ title, value, subtitle, icon, color, trend }) => (
    <Card sx={{ height: '100%', borderRadius: 3, boxShadow: '0 2px 10px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
        <CardContent sx={{ p: '20px !important', '&:last-child': { pb: '20px !important' } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                    <Typography variant="body2" color="text.secondary" fontWeight={600} sx={{ mb: 0.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.5px' }}>
                        {title}
                    </Typography>
                    <Typography variant="h4" fontWeight={700} sx={{ color: '#1e293b' }}>
                        {value}
                    </Typography>
                </Box>
                <Avatar variant="rounded" sx={{ bgcolor: `${color}.50`, color: `${color}.main`, width: 48, height: 48 }}>
                    {icon}
                </Avatar>
            </Box>
            {subtitle && (
                <Box sx={{ mt: 2, display: 'flex', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: trend === 'up' ? 'success.main' : trend === 'down' ? 'error.main' : 'text.secondary', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                        {subtitle}
                    </Typography>
                </Box>
            )}
        </CardContent>
    </Card>
);

const StatsWidget = ({ summary }) => {
    return (
        <Grid container spacing={3}>
            <Grid item xs={12} sm={6} md={3}>
                <StatCard 
                    title="Active Workforce" 
                    value={`${summary.totalCheckedIn}/${summary.totalAssigned}`} 
                    subtitle={`${Math.round(summary.attendanceRate)}% Attendance Rate`}
                    icon={<People />}
                    color="primary"
                    trend="up"
                />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
                <StatCard 
                    title="Event Coverage" 
                    value={summary.totalEvents} 
                    subtitle="Active Events Today"
                    icon={<EventAvailable />}
                    color="success"
                />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
                <StatCard 
                    title="Anomalies" 
                    value={summary.lateArrivals + (summary.remoteCheckIns || 0)} 
                    subtitle="GPS or Time Flags"
                    icon={<WarningAmber />}
                    color="warning"
                    trend="down"
                />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
                <StatCard 
                    title="Completion" 
                    value={summary.totalCheckedOut} 
                    subtitle="Shifts Completed"
                    icon={<TrendingUp />}
                    color="info"
                />
            </Grid>
        </Grid>
    );
};

export default StatsWidget;