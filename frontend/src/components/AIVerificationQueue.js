import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Button,
  Chip,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Badge,
  Paper,
  Grid,
  LinearProgress
} from '@mui/material';
import {
  Priority as PriorityIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Psychology as PsychologyIcon,
  Schedule as ScheduleIcon,
  TrendingUp as TrendingUpIcon,
  Person as PersonIcon,
  AttachMoney as MoneyIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import AIAdminPanel from './AIAdminPanel';

const AIVerificationQueue = () => {
  const { user } = useAuth();
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [showAIPanel, setShowAIPanel] = useState(false);

  useEffect(() => {
    fetchVerificationQueue();
  }, [selectedPriority]);

  const fetchVerificationQueue = async () => {
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const queryParams = new URLSearchParams();
      if (selectedPriority) {
        queryParams.append('priority', selectedPriority);
      }
      
      const response = await fetch(`/api/receipts/admin/ai-queue?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch AI verification queue');
      }

      const queueData = await response.json();
      setQueue(queueData);
    } catch (error) {
      console.error('Error fetching AI verification queue:', error);
      toast.error('Failed to load AI verification queue');
    } finally {
      setLoading(false);
    }
  };

  const handleReceiptSelect = (receipt) => {
    setSelectedReceipt(receipt);
    setShowAIPanel(true);
  };

  const handleDecisionMade = (result) => {
    setShowAIPanel(false);
    setSelectedReceipt(null);
    fetchVerificationQueue(); // Refresh queue
    toast.success('Decision processed successfully');
  };

  const getPriorityColor = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority?.toLowerCase()) {
      case 'critical': return <ErrorIcon />;
      case 'high': return <WarningIcon />;
      case 'medium': return <InfoIcon />;
      case 'low': return <CheckCircleIcon />;
      default: return <PriorityIcon />;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount || 0);
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  if (showAIPanel && selectedReceipt) {
    return (
      <Box>
        <Button 
          onClick={() => setShowAIPanel(false)}
          sx={{ mb: 2 }}
          variant="outlined"
        >
          ← Back to Queue
        </Button>
        <AIAdminPanel 
          receiptId={selectedReceipt.id}
          onDecisionMade={handleDecisionMade}
        />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: '100%', margin: 'auto' }}>
      {/* Header */}
      <Card sx={{ mb: 3, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center">
              <PsychologyIcon sx={{ color: 'white', mr: 2, fontSize: 32 }} />
              <Box>
                <Typography variant="h4" sx={{ color: 'white', fontWeight: 'bold' }}>
                  🚨 AI Verification Queue
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                  AI-prioritized receipts requiring admin attention
                </Typography>
              </Box>
            </Box>
            <Box display="flex" alignItems="center" gap={2}>
              {queue && (
                <Badge 
                  badgeContent={queue.queueItems?.length || 0}
                  color="error"
                  sx={{ '& .MuiBadge-badge': { fontSize: '1rem', fontWeight: 'bold' } }}
                >
                  <Chip 
                    label="Pending"
                    variant="outlined" 
                    sx={{ color: 'white', borderColor: 'white', fontSize: '1rem' }}
                  />
                </Badge>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Filter Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Priority Filter</InputLabel>
                <Select
                  value={selectedPriority}
                  label="Priority Filter"
                  onChange={(e) => setSelectedPriority(e.target.value)}
                >
                  <MenuItem value="">All Priorities</MenuItem>
                  <MenuItem value="critical">🔴 Critical</MenuItem>
                  <MenuItem value="high">🟡 High</MenuItem>
                  <MenuItem value="medium">🔵 Medium</MenuItem>
                  <MenuItem value="low">🟢 Low</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Button 
                variant="outlined" 
                onClick={fetchVerificationQueue}
                disabled={loading}
                startIcon={<TrendingUpIcon />}
                fullWidth
              >
                🔄 Refresh Queue
              </Button>
            </Grid>
            {queue && (
              <>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 1, textAlign: 'center', backgroundColor: '#f8f9fa' }}>
                    <Typography variant="h6" color="primary">
                      {queue.totalPending}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Total Pending
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 1, textAlign: 'center', backgroundColor: '#f8f9fa' }}>
                    <Typography variant="body2" color="textSecondary">
                      Last Updated
                    </Typography>
                    <Typography variant="body2">
                      {formatTimeAgo(queue.timestamp)}
                    </Typography>
                  </Paper>
                </Grid>
              </>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
          <CircularProgress />
          <Typography variant="body1" sx={{ ml: 2 }}>
            🤖 AI prioritizing verification queue...
          </Typography>
        </Box>
      )}

      {/* Queue Items */}
      {queue && !loading && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <ScheduleIcon sx={{ mr: 1, color: 'primary.main' }} />
              📋 Priority Queue ({queue.queueItems?.length || 0} items)
            </Typography>
            
            {queue.queueItems?.length === 0 ? (
              <Alert severity="success" icon={<CheckCircleIcon />}>
                🎉 Great! No receipts require immediate attention. All clear!
              </Alert>
            ) : (
              <List>
                {queue.queueItems?.map((item, index) => (
                  <React.Fragment key={item.id}>
                    <ListItem 
                      sx={{ 
                        cursor: 'pointer',
                        '&:hover': {
                          backgroundColor: '#f5f5f5'
                        },
                        border: '1px solid #e0e0e0',
                        borderRadius: 1,
                        mb: 1
                      }}
                      onClick={() => handleReceiptSelect(item)}
                    >
                      <ListItemIcon>
                        <Badge 
                          badgeContent={index + 1}
                          color="primary"
                          sx={{ '& .MuiBadge-badge': { fontSize: '0.75rem' } }}
                        >
                          {getPriorityIcon(item.priority)}
                        </Badge>
                      </ListItemIcon>
                      
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                            <Typography variant="body1" fontWeight="bold">
                              Receipt #{item.id?.slice(-8)}
                            </Typography>
                            <Chip 
                              label={item.priority?.toUpperCase()}
                              color={getPriorityColor(item.priority)}
                              size="small"
                              variant="outlined"
                            />
                            <Chip 
                              label={`${item.ai_confidence}% confidence`}
                              color={item.ai_confidence > 80 ? 'success' : 'warning'}
                              size="small"
                              variant="filled"
                            />
                          </Box>
                        }
                        secondary={
                          <Box sx={{ mt: 1 }}>
                            <Typography variant="body2" color="textSecondary" gutterBottom>
                              🎯 <strong>AI Reason:</strong> {item.priority_reason}
                            </Typography>
                            <Box display="flex" alignItems="center" gap={2} flexWrap="wrap">
                              <Box display="flex" alignItems="center">
                                <MoneyIcon sx={{ fontSize: 16, mr: 0.5, color: 'success.main' }} />
                                <Typography variant="body2">
                                  {formatCurrency(item.amount)}
                                </Typography>
                              </Box>
                              <Box display="flex" alignItems="center">
                                <PersonIcon sx={{ fontSize: 16, mr: 0.5, color: 'info.main' }} />
                                <Typography variant="body2">
                                  {item.submittedByName}
                                </Typography>
                              </Box>
                              <Typography variant="body2" color="textSecondary">
                                {formatTimeAgo(item.createdAt)}
                              </Typography>
                            </Box>
                            {item.risk_factors?.length > 0 && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="body2" color="error" gutterBottom>
                                  ⚠️ Risk Factors:
                                </Typography>
                                <Box display="flex" gap={0.5} flexWrap="wrap">
                                  {item.risk_factors.slice(0, 3).map((factor, idx) => (
                                    <Chip 
                                      key={idx}
                                      label={factor}
                                      size="small"
                                      color="error"
                                      variant="outlined"
                                      sx={{ fontSize: '0.7rem' }}
                                    />
                                  ))}
                                  {item.risk_factors.length > 3 && (
                                    <Chip 
                                      label={`+${item.risk_factors.length - 3} more`}
                                      size="small"
                                      variant="outlined"
                                      sx={{ fontSize: '0.7rem' }}
                                    />
                                  )}
                                </Box>
                              </Box>
                            )}
                          </Box>
                        }
                      />
                      
                      <ListItemSecondaryAction>
                        <Button
                          variant="contained"
                          color="primary"
                          size="small"
                          startIcon={<PsychologyIcon />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReceiptSelect(item);
                          }}
                        >
                          🔍 AI Analysis
                        </Button>
                      </ListItemSecondaryAction>
                    </ListItem>
                    {index < queue.queueItems.length - 1 && <Divider sx={{ my: 1 }} />}
                  </React.Fragment>
                ))}
              </List>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {!queue && !loading && (
        <Alert severity="error" action={
          <Button color="inherit" size="small" onClick={fetchVerificationQueue}>
            Retry
          </Button>
        }>
          Failed to load AI verification queue. Please try again.
        </Alert>
      )}
    </Box>
  );
};

export default AIVerificationQueue;
