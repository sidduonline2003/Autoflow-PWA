import React from 'react';
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
    IconButton
} from '@mui/material';
import { 
    CheckCircle, 
    Warning, 
    DirectionsRun, 
    Login, 
    Logout,
    ArrowForward
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';

const ActivityStream = ({ activities = [] }) => {
    
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
                borderRadius: 3
            }}
        >
            <Box sx={{ p: 2, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
                    Live Activity
                </Typography>
                <Chip label="Real-time" color="error" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />
            </Box>
            
            <List sx={{ overflowY: 'auto', flexGrow: 1, px: 1 }}>
                {activities.length === 0 ? (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                        <Typography variant="body2" color="text.secondary">No recent activity today.</Typography>
                    </Box>
                ) : (
                    activities.map((activity, index) => (
                        <ListItem 
                            key={activity.id || index} 
                            alignItems="flex-start"
                            sx={{ 
                                mb: 1, 
                                borderRadius: 2, 
                                '&:hover': { bgcolor: '#f8fafc' },
                                transition: 'background 0.2s'
                            }}
                            secondaryAction={
                                <IconButton edge="end" size="small">
                                    <ArrowForward fontSize="small" sx={{ opacity: 0.3 }} />
                                </IconButton>
                            }
                        >
                            <ListItemAvatar sx={{ minWidth: 40 }}>
                                <Avatar 
                                    sx={{ 
                                        width: 32, 
                                        height: 32, 
                                        bgcolor: `${getColor(activity.type)}.light`,
                                        color: `${getColor(activity.type)}.main`
                                    }}
                                >
                                    {getIcon(activity.type)}
                                </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                                primary={
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                            {activity.userName}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                            {activity.timestamp ? formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true }) : 'Just now'}
                                        </Typography>
                                    </Box>
                                }
                                secondary={
                                    <React.Fragment>
                                        <Typography
                                            sx={{ display: 'inline', fontSize: '0.75rem' }}
                                            component="span"
                                            variant="body2"
                                            color="text.primary"
                                        >
                                            {activity.event}
                                        </Typography>
                                        <br />
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            {activity.message}
                                            {activity.distance && (
                                                <span style={{ color: activity.distance > 100 ? '#ed6c02' : '#2e7d32' }}>
                                                    ({Math.round(activity.distance)}m)
                                                </span>
                                            )}
                                        </Typography>
                                    </React.Fragment>
                                }
                            />
                        </ListItem>
                    ))
                )}
            </List>
        </Paper>
    );
};

export default ActivityStream;