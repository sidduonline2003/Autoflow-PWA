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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  LinearProgress,
  Badge
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Psychology as PsychologyIcon,
  TrendingUp as TrendingUpIcon,
  Security as SecurityIcon,
  Assessment as AssessmentIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

const AIAdminPanel = ({ receiptId, onDecisionMade }) => {
  const { user } = useAuth();
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState('summary');
  const [processingDecision, setProcessingDecision] = useState(false);

  useEffect(() => {
    if (receiptId) {
      fetchAIAnalysis();
    }
  }, [receiptId]);

  const fetchAIAnalysis = async () => {
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/receipts/admin/ai-analysis/${receiptId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch AI analysis');
      }

      const analysis = await response.json();
      setAiAnalysis(analysis);
    } catch (error) {
      console.error('Error fetching AI analysis:', error);
      toast.error('Failed to load AI analysis');
    } finally {
      setLoading(false);
    }
  };

  const makeAIAssistedDecision = async (decision, notes = '') => {
    setProcessingDecision(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/receipts/admin/ai-assisted-decision/${receiptId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          decision,
          notes: notes || aiAnalysis?.recommendation || 'AI-assisted decision'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to process AI-assisted decision');
      }

      const result = await response.json();
      toast.success(`Receipt ${decision.toLowerCase()} with AI assistance`);
      
      if (onDecisionMade) {
        onDecisionMade(result);
      }
    } catch (error) {
      console.error('Error making AI-assisted decision:', error);
      toast.error('Failed to process decision');
    } finally {
      setProcessingDecision(false);
    }
  };

  const getRiskColor = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 80) return 'success';
    if (confidence >= 60) return 'warning';
    return 'error';
  };

  const handleExpansionChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="300px">
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>
          🤖 AI analyzing receipt...
        </Typography>
      </Box>
    );
  }

  if (!aiAnalysis) {
    return (
      <Alert severity="info" icon={<PsychologyIcon />}>
        No AI analysis available. Click refresh to generate analysis.
        <Button onClick={fetchAIAnalysis} size="small" sx={{ ml: 1 }}>
          Generate AI Analysis
        </Button>
      </Alert>
    );
  }

  return (
    <Box sx={{ maxWidth: '100%', margin: 'auto' }}>
      {/* AI Analysis Header */}
      <Card sx={{ mb: 2, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center">
              <PsychologyIcon sx={{ color: 'white', mr: 1, fontSize: 30 }} />
              <Typography variant="h5" sx={{ color: 'white', fontWeight: 'bold' }}>
                🧠 AI Analysis Dashboard
              </Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={2}>
              <Badge 
                badgeContent={`${aiAnalysis.overall_confidence}%`} 
                color={getConfidenceColor(aiAnalysis.overall_confidence)}
                sx={{ '& .MuiBadge-badge': { fontSize: '0.75rem', fontWeight: 'bold' } }}
              >
                <Chip 
                  label="AI Confidence" 
                  variant="outlined" 
                  sx={{ color: 'white', borderColor: 'white' }}
                />
              </Badge>
              <Chip 
                label={aiAnalysis.risk_level}
                color={getRiskColor(aiAnalysis.risk_level)}
                sx={{ fontWeight: 'bold' }}
              />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Natural Language Summary */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <InfoIcon sx={{ mr: 1, color: 'primary.main' }} />
            📝 AI Summary
          </Typography>
          <Typography variant="body1" sx={{ 
            backgroundColor: '#f8f9fa', 
            padding: 2, 
            borderRadius: 1,
            fontStyle: 'italic',
            border: '1px solid #e9ecef'
          }}>
            "{aiAnalysis.natural_language_summary}"
          </Typography>
        </CardContent>
      </Card>

      {/* Primary Concerns */}
      {aiAnalysis.primary_concerns?.length > 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <WarningIcon sx={{ mr: 1, color: 'warning.main' }} />
              ⚠️ Primary Concerns
            </Typography>
            <Grid container spacing={1}>
              {aiAnalysis.primary_concerns.map((concern, index) => (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Chip 
                    label={concern}
                    color="warning"
                    variant="outlined"
                    size="small"
                    sx={{ mb: 1, width: '100%' }}
                  />
                </Grid>
              ))}
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Detailed Analysis Sections */}
      <Box sx={{ mb: 2 }}>
        {/* Contextual Insights */}
        <Accordion 
          expanded={expanded === 'insights'} 
          onChange={handleExpansionChange('insights')}
          sx={{ mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center">
              <TrendingUpIcon sx={{ mr: 1, color: 'info.main' }} />
              <Typography variant="h6">🔍 Contextual Insights</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              {aiAnalysis.contextual_insights?.map((insight, index) => (
                <ListItem key={index} divider>
                  <ListItemIcon>
                    <InfoIcon color="info" />
                  </ListItemIcon>
                  <ListItemText 
                    primary={insight.title}
                    secondary={insight.description}
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>

        {/* Risk Factors */}
        <Accordion 
          expanded={expanded === 'risk'} 
          onChange={handleExpansionChange('risk')}
          sx={{ mb: 1 }}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" alignItems="center">
              <SecurityIcon sx={{ mr: 1, color: 'error.main' }} />
              <Typography variant="h6">🛡️ Risk Assessment</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                Overall Risk Score
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={aiAnalysis.overall_confidence}
                color={getConfidenceColor(aiAnalysis.overall_confidence)}
                sx={{ height: 8, borderRadius: 4, mb: 2 }}
              />
            </Box>
            <Typography variant="body1" sx={{ mb: 2 }}>
              <strong>Risk Explanation:</strong> {aiAnalysis.risk_explanation}
            </Typography>
            {aiAnalysis.evidence_highlights?.length > 0 && (
              <Box>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  📋 Evidence Highlights:
                </Typography>
                <List dense>
                  {aiAnalysis.evidence_highlights.map((evidence, index) => (
                    <ListItem key={index}>
                      <ListItemText 
                        primary={evidence}
                        primaryTypographyProps={{ fontSize: '0.875rem' }}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Similar Cases */}
        {aiAnalysis.similar_cases?.length > 0 && (
          <Accordion 
            expanded={expanded === 'similar'} 
            onChange={handleExpansionChange('similar')}
            sx={{ mb: 1 }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center">
                <AssessmentIcon sx={{ mr: 1, color: 'secondary.main' }} />
                <Typography variant="h6">📊 Similar Cases</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                {aiAnalysis.similar_cases.map((similarCase, index) => (
                  <Grid item xs={12} md={6} key={index}>
                    <Paper sx={{ p: 2, backgroundColor: '#f8f9fa' }}>
                      <Typography variant="body2" fontWeight="bold">
                        Case #{index + 1}
                      </Typography>
                      <Typography variant="body2" color="textSecondary">
                        Similarity: {similarCase.similarity_score}%
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 1 }}>
                        {similarCase.description}
                      </Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>
        )}
      </Box>

      {/* AI Recommendation */}
      <Card sx={{ mb: 2, border: '2px solid', borderColor: 'primary.main' }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <PsychologyIcon sx={{ mr: 1, color: 'primary.main' }} />
            🎯 AI Recommendation
          </Typography>
          <Alert 
            severity={aiAnalysis.recommendation_confidence > 80 ? 'success' : 'warning'}
            sx={{ mb: 2 }}
          >
            <Typography variant="body1" fontWeight="bold">
              {aiAnalysis.recommendation}
            </Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              Confidence: {aiAnalysis.recommendation_confidence}%
            </Typography>
          </Alert>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Box display="flex" gap={2} justifyContent="center" sx={{ mt: 3 }}>
        <Button
          variant="contained"
          color="success"
          onClick={() => makeAIAssistedDecision('VERIFIED')}
          disabled={processingDecision}
          startIcon={<CheckCircleIcon />}
          size="large"
        >
          ✅ Approve with AI
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={() => makeAIAssistedDecision('REJECTED')}
          disabled={processingDecision}
          startIcon={<ErrorIcon />}
          size="large"
        >
          ❌ Reject with AI
        </Button>
        <Button
          variant="outlined"
          onClick={fetchAIAnalysis}
          disabled={loading}
          startIcon={<PsychologyIcon />}
        >
          🔄 Refresh Analysis
        </Button>
      </Box>

      {processingDecision && (
        <Box display="flex" justifyContent="center" alignItems="center" sx={{ mt: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2" sx={{ ml: 1 }}>
            Processing AI-assisted decision...
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default AIAdminPanel;
