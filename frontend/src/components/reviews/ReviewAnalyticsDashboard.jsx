import React from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Skeleton
} from '@mui/material';
import {
  PendingActions as PendingIcon,
  HourglassEmpty as HourglassIcon,
  CheckCircle as CheckCircleIcon,
  Timer as TimerIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon
} from '@mui/icons-material';

/**
 * StatCard Component
 * Displays a single statistic with icon and trend
 */
const StatCard = ({ title, value, trend, color, icon, loading }) => {
  const colorMap = {
    warning: { bg: '#FFF9E6', text: '#F59E0B', border: '#FFD700' },
    info: { bg: '#E6F7FF', text: '#1890FF', border: '#1890FF' },
    success: { bg: '#E8F5E9', text: '#4CAF50', border: '#4CAF50' },
    error: { bg: '#FFEBEE', text: '#F44336', border: '#F44336' }
  };

  const colorConfig = colorMap[color] || colorMap.info;

  if (loading) {
    return (
      <Card sx={{ height: '100%', borderRadius: '12px' }}>
        <CardContent>
          <Skeleton variant="rectangular" height={80} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      sx={{
        height: '100%',
        borderRadius: '12px',
        border: '1px solid',
        borderColor: colorConfig.border,
        backgroundColor: colorConfig.bg,
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 3
        }
      }}
    >
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ color: colorConfig.text, fontWeight: 700, mt: 1 }}>
              {value}
            </Typography>
            {trend !== undefined && trend !== null && (
              <Box display="flex" alignItems="center" gap={0.5} mt={1}>
                {trend >= 0 ? (
                  <TrendingUpIcon fontSize="small" sx={{ color: 'success.main' }} />
                ) : (
                  <TrendingDownIcon fontSize="small" sx={{ color: 'error.main' }} />
                )}
                <Typography
                  variant="caption"
                  sx={{
                    color: trend >= 0 ? 'success.main' : 'error.main',
                    fontWeight: 600
                  }}
                >
                  {Math.abs(trend)}%
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  vs last week
                </Typography>
              </Box>
            )}
          </Box>
          <Box
            sx={{
              p: 1.5,
              borderRadius: '50%',
              backgroundColor: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {React.cloneElement(icon, { sx: { color: colorConfig.text, fontSize: 28 } })}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

/**
 * ReviewAnalyticsDashboard Component
 * Displays analytics overview for reviews
 */
const ReviewAnalyticsDashboard = ({ analytics, loading }) => {
  return (
    <Grid container spacing={3} sx={{ mb: 4 }}>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Pending Reviews"
          value={analytics?.pending || 0}
          trend={analytics?.pendingTrend}
          color="warning"
          icon={<PendingIcon />}
          loading={loading}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="In Progress"
          value={analytics?.inProgress || 0}
          trend={analytics?.inProgressTrend}
          color="info"
          icon={<HourglassIcon />}
          loading={loading}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Avg Response Time"
          value={analytics?.avgResponseTimeHours ? `${analytics.avgResponseTimeHours} hrs` : 'N/A'}
          trend={analytics?.responseTrend}
          color="success"
          icon={<TimerIcon />}
          loading={loading}
        />
      </Grid>
      <Grid item xs={12} sm={6} md={3}>
        <StatCard
          title="Resolved Today"
          value={analytics?.resolvedToday || 0}
          trend={analytics?.resolvedTrend}
          color="success"
          icon={<CheckCircleIcon />}
          loading={loading}
        />
      </Grid>
    </Grid>
  );
};

export default ReviewAnalyticsDashboard;
