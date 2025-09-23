import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Grid, 
  Chip, 
  Button,
  CircularProgress,
  Alert,
  Tab,
  Tabs,
  Card,
  CardContent,
  CardActions,
  Divider,
  Stack
} from '@mui/material';
import { Assignment, AutoAwesome, Group, Schedule, VideoLibrary, Photo } from '@mui/icons-material';
import { getOverview, getActivity } from '../api/postprod.api';
import AssignEditorsModal from '../components/postprod/AssignEditorsModal';
import AISuggestionDisplay from '../components/AISuggestionDisplay';
import StreamCard from '../components/postprod/StreamCard';
import api from '../api.js';

const PostProdPanel = () => {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [streams, setStreams] = useState([]);
  const [teamAssignments, setTeamAssignments] = useState([]);

  useEffect(() => {
    const fetchEventDetails = async () => {
      try {
        setLoading(true);
        
        // Fetch event details using direct API call since getEvent doesn't exist in postprod.api
        const eventResponse = await api.get(`/events/${eventId}`);
        setEvent(eventResponse.data);
        
        // Fetch postprod overview which contains stream information
        try {
          const overview = await getOverview(eventId);
          // Extract stream-like data from overview
          const streams = [];
          if (overview.photo) {
            streams.push({
              id: `${eventId}_photo`,
              type: 'PHOTO',
              title: 'Photo Stream',
              status: overview.photo.state,
              assigned_editor: overview.photo.editors?.[0]?.displayName,
              created_at: overview.createdAt
            });
          }
          if (overview.video) {
            streams.push({
              id: `${eventId}_video`,
              type: 'VIDEO',
              title: 'Video Stream',
              status: overview.video.state,
              assigned_editor: overview.video.editors?.[0]?.displayName,
              created_at: overview.createdAt
            });
          }
          setStreams(streams);
        } catch (error) {
          console.warn('Could not fetch postprod overview:', error);
          setStreams([]);
        }
        
        // Fetch current team assignments using backend endpoint
        try {
          const assignmentsResponse = await api.get(`/events/${eventId}/assignments`);
          setTeamAssignments(assignmentsResponse.data || []);
        } catch (error) {
          console.warn('Could not fetch team assignments:', error);
          setTeamAssignments([]);
        }
        
        // Try to get AI suggestions
        try {
          const suggestionsResponse = await api.get(`/events/${eventId}/suggest-team`);
          setAiSuggestions(suggestionsResponse.data);
        } catch (error) {
          console.warn('AI suggestions not available:', error);
          setAiSuggestions(null);
        }
        
      } catch (err) {
        console.error('Error loading post-production data:', err);
        setError('Failed to load post-production data');
      } finally {
        setLoading(false);
      }
    };

    if (eventId) {
      fetchEventDetails();
    }
  }, [eventId]);

  const handleAutoAssign = async () => {
    try {
      const result = await api.post(`/events/${eventId}/auto-assign`);
      console.log('Auto-assignment result:', result.data);
      
      // Refresh streams after assignment
      const updatedStreamsResponse = await api.get(`/events/${eventId}/streams`);
      setStreams(updatedStreamsResponse.data || []);
    } catch (error) {
      console.error('Auto-assignment failed:', error);
    }
  };

  const handleAssignmentSave = async (assignmentData) => {
    try {
      console.log('Saving assignment:', assignmentData);
      setAssignModalOpen(false);
      
      // Refresh data after assignment
      const updatedStreamsResponse = await api.get(`/events/${eventId}/streams`);
      setStreams(updatedStreamsResponse.data || []);
    } catch (error) {
      console.error('Assignment save failed:', error);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!event) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="warning">Event not found</Alert>
      </Container>
    );
  }port { useParams } from 'react-router-dom';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Grid, 
  Chip, 
  Button,
  CircularProgress,
  Alert,
  Tab,
  Tabs,
  Card,
  CardContent,
  CardActions,
  Divider,
  Stack
} from '@mui/material';
import { Assignment, AutoAwesome, Group, Schedule, VideoLibrary, Photo } from '@mui/icons-material';
import { getOverview, getActivity } from '../api/postprod.api';
import AssignEditorsModal from '../components/postprod/AssignEditorsModal';
import AISuggestionDisplay from '../components/AISuggestionDisplay';
import StreamCard from '../components/postprod/StreamCard';
import api from '../api.js';

const PostProdPanel = () => {
  const { eventId } = useParams();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [streams, setStreams] = useState([]);
  const [teamAssignments, setTeamAssignments] = useState([]);

  useEffect(() => {
    const fetchEventDetails = async () => {
      try {
        setLoading(true);
        
        // Fetch event details
        const eventData = await postprodApi.getEvent(eventId);
        setEvent(eventData);
        
        // Fetch streams for this event
        const streamsData = await postprodApi.getStreams(eventId);
        setStreams(streamsData || []);
        
        // Fetch current team assignments
        const assignments = await postprodApi.getTeamAssignments(eventId);
        setTeamAssignments(assignments || []);
        
        // Fetch AI suggestions for team assignment
        try {
          const suggestions = await postprodApi.getAISuggestions(eventId);
          setAiSuggestions(suggestions);
        } catch (suggestionError) {
          console.warn('AI suggestions not available:', suggestionError);
        }
        
      } catch (err) {
        setError('Failed to load event details');
        console.error('Error fetching event:', err);
      } finally {
        setLoading(false);
      }
    };

    if (eventId) {
      fetchEventDetails();
    }
  }, [eventId]);

  const handleAutoAssign = async () => {
    try {
      setLoading(true);
      const result = await postprodApi.autoAssignTeam(eventId);
      setTeamAssignments(result.assignments || []);
      
      // Refresh streams to show updated assignments
      const updatedStreams = await postprodApi.getStreams(eventId);
      setStreams(updatedStreams || []);
      
      setError(null);
    } catch (err) {
      setError('Failed to auto-assign team members');
      console.error('Auto-assign error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualAssign = () => {
    setAssignModalOpen(true);
  };

  const handleAssignmentComplete = async (assignments) => {
    try {
      setTeamAssignments(assignments);
      
      // Refresh streams to show updated assignments
      const updatedStreams = await postprodApi.getStreams(eventId);
      setStreams(updatedStreams || []);
      
      setAssignModalOpen(false);
      setError(null);
    } catch (err) {
      setError('Failed to update assignments');
      console.error('Assignment update error:', err);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'assigned': return 'primary';
      case 'in_progress': return 'warning';
      case 'review': return 'info';
      case 'done': return 'success';
      default: return 'default';
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Event Header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <Typography variant="h4" gutterBottom>
              {event?.name || 'Post-Production Panel'}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Event Date: {event?.date ? new Date(event.date).toLocaleDateString() : 'N/A'}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Chip 
                label={event?.status || 'In Progress'} 
                color={getStatusColor(event?.status)}
                icon={<Schedule />}
                sx={{ mr: 1 }}
              />
              <Chip 
                label={`${streams.length} Stream${streams.length !== 1 ? 's' : ''}`}
                icon={<VideoLibrary />}
                variant="outlined"
                sx={{ mr: 1 }}
              />
              <Chip 
                label={`${teamAssignments.length} Team Member${teamAssignments.length !== 1 ? 's' : ''} Assigned`}
                icon={<Group />}
                variant="outlined"
              />
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Stack spacing={2} direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                startIcon={<AutoAwesome />}
                onClick={handleAutoAssign}
                disabled={loading}
                color="primary"
              >
                AI Auto-Assign
              </Button>
              <Button
                variant="outlined"
                startIcon={<Assignment />}
                onClick={handleManualAssign}
                disabled={loading}
              >
                Manual Assign
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* AI Suggestions */}
      {aiSuggestions && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            AI Team Suggestions
          </Typography>
          <AISuggestionDisplay 
            suggestions={aiSuggestions}
            onApplySuggestion={handleAutoAssign}
          />
        </Paper>
      )}

      {/* Streams Grid */}
      <Typography variant="h6" gutterBottom>
        Streams & Assignments
      </Typography>
      
      {streams.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <VideoLibrary sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No streams available for this event
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Streams will appear here once they are uploaded and processed.
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {streams.map((stream) => (
            <Grid item xs={12} md={6} lg={4} key={stream.id}>
              <StreamCard 
                stream={stream}
                onAssignEditor={() => setAssignModalOpen(true)}
                onUpdateStatus={(status) => {
                  // Handle status update
                  console.log('Update status:', status);
                }}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Current Team Assignments */}
      {teamAssignments.length > 0 && (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" gutterBottom>
            Current Team Assignments
          </Typography>
          <Grid container spacing={2}>
            {teamAssignments.map((assignment, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle1" gutterBottom>
                      {assignment.editor_name || assignment.user?.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Role: {assignment.role || 'Editor'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Stream: {assignment.stream_type || 'General'}
                    </Typography>
                    {assignment.due_date && (
                      <Typography variant="body2" color="text.secondary">
                        Due: {new Date(assignment.due_date).toLocaleDateString()}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* Assignment Modal */}
      <AssignEditorsModal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        eventId={eventId}
        streams={streams}
        onAssignmentComplete={handleAssignmentComplete}
      />
    </Container>
  );
};

export default PostProdPanel;
