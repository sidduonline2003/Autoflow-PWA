import React, { memo } from 'react';
import { Grid, Card, CardContent, Typography, Box, Avatar, Skeleton, LinearProgress } from '@mui/material';
import { People, EventAvailable, WarningAmber, TrendingUp, CheckCircle, Schedule } from '@mui/icons-material';

const StatCard = memo(({ title, value, subtitle, icon, color, trend, progressValue, isLoading }) => (
    <Card sx={{ 
        height: '100%', 
        borderRadius: 3, 
        boxShadow: '0 2px 10px rgba(0,0,0,0.03)', 
        border: '1px solid #f1f5f9',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            borderColor: `${color}.light`
        }
    }}>
        <CardContent sx={{ p: '20px !important', '&:last-child': { pb: '20px !important' } }}>
            {isLoading ? (
                <>
                    <Skeleton variant="text" width="60%" height={20} />
                    <Skeleton variant="text" width="40%" height={40} />
                    <Skeleton variant="text" width="80%" height={16} />
                </>
            ) : (
                <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Box sx={{ flex: 1 }}>
                            <Typography 
                                variant="body2" 
                                color="text.secondary" 
                                fontWeight={600} 
                                sx={{ 
                                    mb: 0.5, 
                                    textTransform: 'uppercase', 
                                    fontSize: '0.7rem', 
                                    letterSpacing: '0.5px' 
                                }}
                            >
                                {title}
                            </Typography>
                            <Typography 
                                variant="h4" 
                                fontWeight={700} 
                                sx={{ 
                                    color: '#1e293b',
                                    background: trend === 'up' ? 'linear-gradient(135deg, #1e293b 0%, #22c55e 100%)' : 
                                               trend === 'down' ? 'linear-gradient(135deg, #1e293b 0%, #ef4444 100%)' : '#1e293b',
                                    WebkitBackgroundClip: trend ? 'text' : 'unset',
                                    WebkitTextFillColor: trend ? 'transparent' : 'inherit',
                                    backgroundClip: trend ? 'text' : 'unset'
                                }}
                            >
                                {value}
                            </Typography>
                        </Box>
                        <Avatar 
                            variant="rounded" 
                            sx={{ 
                                bgcolor: `${color}.50`, 
                                color: `${color}.main`, 
                                width: 48, 
                                height: 48,
                                boxShadow: `0 4px 12px ${color === 'primary' ? 'rgba(59, 130, 246, 0.2)' : 
                                            color === 'success' ? 'rgba(34, 197, 94, 0.2)' : 
                                            color === 'warning' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(6, 182, 212, 0.2)'}`
                            }}
                        >
                            {icon}
                        </Avatar>
                    </Box>
                    
                    {/* Progress bar for metrics that support it */}
                    {progressValue !== undefined && (
                        <Box sx={{ mt: 2 }}>
                            <LinearProgress 
                                variant="determinate" 
                                value={Math.min(progressValue, 100)} 
                                sx={{ 
                                    height: 6, 
                                    borderRadius: 3,
                                    bgcolor: `${color}.50`,
                                    '& .MuiLinearProgress-bar': {
                                        bgcolor: `${color}.main`,
                                        borderRadius: 3
                                    }
                                }}
                            />
                        </Box>
                    )}
                    
                    {subtitle && (
                        <Box sx={{ mt: progressValue !== undefined ? 1 : 2, display: 'flex', alignItems: 'center' }}>
                            <Typography 
                                variant="caption" 
                                sx={{ 
                                    color: trend === 'up' ? 'success.main' : trend === 'down' ? 'error.main' : 'text.secondary', 
                                    fontWeight: 600, 
                                    display: 'flex', 
                                    alignItems: 'center',
                                    gap: 0.5
                                }}
                            >
                                {trend === 'up' && <TrendingUp sx={{ fontSize: 14 }} />}
                                {subtitle}
                            </Typography>
                        </Box>
                    )}
                </>
            )}
        </CardContent>
    </Card>
));

StatCard.displayName = 'StatCard';

const StatsWidget = memo(({ summary, isLoading = false }) => {
    // Handle null/undefined summary gracefully
    const safeSum = summary || {
        totalCheckedIn: 0,
        totalAssigned: 0,
        attendanceRate: 0,
        totalEvents: 0,
        lateArrivals: 0,
        remoteCheckIns: 0,
        totalCheckedOut: 0
    };
    
    return (
        <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard 
                    title="Active Workforce" 
                    value={`${safeSum.totalCheckedIn}/${safeSum.totalAssigned}`} 
                    subtitle={`${Math.round(safeSum.attendanceRate || 0)}% Attendance Rate`}
                    icon={<People />}
                    color="primary"
                    trend={safeSum.attendanceRate >= 80 ? 'up' : undefined}
                    progressValue={safeSum.attendanceRate}
                    isLoading={isLoading}
                />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard 
                    title="Event Coverage" 
                    value={safeSum.totalEvents} 
                    subtitle="Active Events Today"
                    icon={<EventAvailable />}
                    color="success"
                    isLoading={isLoading}
                />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard 
                    title="Anomalies" 
                    value={safeSum.lateArrivals + (safeSum.remoteCheckIns || 0)} 
                    subtitle="GPS or Time Flags"
                    icon={<WarningAmber />}
                    color="warning"
                    trend={(safeSum.lateArrivals + (safeSum.remoteCheckIns || 0)) > 3 ? 'down' : undefined}
                    isLoading={isLoading}
                />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <StatCard 
                    title="Completion" 
                    value={safeSum.totalCheckedOut} 
                    subtitle="Shifts Completed"
                    icon={<CheckCircle />}
                    color="info"
                    progressValue={safeSum.totalAssigned > 0 ? (safeSum.totalCheckedOut / safeSum.totalAssigned) * 100 : 0}
                    isLoading={isLoading}
                />
            </Grid>
        </Grid>
    );
});

StatsWidget.displayName = 'StatsWidget';

export default StatsWidget;