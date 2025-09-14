import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getJob } from '../api/postprod.api';
import { Box, Typography, Paper, Stack, Chip } from '@mui/material';

// Placeholder: In real scenario we'd fetch assignments list. For now we read eventIds from localStorage mock.
const mockEventIds = () => {
  try { return JSON.parse(localStorage.getItem('myWorkEventIds')||'[]'); } catch { return []; }
};

const MyWork = () => {
  const events = mockEventIds();
  return (
    <Box p={2}>
      <Typography variant="h5" gutterBottom>My Post-Production Work</Typography>
      {events.length === 0 && <Typography variant="body2">No assignments</Typography>}
      <Stack spacing={2}>
        {events.map(eid => <EventAssignment key={eid} eventId={eid} />)}
      </Stack>
    </Box>
  );
};

const EventAssignment = ({ eventId }) => {
  const { data: job } = useQuery(['postprodJob', eventId], () => getJob(eventId), { enabled: !!eventId });
  if (!job) return null;
  const streams = ['photo','video'];
  return (
    <Paper variant="outlined" sx={{ p:2 }}>
      <Typography variant="subtitle1">Event {eventId}</Typography>
      <Stack direction="row" spacing={2} mt={1}>
        {streams.map(s => {
          const st = job[s];
          return <Chip key={s} label={`${s}: ${st?.state||'—'} v${st?.version||0}`} />;
        })}
      </Stack>
    </Paper>
  );
};

export default MyWork;
