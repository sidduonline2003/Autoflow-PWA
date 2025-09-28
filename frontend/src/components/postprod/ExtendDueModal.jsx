import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Stack } from '@mui/material';
import toast from 'react-hot-toast';
import { extendDue } from '../../api/postprod.api';

/**
 * ExtendDueModal
 * Props:
 *  - eventId: string
 *  - stream: 'photos' | 'video'
 *  - onClose: () => void
 *  - onExtended: () => void
 */
export default function ExtendDueModal({ eventId, stream, open = false, onClose, onExtended }) {
  const [draftDue, setDraftDue] = React.useState(''); // yyyy-MM-ddTHH:mm
  const [finalDue, setFinalDue] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) {
      setDraftDue('');
      setFinalDue('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!draftDue && !finalDue) {
      setError('Provide at least one new due date.');
      return;
    }
    setSubmitting(true);
    try {
      const body = {};
      if (draftDue) body.draftDueAt = new Date(draftDue).toISOString();
      if (finalDue) body.finalDueAt = new Date(finalDue).toISOString();
      await extendDue(eventId, stream, body);
      toast.success('Due dates updated');
      onExtended && onExtended();
      onClose && onClose();
    } catch (err) {
      toast.error(err?.message || 'Failed to update due dates');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Extend Due Dates</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={2}>
            <TextField
              label="New Draft Due (optional)"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={draftDue}
              onChange={(e) => setDraftDue(e.target.value)}
            />
            <TextField
              label="New Final Due (optional)"
              type="datetime-local"
              InputLabelProps={{ shrink: true }}
              value={finalDue}
              onChange={(e) => setFinalDue(e.target.value)}
              helperText={error}
              error={!!error}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting}>Apply</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
