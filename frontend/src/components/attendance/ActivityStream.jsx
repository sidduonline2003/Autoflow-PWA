import React, { memo, useMemo } from 'react';
import { 
    List, 
    ListItem, 
    ListItemAvatar, 
    ListItemText, 
    Avatar, 
    Typography, 
    Paper, 
    Box,
    Chip,
    IconButton,
    Skeleton,
    Fade,
    Badge,
    Tooltip
} from '@mui/material';
import { 
    CheckCircle, 
    Warning, 
    DirectionsRun, 
    Login, 
    Logout,
    ArrowForward,
    FiberManualRecord as DotIcon,
    Notifications as NotificationIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

// Memoized activity item component
const ActivityItem = memo(({ activity, index }) => {
    const getIcon = (type) => {
        switch (type) {
            case 'check_in': return <Login sx={{ width: 16, height: 16 }} />;
            case 'check_out': return <Logout sx={{ width: 16, height: 16 }} />;
            case 'late': return <Warning sx={{ width: 16, height: 16 }} />;
            case 'remote': return <DirectionsRun sx={{ width: 16, height: 16 }} />;
            default: return <CheckCircle sx={{ width: 16, height: 16 }} />;
        }
    };

    const getColor = (type) => {
        switch (type) {
            case 'check_in': return 'success';
            case 'check_out': return 'default';
            case 'late': return 'error';
            case 'remote': return 'warning';
            default: return 'primary';
        }
    };
    
    const getStatusLabel = (type) => {
        switch (type) {
            case 'check_in': return 'In';
            case 'check_out': return 'Out';
            case 'late': return 'Late';
            case 'remote': return 'Remote';
            default: return '';
        }
    };
    
    const formattedTime = useMemo(() => {
        if (!activity.timestamp) return 'Just now';
        try {
            return formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true });
        } catch {
            return 'Just now';
        }
    }, [activity.timestamp]);
    
    const color = getColor(activity.type);

    return (
        <Fade in timeout={300 + (index * 50)}>
            <ListItem 
                alignItems="flex-start"
                sx={{ 
                    mb: 0.5, 
                    borderRadius: 2, 
                    py: 1.5,
                    px: 1.5,
                    bgcolor: index === 0 ? `${color}.50` : 'transparent',
                    border: index === 0 ? `1px solid` : 'none',
                    borderColor: index === 0 ? `${color}.200` : 'transparent',
                    '&:hover': { bgcolor: '#f8fafc' },
                    transition: 'all 0.2s ease'
                }}
                secondaryAction={
                    <Tooltip title="View Details">
                        <IconButton edge="end" size="small" sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}>
                            <ArrowForward fontSize="small" />
                        </IconButton>
                    </Tooltip>
                }
            >
                <ListItemAvatar sx={{ minWidth: 44 }}>
                    <Badge
                        overlap="circular"
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        badgeContent={
                            index === 0 ? (
                                <DotIcon sx={{ width: 10, height: 10, color: 'success.main', animation: 'pulse 1.5s infinite' }} />
                            ) : null
                        }
                    >
                        <Avatar 
                            sx={{ 
                                width: 36, 
                                height: 36, 
                                bgcolor: `${color}.100`,
                                color: `${color}.main`,
                                boxShadow: index === 0 ? `0 0 0 2px ${color === 'success' ? '#22c55e' : color === 'error' ? '#ef4444' : color === 'warning' ? '#eab308' : '#64748b'}40` : 'none'
                            }}
                        >
                            {getIcon(activity.type)}
                        </Avatar>
                    </Badge>
                </ListItemAvatar>
                <ListItemText
                    primary={
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e293b' }}>
                                    {activity.userName}
                                </Typography>
                                <Chip 
                                    label={getStatusLabel(activity.type)}
                                    size="small"
                                    color={color}
                                    sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                                />
                            </Box>
                            <Typography 
                                variant="caption" 
                                color="text.secondary" 
                                sx={{ 
                                    fontSize: '0.68rem',
                                    whiteSpace: 'nowrap',
                                    ml: 1
                                }}
                            >
                                {formattedTime}
                            </Typography>
                        </Box>
                    }
                    secondary={
                        <React.Fragment>
                            <Typography
                                sx={{ 
                                    display: 'block', 
                                    fontSize: '0.75rem',
                                    color: '#475569',
                                    lineHeight: 1.4,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    maxWidth: 180
                                }}
                                component="span"
                                variant="body2"
                            >
                                {activity.event}
                            </Typography>
                            {activity.distance && (
                                <Typography 
                                    variant="caption" 
                                    component="span"
                                    sx={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: 0.5,
                                        mt: 0.25,
                                        color: activity.distance > 100 ? 'warning.main' : 'success.main',
                                        fontWeight: 500
                                    }}
                                >
                                    📍 {Math.round(activity.distance)}m away
                                </Typography>
                            )}
                        </React.Fragment>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
                />
            </ListItem>
        </Fade>
    );
});

ActivityItem.displayName = 'ActivityItem';

// Loading skeleton
const ActivitySkeleton = () => (
    <Box sx={{ px: 1, py: 0.5 }}>
        {[1, 2, 3, 4, 5].map((i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5 }}>
                <Skeleton variant="circular" width={36} height={36} />
                <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="60%" height={20} />
                    <Skeleton variant="text" width="80%" height={16} />
                </Box>
            </Box>
        ))}
    </Box>
);

const ActivityStream = memo(({ activities = [], isLoading = false }) => {
    // Count activities by type for the header
    const activityCounts = useMemo(() => {
        return activities.reduce((acc, activity) => {
            acc[activity.type] = (acc[activity.type] || 0) + 1;
            return acc;
        }, {});
    }, [activities]);
    
    const totalNewActivities = useMemo(() => {
        // Count activities in last 5 minutes
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return activities.filter(a => {
            if (!a.timestamp) return false;
            return new Date(a.timestamp).getTime() > fiveMinutesAgo;
        }).length;
    }, [activities]);

    return (
        <Paper 
            elevation={0} 
            sx={{ 
                height: '100%', 
                maxHeight: '600px', 
                display: 'flex', 
                flexDirection: 'column',
                bgcolor: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 3,
                overflow: 'hidden'
            }}
        >
            {/* Header */}
            <Box sx={{ 
                p: 2, 
                borderBottom: '1px solid #e2e8f0', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                bgcolor: '#fafbfc'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Badge badgeContent={totalNewActivities} color="error" max={9}>
                        <NotificationIcon sx={{ color: '#64748b', fontSize: 20 }} />
                    </Badge>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>
                        Live Activity
                    </Typography>
                </Box>
                <Chip 
                    icon={<DotIcon sx={{ fontSize: 8, animation: 'blink 1s infinite' }} />}
                    label="Real-time" 
                    color="success" 
                    size="small" 
                    variant="outlined" 
                    sx={{ 
                        height: 22, 
                        fontSize: '0.65rem', 
                        fontWeight: 700,
                        borderColor: '#22c55e',
                        color: '#16a34a',
                        '& .MuiChip-icon': { color: '#22c55e' },
                        '@keyframes blink': {
                            '0%, 50%': { opacity: 1 },
                            '51%, 100%': { opacity: 0.3 }
                        }
                    }} 
                />
            </Box>
            
            {/* Activity Counts Mini Bar */}
            {activities.length > 0 && (
                <Box sx={{ 
                    px: 2, 
                    py: 1, 
                    display: 'flex', 
                    gap: 1, 
                    borderBottom: '1px solid #f1f5f9',
                    bgcolor: '#f8fafc'
                }}>
                    {activityCounts.check_in > 0 && (
                        <Chip 
                            size="small" 
                            label={`${activityCounts.check_in} In`} 
                            color="success" 
                            variant="filled" 
                            sx={{ height: 20, fontSize: '0.65rem' }} 
                        />
                    )}
                    {activityCounts.check_out > 0 && (
                        <Chip 
                            size="small" 
                            label={`${activityCounts.check_out} Out`} 
                            sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#e2e8f0' }} 
                        />
                    )}
                    {activityCounts.late > 0 && (
                        <Chip 
                            size="small" 
                            label={`${activityCounts.late} Late`} 
                            color="error" 
                            variant="filled" 
                            sx={{ height: 20, fontSize: '0.65rem' }} 
                        />
                    )}
                    {activityCounts.remote > 0 && (
                        <Chip 
                            size="small" 
                            label={`${activityCounts.remote} Remote`} 
                            color="warning" 
                            variant="filled" 
                            sx={{ height: 20, fontSize: '0.65rem' }} 
                        />
                    )}
                </Box>
            )}
            
            {/* Activity List */}
            <List sx={{ overflowY: 'auto', flexGrow: 1, px: 0.5, py: 1 }}>
                {isLoading ? (
                    <ActivitySkeleton />
                ) : activities.length === 0 ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                        <Box sx={{ 
                            width: 60, 
                            height: 60, 
                            borderRadius: '50%', 
                            bgcolor: '#f1f5f9', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            mx: 'auto',
                            mb: 2
                        }}>
                            <NotificationIcon sx={{ color: '#94a3b8', fontSize: 28 }} />
                        </Box>
                        <Typography variant="body2" color="text.secondary" fontWeight={500}>
                            No activity yet today
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            Check-ins will appear here in real-time
                        </Typography>
                    </Box>
                ) : (
                    activities.map((activity, index) => (
                        <ActivityItem 
                            key={activity.id || index} 
                            activity={activity} 
                            index={index}
                        />
                    ))
                )}
            </List>
        </Paper>
    );
});

ActivityStream.displayName = 'ActivityStream';

export default ActivityStream;