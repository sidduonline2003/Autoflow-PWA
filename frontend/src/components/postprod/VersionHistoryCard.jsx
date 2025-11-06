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

const LANE_UI_CONFIG = {
  editor: { color: 'primary', variant: 'outlined' },
  admin: { color: 'secondary', variant: 'filled' },
  system: { color: 'default', variant: 'outlined' }
};

const LANE_LABEL_BY_CONTEXT = {
  editor: {
    editor: 'Your submission',
    admin: 'Admin feedback',
    system: 'System update'
  },
  admin: {
    editor: 'Editor submission',
    admin: 'Admin decision',
    system: 'System update'
  },
  shared: {
    editor: 'Editor update',
    admin: 'Admin update',
    system: 'System update'
  }
};

const toTitleCase = (value) => {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const formatSubmissionKindLabel = (kind) => {
  if (!kind) return null;
  const normalized = String(kind).toLowerCase();
  if (normalized.includes('draft')) return 'Draft submission';
  if (normalized.includes('final')) return 'Final submission';
  if (normalized.includes('revision')) return 'Revision upload';
  if (normalized.includes('review')) return 'Review update';
  return toTitleCase(kind);
};

const resolveLane = (item) => {
  if (item?.lane) return item.lane;
  const kind = String(item?.kind || '').toUpperCase();
  if (['SUBMIT', 'NOTE', 'START'].includes(kind)) return 'editor';
  if (['REVIEW', 'REQUEST_CHANGES', 'CHANGES', 'APPROVE', 'WAIVE'].includes(kind) || item?.metadata?.decision) return 'admin';
  if (['ASSIGN', 'REASSIGN'].includes(kind)) return 'admin';
  return 'system';
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
  actions,
  context
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
        metadata: activity.metadata || {},
        lane: resolveLane(activity)
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
          },
          lane: entry.lane || 'admin'
        });
      }
    });

    const items = Array.from(map.values()).map((item) => {
      const metadata = item.metadata || {};
      const submissionKind = metadata.submissionKind || metadata.kind || metadata.manifestKind;
      return {
        ...item,
        metadata: {
          ...metadata,
          submissionKind
        },
        lane: resolveLane(item),
        timestampValue: item.timestamp ? item.timestamp.getTime() : 0
      };
    });
    items.sort((a, b) => {
      if (b.timestampValue !== a.timestampValue) {
        return b.timestampValue - a.timestampValue;
      }
      if ((b.version ?? -1) !== (a.version ?? -1)) {
        return (b.version ?? -1) - (a.version ?? -1);
      }
      return (b.id || '').localeCompare(a.id || '');
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
            const submissionKindLabel = formatSubmissionKindLabel(item.metadata?.submissionKind);
            const lane = resolveLane(item);
            const laneLabel = (LANE_LABEL_BY_CONTEXT[context] || LANE_LABEL_BY_CONTEXT.shared)[lane] || LANE_LABEL_BY_CONTEXT.shared.system;
            const laneChipConfig = LANE_UI_CONFIG[lane] || LANE_UI_CONFIG.system;
            const prevItem = timelineItems[index - 1];
            const isNewVersionBlock = item.version != null && item.version !== (prevItem?.version ?? null);

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
                    {isNewVersionBlock && (
                      <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>
                        Version v{item.version}
                      </Typography>
                    )}
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
                      {submissionKindLabel && item.kind === 'SUBMIT' && (
                        <Chip label={submissionKindLabel} size="small" color="primary" variant="outlined" />
                      )}
                      {laneLabel && (
                        <Chip
                          label={laneLabel}
                          size="small"
                          color={laneChipConfig.color}
                          variant={laneChipConfig.variant}
                        />
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
  actions: PropTypes.node,
  context: PropTypes.oneOf(['editor', 'admin', 'shared'])
};

VersionHistoryCard.defaultProps = {
  streamState: {},
  activities: [],
  changeHistory: [],
  actions: null,
  context: 'shared'
};

export default VersionHistoryCard;
