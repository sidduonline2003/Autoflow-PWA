import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Chip,
  CircularProgress,
  Alert,
  Stack,
  LinearProgress,
  Divider,
  Button,
  Tooltip
} from '@mui/material';
import {
  Assignment,
  AssignmentTurnedIn,
  Group,
  Schedule,
  VideoLibrary,
  AutoAwesome,
  PersonAdd
} from '@mui/icons-material';
import { getOverview, initPostprod } from '../api/postprod.api';
import StreamCard from '../components/postprod/StreamCard';
import ActivityFeed from '../components/postprod/ActivityFeed';
import AISuggestionDisplay from '../components/AISuggestionDisplay';
import ManualTeamAssignmentModal from '../components/ManualTeamAssignmentModal';
import { auth } from '../firebase';
import toast from 'react-hot-toast';
import { POSTPROD_ENABLED } from '../config';

const PostProdPanel = () => {
  const { eventId } = useParams();
  const location = useLocation();
  const locationState = location.state ?? {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [eventInfo, setEventInfo] = useState(null);
  const [clientId, setClientId] = useState(
    locationState?.clientId ||
      locationState?.client_id ||
      locationState?.clientID ||
      locationState?.client?.id ||
      null
  );
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [manualAssignmentOpen, setManualAssignmentOpen] = useState(false);

  const pickFirstNonEmpty = useCallback((...values) => {
    for (const value of values) {
      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }
    return null;
  }, []);

  const queryClientId = useMemo(() => {
    const params = new URLSearchParams(location.search ?? '');
    return params.get('client');
  }, [location.search]);

  const locationClientId = useMemo(
    () =>
      pickFirstNonEmpty(
        locationState?.clientId,
        locationState?.client_id,
        locationState?.clientID,
        locationState?.client?.id,
        locationState?.client?.clientId,
        locationState?.event?.clientId,
        locationState?.event?.client?.id
      ),
    [locationState, pickFirstNonEmpty]
  );

  const callApi = useCallback(async (endpoint, method = 'GET', body = null) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('Authentication required');
    }

    const token = await currentUser.getIdToken();
    const response = await fetch(`/api${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (parseError) {
        console.error('Failed to parse response JSON:', parseError);
      }
    }

    if (!response.ok) {
      const message = payload?.detail || payload?.message || 'An unexpected error occurred.';
      throw new Error(message);
    }

    return payload;
  }, []);

  const applyOverviewData = useCallback(
    (overviewData) => {
      if (!overviewData) {
        setData(null);
        setEventInfo(null);
        return;
      }

      setData(overviewData);

      const eventData = pickFirstNonEmpty(
        overviewData?.eventInfo,
        overviewData?.event_info,
        overviewData?.event,
        overviewData?.eventSummary,
        overviewData?.event_summary,
        overviewData?.eventData,
        overviewData?.event_data
      );

      if (eventData) {
        setEventInfo({
          id: eventData?.id || eventData?.eventId || eventId,
          name: eventData?.name || overviewData?.eventName,
          date: eventData?.date || eventData?.eventDate || overviewData?.eventDate,
          clientName: pickFirstNonEmpty(
            eventData?.clientName,
            eventData?.client?.name,
            overviewData?.clientName,
            overviewData?.client?.name
          ),
          status: eventData?.status || overviewData?.status
        });
      } else {
        setEventInfo(null);
      }

      const resolvedClientId = pickFirstNonEmpty(
        overviewData?.clientId,
        overviewData?.clientID,
        overviewData?.client_id,
        overviewData?.client?.id,
        eventData?.clientId,
        eventData?.client?.id
      );

      if (resolvedClientId) {
        setClientId((prev) => prev || resolvedClientId);
      }

      const inlineSuggestions = pickFirstNonEmpty(
        overviewData?.aiSuggestions,
        overviewData?.ai_suggestions
      );
      setAiSuggestions(inlineSuggestions || null);
    },
    [eventId, pickFirstNonEmpty]
  );

  const fetchOverview = useCallback(async () => {
    if (!POSTPROD_ENABLED) {
      setLoading(false);
      applyOverviewData(null);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const overviewData = await getOverview(eventId);
      applyOverviewData(overviewData);
    } catch (err) {
      console.error('Failed to load post-production overview:', err);
      if (err?.response?.status === 404) {
        try {
          await initPostprod(eventId, {});
          const overviewData = await getOverview(eventId);
          applyOverviewData(overviewData);
          setError('');
        } catch (nestedError) {
          console.error('Failed to initialize post-production:', nestedError);
          setError('Post-Production not initialized. Ask Data Manager to approve intake.');
        }
      } else {
        setError('Failed to load post-production overview. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [applyOverviewData, eventId]);

  useEffect(() => {
    const incoming = pickFirstNonEmpty(queryClientId, locationClientId);
    if (incoming && incoming !== clientId) {
      setClientId(incoming);
    }
  }, [clientId, locationClientId, pickFirstNonEmpty, queryClientId]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const effectiveClientId = useMemo(
    () =>
      pickFirstNonEmpty(
        queryClientId,
        locationClientId,
        clientId,
        data?.clientId,
        data?.clientID,
        data?.client_id,
        data?.assignedClientId,
        data?.event?.clientId,
        data?.event?.client?.id,
        data?.event?.assignedClientId,
        data?.eventInfo?.clientId,
        data?.eventInfo?.client?.id,
        data?.aiSummary?.clientId,
        data?.intakeSummary?.clientId,
        data?.dataIntake?.clientId,
        data?.dataIntake?.assignedClientId,
        data?.submissionSummary?.clientId
      ),
    [clientId, data, locationClientId, pickFirstNonEmpty, queryClientId]
  );

  const clientContextReady = Boolean(effectiveClientId);

  const fetchAiSuggestions = useCallback(
    async (showToast = false) => {
      if (!eventId || !effectiveClientId) {
        if (showToast) {
          toast.error('Client context not available for this event.');
        }
        return;
      }

      try {
        setAiLoading(true);
        setAiError('');
        const response = await callApi(
          `/events/${eventId}/suggest-team?client_id=${effectiveClientId}`,
          'GET'
        );
        setAiSuggestions(response?.ai_suggestions || null);
        if (showToast) {
          toast.success('AI suggestions refreshed.');
        }
      } catch (err) {
        setAiSuggestions(null);
        setAiError(err.message || 'Failed to fetch AI suggestions');
        if (showToast) {
          toast.error(err.message || 'Failed to fetch AI suggestions');
        }
      } finally {
        setAiLoading(false);
      }
    },
    [callApi, effectiveClientId, eventId]
  );

  useEffect(() => {
    if (eventId && effectiveClientId) {
      fetchAiSuggestions();
    }
  }, [eventId, effectiveClientId, fetchAiSuggestions]);

  const handleAssignTeam = async (targetEventId, teamMembers) => {
    if (!teamMembers?.length) {
      return;
    }

    if (!effectiveClientId) {
      toast.error('Client context not available for assignment.');
      return;
    }

    try {
      await callApi(`/events/${targetEventId}/assign-crew?client_id=${effectiveClientId}`, 'POST', {
        team: teamMembers
      });
      toast.success('Team assignment updated.');
      fetchOverview();
      fetchAiSuggestions();
    } catch (err) {
      toast.error(err.message || 'Failed to assign team members.');
    }
  };

  const handleOpenManualAssignment = useCallback(() => {
    if (!effectiveClientId) {
      toast.error('Client context not available for manual assignment.');
      return;
    }
    setManualAssignmentOpen(true);
  }, [effectiveClientId]);

  const handleCloseManualAssignment = useCallback(() => {
    setManualAssignmentOpen(false);
    fetchOverview();
    fetchAiSuggestions();
  }, [fetchAiSuggestions, fetchOverview]);

  const handleRefreshSuggestions = () => {
    fetchAiSuggestions(true);
  };

  const submissionSummary = data?.submissionSummary || null;
  const assignedTotal = submissionSummary?.assigned ?? submissionSummary?.required ?? 0;
  const submittedTotal = submissionSummary?.submitted ?? 0;
  const approvedTotal = submissionSummary?.approved ?? 0;
  const pendingTotal = submissionSummary?.pending ?? Math.max(assignedTotal - approvedTotal, 0);
  const remainingRequired =
    submissionSummary?.remaining ?? Math.max((submissionSummary?.required ?? assignedTotal) - approvedTotal, 0);
  const requiredTotal = submissionSummary?.required ?? assignedTotal;
  const submittedPending = submissionSummary?.submittedPending ?? Math.max(submittedTotal - approvedTotal, 0);
  const approvalProgress = requiredTotal > 0 ? Math.min(100, Math.round((approvedTotal / requiredTotal) * 100)) : 0;
  const formattedLastUpdate = submissionSummary?.lastUpdate
    ? new Date(submissionSummary.lastUpdate).toLocaleString()
    : null;

  const summaryTiles = submissionSummary
    ? [
        {
          label: 'Assigned crew',
          value: assignedTotal,
          icon: <Group fontSize="small" sx={{ color: 'text.secondary' }} />,
          helper: 'Crew members who must submit intake data'
        },
        {
          label: 'Submitted',
          value: submittedTotal,
          icon: <Assignment fontSize="small" sx={{ color: 'text.secondary' }} />,
          helper: 'Teammates who have submitted their info'
        },
        {
          label: 'Approved',
          value: approvedTotal,
          icon: <AssignmentTurnedIn fontSize="small" sx={{ color: 'text.secondary' }} />,
          helper: 'Submissions fully reviewed and approved'
        },
        {
          label: 'Awaiting approval',
          value: submittedPending,
          icon: <Assignment fontSize="small" sx={{ color: 'text.secondary' }} />,
          helper: 'Submitted, but still waiting for approval'
        },
        {
          label: 'Pending submission',
          value: pendingTotal,
          icon: <Assignment fontSize="small" sx={{ color: 'text.secondary' }} />,
          helper: 'Assigned teammates who have not submitted yet'
        },
        {
          label: 'Approvals remaining',
          value: remainingRequired,
          icon: <AssignmentTurnedIn fontSize="small" sx={{ color: 'text.secondary' }} />,
          helper: 'Approvals needed to unlock post-production'
        }
      ]
    : [];

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'assigned':
        return 'primary';
      case 'in_progress':
        return 'warning';
      case 'review':
        return 'info';
      case 'done':
        return 'success';
      default:
        return 'default';
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
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={8}>
            <Typography variant="h4" gutterBottom>
              {eventInfo?.name || 'Post-Production Panel'}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Event ID: {eventId}
              {eventInfo?.date ? ` • ${new Date(eventInfo.date).toLocaleDateString()}` : ''}
              {eventInfo?.clientName ? ` • Client: ${eventInfo.clientName}` : ''}
            </Typography>
            <Box sx={{ mt: 2 }}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={eventInfo?.status || data?.status || 'IN_PROGRESS'} icon={<Schedule />} sx={{ mr: 1 }} />
                {effectiveClientId && <Chip label={`Client ${effectiveClientId}`} icon={<Group />} variant="outlined" />}
              </Stack>
              {submissionSummary && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: { xs: 2, sm: 1 } }}>
                  <Chip
                    icon={<Group />}
                    label={`${submittedTotal} submitted / ${assignedTotal || submissionSummary?.required || 0} assigned`}
                    color={
                      submittedTotal >= (assignedTotal || submissionSummary?.required || 0) &&
                      (assignedTotal || submissionSummary?.required || 0) > 0
                        ? 'success'
                        : 'default'
                    }
                  />
                  <Chip
                    icon={<AssignmentTurnedIn />}
                    label={`${approvedTotal} approved`}
                    color={remainingRequired === 0 && approvedTotal > 0 ? 'success' : 'warning'}
                  />
                  {pendingTotal > 0 && (
                    <Chip icon={<Assignment />} label={`${pendingTotal} pending`} color="warning" />
                  )}
                </Stack>
              )}
            </Box>
            {submissionSummary && (
              <Box sx={{ mt: 1 }}>
                <Typography
                  variant="body2"
                  color={remainingRequired === 0 ? 'success.main' : 'text.secondary'}
                >
                  {remainingRequired === 0
                    ? 'All required submissions are approved. Post-production can begin once assignments are ready.'
                    : `${remainingRequired} more approval${remainingRequired === 1 ? '' : 's'} needed before starting post-production.`}
                </Typography>
                {pendingTotal > 0 && submissionSummary?.pendingNames?.length > 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Pending teammates: {submissionSummary.pendingNames.join(', ')}
                  </Typography>
                )}
                {formattedLastUpdate && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    Last intake update: {formattedLastUpdate}
                  </Typography>
                )}
              </Box>
            )}
          </Grid>
          <Grid item xs={12} md={4}>
           
          </Grid>
        </Grid>
      </Paper>

      {submissionSummary && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Data Intake Summary
          </Typography>
          <Box sx={{ mt: 1 }}>
            <LinearProgress
              variant="determinate"
              value={approvalProgress}
              color={approvalProgress === 100 ? 'success' : 'primary'}
              sx={{ height: 10, borderRadius: 5 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {approvalProgress}% approved ({approvedTotal} of {requiredTotal || assignedTotal || 0})
            </Typography>
          </Box>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {summaryTiles.map(({ label, value, icon, helper }) => (
              <Grid item xs={12} sm={6} md={4} key={label}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.5,
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'action.hover'
                  }}
                >
                  {icon}
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary">
                      {label}
                    </Typography>
                    <Typography variant="h6">{value}</Typography>
                    {helper && (
                      <Typography variant="caption" color="text.secondary">
                        {helper}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>

          {(submissionSummary?.submittedNames?.length ||
            submissionSummary?.approvedNames?.length ||
            submissionSummary?.pendingNames?.length) && (
            <>
              <Divider sx={{ my: 2 }} />
              <Grid container spacing={2}>
                {submissionSummary?.submittedNames?.length ? (
                  <Grid item xs={12} md={4}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Submitted
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {submissionSummary.submittedNames.map((name) => (
                        <Chip
                          key={`submitted-${name}`}
                          label={name}
                          size="small"
                          icon={<Assignment fontSize="small" />}
                        />
                      ))}
                    </Stack>
                  </Grid>
                ) : null}

                {submissionSummary?.approvedNames?.length ? (
                  <Grid item xs={12} md={4}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Approved
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {submissionSummary.approvedNames.map((name) => (
                        <Chip
                          key={`approved-${name}`}
                          label={name}
                          size="small"
                          color="success"
                          icon={<AssignmentTurnedIn fontSize="small" />}
                        />
                      ))}
                    </Stack>
                  </Grid>
                ) : null}

                {submissionSummary?.pendingNames?.length ? (
                  <Grid item xs={12} md={4}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                      Pending
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {submissionSummary.pendingNames.map((name) => (
                        <Chip
                          key={`pending-${name}`}
                          label={name}
                          size="small"
                          color="warning"
                          icon={<Assignment fontSize="small" />}
                        />
                      ))}
                    </Stack>
                  </Grid>
                ) : null}
              </Grid>
            </>
          )}
        </Paper>
      )}

   

      <Typography variant="h6" gutterBottom>
        Streams & Assignments
      </Typography>

      {!data?.photo && !data?.video ? (
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
          <Grid item xs={12} md={6}>
            <StreamCard eventId={eventId} stream="photo" data={data?.photo} refresh={fetchOverview} />
          </Grid>
          <Grid item xs={12} md={6}>
            <StreamCard eventId={eventId} stream="video" data={data?.video} refresh={fetchOverview} />
          </Grid>
        </Grid>
      )}

      <ActivityFeed eventId={eventId} canNote />

      <ManualTeamAssignmentModal
        open={manualAssignmentOpen}
        onClose={handleCloseManualAssignment}
        eventId={eventId}
        clientId={effectiveClientId}
        eventData={eventInfo}
        callApi={callApi}
      />
    </Container>
  );
};

export default PostProdPanel;
