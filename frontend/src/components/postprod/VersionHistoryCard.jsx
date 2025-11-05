import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Paper,
  Typography,
  Stack,
  Chip,
  Box,
  Divider
} from '@mui/material';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineOppositeContent,
  TimelineDot
} from '@mui/lab';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import RateReviewIcon from '@mui/icons-material/RateReview';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EditNoteIcon from '@mui/icons-material/EditNote';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ReplayIcon from '@mui/icons-material/Replay';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import InfoIcon from '@mui/icons-material/Info';
import { format, formatDistanceToNow } from 'date-fns';

const EVENT_CONFIG = {
  ASSIGN: {
    color: 'info',
    icon: <AssignmentIndIcon fontSize="small" />,
    title: 'Assignment created'
  },
  REASSIGN: {
    color: 'info',
    icon: <ReplayIcon fontSize="small" />,
    title: 'Team updated'
  },
  START: {
    color: 'primary',
    icon: <PlayArrowIcon fontSize="small" />,
    title: 'Work started'
  },
  SUBMIT: {
    color: 'primary',
    icon: <CloudUploadIcon fontSize="small" />,
    title: 'Submission uploaded'
  },
  REVIEW: {
    color: 'secondary',
    icon: <RateReviewIcon fontSize="small" />,
    title: 'Under review'
  },
  REQUEST_CHANGES: {
    color: 'warning',
    icon: <RateReviewIcon fontSize="small" />,
    title: 'Changes requested'
  },
  CHANGES: {
    color: 'warning',
    icon: <RateReviewIcon fontSize="small" />,
    title: 'Changes requested'
  },
  APPROVE: {
    color: 'success',
    icon: <CheckCircleIcon fontSize="small" />,
    title: 'Approved'
  },
  NOTE: {
    color: 'default',
    icon: <EditNoteIcon fontSize="small" />,
    title: 'Note added'
  }
};

const FALLBACK_EVENT = {
  color: 'default',
  icon: <InfoIcon fontSize="small" />,
  title: 'Activity'
};

const safeFormatDate = (value) => {
  if (!value) {
    return {
      distance: 'Unknown time',
      formatted: 'No date available'
    };
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      distance: 'Unknown time',
      formatted: 'No date available'
    };
  }

  try {
    return {
      distance: formatDistanceToNow(date, { addSuffix: true }),
      formatted: format(date, 'MMM dd, yyyy • h:mm a')
    };
  } catch (error) {
    return {
      distance: 'Recently',
      formatted: date.toLocaleString()
    };
  }
};

const VersionHistoryCard = ({
  streamType,
  streamLabel,
  streamState,
  activities,
  changeHistory,
  actions
}) => {
  const timelineItems = useMemo(() => {
    const map = new Map();

    (activities || []).forEach((activity, index) => {
      if (activity.stream && activity.stream !== streamType) {
        return;
      }
      const keyBase = `${activity.kind || 'EVENT'}-${activity.version ?? 'no-version'}-${activity.timestamp ? activity.timestamp.getTime() : index}`;
      const key = map.has(keyBase) ? `${keyBase}-${index}` : keyBase;
      map.set(key, {
        id: key,
        kind: activity.kind || 'NOTE',
        timestamp: activity.timestamp,
        version: activity.version ?? null,
        summary: activity.summary,
        actor: activity.actor,
        metadata: activity.metadata || {}
      });
    });

    (changeHistory || []).forEach((entry, index) => {
      const key = `REQUEST_CHANGES-${entry.version ?? index}`;
      if (map.has(key)) {
        const existing = map.get(key);
        existing.kind = 'REQUEST_CHANGES';
        existing.metadata = {
          ...existing.metadata,
          changeList: entry.changeList || existing.metadata.changeList,
          nextDue: entry.nextDue || existing.metadata.nextDue
        };
        if (!existing.timestamp && entry.timestamp) {
          existing.timestamp = entry.timestamp;
        }
      } else {
        map.set(key, {
          id: `${key}-${index}`,
          kind: 'REQUEST_CHANGES',
          timestamp: entry.timestamp || null,
          version: entry.version ?? null,
          summary: 'Admin requested revisions',
          actor: entry.actor || null,
          metadata: {
            changeList: entry.changeList,
            nextDue: entry.nextDue
          }
        });
      }
    });

    const items = Array.from(map.values());
    items.sort((a, b) => {
      const timeA = a.timestamp ? a.timestamp.getTime() : 0;
      const timeB = b.timestamp ? b.timestamp.getTime() : 0;
      return timeA - timeB;
    });

    return items;
  }, [activities, changeHistory, streamType]);

  const stateLabel = streamState?.state || 'ASSIGNED';
  const currentVersion = streamState?.version ?? 0;

  return (
    <Paper sx={{ p: 3, borderRadius: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
        <Box>
          <Typography variant="h6" gutterBottom>
            {streamLabel} Version History
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip label={stateLabel.replaceAll('_', ' ')} color="default" size="small" />
            <Chip label={`Current v${currentVersion}`} variant="outlined" size="small" />
            {streamState?.draftDue && (
              <Chip label={`Draft due ${new Date(streamState.draftDue).toLocaleDateString()}`} size="small" variant="outlined" />
            )}
            {streamState?.finalDue && (
              <Chip label={`Final due ${new Date(streamState.finalDue).toLocaleDateString()}`} size="small" variant="outlined" />
            )}
          </Stack>
        </Box>
        {actions && <Box>{actions}</Box>}
      </Stack>

      <Divider sx={{ my: 2 }} />

      {timelineItems.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No submissions yet. Once you upload deliverables or receive feedback, the full review trail will appear here.
        </Typography>
      ) : (
        <Timeline position="right" sx={{ '& .MuiTimelineItem-root:before': { flex: 0, padding: 0 } }}>
          {timelineItems.map((item, index) => {
            const config = EVENT_CONFIG[item.kind] || FALLBACK_EVENT;
            const timestampInfo = safeFormatDate(item.timestamp);
            const changeList = item.metadata?.changeList || [];
            const nextDue = item.metadata?.nextDue;
            const requestKind = item.metadata?.decision || (item.kind === 'REQUEST_CHANGES' ? 'changes' : null);

            return (
              <TimelineItem key={item.id || index}>
                <TimelineOppositeContent sx={{ flex: 0.25, pr: 2 }}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    {timestampInfo.distance}
                  </Typography>
                  <Typography variant="caption" color="text.disabled">
                    {timestampInfo.formatted}
                  </Typography>
                </TimelineOppositeContent>
                <TimelineSeparator>
                  <TimelineDot color={config.color} variant={config.color === 'default' ? 'outlined' : 'filled'}>
                    {config.icon}
                  </TimelineDot>
                  {index < timelineItems.length - 1 && <TimelineConnector />}
                </TimelineSeparator>
                <TimelineContent sx={{ py: 1 }}>
                  <Stack spacing={0.5}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="subtitle2">
                        {config.title}
                      </Typography>
                      {item.version != null && (
                        <Chip label={`v${item.version}`} size="small" variant="outlined" />
                      )}
                      {requestKind && (
                        <Chip label={requestKind === 'changes' ? 'Changes requested' : requestKind} size="small" color="warning" variant="outlined" />
                      )}
                    </Stack>
                    {item.summary && (
                      <Typography variant="body2" color="text.primary">
                        {item.summary}
                      </Typography>
                    )}
                    {item.metadata?.deliverableCount != null && (
                      <Typography variant="caption" color="text.secondary">
                        Deliverables: {item.metadata.deliverableCount}
                      </Typography>
                    )}
                    {Array.isArray(changeList) && changeList.length > 0 && (
                      <Box component="ul" sx={{ pl: 2, mb: 0 }}>
                        {changeList.map((change, changeIdx) => (
                          <Typography component="li" variant="body2" key={changeIdx} sx={{ mb: 0.25 }}>
                            {change}
                          </Typography>
                        ))}
                      </Box>
                    )}
                    {nextDue && (
                      <Typography variant="caption" color="text.secondary">
                        Resubmit by {safeFormatDate(new Date(nextDue)).formatted}
                      </Typography>
                    )}
                    {item.actor && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                        {item.actor}
                      </Typography>
                    )}
                  </Stack>
                </TimelineContent>
              </TimelineItem>
            );
          })}
        </Timeline>
      )}
    </Paper>
  );
};

VersionHistoryCard.propTypes = {
  streamType: PropTypes.oneOf(['photo', 'video']).isRequired,
  streamLabel: PropTypes.string.isRequired,
  streamState: PropTypes.object,
  activities: PropTypes.array,
  changeHistory: PropTypes.array,
  actions: PropTypes.node
};

VersionHistoryCard.defaultProps = {
  streamState: {},
  activities: [],
  changeHistory: [],
  actions: null
};

export default VersionHistoryCard;
