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
  Alert,
  Box,
} from '@mui/material';
import toast from 'react-hot-toast';
import { decideReview } from '../../api/postprod.api';

/**
 * ReviewModal
 * Props:
 *  - eventId: string
 *  - stream: 'photo' | 'video'
 *  - onClose: () => void
 *  - onDecided: () => void
 */
export default function ReviewModal({ eventId, stream, open = false, onClose, onDecided }) {
  const [mode, setMode] = React.useState('APPROVE'); // 'APPROVE' | 'REQUEST'
  const [changesText, setChangesText] = React.useState('');
  const [nextDueLocal, setNextDueLocal] = React.useState(''); // yyyy-MM-ddTHH:mm
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) {
      setMode('APPROVE');
      setChangesText('');
      setNextDueLocal('');
      setSubmitting(false);
      setError('');
    }
  }, [open]);

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
      toast.success(mode === 'APPROVE' ? 'Final deliverables approved!' : 'Change requests sent to editor');
      onDecided && onDecided();
      onClose && onClose();
    } catch (err) {
      console.error('Review submission error:', err);
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to save decision';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Review Submission – {stream === 'photo' ? 'Photos' : 'Video'}
        <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
          Choose whether to approve the final deliverables or request changes
        </Typography>
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}
          <FormControl component="fieldset" fullWidth>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Decision</Typography>
            <RadioGroup
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              aria-label="review-decision"
            >
              <FormControlLabel 
                value="APPROVE" 
                control={<Radio />} 
                label={
                  <Box>
                    <Typography variant="body2" fontWeight="bold">Approve Final</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Mark this stream as complete and ready for client delivery
                    </Typography>
                  </Box>
                } 
              />
              <FormControlLabel 
                value="REQUEST" 
                control={<Radio />} 
                label={
                  <Box>
                    <Typography variant="body2" fontWeight="bold">Request Changes</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Send the work back to the editor with specific revision requests
                    </Typography>
                  </Box>
                } 
              />
            </RadioGroup>
          </FormControl>

          {mode === 'REQUEST' && (
            <Stack spacing={2} sx={{ mt: 2, p: 2, bgcolor: 'warning.lighter', borderRadius: 1 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                  Change Requests *
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                  Enter one change per line. Be specific and clear. Empty lines will be ignored.
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  placeholder={'Examples:\n- Brighten clip 02 by 0:15\n- Replace background music in reel\n- Remove duplicate image #45 from gallery\n- Adjust color grading on shots 10-15'}
                  value={changesText}
                  onChange={(e) => {
                    setChangesText(e.target.value);
                    if (error) setError(''); // Clear error when user starts typing
                  }}
                  error={!!error}
                  helperText={error || 'Required: At least one change request'}
                  sx={{ bgcolor: 'background.paper' }}
                />
              </Box>
              <TextField
                label="Next Draft Due (optional)"
                type="datetime-local"
                InputLabelProps={{ shrink: true }}
                value={nextDueLocal}
                onChange={(e) => setNextDueLocal(e.target.value)}
                helperText="Leave blank to use default timeline (24 hours from now)"
                sx={{ bgcolor: 'background.paper' }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="contained" 
            disabled={submitting}
            color={mode === 'APPROVE' ? 'success' : 'warning'}
          >
            {submitting ? 'Submitting...' : (mode === 'APPROVE' ? '✓ Approve & Complete' : '↩ Request Changes')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
