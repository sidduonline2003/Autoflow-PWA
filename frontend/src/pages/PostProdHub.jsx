import React from 'react';
import { Box, Typography, AppBar, Toolbar, Button, TextField, Grid, Card, CardContent, Chip, CircularProgress, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';

// Post Production Hub: lists events and lets user open per-event post production panel
const normalizeEvents = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return raw.events || [];
};

const PostProdHub = () => {
  const navigate = useNavigate();
  const { user, claims } = useAuth();
  const [search, setSearch] = React.useState('');
  const isAdmin = (claims?.role || '').toLowerCase() === 'admin';

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['allEvents'],
    queryFn: async () => {
      const token = await user?.getIdToken?.();
      const res = await fetch('/api/events/', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Failed to load events');
      return res.json();
    },
    enabled: !!user,
  });

  const events = normalizeEvents(data)
    .filter(ev => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (ev.eventName || ev.name || ev.id || '').toLowerCase().includes(q) || (ev.clientName || '').toLowerCase().includes(q);
    })
    .sort((a,b) => {
      const ad = a.updatedAt || a.createdAt || ''; const bd = b.updatedAt || b.createdAt || '';
      return bd.localeCompare(ad);
    });

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Post Production Hub</Typography>
          <Button color="inherit" onClick={() => navigate('/dashboard')}>Dashboard</Button>
          <Button color="inherit" onClick={() => navigate('/my-work')}>My Work</Button>
          {isAdmin && <Button color="inherit" onClick={() => navigate('/settings')}>Settings</Button>}
          {isAdmin && <Button color="inherit" onClick={() => navigate('/postprod/ingest-tracking')}>Ingest Tracking</Button>}
          <Button color="inherit" onClick={() => refetch()}>Refresh</Button>
          <Button color="inherit" onClick={() => navigate('/clients')}>Clients</Button>
        </Toolbar>
      </AppBar>
      <Box p={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3} alignItems="center">
          <TextField label="Search events" value={search} onChange={e => setSearch(e.target.value)} size="small" sx={{ minWidth: 240 }} />
          <Typography variant="body2" color="text.secondary">{isLoading ? 'Loading…' : `${events.length} events`}</Typography>
        </Stack>
        {isLoading && <Box textAlign="center" mt={6}><CircularProgress /></Box>}
        {isError && <Typography color="error">Failed to load events.</Typography>}
        {!isLoading && events.length === 0 && <Typography>No events found.</Typography>}
        <Grid container spacing={2}>
          {events.slice(0, 200).map(ev => {
            const name = ev.eventName || ev.name || ev.id;
            const status = ev.status || ev.workflowStatus || 'UNKNOWN';
            const intake = ev.intake?.status || ev.intakeStatus;
            return (
              <Grid item xs={12} sm={6} md={4} lg={3} key={ev.id}>
                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <CardContent sx={{ flexGrow: 1 }}>
                    <Typography variant="subtitle1" gutterBottom noWrap title={name}>{name}</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      <Chip size="small" label={status} color={status.includes('COMPLETE')||status==='COMPLETED' ? 'success' : 'default'} />
                      {intake && <Chip size="small" label={intake} color={intake==='DATA_INTAKE_COMPLETE' ? 'primary' : 'default'} />}
                    </Stack>
                  </CardContent>
                  <Stack direction="row" spacing={1} p={1} pt={0} flexWrap="wrap">
                    <Button size="small" variant="contained" onClick={() => navigate(`/events/${ev.id}/postprod`)}>Open</Button>
                    {isAdmin && <Button size="small" onClick={() => navigate(`/client/${ev.clientId||ev.client_id||''}`)}>Client</Button>}
                  </Stack>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      </Box>
    </>
  );
};

export default PostProdHub;
