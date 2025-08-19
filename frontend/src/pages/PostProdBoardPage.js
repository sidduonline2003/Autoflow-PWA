import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Divider, Grid, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { toast } from 'react-hot-toast';
import { api } from '../utils/api';

async function apiListJobs() {
  return api.get('/api/postprod/jobs');
}
async function apiAssignJob(id, payload) {
  return api.post(`/api/postprod/jobs/${id}/assign`, payload);
}
async function apiAdvanceState(id, action, payload) {
  return api.post(`/api/postprod/jobs/${id}/${action}`, payload || {});
}
async function apiAISuggestions() {
  return api.get('/api/postprod/suggestions');
}

const roles = ['EDITOR', 'COLORIST', 'SOUND', 'VFX'];

export default function PostProdBoardPage() {
  const [jobs, setJobs] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [assign, setAssign] = useState({ userId: '', role: '', dueDate: '' });

  useEffect(() => {
    apiListJobs().then(setJobs).catch(() => {});
  }, []);

  async function refreshSuggestions() {
    try {
      const data = await apiAISuggestions();
      setSuggestions(data || []);
      toast.success('Suggestions updated');
    } catch {
      toast.error('Failed to get suggestions');
    }
  }

  async function handleAssign(job) {
    try {
      const res = await apiAssignJob(job.id, assign);
      setJobs(prev => prev.map(j => j.id === res.id ? res : j));
      toast.success('Assigned');
      setAssign({ userId: '', role: '', dueDate: '' });
    } catch {
      toast.error('Failed to assign');
    }
  }

  async function doAction(job, action) {
    try {
      const res = await apiAdvanceState(job.id, action);
      setJobs(prev => prev.map(j => j.id === res.id ? res : j));
    } catch {
      toast.error('Action failed');
    }
  }

  return (
    <Box p={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">Post-Production Board</Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Get AI suggestions">
            <IconButton onClick={refreshSuggestions}><AutoFixHighIcon /></IconButton>
          </Tooltip>
        </Stack>
      </Stack>
      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Stack spacing={1}>
                {jobs.map(job => (
                  <Box key={job.id} sx={{ p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle2">{job.title || job.id}</Typography>
                        <Chip size="small" label={job.state} color={job.state === 'DONE' ? 'success' : job.state === 'BLOCKED' ? 'error' : 'warning'} />
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" onClick={() => doAction(job, 'start')} disabled={job.state !== 'QUEUED'}>Start</Button>
                        <Button size="small" onClick={() => doAction(job, 'submit') } disabled={job.state !== 'IN_PROGRESS'}>Submit</Button>
                        <Button size="small" onClick={() => doAction(job, 'approve')} disabled={job.state !== 'SUBMITTED'}>Approve</Button>
                        <Button size="small" color="warning" onClick={() => doAction(job, 'request_changes')} disabled={job.state !== 'SUBMITTED'}>Request Changes</Button>
                      </Stack>
                    </Stack>
                    {job.notes && <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>{job.notes}</Typography>}
                  </Box>
                ))}
                {!jobs.length && <Typography variant="body2" color="text.secondary">No jobs</Typography>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1">Assign</Typography>
              <Divider sx={{ my: 1 }} />
              <Stack spacing={1}>
                <TextField label="User ID" value={assign.userId} onChange={(e) => setAssign(a => ({ ...a, userId: e.target.value }))} />
                <TextField select label="Role" value={assign.role} onChange={(e) => setAssign(a => ({ ...a, role: e.target.value }))}>
                  {roles.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </TextField>
                <TextField type="date" label="Due Date" InputLabelProps={{ shrink: true }} value={assign.dueDate} onChange={(e) => setAssign(a => ({ ...a, dueDate: e.target.value }))} />
                <Button variant="contained" disabled={!assign.userId || !assign.role} onClick={() => {
                  const job = jobs.find(j => j.state === 'QUEUED' || j.state === 'IN_PROGRESS');
                  if (job) handleAssign(job);
                  else toast('No job selected/available');
                }}>Assign to first available</Button>
              </Stack>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1">AI Suggestions</Typography>
              <Stack spacing={1} sx={{ mt: 1 }}>
                {suggestions.map((s, i) => (
                  <Box key={i} sx={{ p: 1, border: '1px dashed #ddd', borderRadius: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <Typography variant="body2">{s.reason || 'Suggested job'}</Typography>
                      <Chip size="small" label={Math.round((s.score || 0) * 100)} />
                    </Stack>
                  </Box>
                ))}
                {!suggestions.length && <Typography variant="body2" color="text.secondary">No suggestions</Typography>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
