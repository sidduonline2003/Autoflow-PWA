import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Button,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
  CircularProgress,
  Tooltip,
  Stack,
  Alert,
  Divider
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../api';

const overallStatusConfig = {
  'Data Gathering': { color: 'default', icon: <PendingActionsIcon fontSize="small" /> },
  'Awaiting Approvals': { color: 'warning', icon: <PendingActionsIcon fontSize="small" /> },
  'Ready for Post-Production': { color: 'success', icon: <AssignmentTurnedInIcon fontSize="small" /> }
};

const EventIngestTrackingPage = () => {
  const { claims } = useAuth();
  const navigate = useNavigate();
  const normalizedRole = (claims?.role || '').toString().trim().toLowerCase();
  const isAdmin = normalizedRole === 'admin';

  const query = useQuery({
    queryKey: ['admin-ingest-tracking'],
    queryFn: async () => {
      const { data } = await api.get('/data-submissions/admin/ingest-tracking');
      return data;
    },
    enabled: isAdmin,
    staleTime: 30_000
  });

  const events = query.data?.events || [];
  const readyCount = events.filter(evt => evt.actionEnabled).length;
  const awaitingCount = events.filter(evt => !evt.actionEnabled).length;

  const renderPendingTeammates = (teammates) => {
    if (!teammates || teammates.length === 0) {
      return <Typography variant="body2" color="text.secondary">—</Typography>;
    }
    const label = teammates.length === 1 ? teammates[0] : `${teammates.length} teammates`;
    return (
      <Tooltip title={teammates.join(', ')} arrow placement="top">
        <Chip label={label} size="small" variant="outlined" />
      </Tooltip>
    );
  };

  const renderStatusChip = (overallStatus) => {
    const cfg = overallStatusConfig[overallStatus] || overallStatusConfig['Data Gathering'];
    return (
      <Chip
        size="small"
        color={cfg.color}
        icon={cfg.icon}
        label={overallStatus}
        sx={{ fontWeight: 500 }}
      />
    );
  };

  if (!isAdmin) {
    return (
      <Container maxWidth="lg" sx={{ mt: 6 }}>
        <Alert severity="error">You need administrator permissions to view intake tracking.</Alert>
      </Container>
    );
  }

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" sx={{ mb: 3 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Event Ingest &amp; Approval Tracking</Typography>
          <Button color="inherit" onClick={() => navigate('/postprod')}>Post-Production Hub</Button>
          <Button color="inherit" onClick={() => navigate('/dashboard')}>Dashboard</Button>
          <Button color="inherit" onClick={() => query.refetch()} startIcon={<RefreshIcon />} disabled={query.isLoading}>
            Refresh
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl">
        <Paper sx={{ p: 3, mb: 3 }} elevation={3}>
          <Typography variant="subtitle1" gutterBottom>Overview</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Chip
              color="success"
              icon={<AssignmentTurnedInIcon />}
              label={`${readyCount} ready for post-production`}
            />
            <Chip
              color="warning"
              icon={<PendingActionsIcon />}
              label={`${awaitingCount} awaiting approvals`}
            />
            <Chip
              color="default"
              icon={<PlayCircleOutlineIcon />}
              label={`${events.length} total active events`}
            />
          </Stack>
        </Paper>

        <Paper elevation={1}>
          <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">Active Events</Typography>
            {query.isFetching && <CircularProgress size={24} />}
          </Box>
          <Divider />
          {query.isLoading ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <CircularProgress />
              <Typography variant="body2" sx={{ mt: 2 }}>Loading intake status…</Typography>
            </Box>
          ) : query.isError ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Alert severity="error">Failed to load intake tracking. Please try again.</Alert>
            </Box>
          ) : events.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center' }}>
              <Typography variant="body1">No active events in data collection right now.</Typography>
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Event</TableCell>
                  <TableCell>Client</TableCell>
                  <TableCell>Submission Status</TableCell>
                  <TableCell>Pending Teammates</TableCell>
                  <TableCell>Overall Status</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.eventId} hover>
                    <TableCell>
                      <Typography variant="subtitle2">{event.eventName}</Typography>
                      <Typography variant="caption" color="text.secondary">ID: {event.eventId}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{event.clientName}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={event.submissionStatus} size="small" color={event.actionEnabled ? 'success' : 'default'} />
                    </TableCell>
                    <TableCell>{renderPendingTeammates(event.pendingTeammates)}</TableCell>
                    <TableCell>{renderStatusChip(event.overallStatus)}</TableCell>
                    <TableCell align="right">
                      <Button
                        variant="contained"
                        size="small"
                        color="primary"
                        disabled={!event.actionEnabled}
                        onClick={() => navigate(`/events/${event.eventId}/postprod`)}
                      >
                        Create Post-Production Job
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Container>
    </Box>
  );
};

export default EventIngestTrackingPage;
