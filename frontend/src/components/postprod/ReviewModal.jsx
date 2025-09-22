import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  FormControlLabel,
  RadioGroup,
  Radio,
  Stack,
  Typography,
} from '@mui/material';
import toast from 'react-hot-toast';
import { decideReview } from '../../api/postprod.api';

/**
 * ReviewModal
 * Props:
 *  - eventId: string
 *  - stream: 'photos' | 'video'
 *  - onClose: () => void
 *  - onDecided: () => void
 */
export default function ReviewModal({ eventId, stream, onClose, onDecided }) {
  const [mode, setMode] = React.useState('APPROVE'); // 'APPROVE' | 'REQUEST'
  const [changesText, setChangesText] = React.useState('');
  const [nextDueLocal, setNextDueLocal] = React.useState(''); // yyyy-MM-ddTHH:mm
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      setSubmitting(true);
      if (mode === 'APPROVE') {
        await decideReview(eventId, stream, { decision: 'APPROVE_FINAL' });
      } else {
        const changeList = changesText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        if (changeList.length === 0) {
          setError('Please provide at least one change request.');
          setSubmitting(false);
          return;
        }
        const body = { decision: 'REQUEST_CHANGES', changeList };
        if (nextDueLocal) {
          const iso = new Date(nextDueLocal).toISOString();
          body.nextDueAt = iso;
        }
        await decideReview(eventId, stream, body);
      }
      toast.success('Decision saved');
      onDecided && onDecided();
      onClose && onClose();
    } catch (err) {
      toast.error(err?.message || 'Failed to save decision');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Review – {stream === 'photos' ? 'Photos' : 'Video'}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <FormControl component="fieldset" fullWidth>
            <RadioGroup
              row
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              aria-label="review-decision"
            >
              <FormControlLabel value="APPROVE" control={<Radio />} label="Approve Final" />
              <FormControlLabel value="REQUEST" control={<Radio />} label="Request Changes" />
            </RadioGroup>
          </FormControl>

          {mode === 'REQUEST' && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <div>
                <Typography variant="caption" color="text.secondary">
                  Enter one change per line. Empty lines will be ignored.
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  placeholder={'E.g.\n- Brighten clip 02 by 0:15\n- Replace song in reel\n- Remove duplicate image from gallery'}
                  value={changesText}
                  onChange={(e) => setChangesText(e.target.value)}
                  error={!!error}
                  helperText={error || ' '}
                />
              </div>
              <TextField
                label="Next Draft Due (optional)"
                type="datetime-local"
                InputLabelProps={{ shrink: true }}
                value={nextDueLocal}
                onChange={(e) => setNextDueLocal(e.target.value)}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {mode === 'APPROVE' ? 'Approve Final' : 'Submit Changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
