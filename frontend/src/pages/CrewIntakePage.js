import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { toast } from 'react-hot-toast';
import { queueOrSend, flushQueue, registerAutoFlush } from '../utils/offlineQueue';
import { api } from '../utils/api';

const captureUnits = ['A-CAM', 'B-CAM', 'DRONE', 'AUDIO', 'BTS'];
const mediaTypes = ['SD_CARD', 'CFEXPRESS', 'HDD', 'SSD', 'TAPE'];

// Placeholder API calls - to be wired to backend
async function apiCreateBatch(payload) {
  const res = await api.post('/api/intake/batches', payload);
  return res;
}

async function apiListBatches() {
  const res = await api.get('/api/intake/batches?status=PENDING');
  return res;
}

export default function CrewIntakePage() {
  const [form, setForm] = useState({ captureUnit: '', mediaType: '', notes: '' });
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState([]);

  useEffect(() => {
    apiListBatches().then(setBatches).catch(() => {});
    const unregister = registerAutoFlush(async (item) => {
      await apiCreateBatch(item.payload);
    });
    return unregister;
  }, []);

  const disabled = useMemo(() => !form.captureUnit || !form.mediaType, [form]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const payload = { ...form, createdAt: new Date().toISOString() };
    const result = await queueOrSend(() => apiCreateBatch(payload), { type: 'CREATE_BATCH', payload });
    setLoading(false);
    if (result?.queued) {
      toast('Offline: saved locally and will sync later', { icon: '⏳' });
    } else {
      toast.success('Batch submitted');
      setBatches((prev) => [result, ...prev]);
    }
    setForm({ captureUnit: '', mediaType: '', notes: '' });
  }

  async function handleManualSync() {
    const res = await flushQueue(async (item) => {
      if (item.type === 'CREATE_BATCH') {
        await apiCreateBatch(item.payload);
      }
    });
    toast.success(`Synced ${res.flushed}/${res.total}`);
  }

  return (
    <Box p={2}>
      <Typography variant="h5" gutterBottom>Crew Intake</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <form onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  <TextField select label="Capture Unit" value={form.captureUnit} onChange={(e) => setForm(f => ({ ...f, captureUnit: e.target.value }))} required>
                    {captureUnits.map((cu) => (
                      <MenuItem key={cu} value={cu}>{cu}</MenuItem>
                    ))}
                  </TextField>
                  <TextField select label="Media Type" value={form.mediaType} onChange={(e) => setForm(f => ({ ...f, mediaType: e.target.value }))} required>
                    {mediaTypes.map((mt) => (
                      <MenuItem key={mt} value={mt}>{mt}</MenuItem>
                    ))}
                  </TextField>
                  <TextField label="Notes" multiline minRows={3} value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
                  <Stack direction="row" spacing={2}>
                    <Button type="submit" variant="contained" disabled={loading || disabled}>Submit</Button>
                    <Button variant="outlined" onClick={handleManualSync}>Sync</Button>
                  </Stack>
                </Stack>
              </form>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" gutterBottom>Recent Batches</Typography>
              <Stack spacing={1}>
                {batches.map((b, idx) => (
                  <Box key={b.id || idx} sx={{ p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip size="small" label={b.captureUnit} />
                        <Chip size="small" label={b.mediaType} color="info" />
                      </Stack>
                      <Chip size="small" label={b.status || 'PENDING'} color={b.status === 'CONFIRMED' ? 'success' : b.status === 'REJECTED' ? 'error' : 'warning'} />
                    </Stack>
                    {b.notes && <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>{b.notes}</Typography>}
                  </Box>
                ))}
                {!batches.length && <Typography variant="body2" color="text.secondary">No batches yet</Typography>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
