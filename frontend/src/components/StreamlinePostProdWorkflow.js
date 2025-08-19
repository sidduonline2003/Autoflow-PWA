import React, { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  Typography, 
  Button, 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  TextField, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel,
  Chip,
  LinearProgress,
  Alert,
  Box,
  Grid,
  IconButton,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Paper
} from '@mui/material';
import { 
  PlayArrow, 
  Edit, 
  Upload, 
  CheckCircle,
  Assignment,
  Timeline,
  Person,
  Schedule,
  SaveAlt
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const StreamlinePostProdWorkflow = ({ eventId, clientId, onStatusUpdate }) => {
  const { user } = useAuth();
  const [workflowStatus, setWorkflowStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [availableEditors, setAvailableEditors] = useState([]);
  const [assignmentData, setAssignmentData] = useState({
    primaryEditor: '',
    secondaryEditor: '',
    uploader: '',
    estimatedHours: '',
    notes: ''
  });
  const [statusUpdateData, setStatusUpdateData] = useState({
    status: '',
    notes: '',
    timeSpent: '',
    completionPercentage: ''
  });

  // Post-production workflow steps
  const workflowSteps = [
    { key: 'SHOOT_COMPLETE', label: 'Shoot Complete', icon: <CheckCircle /> },
    { key: 'AI_EDITOR_ASSIGNMENT', label: 'AI Editor Assignment', icon: <Assignment /> },
    { key: 'EDITING_PENDING', label: 'Editing Pending', icon: <Schedule /> },
    { key: 'EDITING_IN_PROGRESS', label: 'Editing In Progress', icon: <Edit /> },
    { key: 'EDITING_REVIEW', label: 'Editing Review', icon: <Timeline /> },
    { key: 'UPLOAD_PENDING', label: 'Upload Pending', icon: <Upload /> },
    { key: 'CLIENT_READY', label: 'Client Ready', icon: <CheckCircle /> }
  ];

  const statusColors = {
    'SHOOT_COMPLETE': 'info',
    'AI_EDITOR_ASSIGNMENT': 'warning',
    'EDITING_PENDING': 'warning',
    'EDITING_IN_PROGRESS': 'primary',
    'EDITING_REVIEW': 'secondary',
    'REVISION_NEEDED': 'error',
    'UPLOAD_PENDING': 'primary',
    'CLIENT_READY': 'success'
  };

  useEffect(() => {
    fetchWorkflowStatus();
  }, [eventId]);

  const fetchWorkflowStatus = async () => {
    try {
      setLoading(true);
      const idToken = await user?.getIdToken();
      if (!idToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/events/${eventId}/post-production/status`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setWorkflowStatus(data);
      } else {
        setWorkflowStatus({ status: 'not_started' });
      }
    } catch (error) {
      console.error('Error fetching workflow status:', error);
      setError('Failed to load workflow status');
    } finally {
      setLoading(false);
    }
  };

  const triggerPostProduction = async () => {
    try {
      setLoading(true);
      const idToken = await user?.getIdToken();
      if (!idToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/events/${eventId}/trigger-post-production?client_id=${clientId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        await fetchWorkflowStatus();
        if (onStatusUpdate) onStatusUpdate(data);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to trigger post-production');
      }
    } catch (error) {
      console.error('Error triggering post-production:', error);
      setError('Failed to trigger post-production');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableEditors = async () => {
    try {
      const idToken = await user?.getIdToken();
      if (!idToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/events/${eventId}/available-team?client_id=${clientId}`, {
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        // Filter for editors and data managers
        const editors = data.availableMembers.filter(member => 
          member.role === 'editor' || 
          member.role === 'data-manager' ||
          member.skills?.includes('Editing')
        );
        setAvailableEditors(editors);
      }
    } catch (error) {
      console.error('Error fetching available editors:', error);
    }
  };

  const assignEditors = async () => {
    try {
      setLoading(true);
      const idToken = await user?.getIdToken();
      if (!idToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/events/${eventId}/assign-editors?client_id=${clientId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(assignmentData)
      });

      if (response.ok) {
        await fetchWorkflowStatus();
        setAssignDialogOpen(false);
        setAssignmentData({
          primaryEditor: '',
          secondaryEditor: '',
          uploader: '',
          estimatedHours: '',
          notes: ''
        });
        if (onStatusUpdate) onStatusUpdate();
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to assign editors');
      }
    } catch (error) {
      console.error('Error assigning editors:', error);
      setError('Failed to assign editors');
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async () => {
    try {
      setLoading(true);
      const idToken = await user?.getIdToken();
      if (!idToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/events/${eventId}/post-production/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(statusUpdateData)
      });

      if (response.ok) {
        await fetchWorkflowStatus();
        setStatusDialogOpen(false);
        setStatusUpdateData({
          status: '',
          notes: '',
          timeSpent: '',
          completionPercentage: ''
        });
        if (onStatusUpdate) onStatusUpdate();
      } else {
        const errorData = await response.json();
        setError(errorData.detail || 'Failed to update status');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      setError('Failed to update status');
    } finally {
      setLoading(false);
    }
  };

  const openAssignDialog = () => {
    fetchAvailableEditors();
    setAssignDialogOpen(true);
  };

  const getCurrentStepIndex = () => {
    if (!workflowStatus || workflowStatus.status === 'not_started') return -1;
    return workflowSteps.findIndex(step => step.key === workflowStatus.status);
  };

  if (loading && !workflowStatus) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Streamlined Post-Production Workflow
          </Typography>
          <LinearProgress />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom display="flex" alignItems="center">
          <Timeline sx={{ mr: 1 }} />
          Streamlined Post-Production Workflow
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {workflowStatus?.status === 'not_started' ? (
          <Box textAlign="center" py={3}>
            <Typography variant="body1" color="text.secondary" gutterBottom>
              Post-production workflow has not been started for this event.
            </Typography>
            <Button
              variant="contained"
              startIcon={<PlayArrow />}
              onClick={triggerPostProduction}
              disabled={loading}
            >
              Start Post-Production
            </Button>
          </Box>
        ) : (
          <>
            {/* Current Status */}
            <Box mb={3}>
              <Typography variant="subtitle1" gutterBottom>
                Current Status
              </Typography>
              <Chip
                label={workflowStatus?.status?.replace(/_/g, ' ')}
                color={statusColors[workflowStatus?.status] || 'default'}
                icon={workflowSteps.find(s => s.key === workflowStatus?.status)?.icon}
                size="medium"
              />
              {workflowStatus?.completionPercentage > 0 && (
                <Box mt={1}>
                  <LinearProgress 
                    variant="determinate" 
                    value={workflowStatus.completionPercentage} 
                  />
                  <Typography variant="caption" color="text.secondary">
                    {workflowStatus.completionPercentage}% Complete
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Workflow Timeline */}
            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Typography variant="subtitle1" gutterBottom>
                Workflow Progress
              </Typography>
              <Stepper activeStep={getCurrentStepIndex()} orientation="vertical">
                {workflowSteps.map((step, index) => (
                  <Step key={step.key}>
                    <StepLabel 
                      icon={step.icon}
                      StepIconProps={{
                        style: { 
                          color: index <= getCurrentStepIndex() ? '#1976d2' : '#ccc' 
                        }
                      }}
                    >
                      {step.label}
                    </StepLabel>
                    <StepContent>
                      {workflowStatus?.workflow?.[step.key.toLowerCase()] && (
                        <Typography variant="caption" color="text.secondary">
                          Completed: {new Date(workflowStatus.workflow[step.key.toLowerCase()]).toLocaleString()}
                        </Typography>
                      )}
                    </StepContent>
                  </Step>
                ))}
              </Stepper>
            </Paper>

            {/* Assignments */}
            {workflowStatus?.assignments && (
              <Box mt={3}>
                <Typography variant="subtitle1" gutterBottom>
                  Team Assignments
                </Typography>
                <Grid container spacing={2}>
                  {workflowStatus.assignments.primaryEditor && (
                    <Grid item xs={12} md={4}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" color="primary">
                            Primary Editor
                          </Typography>
                          <Typography variant="body2">
                            {workflowStatus.assignments.primaryEditor.name}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                  {workflowStatus.assignments.secondaryEditor && (
                    <Grid item xs={12} md={4}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" color="secondary">
                            Secondary Editor
                          </Typography>
                          <Typography variant="body2">
                            {workflowStatus.assignments.secondaryEditor.name}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                  {workflowStatus.assignments.uploader && (
                    <Grid item xs={12} md={4}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" color="info.main">
                            Uploader
                          </Typography>
                          <Typography variant="body2">
                            {workflowStatus.assignments.uploader.name}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  )}
                </Grid>
              </Box>
            )}

            {/* AI Suggestions */}
            {workflowStatus?.aiSuggestions && workflowStatus.status === 'AI_EDITOR_ASSIGNMENT' && (
              <Box mt={3}>
                <Typography variant="subtitle1" gutterBottom>
                  AI Recommendations
                </Typography>
                <Alert severity="info">
                  <Typography variant="body2">
                    {workflowStatus.aiSuggestions.reasoning}
                  </Typography>
                </Alert>
                <Box mt={2}>
                  <Button
                    variant="contained"
                    startIcon={<Person />}
                    onClick={openAssignDialog}
                  >
                    Assign Editors
                  </Button>
                </Box>
              </Box>
            )}

            {/* Action Buttons */}
            <Box mt={3} display="flex" gap={1}>
              {workflowStatus?.status === 'AI_EDITOR_ASSIGNMENT' && (
                <Button
                  variant="contained"
                  startIcon={<Assignment />}
                  onClick={openAssignDialog}
                >
                  Assign Editors
                </Button>
              )}
              
              {workflowStatus?.status && workflowStatus.status !== 'CLIENT_READY' && workflowStatus.status !== 'AI_EDITOR_ASSIGNMENT' && (
                <Button
                  variant="outlined"
                  startIcon={<Edit />}
                  onClick={() => setStatusDialogOpen(true)}
                >
                  Update Status
                </Button>
              )}
              
              {workflowStatus?.status === 'CLIENT_READY' && (
                <Button
                  variant="outlined"
                  startIcon={<SaveAlt />}
                  color="success"
                >
                  Download Delivery Files
                </Button>
              )}
            </Box>
          </>
        )}

        {/* Assignment Dialog */}
        <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>Assign Editors</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Primary Editor *</InputLabel>
                  <Select
                    value={assignmentData.primaryEditor}
                    onChange={(e) => setAssignmentData({...assignmentData, primaryEditor: e.target.value})}
                  >
                    {availableEditors.map(editor => (
                      <MenuItem key={editor.userId} value={editor.userId}>
                        {editor.name} ({editor.role})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Secondary Editor</InputLabel>
                  <Select
                    value={assignmentData.secondaryEditor}
                    onChange={(e) => setAssignmentData({...assignmentData, secondaryEditor: e.target.value})}
                  >
                    <MenuItem value="">None</MenuItem>
                    {availableEditors.map(editor => (
                      <MenuItem key={editor.userId} value={editor.userId}>
                        {editor.name} ({editor.role})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Uploader *</InputLabel>
                  <Select
                    value={assignmentData.uploader}
                    onChange={(e) => setAssignmentData({...assignmentData, uploader: e.target.value})}
                  >
                    {availableEditors.map(editor => (
                      <MenuItem key={editor.userId} value={editor.userId}>
                        {editor.name} ({editor.role})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Estimated Hours"
                  type="number"
                  value={assignmentData.estimatedHours}
                  onChange={(e) => setAssignmentData({...assignmentData, estimatedHours: e.target.value})}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes"
                  multiline
                  rows={3}
                  value={assignmentData.notes}
                  onChange={(e) => setAssignmentData({...assignmentData, notes: e.target.value})}
                />
              </Grid>
            </Grid>
            <Box mt={3} display="flex" justifyContent="flex-end" gap={1}>
              <Button onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
              <Button 
                variant="contained" 
                onClick={assignEditors}
                disabled={!assignmentData.primaryEditor || !assignmentData.uploader}
              >
                Assign
              </Button>
            </Box>
          </DialogContent>
        </Dialog>

        {/* Status Update Dialog */}
        <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Update Status</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>New Status</InputLabel>
                  <Select
                    value={statusUpdateData.status}
                    onChange={(e) => setStatusUpdateData({...statusUpdateData, status: e.target.value})}
                  >
                    <MenuItem value="EDITING_IN_PROGRESS">Start Editing</MenuItem>
                    <MenuItem value="EDITING_REVIEW">Ready for Review</MenuItem>
                    <MenuItem value="REVISION_NEEDED">Needs Revision</MenuItem>
                    <MenuItem value="UPLOAD_PENDING">Ready for Upload</MenuItem>
                    <MenuItem value="CLIENT_READY">Complete</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Time Spent (hours)"
                  type="number"
                  value={statusUpdateData.timeSpent}
                  onChange={(e) => setStatusUpdateData({...statusUpdateData, timeSpent: e.target.value})}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Completion %"
                  type="number"
                  inputProps={{ min: 0, max: 100 }}
                  value={statusUpdateData.completionPercentage}
                  onChange={(e) => setStatusUpdateData({...statusUpdateData, completionPercentage: e.target.value})}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Notes"
                  multiline
                  rows={3}
                  value={statusUpdateData.notes}
                  onChange={(e) => setStatusUpdateData({...statusUpdateData, notes: e.target.value})}
                />
              </Grid>
            </Grid>
            <Box mt={3} display="flex" justifyContent="flex-end" gap={1}>
              <Button onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
              <Button 
                variant="contained" 
                onClick={updateStatus}
                disabled={!statusUpdateData.status}
              >
                Update
              </Button>
            </Box>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default StreamlinePostProdWorkflow;
