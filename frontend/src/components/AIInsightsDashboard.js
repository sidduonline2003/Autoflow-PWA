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
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
  Divider
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  TrendingUp as TrendingUpIcon,
  Psychology as PsychologyIcon,
  Assessment as AssessmentIcon,
  Security as SecurityIcon,
  People as PeopleIcon,
  Timeline as TimelineIcon,
  Lightbulb as LightbulbIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  MonetizationOn as MoneyIcon,
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

const AIInsightsDashboard = () => {
  const { user } = useAuth();
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timeframe, setTimeframe] = useState('30d');
  const [expanded, setExpanded] = useState('summary');

  useEffect(() => {
    fetchAIInsights();
  }, [timeframe]);

  const fetchAIInsights = async () => {
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/receipts/admin/ai-insights?timeframe=${timeframe}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch AI insights');
      }

      const insightsData = await response.json();
      setInsights(insightsData);
    } catch (error) {
      console.error('Error fetching AI insights:', error);
      toast.error('Failed to load AI insights');
    } finally {
      setLoading(false);
    }
  };

  const handleExpansionChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount || 0);
  };

  const getSeverityColor = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getTimeframeLabel = (tf) => {
    switch (tf) {
      case '7d': return 'Last 7 Days';
      case '30d': return 'Last 30 Days';
      case '90d': return 'Last 90 Days';
      default: return 'Last 30 Days';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>
          🧠 AI analyzing organizational patterns...
        </Typography>
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
              <AssessmentIcon sx={{ color: 'white', mr: 2, fontSize: 32 }} />
              <Box>
                <Typography variant="h4" sx={{ color: 'white', fontWeight: 'bold' }}>
                  📊 AI Insights Dashboard
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                  Intelligent analysis of receipt patterns and trends
                </Typography>
              </Box>
            </Box>
            <Box>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel sx={{ color: 'white' }}>Timeframe</InputLabel>
                <Select
                  value={timeframe}
                  label="Timeframe"
                  onChange={(e) => setTimeframe(e.target.value)}
                  sx={{ 
                    color: 'white',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'rgba(255,255,255,0.5)'
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: 'white'
                    }
                  }}
                >
                  <MenuItem value="7d">📅 Last 7 Days</MenuItem>
                  <MenuItem value="30d">📅 Last 30 Days</MenuItem>
                  <MenuItem value="90d">📅 Last 90 Days</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {insights ? (
        <>
          {/* Executive Summary */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <PsychologyIcon sx={{ mr: 1, color: 'primary.main' }} />
                🎯 AI Executive Summary
              </Typography>
              <Typography variant="body1" sx={{ 
                backgroundColor: '#f8f9fa', 
                padding: 2, 
                borderRadius: 1,
                fontStyle: 'italic',
                border: '1px solid #e9ecef',
                mb: 2
              }}>
                "{insights.executive_summary}"
              </Typography>
              
              {/* Key Metrics */}
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#e3f2fd' }}>
                    <MoneyIcon sx={{ fontSize: 30, color: 'primary.main', mb: 1 }} />
                    <Typography variant="h6" color="primary">
                      {formatCurrency(insights.key_metrics?.total_amount)}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Total Amount
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#f3e5f5' }}>
                    <AssessmentIcon sx={{ fontSize: 30, color: 'secondary.main', mb: 1 }} />
                    <Typography variant="h6" color="secondary">
                      {insights.key_metrics?.total_receipts || 0}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Total Receipts
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#fff3e0' }}>
                    <SecurityIcon sx={{ fontSize: 30, color: 'warning.main', mb: 1 }} />
                    <Typography variant="h6" color="warning.main">
                      {insights.key_metrics?.high_risk_count || 0}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      High Risk
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: '#e8f5e8' }}>
                    <CheckCircleIcon sx={{ fontSize: 30, color: 'success.main', mb: 1 }} />
                    <Typography variant="h6" color="success.main">
                      {insights.key_metrics?.verification_rate || 0}%
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Verification Rate
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          {/* Detailed Insights */}
          <Box sx={{ mb: 2 }}>
            {/* Spending Patterns */}
            <Accordion 
              expanded={expanded === 'spending'} 
              onChange={handleExpansionChange('spending')}
              sx={{ mb: 1 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center">
                  <TrendingUpIcon sx={{ mr: 1, color: 'info.main' }} />
                  <Typography variant="h6">💰 Spending Patterns</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {insights.spending_patterns?.map((pattern, index) => (
                    <Grid item xs={12} md={6} key={index}>
                      <Paper sx={{ p: 2, backgroundColor: '#f8f9fa' }}>
                        <Typography variant="body1" fontWeight="bold" gutterBottom>
                          {pattern.category}
                        </Typography>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                          <Typography variant="body2" color="textSecondary">
                            Amount
                          </Typography>
                          <Typography variant="body2" fontWeight="bold">
                            {formatCurrency(pattern.amount)}
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={pattern.percentage || 0}
                          sx={{ height: 6, borderRadius: 3, mb: 1 }}
                        />
                        <Typography variant="body2" color="textSecondary">
                          {pattern.insight}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </AccordionDetails>
            </Accordion>

            {/* Risk Analysis */}
            <Accordion 
              expanded={expanded === 'risk'} 
              onChange={handleExpansionChange('risk')}
              sx={{ mb: 1 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center">
                  <SecurityIcon sx={{ mr: 1, color: 'error.main' }} />
                  <Typography variant="h6">🛡️ Risk Analysis</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>Overall Risk Assessment:</strong> {insights.risk_analysis?.overall_assessment}
                  </Typography>
                </Alert>
                <List>
                  {insights.risk_analysis?.risk_factors?.map((factor, index) => (
                    <ListItem key={index} divider>
                      <ListItemIcon>
                        <WarningIcon color={getSeverityColor(factor.severity)} />
                      </ListItemIcon>
                      <ListItemText 
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body1">{factor.factor}</Typography>
                            <Chip 
                              label={factor.severity}
                              color={getSeverityColor(factor.severity)}
                              size="small"
                            />
                          </Box>
                        }
                        secondary={factor.description}
                      />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>

            {/* User Behavior */}
            <Accordion 
              expanded={expanded === 'behavior'} 
              onChange={handleExpansionChange('behavior')}
              sx={{ mb: 1 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center">
                  <PeopleIcon sx={{ mr: 1, color: 'secondary.main' }} />
                  <Typography variant="h6">👥 User Behavior</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {insights.user_behavior?.top_submitters?.map((submitter, index) => (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                      <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h6" color="primary">
                          #{index + 1}
                        </Typography>
                        <Typography variant="body1" fontWeight="bold">
                          {submitter.name}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {submitter.count} receipts
                        </Typography>
                        <Typography variant="body2">
                          {formatCurrency(submitter.total_amount)}
                        </Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
                {insights.user_behavior?.behavior_insights && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="body1" fontWeight="bold" gutterBottom>
                      🔍 Behavior Insights:
                    </Typography>
                    <List dense>
                      {insights.user_behavior.behavior_insights.map((insight, index) => (
                        <ListItem key={index}>
                          <ListItemText 
                            primary={insight}
                            primaryTypographyProps={{ fontSize: '0.875rem' }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>

            {/* AI Recommendations */}
            <Accordion 
              expanded={expanded === 'recommendations'} 
              onChange={handleExpansionChange('recommendations')}
              sx={{ mb: 1 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center">
                  <LightbulbIcon sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="h6">💡 AI Recommendations</Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <List>
                  {insights.recommendations?.map((recommendation, index) => (
                    <ListItem key={index} divider>
                      <ListItemIcon>
                        <LightbulbIcon color="success" />
                      </ListItemIcon>
                      <ListItemText 
                        primary={
                          <Box display="flex" alignItems="center" gap={1}>
                            <Typography variant="body1" fontWeight="bold">
                              {recommendation.title}
                            </Typography>
                            <Chip 
                              label={recommendation.priority}
                              color={getSeverityColor(recommendation.priority)}
                              size="small"
                            />
                          </Box>
                        }
                        secondary={
                          <Box>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                              {recommendation.description}
                            </Typography>
                            <Typography variant="body2" fontWeight="bold" color="primary">
                              Expected Impact: {recommendation.expected_impact}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </AccordionDetails>
            </Accordion>

            {/* Trends */}
            {insights.trends && (
              <Accordion 
                expanded={expanded === 'trends'} 
                onChange={handleExpansionChange('trends')}
                sx={{ mb: 1 }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box display="flex" alignItems="center">
                    <TimelineIcon sx={{ mr: 1, color: 'info.main' }} />
                    <Typography variant="h6">📈 Trends & Patterns</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    {Object.entries(insights.trends).map(([key, trend], index) => (
                      <Grid item xs={12} md={6} key={index}>
                        <Paper sx={{ p: 2, backgroundColor: '#f8f9fa' }}>
                          <Typography variant="body1" fontWeight="bold" gutterBottom>
                            {key.replace(/_/g, ' ').toUpperCase()}
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            {trend.description || trend}
                          </Typography>
                          {trend.change && (
                            <Box display="flex" alignItems="center" mt={1}>
                              <TrendingUpIcon 
                                sx={{ 
                                  fontSize: 16, 
                                  mr: 0.5,
                                  color: trend.change > 0 ? 'success.main' : 'error.main'
                                }} 
                              />
                              <Typography 
                                variant="body2" 
                                color={trend.change > 0 ? 'success.main' : 'error.main'}
                                fontWeight="bold"
                              >
                                {trend.change > 0 ? '+' : ''}{trend.change}%
                              </Typography>
                            </Box>
                          )}
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </AccordionDetails>
              </Accordion>
            )}
          </Box>

          {/* Refresh Button */}
          <Box display="flex" justifyContent="center" sx={{ mt: 3 }}>
            <Button
              variant="contained"
              onClick={fetchAIInsights}
              disabled={loading}
              startIcon={<PsychologyIcon />}
              size="large"
            >
              🔄 Refresh AI Insights
            </Button>
          </Box>
        </>
      ) : (
        !loading && (
          <Alert severity="error" action={
            <Button color="inherit" size="small" onClick={fetchAIInsights}>
              Retry
            </Button>
          }>
            Failed to load AI insights. Please try again.
          </Alert>
        )
      )}
    </Box>
  );
};

export default AIInsightsDashboard;
