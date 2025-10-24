import React, { useState } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  CardActions,
  Avatar,
  Typography,
  Box,
  Button,
  IconButton,
  Tooltip,
  Chip,
  Collapse,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  AccessTime as AccessTimeIcon,
  Reply as ReplyIcon,
  CheckCircle as CheckCircleIcon,
  MoreVert as MoreVertIcon,
  Event as EventIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import StatusBadge from './StatusBadge';
import AttachmentPreview from './AttachmentPreview';
import { formatTimestamp } from '../../utils/timeUtils';
import { priorityIndicators, reviewerRoles, pulseAnimation } from '../../constants/reviewConstants';

/**
 * ReviewCard Component
 * Displays a single review with all its details
 */
const ReviewCard = ({ 
  review, 
  onReply, 
  onResolve, 
  onMoreOptions,
  onStatusChange,
  showThread = false,
  replies = []
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expanded, setExpanded] = useState(false);

  const priorityConfig = priorityIndicators[review.priority] || priorityIndicators.medium;
  const roleConfig = reviewerRoles[review.reviewerRole] || reviewerRoles.editor;
  const timeData = formatTimestamp(review.timestamp);

  const handleExpandClick = () => {
    setExpanded(!expanded);
  };

  const handleResolveClick = () => {
    if (review.status !== 'resolved' && onResolve) {
      onResolve(review.reviewId);
    }
  };

  const handleReplyClick = () => {
    if (onReply) {
      onReply(review.reviewId);
    }
  };

  const handleMoreClick = (event) => {
    event.stopPropagation();
    if (onMoreOptions) {
      onMoreOptions(review.reviewId, event);
    }
  };

  return (
    <Card
      sx={{
        position: 'relative',
        transition: 'all 0.3s ease',
        borderRadius: '12px',
        border: '1px solid',
        borderColor: 'divider',
        '&:hover': {
          boxShadow: theme.shadows[6],
          transform: 'translateY(-2px)'
        },
        mb: 3,
        ...pulseAnimation
      }}
      role="article"
      aria-labelledby={`review-${review.reviewId}-title`}
      aria-describedby={`review-${review.reviewId}-content`}
      tabIndex={0}
    >
      {/* Priority Indicator - Left Border */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: priorityConfig.width,
          bgcolor: priorityConfig.color,
          borderRadius: '12px 0 0 12px',
          animation: priorityConfig.pulse ? 'pulse 2s ease-in-out infinite' : 'none'
        }}
      />

      {/* Header Section */}
      <CardHeader
        sx={{ pl: 3 }}
        avatar={
          <Avatar
            sx={{ 
              bgcolor: roleConfig.color,
              width: isMobile ? 32 : 40,
              height: isMobile ? 32 : 40
            }}
          >
            {review.reviewerName?.charAt(0).toUpperCase() || 'U'}
          </Avatar>
        }
        title={
          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
            <Typography 
              id={`review-${review.reviewId}-title`}
              variant={isMobile ? 'subtitle2' : 'subtitle1'} 
              fontWeight={600}
            >
              {review.reviewerName}
            </Typography>
            <Chip
              label={roleConfig.label}
              size="small"
              sx={{
                height: '20px',
                fontSize: '0.7rem',
                bgcolor: roleConfig.color,
                color: 'white'
              }}
            />
            {review.priority === 'urgent' && (
              <Chip
                label="URGENT"
                size="small"
                sx={{
                  height: '20px',
                  fontSize: '0.7rem',
                  bgcolor: priorityConfig.color,
                  color: 'white',
                  animation: 'pulse 2s ease-in-out infinite'
                }}
              />
            )}
          </Box>
        }
        subheader={
          <Box display="flex" alignItems="center" gap={1} mt={0.5}>
            <Typography variant="caption" color="text.secondary">
              {timeData.relative}
            </Typography>
            <Tooltip title={timeData.absolute} arrow>
              <IconButton size="small" sx={{ p: 0 }}>
                <AccessTimeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        }
        action={<StatusBadge status={review.status} />}
      />

      {/* Content Section */}
      <CardContent sx={{ pt: 0, pl: 3 }}>
        <Typography 
          id={`review-${review.reviewId}-content`}
          variant="body2" 
          color="text.primary" 
          sx={{ mb: 2, whiteSpace: 'pre-wrap' }}
        >
          {review.content}
        </Typography>

        {/* Event Context */}
        <Box display="flex" alignItems="center" gap={1} mb={2}>
          <EventIcon fontSize="small" color="action" />
          <Typography variant="caption" color="text.secondary">
            Event: <strong>{review.eventName}</strong>
          </Typography>
        </Box>

        {/* Review Type Chip */}
        <Box mb={2}>
          <Chip
            label={review.reviewType?.replace('_', ' ').toUpperCase() || 'COMMENT'}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem' }}
          />
        </Box>

        {/* Attachments Preview */}
        {review.attachments && review.attachments.length > 0 && (
          <AttachmentPreview attachments={review.attachments} />
        )}

        {/* Assignment Info */}
        {review.assignedTo && (
          <Box mt={2} p={1} bgcolor="action.hover" borderRadius={1}>
            <Typography variant="caption" color="text.secondary">
              Assigned to: <strong>{review.assignedTo}</strong>
            </Typography>
          </Box>
        )}

        {/* Resolution Info */}
        {review.status === 'resolved' && review.resolvedAt && (
          <Box mt={2} p={1} bgcolor="success.light" borderRadius={1}>
            <Typography variant="caption" sx={{ color: 'success.dark' }}>
              Resolved by {review.resolvedBy || 'Unknown'} • {formatTimestamp(review.resolvedAt).relative}
            </Typography>
          </Box>
        )}
      </CardContent>

      {/* Actions Section */}
      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2, pl: 3 }}>
        <Box display="flex" gap={1} flexWrap="wrap">
          <Button
            size="small"
            startIcon={<ReplyIcon />}
            onClick={handleReplyClick}
            aria-label={`Reply to review from ${review.reviewerName}`}
          >
            Reply {review.threadCount > 0 && `(${review.threadCount})`}
          </Button>
          <Button
            size="small"
            startIcon={<CheckCircleIcon />}
            onClick={handleResolveClick}
            disabled={review.status === 'resolved'}
            color="success"
            aria-label="Mark review as resolved"
          >
            {isMobile ? 'Resolve' : 'Mark Resolved'}
          </Button>
        </Box>

        <Box display="flex" alignItems="center" gap={1}>
          {review.threadCount > 0 && (
            <IconButton
              size="small"
              onClick={handleExpandClick}
              aria-expanded={expanded}
              aria-label="Show replies"
              sx={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s'
              }}
            >
              <ExpandMoreIcon />
            </IconButton>
          )}
          <IconButton 
            size="small" 
            onClick={handleMoreClick}
            aria-label="More options"
          >
            <MoreVertIcon />
          </IconButton>
        </Box>
      </CardActions>

      {/* Thread/Replies Section */}
      {review.threadCount > 0 && (
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box sx={{ ml: 7, mr: 2, mb: 2, borderLeft: '2px solid', borderColor: 'divider', pl: 2 }}>
            {replies.map((reply, index) => (
              <Box key={reply.replyId || index} sx={{ mb: 2 }}>
                <Box display="flex" gap={1} alignItems="center">
                  <Avatar 
                    sx={{ width: 32, height: 32, fontSize: '0.875rem' }}
                  >
                    {reply.authorName?.charAt(0).toUpperCase() || 'U'}
                  </Avatar>
                  <Typography variant="body2" fontWeight={500}>
                    {reply.authorName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatTimestamp(reply.timestamp).relative}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ mt: 0.5, ml: 5, whiteSpace: 'pre-wrap' }}>
                  {reply.content}
                </Typography>
                {reply.attachments && reply.attachments.length > 0 && (
                  <Box sx={{ ml: 5, mt: 1 }}>
                    <AttachmentPreview attachments={reply.attachments} />
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Collapse>
      )}
    </Card>
  );
};

export default ReviewCard;
