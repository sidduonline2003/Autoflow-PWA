import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  IconButton,
  Stack,
  Tooltip,
  FormControlLabel,
  Switch,
  Divider,
  Typography,
  Box,
  Chip,
  Checkbox,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import toast from 'react-hot-toast';
import { assignEditors, reassignEditors } from '../../api/postprod.api';
import api from '../../api.js';

/**
 * AssignEditorsModal
 * Props:
 *  - eventId: string
 *  - stream: 'photos' | 'video'
 *  - onClose: () => void
 *  - onAssigned: () => void
 *  - mode?: 'assign' | 'reassign' (default 'assign')
 *  - initialEditors?: Array<{ uid: string, displayName?: string, role: 'LEAD'|'ASSIST' }>
 *  - initialDraftDue?: string
 *  - initialFinalDue?: string
 */
export default function AssignEditorsModal({ open = true, eventId, stream, onClose, onAssigned, mode = 'assign', initialEditors, initialDraftDue, initialFinalDue }) {
  const [lead, setLead] = React.useState({ uid: '', displayName: '' });
  const [assists, setAssists] = React.useState([]); // [{ uid, displayName }]
  const [draftDue, setDraftDue] = React.useState(''); // yyyy-MM-ddTHH:mm
  const [finalDue, setFinalDue] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const [showAI, setShowAI] = React.useState(false);
  const [aiAvailable, setAiAvailable] = React.useState(true);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiError, setAiError] = React.useState('');
  const [aiSuggestions, setAiSuggestions] = React.useState(null); // { lead, assistants } | { candidates: [] }
  const [availability, setAvailability] = React.useState({ availableEditors: [], unavailableEditors: [], currentEditors: [] });
  const [storageData, setStorageData] = React.useState(null);
  const [loadingStorage, setLoadingStorage] = React.useState(false);
  const [selectedStorageSubmissions, setSelectedStorageSubmissions] = React.useState([]);

  const [errors, setErrors] = React.useState({ leadUid: '', draftDue: '', finalDue: '' });

  // Prefill from initialEditors when provided
  React.useEffect(() => {
    if (Array.isArray(initialEditors) && initialEditors.length) {
      const leadE = initialEditors.find((e) => e.role === 'LEAD');
      const assistsE = initialEditors.filter((e) => e.role === 'ASSIST');
      if (leadE) setLead({ uid: leadE.uid || '', displayName: leadE.displayName || '' });
      setAssists(assistsE.map((e) => ({ uid: e.uid || '', displayName: e.displayName || '' })));
    }
    if (initialDraftDue) setDraftDue(initialDraftDue.replace('Z', ''));
    if (initialFinalDue) setFinalDue(initialFinalDue.replace('Z', ''));
  }, [initialEditors, initialDraftDue, initialFinalDue]);

  // Load availability when modal opens
  React.useEffect(() => {
    (async () => {
      try {
        const res = await api.get(`/events/${eventId}/postprod/available-editors`, { params: { stream } });
        setAvailability(res.data || { availableEditors: [], unavailableEditors: [], currentEditors: [] });
      } catch (e) {
        // ignore silently; modal still usable
      }
    })();
  }, [eventId, stream]);

  // Load storage/intake data when modal opens
  React.useEffect(() => {
    (async () => {
      if (!eventId) return;
      setLoadingStorage(true);
      try {
        const res = await api.get(`/events/${eventId}/postprod/overview`);
        const overview = res.data;
        const intakeSummary = overview?.intakeSummary || overview?.intake_summary;
        setStorageData(intakeSummary);
        
        // Pre-select all submissions by default
        if (intakeSummary?.approvedSubmissions?.length > 0) {
          setSelectedStorageSubmissions(
            intakeSummary.approvedSubmissions.map((_, idx) => idx)
          );
        }
      } catch (e) {
        console.error('Failed to load storage data:', e);
      } finally {
        setLoadingStorage(false);
      }
    })();
  }, [eventId]);

  const addAssist = () => setAssists((a) => [...a, { uid: '', displayName: '' }]);
  const removeAssist = (idx) => setAssists((a) => a.filter((_, i) => i !== idx));
  const updateAssist = (idx, key, value) => setAssists((a) => a.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));

  const toggleStorageSubmission = (idx) => {
    setSelectedStorageSubmissions((prev) => {
      if (prev.includes(idx)) {
        return prev.filter((i) => i !== idx);
      } else {
        return [...prev, idx];
      }
    });
  };

  const selectAllStorage = () => {
    if (storageData?.approvedSubmissions) {
      setSelectedStorageSubmissions(storageData.approvedSubmissions.map((_, idx) => idx));
    }
  };

  const deselectAllStorage = () => {
    setSelectedStorageSubmissions([]);
  };

  const validate = () => {
    const nextErrors = { leadUid: '', draftDue: '', finalDue: '' };
    if (!lead.uid.trim()) nextErrors.leadUid = 'Lead UID is required';
    // Backend requires due dates on both assign and reassign
    if (!draftDue) nextErrors.draftDue = 'Required';
    if (!finalDue) nextErrors.finalDue = 'Required';
    setErrors(nextErrors);
    return !nextErrors.leadUid && !nextErrors.draftDue && !nextErrors.finalDue;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const editors = [];
      editors.push({ role: 'LEAD', uid: lead.uid.trim(), displayName: lead.displayName.trim() });
      assists.forEach((a) => {
        if (a.uid?.trim()) editors.push({ role: 'ASSIST', uid: a.uid.trim(), displayName: (a.displayName || '').trim() });
      });

      // Prepare selected storage submissions
      const assignedStorageData = storageData?.approvedSubmissions
        ? selectedStorageSubmissions.map(idx => storageData.approvedSubmissions[idx]).filter(Boolean)
        : [];

      if (mode === 'reassign') {
        await reassignEditors(eventId, stream, {
          editors,
          draftDueAt: new Date(draftDue).toISOString(),
          finalDueAt: new Date(finalDue).toISOString(),
          assignedStorage: assignedStorageData,
        });
        toast.success('Editors reassigned');
      } else {
        await assignEditors(eventId, stream, {
          editors,
          draftDueAt: new Date(draftDue).toISOString(),
          finalDueAt: new Date(finalDue).toISOString(),
          useAISuggest: showAI,
          assignedStorage: assignedStorageData,
        });
        toast.success('Editors assigned');
      }

      onAssigned && onAssigned();
      onClose && onClose();
    } catch (e) {
      toast.error(e?.message || `Failed to ${mode === 'reassign' ? 'reassign' : 'assign'} editors`);
    } finally {
      setSubmitting(false);
    }
  };

  const fetchSuggestions = async () => {
    setAiLoading(true);
    setAiError('');
    try {
      const res = await api.get(`/events/${eventId}/postprod/suggest-editors`, { params: { stream } });
      const data = res.data;
      // Normalize
      let normalized = null;
      if (data && (data.lead || data.assistants)) {
        normalized = {
          lead: data.lead ? pick(data.lead) : null,
          assistants: Array.isArray(data.assistants) ? data.assistants.map(pick) : [],
        };
      } else if (Array.isArray(data)) {
        const candidates = data.map(pick);
        normalized = {
          lead: candidates[0] || null,
          assistants: candidates.slice(1, 3),
          candidates,
        };
      } else {
        normalized = { candidates: [] };
      }
      setAiSuggestions(normalized);
    } catch (err) {
      if (err?.response?.status === 404) {
        setAiAvailable(false);
        setShowAI(false);
      } else {
        setAiError(err?.message || 'Failed to fetch suggestions');
      }
    } finally {
      setAiLoading(false);
    }
  };

  const onToggleAI = (checked) => {
    setShowAI(checked);
    if (checked) fetchSuggestions();
  };

  const applySuggestedSet = () => {
    if (!aiSuggestions) return;
    if (aiSuggestions.lead) setLead({ uid: aiSuggestions.lead.uid || '', displayName: aiSuggestions.lead.displayName || '' });
    if (Array.isArray(aiSuggestions.assistants)) setAssists(aiSuggestions.assistants.map((a) => ({ uid: a.uid || '', displayName: a.displayName || '' })));
  };

  const applyLead = (candidate) => {
    setLead({ uid: candidate.uid || '', displayName: candidate.displayName || '' });
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{mode === 'reassign' ? 'Reassign Editors' : 'Assign Editors'} – {stream === 'photo' ? 'Photos' : 'Video'}</DialogTitle>
      <DialogContent>
        {/* LEAD */}
        <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Lead (required)</Typography>
        <Grid container spacing={2} alignItems="center" sx={{ mb: 1 }}>
          <Grid item xs={12} md={4}>
            <TextField
              label="Lead UID"
              fullWidth
              value={lead.uid}
              onChange={(e) => setLead((s) => ({ ...s, uid: e.target.value }))}
              error={!!errors.leadUid}
              helperText={errors.leadUid}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              label="Lead Name"
              fullWidth
              value={lead.displayName}
              onChange={(e) => setLead((s) => ({ ...s, displayName: e.target.value }))}
            />
          </Grid>
        </Grid>

        {/* ASSISTANTS */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2, mb: 1 }}>
          <Typography variant="subtitle2">Assistants</Typography>
          <Button size="small" startIcon={<AddCircleOutlineIcon />} onClick={addAssist}>Add</Button>
        </Stack>
        {assists.map((row, idx) => (
          <Grid container spacing={2} alignItems="center" key={idx} sx={{ mb: 1 }}>
            <Grid item xs={12} md={4}>
              <TextField
                label="Assistant UID"
                fullWidth
                value={row.uid}
                onChange={(e) => updateAssist(idx, 'uid', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Assistant Name"
                fullWidth
                value={row.displayName}
                onChange={(e) => updateAssist(idx, 'displayName', e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={2}>
              <Tooltip title="Remove">
                <span>
                  <IconButton aria-label="remove" onClick={() => removeAssist(idx)}>
                    <DeleteOutlineIcon />
                  </IconButton>
                </span>
              </Tooltip>
            </Grid>
          </Grid>
        ))}

        {/* DUE DATES */}
        <>
          <Divider sx={{ my: 2 }} />
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Draft Due"
                type="datetime-local"
                InputLabelProps={{ shrink: true }}
                fullWidth
                value={draftDue}
                onChange={(e) => setDraftDue(e.target.value)}
                error={!!errors.draftDue}
                helperText={errors.draftDue}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Final Due"
                type="datetime-local"
                InputLabelProps={{ shrink: true }}
                fullWidth
                value={finalDue}
                onChange={(e) => setFinalDue(e.target.value)}
                error={!!errors.finalDue}
                helperText={errors.finalDue}
              />
            </Grid>
          </Grid>
        </>

        {/* AI SUGGEST - hide toggle when unavailable; still useful in assign mode */}
        {mode !== 'reassign' && aiAvailable && (
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={<Switch checked={showAI} onChange={(e) => onToggleAI(e.target.checked)} />}
              label="Use AI Suggest"
            />
            {showAI && (
              <Box sx={{ p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                {aiLoading && <Typography>Fetching suggestions…</Typography>}
                {!aiLoading && aiError && <Typography color="error">{aiError}</Typography>}
                {!aiLoading && !aiError && aiSuggestions && (
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="subtitle2">Suggested Set</Typography>
                      <Button size="small" variant="outlined" onClick={applySuggestedSet}>Use Suggested Set</Button>
                    </Stack>
                    {Array.isArray(aiSuggestions.candidates) && aiSuggestions.candidates.length > 0 && (
                      <Box>
                        <Typography variant="caption" color="text.secondary">Top Matches</Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                          {aiSuggestions.candidates.slice(0, 5).map((c, i) => (
                            <Stack key={i} direction="row" alignItems="center" spacing={1}>
                              <Chip size="small" label={`#${i + 1}`} />
                              <Typography sx={{ flex: 1 }}>{c.displayName || c.uid} {c.uid && c.displayName ? `(${c.uid})` : ''}</Typography>
                              <Button size="small" onClick={() => applyLead(c)}>Use as Lead</Button>
                            </Stack>
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </Stack>
                )}
              </Box>
            )}
          </Box>
        )}

        {/* Storage Data Section */}
        {storageData && storageData.approvedSubmissions && storageData.approvedSubmissions.length > 0 && (
          <Box sx={{ mt: 2, mb: 2, p: 2, bgcolor: 'background.default', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                💾 Data Storage Information ({storageData.approvedCount} approved submission{storageData.approvedCount !== 1 ? 's' : ''})
              </Typography>
              <Stack direction="row" spacing={1}>
                <Button size="small" onClick={selectAllStorage} disabled={selectedStorageSubmissions.length === storageData.approvedSubmissions.length}>
                  Select All
                </Button>
                <Button size="small" onClick={deselectAllStorage} disabled={selectedStorageSubmissions.length === 0}>
                  Deselect All
                </Button>
              </Stack>
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
              Select which data submissions to assign to the editors. They will only see the selected submissions.
            </Typography>
            <Stack spacing={1.5}>
              {storageData.approvedSubmissions.map((submission, idx) => (
                <Box key={idx} sx={{ 
                  p: 1.5, 
                  bgcolor: selectedStorageSubmissions.includes(idx) ? 'action.selected' : 'action.hover', 
                  borderRadius: 1, 
                  borderLeft: '3px solid', 
                  borderColor: selectedStorageSubmissions.includes(idx) ? 'primary.main' : 'divider',
                  transition: 'all 0.2s',
                }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={selectedStorageSubmissions.includes(idx)}
                        onChange={() => toggleStorageSubmission(idx)}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="body2" fontWeight="bold">
                        {submission.submitterName || `Submission ${idx + 1}`}
                      </Typography>
                    }
                  />
                  <Grid container spacing={1} sx={{ mt: 0.5, ml: 4 }}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" display="block">
                        <strong>Devices:</strong> {submission.deviceCount || 'N/A'}
                      </Typography>
                      <Typography variant="caption" display="block">
                        <strong>Data Size:</strong> {submission.estimatedDataSize || 'Unknown'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      {submission.storageAssignment && submission.storageAssignment.location && (
                        <Typography variant="caption" display="block">
                          <strong>Location:</strong> Room {submission.storageAssignment.location.room}
                          {submission.storageAssignment.location.cabinet && `, Cabinet ${submission.storageAssignment.location.cabinet}`}
                          {submission.storageAssignment.location.shelf && `, Shelf ${submission.storageAssignment.location.shelf}`}
                          {submission.storageAssignment.location.bin && `, Bin ${submission.storageAssignment.location.bin}`}
                        </Typography>
                      )}
                      {submission.handoffReference && (
                        <Typography variant="caption" display="block">
                          <strong>Reference:</strong> {submission.handoffReference}
                        </Typography>
                      )}
                    </Grid>
                  </Grid>
                  {submission.notes && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5, ml: 4, fontStyle: 'italic' }}>
                      Note: {submission.notes}
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
            <Box sx={{ mt: 1.5, p: 1, bgcolor: 'info.light', borderRadius: 1 }}>
              <Typography variant="caption" fontWeight="bold">
                📋 Selected: {selectedStorageSubmissions.length} of {storageData.approvedSubmissions.length} submissions • {storageData.totalDevices || 0} total devices available
              </Typography>
            </Box>
          </Box>
        )}
        
        {loadingStorage && (
          <Box sx={{ mt: 2, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Loading storage information...</Typography>
          </Box>
        )}

        {/* Availability Snapshot */}
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Availability</Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {availability.availableEditors.slice(0, 6).map((m) => (
              <Chip key={m.uid} label={m.name || m.uid} onClick={() => setLead({ uid: m.uid, displayName: m.name || '' })} />
            ))}
          </Stack>
          {availability.unavailableEditors.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Unavailable: {availability.unavailableEditors.slice(0, 5).map(x => x.name || x.uid).join(', ')}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" onClick={onSubmit} disabled={submitting}>{mode === 'reassign' ? 'Reassign' : 'Assign'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function pick(x) {
  if (!x) return { uid: '', displayName: '' };
  return { uid: x.uid || x.id || '', displayName: x.displayName || x.name || '' };
}
