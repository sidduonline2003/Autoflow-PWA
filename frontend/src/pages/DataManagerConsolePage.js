import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Stack, TextField, Typography, Divider } from '@mui/material';
import { toast } from 'react-hot-toast';
import { api } from '../utils/api';

async function apiListBatches(filter) {
  const qs = new URLSearchParams({ status: filter }).toString();
  return api.get(`/api/intake/batches?${qs}`);
}
async function apiListMedia() {
  return api.get('/api/storage/media');
}
async function apiConfirmBatch(id, payload) {
  return api.post(`/api/intake/batches/${id}/confirm`, payload);
}
async function apiRejectBatch(id, payload) {
  return api.post(`/api/intake/batches/${id}/reject`, payload);
}

// Leave Requests APIs
async function apiListLeave(status) {
  const qs = status && status !== 'ALL' ? `?status=${encodeURIComponent(status.toLowerCase())}` : '';
  return api.get(`/api/leave-requests${qs}`);
}
async function apiApproveLeave(id) {
  return api.put(`/api/leave-requests/${id}/approve`, {});
}
async function apiRejectLeave(id) {
  return api.put(`/api/leave-requests/${id}/reject`, {});
}

// Data Submissions APIs
async function apiListPendingDataSubmissions() {
  return api.get('/api/data-submissions/pending');
}
async function apiListAllDataSubmissions(status) {
  const qs = status && status !== 'ALL' ? `?status=${encodeURIComponent(status.toLowerCase())}` : '';
  return api.get(`/api/data-submissions/all${qs}`);
}
async function apiProcessDataSubmission(id, payload) {
  return api.put(`/api/data-submissions/${id}/process`, payload);
}
async function apiEditProcessedDataSubmission(id, payload) {
  return api.put(`/api/data-submissions/${id}/edit`, payload);
}

const batchFilters = ['PENDING', 'REJECTED', 'ALL'];
const leaveFilters = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];
const dataSubmissionFilters = ['PENDING', 'PROCESSED', 'ALL'];

export default function DataManagerConsolePage() {
  // Intake state
  const [filter, setFilter] = useState('PENDING');
  const [batches, setBatches] = useState([]);
  const [media, setMedia] = useState([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [confirmPayload, setConfirmPayload] = useState({ storageMediaId: '', location: '' });

  // Leave state
  const [leaveFilter, setLeaveFilter] = useState('PENDING');
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(false);

  // Data Submissions state
  const [dataSubmissions, setDataSubmissions] = useState([]);
  const [dataSubmissionsLoading, setDataSubmissionsLoading] = useState(false);
  const [dataSubmissionFilter, setDataSubmissionFilter] = useState('PENDING');
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [processingPayload, setProcessingPayload] = useState({
    storageLocation: '',
    diskName: '',
    archiveLocation: '',
    processingNotes: ''
  });
  const [isEditMode, setIsEditMode] = useState(false);

  const toArray = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.items)) return data.items;
    if (Array.isArray(data?.batches)) return data.batches;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.results)) return data.results;
    return [];
  };

  useEffect(() => {
    // Intake fetch
    apiListBatches(filter === 'ALL' ? '' : filter)
      .then((data) => setBatches(toArray(data)))
      .catch(() => setBatches([]));
    apiListMedia()
      .then((data) => setMedia(toArray(data)))
      .catch(() => setMedia([]));
  }, [filter]);

  useEffect(() => {
    // Leave fetch
    setLeaveLoading(true);
    apiListLeave(leaveFilter)
      .then((data) => setLeaveRequests(data || []))
      .catch(() => setLeaveRequests([]))
      .finally(() => setLeaveLoading(false));
  }, [leaveFilter]);

  useEffect(() => {
    // Data submissions fetch
    setDataSubmissionsLoading(true);
    apiListAllDataSubmissions(dataSubmissionFilter === 'ALL' ? '' : dataSubmissionFilter)
      .then((data) => setDataSubmissions(data || []))
      .catch(() => setDataSubmissions([]))
      .finally(() => setDataSubmissionsLoading(false));
  }, [dataSubmissionFilter]);

  const mediaOptions = useMemo(() => media.map(m => ({ id: m.id, label: `${m.type} - ${m.label || m.serial || m.id}` })), [media]);

  function openConfirm(b) {
    setSelected(b);
    setConfirmPayload({ storageMediaId: '', location: '' });
    setOpen(true);
  }

  async function handleConfirm() {
    try {
      const res = await apiConfirmBatch(selected.id, confirmPayload);
      toast.success('Batch confirmed');
      setBatches(prev => prev.map(b => b.id === res.id ? res : b));
    } catch (e) {
      toast.error('Failed to confirm');
    } finally {
      setOpen(false);
    }
  }

  async function handleReject(b) {
    try {
      const res = await apiRejectBatch(b.id, { reason: 'Invalid checksum' });
      toast.success('Batch rejected');
      setBatches(prev => prev.map(x => x.id === res.id ? res : x));
    } catch (e) {
      toast.error('Failed to reject');
    }
  }

  async function handleLeaveAction(req, action) {
    try {
      const res = action === 'approve' ? await apiApproveLeave(req.id) : await apiRejectLeave(req.id);
      toast.success(`Leave ${action}d`);
      setLeaveRequests(prev => prev.map(r => r.id === res.id ? res : r));
    } catch (e) {
      toast.error(`Failed to ${action} leave`);
    }
  }

  function openProcessDialog(submission) {
    setSelectedSubmission(submission);
    setProcessingPayload({
      storageLocation: '',
      diskName: '',
      archiveLocation: '',
      processingNotes: ''
    });
    setIsEditMode(false);
    setProcessDialogOpen(true);
  }

  function openEditDialog(submission) {
    setSelectedSubmission(submission);
    // Pre-fill form with existing processing info
    setProcessingPayload({
      storageLocation: submission.processingInfo?.storageLocation || '',
      diskName: submission.processingInfo?.diskName || '',
      archiveLocation: submission.processingInfo?.archiveLocation || '',
      processingNotes: submission.processingInfo?.processingNotes || ''
    });
    setIsEditMode(true);
    setProcessDialogOpen(true);
  }

  async function handleProcessSubmission() {
    try {
      if (isEditMode) {
        await apiEditProcessedDataSubmission(selectedSubmission.id, processingPayload);
        toast.success('Data submission updated successfully');
      } else {
        await apiProcessDataSubmission(selectedSubmission.id, processingPayload);
        toast.success('Data submission processed successfully');
      }
      
      setDataSubmissions(prev => prev.map(s => 
        s.id === selectedSubmission.id 
          ? { 
              ...s, 
              status: 'processed', 
              processedAt: new Date().toISOString(), 
              processingInfo: processingPayload,
              ...(isEditMode && { updatedAt: new Date().toISOString() })
            }
          : s
      ));
      setProcessDialogOpen(false);
      // Refresh the data to get updated list
      setDataSubmissionsLoading(true);
      apiListAllDataSubmissions(dataSubmissionFilter === 'ALL' ? '' : dataSubmissionFilter)
        .then((data) => setDataSubmissions(data || []))
        .catch(() => setDataSubmissions([]))
        .finally(() => setDataSubmissionsLoading(false));
    } catch (e) {
      toast.error(isEditMode ? 'Failed to update data submission' : 'Failed to process data submission');
    }
  }

  const leaveStatusColor = (s) => s === 'approved' ? 'success' : s === 'rejected' ? 'error' : 'warning';

  return (
    <Box p={2}>
      <Typography variant="h5" gutterBottom>Data Manager Portal</Typography>

      {/* Data Submissions Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Data Submissions</Typography>
            <Stack direction="row" spacing={1}>
              {dataSubmissionFilters.map(f => (
                <Chip 
                  key={f} 
                  label={f} 
                  color={dataSubmissionFilter === f ? 'primary' : 'default'} 
                  onClick={() => setDataSubmissionFilter(f)} 
                />
              ))}
            </Stack>
          </Stack>
          <Stack spacing={1}>
            {dataSubmissions.map((submission) => (
              <Box key={submission.id} sx={{ p: 2, border: '1px solid #eee', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2">{submission.eventName}</Typography>
                      <Chip size="small" label={submission.clientName} variant="outlined" />
                      <Chip 
                        size="small" 
                        label={submission.status === 'pending' ? 'Pending' : 'Processed'} 
                        color={submission.status === 'pending' ? 'warning' : 'success'}
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Submitted by: {submission.submittedByName} • {new Date(submission.submittedAt).toLocaleDateString()}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Storage: {submission.storageType} • Device: {submission.deviceInfo}
                    </Typography>
                    {submission.dataSize && (
                      <Typography variant="body2" color="text.secondary">
                        Data Size: {submission.dataSize} • Files: {submission.fileCount || 'N/A'}
                      </Typography>
                    )}
                    {submission.notes && (
                      <Typography variant="body2" color="text.secondary">
                        Notes: {submission.notes}
                      </Typography>
                    )}
                    {/* Show processing info if processed */}
                    {submission.status === 'processed' && submission.processingInfo && (
                      <Box sx={{ mt: 1, p: 1, bgcolor: 'success.light', borderRadius: 1 }}>
                        <Typography variant="body2" color="success.dark">
                          <strong>Processed by:</strong> {submission.processedByName} • {new Date(submission.processedAt).toLocaleDateString()}
                        </Typography>
                        <Typography variant="body2" color="success.dark">
                          <strong>Storage Location:</strong> {submission.processingInfo.storageLocation}
                        </Typography>
                        <Typography variant="body2" color="success.dark">
                          <strong>Disk Name:</strong> {submission.processingInfo.diskName}
                        </Typography>
                        <Typography variant="body2" color="success.dark">
                          <strong>Archive Location:</strong> {submission.processingInfo.archiveLocation}
                        </Typography>
                        {submission.processingInfo.processingNotes && (
                          <Typography variant="body2" color="success.dark">
                            <strong>Processing Notes:</strong> {submission.processingInfo.processingNotes}
                          </Typography>
                        )}
                        <Button 
                          size="small" 
                          variant="outlined" 
                          color="primary" 
                          sx={{ mt: 1 }}
                          onClick={() => openEditDialog(submission)}
                        >
                          Edit Details
                        </Button>
                      </Box>
                    )}
                  </Stack>
                  {submission.status === 'pending' && (
                    <Button 
                      size="small" 
                      variant="contained" 
                      onClick={() => openProcessDialog(submission)}
                    >
                      Process
                    </Button>
                  )}
                </Stack>
              </Box>
            ))}
            {!dataSubmissions.length && (
              <Typography variant="body2" color="text.secondary">
                {dataSubmissionsLoading ? 'Loading...' : `No ${dataSubmissionFilter.toLowerCase()} data submissions`}
              </Typography>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Leave Requests Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Leave Requests</Typography>
            <Stack direction="row" spacing={1}>
              {leaveFilters.map(f => (
                <Chip key={f} label={f} color={leaveFilter === f ? 'primary' : 'default'} onClick={() => setLeaveFilter(f)} />
              ))}
            </Stack>
          </Stack>
          <Stack spacing={1}>
            {leaveRequests.map((req) => (
              <Box key={req.id} sx={{ p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Stack spacing={0.5}>
                    <Typography variant="subtitle2">{req.userName || req.userId}</Typography>
                    <Typography variant="body2" color="text.secondary">{req.startDate} → {req.endDate}</Typography>
                    {req.reason && <Typography variant="body2" color="text.secondary">Reason: {req.reason}</Typography>}
                  </Stack>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Chip size="small" label={req.status} color={leaveStatusColor(req.status)} />
                    <Divider flexItem orientation="vertical" />
                    <Button size="small" variant="contained" onClick={() => handleLeaveAction(req, 'approve')} disabled={req.status !== 'pending'}>Approve</Button>
                    <Button size="small" variant="outlined" color="error" onClick={() => handleLeaveAction(req, 'reject')} disabled={req.status !== 'pending'}>Reject</Button>
                  </Stack>
                </Stack>
              </Box>
            ))}
            {!leaveRequests.length && (
              <Typography variant="body2" color="text.secondary">{leaveLoading ? 'Loading...' : 'No leave requests'}</Typography>
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Data Intake Section */}
      <Typography variant="h6" gutterBottom>Data Intake</Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        {batchFilters.map(f => (
          <Chip key={f} label={f} color={filter === f ? 'primary' : 'default'} onClick={() => setFilter(f)} />
        ))}
      </Stack>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Stack spacing={1}>
                {batches.map(b => (
                  <Box key={b.id} sx={{ p: 1, border: '1px solid #eee', borderRadius: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip size="small" label={b.captureUnit} />
                        <Chip size="small" label={b.mediaType} />
                        <Chip size="small" label={b.status} color={b.status === 'CONFIRMED' ? 'success' : b.status === 'REJECTED' ? 'error' : 'warning'} />
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <Button size="small" variant="contained" onClick={() => openConfirm(b)} disabled={b.status !== 'PENDING'}>Confirm</Button>
                        <Button size="small" variant="outlined" color="error" onClick={() => handleReject(b)} disabled={b.status !== 'PENDING'}>Reject</Button>
                      </Stack>
                    </Stack>
                    {b.notes && <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>{b.notes}</Typography>}
                  </Box>
                ))}
                {!batches.length && <Typography variant="body2" color="text.secondary">No batches</Typography>}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={processDialogOpen} onClose={() => setProcessDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{isEditMode ? 'Edit Data Submission' : 'Process Data Submission'}</DialogTitle>
        <DialogContent>
          {selectedSubmission && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="subtitle2">
                Event: {selectedSubmission.eventName} ({selectedSubmission.clientName})
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Submitted by: {selectedSubmission.submittedByName} • Storage: {selectedSubmission.storageType}
              </Typography>
              <Divider />
              <TextField 
                label="Storage Location" 
                placeholder="e.g., Vault A - Shelf 3" 
                value={processingPayload.storageLocation} 
                onChange={(e) => setProcessingPayload(p => ({ ...p, storageLocation: e.target.value }))}
                required
                fullWidth
              />
              <TextField 
                label="Disk Name" 
                placeholder="e.g., DISK_001_CLIENT_EVENT" 
                value={processingPayload.diskName} 
                onChange={(e) => setProcessingPayload(p => ({ ...p, diskName: e.target.value }))}
                required
                fullWidth
              />
              <TextField 
                label="Archive Location" 
                placeholder="e.g., Cloud Storage Path or Physical Archive" 
                value={processingPayload.archiveLocation} 
                onChange={(e) => setProcessingPayload(p => ({ ...p, archiveLocation: e.target.value }))}
                required
                fullWidth
              />
              <TextField 
                label="Processing Notes" 
                placeholder="Additional notes about processing..." 
                value={processingPayload.processingNotes} 
                onChange={(e) => setProcessingPayload(p => ({ ...p, processingNotes: e.target.value }))}
                multiline
                rows={3}
                fullWidth
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProcessDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleProcessSubmission} 
            variant="contained" 
            disabled={!processingPayload.storageLocation || !processingPayload.diskName || !processingPayload.archiveLocation}
          >
            {isEditMode ? 'Save Changes' : 'Process Submission'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Confirm Batch</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField select label="Storage Medium" value={confirmPayload.storageMediaId} onChange={(e) => setConfirmPayload(p => ({ ...p, storageMediaId: e.target.value }))} required>
              {mediaOptions.map(m => (
                <MenuItem key={m.id} value={m.id}>{m.label}</MenuItem>
              ))}
            </TextField>
            <TextField label="Location" placeholder="Vault A / Shelf 3" value={confirmPayload.location} onChange={(e) => setConfirmPayload(p => ({ ...p, location: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirm} variant="contained" disabled={!confirmPayload.storageMediaId}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
