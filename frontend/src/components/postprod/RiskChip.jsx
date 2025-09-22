import React from 'react';
import { Chip, Tooltip } from '@mui/material';

// Props: { atRisk?: boolean, reason?: string }
export default function RiskChip({ atRisk, reason }) {
  if (!atRisk) return null;
  const chip = <Chip size="small" label="At Risk" color="warning" variant="filled" />;
  return reason ? <Tooltip title={reason}>{chip}</Tooltip> : chip;
}
