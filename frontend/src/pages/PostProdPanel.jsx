import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useParams, Link as RouterLink } from 'react-router-dom';
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
  Tooltip,
  Breadcrumbs,
  Link
} from '@mui/material';
import {
  Assignment,
  AssignmentTurnedIn,
  Group,
  Schedule,
  VideoLibrary,
  AutoAwesome,
  PersonAdd,
  NavigateNext
} from '@mui/icons-material';
import { initPostprod } from '../api/postprod.api';
import StreamCardLive from '../components/postprod/StreamCardLive';
import ActivityFeed from '../components/postprod/ActivityFeed';
import AISuggestionDisplay from '../components/AISuggestionDisplay';
import ManualTeamAssignmentModal from '../components/ManualTeamAssignmentModal';
import EditorJobView from '../components/postprod/EditorJobView';
import { auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { POSTPROD_ENABLED } from '../config';
import usePostProdCache from '../hooks/usePostProdCache';
import useActivityFeed from '../hooks/useActivityFeed';
import { normalizeActivities } from '../components/postprod/historyUtils';

const PostProdPanel = () => {
  const { eventId } = useParams();
  const location = useLocation();
  const locationState = useMemo(() => location.state ?? {}, [location.state]);
  const { claims } = useAuth();

  const [error, setError] = useState('');
  const [clientId, setClientId] = useState(
    locationState?.clientId ||
      locationState?.client_id ||
      locationState?.clientID ||
      locationState?.client?.id ||
      null
  );

  const {
    data: overviewData,
    loading: cacheLoading,
    error: cacheError,
    fetchIfNeeded,
    forceRefresh,
    cacheState
  } = usePostProdCache(eventId, { autoLoad: false });

  const data = overviewData || null;
  
  // Detect user role
  const userRole = claims?.role || 'editor';
  const isAdmin = userRole === 'admin';
  const isEditor = ['editor', 'crew', 'data-manager'].includes(userRole);
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

  const eventData = useMemo(
    () =>
      pickFirstNonEmpty(
        data?.eventInfo,
        data?.event_info,
        data?.event,
        data?.eventSummary,
        data?.event_summary,
        data?.eventData,
        data?.event_data
      ),
    [data, pickFirstNonEmpty]
  );

  const eventInfo = useMemo(
    () =>
      eventData
        ? {
            id: eventData?.id || eventData?.eventId || eventId,
            name: eventData?.name || data?.eventName,
            date: eventData?.date || eventData?.eventDate || data?.eventDate,
            clientName: pickFirstNonEmpty(
              eventData?.clientName,
              eventData?.client?.name,
              data?.clientName,
              data?.client?.name
            ),
            status: eventData?.status || data?.status
          }
        : null,
    [eventData, data, eventId, pickFirstNonEmpty]
  );

  const orgId = useMemo(
    () =>
      pickFirstNonEmpty(
        claims?.orgId,
        claims?.org_id,
        locationState?.orgId,
        locationState?.org_id,
        data?.orgId,
        data?.organizationId,
        eventData?.orgId,
        eventData?.organizationId,
        data?.event?.orgId,
        data?.event?.organizationId
      ),
    [claims, locationState, data, eventData, pickFirstNonEmpty]
  );

  const pageLoading = cacheLoading && !data;
  const combinedError = error || cacheError;

  const cacheBridge = useMemo(
    () => ({
      data,
      loading: cacheLoading,
      error: cacheError,
      fetchIfNeeded,
      forceRefresh,
      cacheState
    }),
    [data, cacheLoading, cacheError, fetchIfNeeded, forceRefresh, cacheState]
  );

  const {
    activities: liveActivities,
    loading: activityLoading,
    hasMore: activityHasMore,
    refresh: refreshActivity
  } = useActivityFeed(orgId, eventId, 40, { enabled: Boolean(orgId && eventId) });

  const fallbackActivities = useMemo(() => {
    const raw = pickFirstNonEmpty(
      data?.recentActivity,
      data?.activity,
      data?.activityFeed,
      data?.activityLog
    );
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.items)) return raw.items;
    return [];
  }, [data, pickFirstNonEmpty]);

  const activityItems = liveActivities?.length ? liveActivities : fallbackActivities;
  const isActivityLoading = activityLoading && Boolean(orgId && eventId);

  const normalizedActivities = useMemo(
    () => normalizeActivities(activityItems),
    [activityItems]
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
    (incoming) => {
      if (!incoming) {
        setAiSuggestions(null);
        return;
      }

      const eventData = pickFirstNonEmpty(
        incoming?.eventInfo,
        incoming?.event_info,
        incoming?.event,
        incoming?.eventSummary,
        incoming?.event_summary,
        incoming?.eventData,
        incoming?.event_data
      );

      const resolvedClientId = pickFirstNonEmpty(
        incoming?.clientId,
        incoming?.clientID,
        incoming?.client_id,
        incoming?.client?.id,
        eventData?.clientId,
        eventData?.client?.id
      );

      if (resolvedClientId) {
        setClientId((prev) => prev || resolvedClientId);
      }

      const inlineSuggestions = pickFirstNonEmpty(
        incoming?.aiSuggestions,
        incoming?.ai_suggestions
      );
      setAiSuggestions(inlineSuggestions || null);
    },
    [pickFirstNonEmpty]
  );

  const refreshOverview = useCallback(async () => {
    if (!POSTPROD_ENABLED) {
      applyOverviewData(null);
      return null;
    }

    try {
      setError('');
      const overview = await forceRefresh();
      applyOverviewData(overview);
      return overview;
    } catch (err) {
      console.error('Failed to load post-production overview:', err);
      if (err?.response?.status === 404) {
        try {
          await initPostprod(eventId, {});
          const overview = await forceRefresh();
          applyOverviewData(overview);
          setError('');
          return overview;
        } catch (nestedError) {
          console.error('Failed to initialize post-production:', nestedError);
          setError('Post-Production not initialized. Ask Data Manager to approve intake.');
        }
      } else {
        setError('Failed to load post-production overview. Please try again.');
      }
    }
    return null;
  }, [applyOverviewData, eventId, forceRefresh]);

  const handleActivityRefresh = useCallback(() => {
    if (orgId && eventId) {
      refreshActivity();
    } else {
      refreshOverview();
    }
  }, [orgId, eventId, refreshActivity, refreshOverview]);

  useEffect(() => {
    const incoming = pickFirstNonEmpty(queryClientId, locationClientId);
    if (incoming && incoming !== clientId) {
      setClientId(incoming);
    }
  }, [clientId, locationClientId, pickFirstNonEmpty, queryClientId]);

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  useEffect(() => {
    if (overviewData) {
      applyOverviewData(overviewData);
    }
  }, [overviewData, applyOverviewData]);

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

  // Removed automatic AI suggestions fetch on page load
  // AI suggestions should only be fetched when user explicitly toggles the AI switch
  // in the AssignEditorsModal component
  
  // useEffect(() => {
  //   if (eventId && effectiveClientId) {
  //     fetchAiSuggestions();
  //   }
  // }, [eventId, effectiveClientId, fetchAiSuggestions]);

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
      refreshOverview();
      // Removed automatic AI suggestions refresh - only fetch when user toggles AI
      // fetchAiSuggestions();
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
    refreshOverview();
    // Removed automatic AI suggestions refresh - only fetch when user toggles AI
    // fetchAiSuggestions();
  }, [refreshOverview]);

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

  if (pageLoading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (combinedError) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Alert severity="error">{combinedError}</Alert>
      </Container>
    );
  }

  // Show Editor-friendly view for non-admin users
  if (isEditor && !isAdmin) {
    return (
      <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
        <EditorJobView 
          jobData={{
            ...data,
            eventName: eventInfo?.name,
            clientName: eventInfo?.clientName || data?.clientName,
            currentUserUid: auth.currentUser?.uid
          }}
          eventId={eventId}
          activityData={activityItems}
          userRole={userRole}
          onRefresh={refreshOverview}
          onRefreshActivity={handleActivityRefresh}
        />
      </Container>
    );
  }

  // Admin view (existing code)
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Breadcrumb Navigation */}
      <Breadcrumbs separator={<NavigateNext fontSize="small" />} sx={{ mb: 2 }}>
        <Link component={RouterLink} underline="hover" color="inherit" to="/postprod">
          Post-Production Hub
        </Link>
        <Typography color="text.primary">
          {eventInfo?.name || 'Event Details'}
        </Typography>
      </Breadcrumbs>

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
            <Stack spacing={2}>
              <Tooltip
                title={clientContextReady ? 'Refresh AI-based team suggestions' : 'Client context required'}
                placement="left"
              >
                <span>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<AutoAwesome />}
                    onClick={handleRefreshSuggestions}
                    disabled={!clientContextReady || aiLoading}
                  >
                    {aiLoading ? 'Refreshing…' : 'Refresh AI Suggestions'}
                  </Button>
                </span>
              </Tooltip>

              <Tooltip
                title={clientContextReady ? 'Open manual team assignment modal' : 'Client context required'}
                placement="left"
              >
                <span>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<PersonAdd />}
                    onClick={handleOpenManualAssignment}
                    disabled={!clientContextReady}
                  >
                    Manual Assignment
                  </Button>
                </span>
              </Tooltip>

              <AISuggestionDisplay
                eventId={eventId}
                suggestions={aiSuggestions}
                loading={aiLoading}
                error={aiError}
                onAssign={handleAssignTeam}
                onManualAssign={handleOpenManualAssignment}
              />
            </Stack>
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
            <StreamCardLive
              eventId={eventId}
              orgId={orgId}
              stream="photo"
              cache={cacheBridge}
              activities={normalizedActivities}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <StreamCardLive
              eventId={eventId}
              orgId={orgId}
              stream="video"
              cache={cacheBridge}
              activities={normalizedActivities}
            />
          </Grid>
        </Grid>
      )}

      <ActivityFeed
        eventId={eventId}
        orgId={orgId}
        canNote
        limit={40}
        activities={activityItems}
        loading={isActivityLoading}
        hasMore={activityHasMore}
        onRefresh={handleActivityRefresh}
      />

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
