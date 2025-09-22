import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  IconButton,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Grid,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { submitManifest } from '../../api/postprod.api';
import toast from 'react-hot-toast';

const ManifestForm = ({ open, onClose, eventId, stream, onSubmitted }) => {
  const [whatChanged, setWhatChanged] = useState('');
  const [deliverables, setDeliverables] = useState([{ name: '', type: 'photos', url: '', provider: 'gdrive', access: 'org', counts: {} }]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddDeliverable = () => {
    setDeliverables([...deliverables, { name: '', type: 'photos', url: '', provider: 'gdrive', access: 'org', counts: {} }]);
  };

  const handleRemoveDeliverable = (index) => {
    const newDeliverables = deliverables.filter((_, i) => i !== index);
    setDeliverables(newDeliverables);
  };

  const handleDeliverableChange = (index, field, value) => {
    const newDeliverables = [...deliverables];
    if (field === 'images' || field === 'minutes') {
      newDeliverables[index].counts[field] = value;
    } else {
      newDeliverables[index][field] = value;
    }
    setDeliverables(newDeliverables);
  };

  const handleSubmit = async () => {
    if (!whatChanged.trim()) {
      toast.error('"What changed" description is required.');
      return;
    }
    if (deliverables.length === 0 || deliverables.some(d => !d.url.startsWith('http'))) {
      toast.error('At least one deliverable with a valid URL is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitManifest(eventId, stream, { whatChanged, deliverables });
      toast.success('Manifest submitted successfully!');
      onSubmitted();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to submit manifest.');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Submit Draft: {stream}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          margin="dense"
          label="What Changed?"
          type="text"
          fullWidth
          multiline
          rows={3}
          variant="outlined"
          value={whatChanged}
          onChange={(e) => setWhatChanged(e.target.value)}
          sx={{ my: 2 }}
        />
        {deliverables.map((d, index) => (
          <Box key={index} sx={{ p: 2, border: '1px solid #ddd', borderRadius: 1, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1">Deliverable #{index + 1}</Typography>
              <IconButton onClick={() => handleRemoveDeliverable(index)} size="small"><DeleteIcon /></IconButton>
            </Box>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Name" value={d.name} onChange={(e) => handleDeliverableChange(index, 'name', e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="URL" value={d.url} onChange={(e) => handleDeliverableChange(index, 'url', e.target.value)} placeholder="https://..." />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <FormControl fullWidth>
                  <InputLabel>Type</InputLabel>
                  <Select value={d.type} label="Type" onChange={(e) => handleDeliverableChange(index, 'type', e.target.value)}>
                    <MenuItem value="photos">Photos</MenuItem>
                    <MenuItem value="video">Video</MenuItem>
                    <MenuItem value="album">Album</MenuItem>
                    <MenuItem value="reel">Reel</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <FormControl fullWidth>
                  <InputLabel>Provider</InputLabel>
                  <Select value={d.provider} label="Provider" onChange={(e) => handleDeliverableChange(index, 'provider', e.target.value)}>
                    <MenuItem value="gdrive">Google Drive</MenuItem>
                    <MenuItem value="dropbox">Dropbox</MenuItem>
                    <MenuItem value="frameio">Frame.io</MenuItem>
                    <MenuItem value="vimeo">Vimeo</MenuItem>
                    <MenuItem value="pictime">Pictime</MenuItem>
                    <MenuItem value="smugmug">SmugMug</MenuItem>
                    <MenuItem value="other">Other</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <FormControl fullWidth>
                  <InputLabel>Access</InputLabel>
                  <Select value={d.access} label="Access" onChange={(e) => handleDeliverableChange(index, 'access', e.target.value)}>
                    <MenuItem value="public">Public</MenuItem>
                    <MenuItem value="org">Organization</MenuItem>
                    <MenuItem value="restricted">Restricted</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                {d.type === 'photos' ?
                  <TextField type="number" label="Image Count" value={d.counts?.images || ''} onChange={e => handleDeliverableChange(index, 'images', e.target.value)} /> :
                  <TextField type="number" label="Minutes" value={d.counts?.minutes || ''} onChange={e => handleDeliverableChange(index, 'minutes', e.target.value)} />
                }
              </Grid>
            </Grid>
          </Box>
        ))}
        <Button startIcon={<AddIcon />} onClick={handleAddDeliverable}>
          Add Deliverable
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ManifestForm;
