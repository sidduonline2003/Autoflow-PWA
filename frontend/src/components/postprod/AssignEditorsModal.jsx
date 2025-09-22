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
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import toast from 'react-hot-toast';
import { assignEditors, reassignEditors } from '../../api/postprod.api';
import api from '../../api';

/**
 * AssignEditorsModal
 * Props:
 *  - eventId: string
 *  - stream: 'photos' | 'video'
 *  - onClose: () => void
 *  - onAssigned: () => void
 *  - mode?: 'assign' | 'reassign' (default 'assign')
 *  - initialEditors?: Array<{ uid: string, displayName?: string, role: 'LEAD'|'ASSIST' }>
 */
export default function AssignEditorsModal({ eventId, stream, onClose, onAssigned, mode = 'assign', initialEditors }) {
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

  const [errors, setErrors] = React.useState({ leadUid: '', draftDue: '', finalDue: '' });

  // Prefill from initialEditors when provided
  React.useEffect(() => {
    if (Array.isArray(initialEditors) && initialEditors.length) {
      const leadE = initialEditors.find((e) => e.role === 'LEAD');
      const assistsE = initialEditors.filter((e) => e.role === 'ASSIST');
      if (leadE) setLead({ uid: leadE.uid || '', displayName: leadE.displayName || '' });
      setAssists(assistsE.map((e) => ({ uid: e.uid || '', displayName: e.displayName || '' })));
    }
  }, [initialEditors]);

  const addAssist = () => setAssists((a) => [...a, { uid: '', displayName: '' }]);
  const removeAssist = (idx) => setAssists((a) => a.filter((_, i) => i !== idx));
  const updateAssist = (idx, key, value) => setAssists((a) => a.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));

  const validate = () => {
    const nextErrors = { leadUid: '', draftDue: '', finalDue: '' };
    if (!lead.uid.trim()) nextErrors.leadUid = 'Lead UID is required';
    if (mode === 'assign') {
      if (!draftDue) nextErrors.draftDue = 'Required';
      if (!finalDue) nextErrors.finalDue = 'Required';
    }
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

      if (mode === 'reassign') {
        await reassignEditors(eventId, stream, { editors });
        toast.success('Editors reassigned');
      } else {
        await assignEditors(eventId, stream, {
          editors,
          draftDueAt: new Date(draftDue).toISOString(),
          finalDueAt: new Date(finalDue).toISOString(),
          useAISuggest: showAI,
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
      const res = await api.post('/api/ai/suggest-editors', { eventId, stream }, { baseURL: '' });
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
    <Dialog open onClose={submitting ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{mode === 'reassign' ? 'Reassign Editors' : 'Assign Editors'} – {stream === 'photos' ? 'Photos' : 'Video'}</DialogTitle>
      <DialogContent>
        {/* LEAD */}
        <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Lead (required)</Typography>
        <Grid container spacing={2} alignItems="center" sx={{ mb: 1 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Lead UID"
              fullWidth
              value={lead.uid}
              onChange={(e) => setLead((s) => ({ ...s, uid: e.target.value }))}
              error={!!errors.leadUid}
              helperText={errors.leadUid}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
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
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Assistant UID"
                fullWidth
                value={row.uid}
                onChange={(e) => updateAssist(idx, 'uid', e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Assistant Name"
                fullWidth
                value={row.displayName}
                onChange={(e) => updateAssist(idx, 'displayName', e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
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

        {/* DUE DATES - hidden in reassign mode */}
        {mode !== 'reassign' && (
          <>
            <Divider sx={{ my: 2 }} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}>
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
              <Grid size={{ xs: 12, md: 6 }}>
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
        )}

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
