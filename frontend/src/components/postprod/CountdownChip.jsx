import React from 'react';
import { Chip } from '@mui/material';
import { now, parseISO, humanizeDuration } from '../../utils/datetime';

// Props: { dueAt: string }
export default function CountdownChip({ dueAt }) {
  const [label, setLabel] = React.useState('');
  React.useEffect(() => {
    const tick = () => {
      if (!dueAt) { setLabel(''); return; }
      const due = parseISO(dueAt);
      if (!due) { setLabel(''); return; }
      const ms = due.getTime() - now().getTime();
      const txt = ms >= 0 ? `Due in ${humanizeDuration(ms)}` : `Overdue by ${humanizeDuration(ms)}`;
      setLabel(txt);
    };
    tick();
    const id = setInterval(tick, 60_000); // update every minute
    return () => clearInterval(id);
  }, [dueAt]);

  if (!label) return null;
  const overdue = parseISO(dueAt)?.getTime() < now().getTime();
  return <Chip size="small" color={overdue ? 'error' : 'default'} label={label} variant={overdue ? 'filled' : 'outlined'} />;
}
