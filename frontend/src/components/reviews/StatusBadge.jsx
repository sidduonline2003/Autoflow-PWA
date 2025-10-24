import React from 'react';
import { Chip, Box } from '@mui/material';
import { reviewStatusColors } from '../../constants/reviewConstants';

/**
 * StatusBadge Component
 * Displays a colored badge indicating the review status
 */
const StatusBadge = ({ status }) => {
  const statusConfig = reviewStatusColors[status] || reviewStatusColors.pending;

  return (
    <Chip
      label={statusConfig.label}
      size="small"
      sx={{
        backgroundColor: statusConfig.bg,
        color: statusConfig.icon,
        border: `1px solid ${statusConfig.border}`,
        fontWeight: 600,
        fontSize: '0.75rem',
        height: '24px'
      }}
    />
  );
};

export default StatusBadge;
