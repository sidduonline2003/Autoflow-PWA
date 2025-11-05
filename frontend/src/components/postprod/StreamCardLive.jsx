import React, { useState, useMemo, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Typography,
  Button,
  Box,
  Chip,
  Stack,
  Alert,
  Avatar,
  AvatarGroup,
  Tooltip,
  LinearProgress
} from '@mui/material';
import {
  FiberManualRecord,
  CheckCircle,
  RateReview,
  HourglassEmpty,
  Visibility
} from '@mui/icons-material';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

import { useAuth } from '../../contexts/AuthContext';
import AssignEditorsModal from './AssignEditorsModal';
import ReviewModal from './ReviewModal';
import ExtendDueModal from './ExtendDueModal';
import ManifestForm from './ManifestForm';
import { startStream, waiveStream } from '../../api/postprod.api';
import usePostProdLiveSync from '../../hooks/usePostProdLiveSync';

const STATE_PILLS = {
  done: { icon: <CheckCircle fontSize="small" />, color: 'success', label: 'Approved' },
  review: { icon: <RateReview fontSize="small" />, color: 'info', label: 'In Review' },
  changes: { icon: <RateReview fontSize="small" />, color: 'warning', label: 'Changes Requested' },
  progress: { icon: <HourglassEmpty fontSize="small" />, color: 'primary', label: 'In Progress' },
  assigned: { icon: <HourglassEmpty fontSize="small" />, color: 'default', label: 'Assigned' }
};

const LIVE_INDICATOR_STYLE = {
  fontSize: 12,
  color: 'success.main',
  animation: 'pulse 2s infinite',
  '@keyframes pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.4 }
  }
};

const deriveStateInfo = (stateValue = '') => {
  if (!stateValue) return STATE_PILLS.assigned;
  if (stateValue.includes('DONE') || stateValue.includes('APPROVED')) return STATE_PILLS.done;
  if (stateValue.includes('REVIEW')) return STATE_PILLS.review;
  if (stateValue.includes('CHANGES')) return STATE_PILLS.changes;
  if (stateValue.includes('PROGRESS')) return STATE_PILLS.progress;
  if (stateValue.includes('ASSIGNED')) return STATE_PILLS.assigned;
  return {
    icon: <HourglassEmpty fontSize="small" />,
    color: 'default',
    label: stateValue
  };
};

const formatDate = (value) => {
  try {
    return value ? format(new Date(value), 'PP p') : 'N/A';
  } catch (err) {
    return value || 'N/A';
  }
};

const StreamCardLive = ({ eventId, orgId, stream, cache }) => {
  const { user, claims } = useAuth();
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [extendDueModalOpen, setExtendDueModalOpen] = useState(false);
  const [manifestModalOpen, setManifestModalOpen] = useState(false);

  const isAdmin = (claims?.role === 'admin') || (claims?.roles || [])?.includes?.('admin');

  const jobData = cache?.data;
  const cacheLoading = cache?.loading;
  const fetchIfNeeded = cache?.fetchIfNeeded;
  const forceRefresh = cache?.forceRefresh;
  const cacheState = cache?.cacheState;

  const cachedPhotoVersion = cacheState?.versions?.photo ?? 0;
  const cachedVideoVersion = cacheState?.versions?.video ?? 0;

  const handleVersionChange = useCallback(
    (nextVersion) => {
      if (!fetchIfNeeded) return;
      const nextPhotoVersion = stream === 'photo' ? nextVersion : cachedPhotoVersion;
      const nextVideoVersion = stream === 'video' ? nextVersion : cachedVideoVersion;
      fetchIfNeeded(nextPhotoVersion, nextVideoVersion).catch(() => undefined);
    },
    [stream, cachedPhotoVersion, cachedVideoVersion, fetchIfNeeded]
  );

  const {
    liveState,
    activeUsers,
    lastAction,
    version: liveVersion,
    loading: liveLoading
  } = usePostProdLiveSync(orgId, eventId, stream, handleVersionChange);

  const streamData = useMemo(() => jobData?.[stream] || {}, [jobData, stream]);
  const stateValue = liveState || streamData.state;
  const stateInfo = deriveStateInfo(stateValue);

  const leadEditor = useMemo(
    () => streamData?.editors?.find((editor) => editor.role === 'LEAD' && editor.uid === user?.uid),
    [streamData?.editors, user?.uid]
  );

  const hasSubmission = useMemo(() => {
    if (!streamData) return false;
    const deliverables = streamData.deliverables || {};
    return (
      (streamData.version && streamData.version > 0) ||
      (deliverables && Object.keys(deliverables).length > 0) ||
      Boolean(streamData.lastSubmissionAt)
    );
  }, [streamData]);

  const handleRefresh = useCallback(() => {
    if (forceRefresh) {
      forceRefresh().catch(() => undefined);
    }
  }, [forceRefresh]);

  const onStart = useCallback(async () => {
    try {
      await startStream(eventId, stream);
      toast.success('Stream started');
      handleRefresh();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to start stream');
    }
  }, [eventId, stream, handleRefresh]);

  const onWaive = useCallback(async () => {
    try {
      await waiveStream(eventId, stream);
      toast.success('Stream waived');
      handleRefresh();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Failed to waive stream');
    }
  }, [eventId, stream, handleRefresh]);

  const loading = cacheLoading || liveLoading;
  const versionLabel = liveVersion || streamData?.version || 0;

  const actionSummary = useMemo(() => {
    if (!lastAction) return null;
    const { type, by, at } = lastAction;
    return {
      label: type ? type.toString().toUpperCase() : 'ACTION',
      by,
      at: at ? formatDate(at) : null
    };
  }, [lastAction]);

  return (
    <Card variant="outlined" sx={{ position: 'relative', overflow: 'visible' }}>
  {(loading && !streamData?.state) && <LinearProgress />}

      {activeUsers?.length > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 12,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 0.5
          }}
        >
          <FiberManualRecord sx={LIVE_INDICATOR_STYLE} />
          <Typography variant="caption" color="success.main">
            Live
          </Typography>
        </Box>
      )}

      <CardHeader
        title={stream === 'photo' ? '📷 Photos' : '🎥 Video'}
        action={
          <Stack direction="row" spacing={1} alignItems="center">
            {Boolean(versionLabel) && (
              <Chip label={`v${versionLabel}`} size="small" />
            )}
            <Chip
              icon={stateInfo.icon}
              color={stateInfo.color}
              label={stateInfo.label}
              size="small"
              sx={{ fontWeight: 600 }}
            />
          </Stack>
        }
      />

      <CardContent>
        {streamData?.risk?.atRisk && (
          <Chip
            label="At Risk"
            color="error"
            size="small"
            sx={{ mb: 1 }}
            title={streamData?.risk?.reason}
          />
        )}

        {stateValue?.includes('REVIEW') && !hasSubmission && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Waiting for editor submission to review.
          </Alert>
        )}

        {stateValue?.includes('CHANGES') && Array.isArray(streamData?.changeList) && streamData.changeList.length > 0 && (
          <Alert severity="warning" sx={{ my: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
              📝 Changes Requested by Admin
            </Typography>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {streamData.changeList.map((change, idx) => (
                <li key={idx}>
                  <Typography variant="body2">{change}</Typography>
                </li>
              ))}
            </ul>
            {streamData.nextDue && (
              <Typography variant="caption" sx={{ mt: 1, display: 'block', fontStyle: 'italic' }}>
                ⏰ Resubmit by: {formatDate(streamData.nextDue)}
              </Typography>
            )}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box>
            <Typography variant="subtitle2">Due Dates</Typography>
            <Typography variant="body2" color="text.secondary">
              Draft: {formatDate(streamData?.draftDue)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Final: {formatDate(streamData?.finalDue)}
            </Typography>
          </Box>

          <Box>
            <Typography variant="subtitle2">Editors</Typography>
            {streamData?.editors?.length ? (
              streamData.editors.map((editor) => (
                <Typography key={editor.uid} variant="body2">
                  {editor.role === 'LEAD' && '★ '}
                  {editor.displayName || editor.uid}
                </Typography>
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                Not assigned
              </Typography>
            )}
          </Box>

          {Array.isArray(activeUsers) && activeUsers.length > 0 && (
            <Box>
              <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Visibility fontSize="small" /> Currently Viewing
              </Typography>
              <AvatarGroup max={5} sx={{ justifyContent: 'flex-start', mt: 0.5 }}>
                {activeUsers.map((uid, index) => (
                  <Tooltip key={uid || index} title={uid || `Viewer ${index + 1}`}>
                    <Avatar sx={{ width: 28, height: 28, fontSize: 12 }}>
                      {(uid || '').slice(0, 2).toUpperCase() || index + 1}
                    </Avatar>
                  </Tooltip>
                ))}
              </AvatarGroup>
            </Box>
          )}

          {actionSummary && (
            <Box>
              <Typography variant="subtitle2">Last Action</Typography>
              <Typography variant="body2" color="text.secondary">
                {actionSummary.label} by {actionSummary.by || 'unknown'}
                {actionSummary.at ? ` • ${actionSummary.at}` : ''}
              </Typography>
            </Box>
          )}

          {streamData?.deliverables && Object.keys(streamData.deliverables).length > 0 && (
            <Box
              sx={{
                p: 1.5,
                bgcolor: 'success.light',
                borderRadius: 1,
                borderLeft: '4px solid',
                borderColor: 'success.main'
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                ✅ Submitted Deliverables
              </Typography>
              <Stack spacing={0.5}>
                {Object.entries(streamData.deliverables).map(([key, value]) => (
                  value ? (
                    <Typography key={key} variant="caption" component="div">
                      • {key}:&nbsp;
                      {typeof value === 'string' && value.startsWith('http') ? (
                        <a href={value} target="_blank" rel="noopener noreferrer">
                          {value.length > 60 ? `${value.slice(0, 57)}...` : value}
                        </a>
                      ) : (
                        <span>{String(value)}</span>
                      )}
                    </Typography>
                  ) : null
                ))}
              </Stack>
              {streamData?.lastSubmissionAt && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                  Submitted: {formatDate(streamData.lastSubmissionAt)}
                </Typography>
              )}
            </Box>
          )}

          {streamData?.lastSubmission?.whatChanged && (
            <Typography variant="caption" color="text.secondary" display="block">
              Last update: {streamData.lastSubmission.whatChanged}
            </Typography>
          )}
        </Box>

        <Box sx={{ mt: 3, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {isAdmin && (
            <>
              {stateValue?.includes('REVIEW') && hasSubmission && (
                <Button size="small" variant="contained" onClick={() => setReviewModalOpen(true)}>
                  Review Submission
                </Button>
              )}
              {stateValue?.includes('REVIEW') && !hasSubmission && (
                <Button size="small" variant="outlined" disabled>
                  Awaiting Submission
                </Button>
              )}
              {!streamData?.editors?.length && (
                <Button size="small" variant="contained" onClick={() => setAssignModalOpen(true)}>
                  Assign Editors
                </Button>
              )}
              {streamData?.editors?.length > 0 && !stateValue?.includes('DONE') && (
                <>
                  <Button size="small" onClick={() => setExtendDueModalOpen(true)}>Extend Due</Button>
                  <Button size="small" onClick={() => setAssignModalOpen(true)}>Reassign</Button>
                  <Button size="small" color="error" onClick={onWaive}>Waive</Button>
                </>
              )}
            </>
          )}

          {leadEditor && (
            <>
              {stateValue?.includes('ASSIGNED') && (
                <Button size="small" variant="contained" onClick={onStart}>
                  Start
                </Button>
              )}
              {(stateValue?.includes('IN_PROGRESS') || stateValue?.includes('CHANGES')) && (
                  <Button size="small" variant="contained" onClick={() => setManifestModalOpen(true)}>
                    Submit Draft
                  </Button>
              )}
            </>
          )}
        </Box>
      </CardContent>

      <AssignEditorsModal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        eventId={eventId}
        stream={stream}
        onAssigned={handleRefresh}
        mode={streamData?.editors?.length ? 'reassign' : 'assign'}
        initialEditors={streamData?.editors || []}
        initialDraftDue={streamData?.draftDue}
        initialFinalDue={streamData?.finalDue}
      />
      <ReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        eventId={eventId}
        stream={stream}
        onDecided={handleRefresh}
      />
      <ExtendDueModal
        open={extendDueModalOpen}
        onClose={() => setExtendDueModalOpen(false)}
        eventId={eventId}
        stream={stream}
        onExtended={handleRefresh}
      />
      <ManifestForm
        open={manifestModalOpen}
        onClose={() => setManifestModalOpen(false)}
        eventId={eventId}
        stream={stream}
        nextVersion={(streamData?.version || 0) + 1}
        kind="draft"
        onSubmitted={handleRefresh}
      />
    </Card>
  );
};

export default StreamCardLive;
