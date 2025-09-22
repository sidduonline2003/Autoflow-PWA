import React from 'react';
import { Box, Typography, Paper, Stack, Chip, Button, Divider } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import ManifestForm from '../components/postprod/ManifestForm.jsx';
import { startStream } from '../api/postprod.api';
import { toast } from 'react-hot-toast';

// Helpers
function friendlyStage(state) {
  const s = (state || '').toUpperCase();
  if (s === 'UNASSIGNED') return 'UNASSIGNED';
  if (s === 'ASSIGNED') return 'ASSIGNED';
  if (s.includes('IN_PROGRESS')) return 'IN_PROGRESS';
  if (s.includes('SUBMIT')) return 'SUBMITTED';
  if (s.includes('REVIEW')) return 'REVIEW';
  if (s.includes('CHANGE')) return 'CHANGES';
  if (s.includes('DONE') || s.includes('APPROVED')) return 'DONE';
  return 'UNASSIGNED';
}
function pickDue(item, stage) {
  const draft = item?.draftDueAt || item?.draftDue;
  const final = item?.finalDueAt || item?.finalDue;
  let date = null;
  let label = '';
  if (stage === 'REVIEW' || stage === 'SUBMITTED' || stage === 'DONE') {
    date = final || draft || null;
    label = date ? 'Final Due' : '';
  } else {
    date = draft || final || null;
    label = date ? 'Draft Due' : '';
  }
  if (!date) return null;
  const overdue = new Date(date).getTime() < Date.now();
  return { date, label, overdue };
}
function formatDue(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch { return iso || ''; }
}

// Mock loader (temporary)
function useMyAssignments(initial) {
  const [items, setItems] = React.useState(initial || null);
  React.useEffect(() => {
    if (initial) return;
    try {
      const raw = localStorage.getItem('myPostprodAssignments');
      if (raw) {
        setItems(JSON.parse(raw));
        return;
      }
    } catch {}
    // Fallback demo data
    setItems([]);
  }, [initial]);
  return items || [];
}

const AssignmentRow = ({ item, onStart, onSubmit }) => {
  const stage = friendlyStage(item.state);
  const due = pickDue(item, stage);
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap title={item.eventName || item.eventId}>
            {item.eventName || `Event ${item.eventId}`}
          </Typography>
          <Chip size="small" label={item.stream === 'photos' ? 'Photos' : 'Video'} />
          <Chip size="small" label={stage} />
          {due && (
            <Chip size="small" label={`${due.label}: ${formatDue(due.date)}`} color={due.overdue ? 'error' : 'default'} variant={due.overdue ? 'filled' : 'outlined'} />
          )}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">
          {item.version != null && <Chip size="small" label={`v${item.version}`} />}
          {item.lastSubmissionWhatChanged && (
            <Typography variant="caption" color="text.secondary" noWrap title={item.lastSubmissionWhatChanged}>
              • {item.lastSubmissionWhatChanged}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={1}>
          {item.isLead && stage === 'ASSIGNED' && (
            <Button size="small" variant="contained" onClick={() => onStart(item)}>Start</Button>
          )}
          {item.isLead && (stage === 'IN_PROGRESS' || stage === 'CHANGES') && (
            <Button size="small" variant="contained" onClick={() => onSubmit(item)}>Submit Draft</Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  );
};

export default function MyAssignments({ initial }) {
  const { user } = useAuth();
  const all = useMyAssignments(initial).map((it) => ({
    ...it,
    isLead: Array.isArray(it.editors) ? !!it.editors.find(e => e.uid === user?.uid && e.role === 'LEAD') : !!it.isLead,
  }));
  const photos = all.filter(i => i.stream === 'photos');
  const video = all.filter(i => i.stream === 'video');

  const [manifestOpen, setManifestOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(null);

  const openManifest = (item) => { setSelected(item); setManifestOpen(true); };
  const closeManifest = () => { setManifestOpen(false); setSelected(null); };

  const handleStart = async (item) => {
    if (!window.confirm(`Start ${item.stream === 'photos' ? 'Photos' : 'Video'} for ${item.eventName || item.eventId}?`)) return;
    try {
      await startStream(item.eventId, item.stream);
      toast.success('Started');
    } catch (e) { toast.error('Failed to start'); }
  };

  return (
    <Box p={2}>
      <Typography variant="h5" gutterBottom>My Post-Production</Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Photos</Typography>
        <Stack spacing={1}>
          {photos.length === 0 && <Typography variant="body2" color="text.secondary">No photo assignments.</Typography>}
          {photos.map(item => (
            <AssignmentRow key={`${item.eventId}-photos`} item={item} onStart={handleStart} onSubmit={openManifest} />
          ))}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Video</Typography>
        <Stack spacing={1}>
          {video.length === 0 && <Typography variant="body2" color="text.secondary">No video assignments.</Typography>}
          {video.map(item => (
            <AssignmentRow key={`${item.eventId}-video`} item={item} onStart={handleStart} onSubmit={openManifest} />
          ))}
        </Stack>
      </Paper>

      {manifestOpen && selected && (
        <ManifestForm
          eventId={selected.eventId}
          stream={selected.stream}
          onClose={closeManifest}
          onSubmitted={closeManifest}
        />
      )}
    </Box>
  );
}
