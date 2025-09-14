import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getJob, assignEditors, submitVersion, reviewVersion, waiveStream } from '../api/postprod.api';
import { Box, Grid, Paper, Typography, Chip, Button, Stack, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import { formatDue } from '../utils/postprod';
import ActivityFeed from '../components/postprod/ActivityFeed';

const StreamCard = ({ streamKey, job, onOpenAssign, onOpenSubmit, onOpenReview, onWaive, user }) => {
  const stream = job?.[streamKey] || {};
  const waived = job?.waived?.[streamKey];
  const state = stream.state || 'UNASSIGNED';
  const isPhoto = streamKey === 'photo';
  const title = isPhoto ? 'Photo Stream' : 'Video Stream';
  const lead = (stream.editors||[]).find(e => e.role === 'LEAD');

  return (
    <Paper variant="outlined" sx={{ p:2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="h6">{title}</Typography>
        {waived && <Chip label="Waived" color="default" size="small" />}
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" mb={1}>
        <Chip label={state} size="small" />
        {stream.draftDue && <Chip size="small" label={"Draft: " + formatDue(stream.draftDue)} />}
        {stream.finalDue && <Chip size="small" label={"Final: " + formatDue(stream.finalDue)} />}
      </Stack>
      <Typography variant="body2" gutterBottom>Lead: {lead?.displayName || lead?.uid || '—'}</Typography>
      {stream.lastSubmission && (
        <Typography variant="caption" color="text.secondary">Last v{stream.lastSubmission.version} @ {formatDue(stream.lastSubmission.at)} – {stream.lastSubmission.whatChanged}</Typography>
      )}
      <Stack direction="row" spacing={1} mt={2}>
        <Button size="small" variant="outlined" onClick={() => onOpenAssign(streamKey)}>Assign / Reassign</Button>
        <Button size="small" variant="contained" disabled={!lead} onClick={() => onOpenSubmit(streamKey)}>Submit</Button>
        <Button size="small" variant="contained" color="secondary" onClick={() => onOpenReview(streamKey)}>Review</Button>
        <Button size="small" variant="text" color="error" onClick={() => onWaive(streamKey)}>Waive</Button>
      </Stack>
    </Paper>
  );
};

const AssignDialog = ({ open, onClose, onSave, stream }) => {
  const [editorsJson, setEditorsJson] = useState('[{"uid":"u1","role":"LEAD","displayName":"Lead"}]');
  const [draftDue, setDraftDue] = useState('');
  const [finalDue, setFinalDue] = useState('');
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Assign Editors</DialogTitle>
      <DialogContent>
        <TextField fullWidth margin="normal" label="Editors JSON" value={editorsJson} onChange={e=>setEditorsJson(e.target.value)} helperText="Provide array with one LEAD" />
        <TextField fullWidth margin="normal" type="datetime-local" label="Draft Due" value={draftDue} onChange={e=>setDraftDue(e.target.value)} />
        <TextField fullWidth margin="normal" type="datetime-local" label="Final Due" value={finalDue} onChange={e=>setFinalDue(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => {
          try {
            const editors = JSON.parse(editorsJson);
            onSave({ editors, draft_due: new Date(draftDue).toISOString(), final_due: new Date(finalDue).toISOString() });
          } catch(e){ alert('Invalid JSON'); }
        }} variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
};

const SubmitDialog = ({ open, onClose, onSubmit }) => {
  const [kind, setKind] = useState('draft');
  const [whatChanged, setWhatChanged] = useState('Initial submission');
  const [deliverablesJson, setDeliverablesJson] = useState('{"previewSetUrl":"https://example.com"}');
  const [version, setVersion] = useState(1);
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Submit Version</DialogTitle>
      <DialogContent>
        <TextField fullWidth margin="normal" select SelectProps={{native:true}} label="Kind" value={kind} onChange={e=>setKind(e.target.value)}>
          <option value="draft">Draft</option>
          <option value="final">Final</option>
        </TextField>
        <TextField fullWidth margin="normal" label="Version" type="number" value={version} onChange={e=>setVersion(parseInt(e.target.value,10))} />
        <TextField fullWidth margin="normal" label="What Changed" value={whatChanged} onChange={e=>setWhatChanged(e.target.value)} />
        <TextField fullWidth margin="normal" label="Deliverables JSON" value={deliverablesJson} onChange={e=>setDeliverablesJson(e.target.value)} multiline minRows={3} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => { try { onSubmit({ kind, what_changed: whatChanged, version, deliverables: JSON.parse(deliverablesJson) }); } catch { alert('Invalid JSON'); } }}>Submit</Button>
      </DialogActions>
    </Dialog>
  );
};

const ReviewDialog = ({ open, onClose, onReview }) => {
  const [decision, setDecision] = useState('approve');
  const [changeList, setChangeList] = useState('1. Improve color\n2. Fix lighting');
  const [nextDue, setNextDue] = useState('');
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Review Submission</DialogTitle>
      <DialogContent>
        <TextField fullWidth margin="normal" select SelectProps={{native:true}} label="Decision" value={decision} onChange={e=>setDecision(e.target.value)}>
          <option value="approve">Approve</option>
          <option value="changes">Request Changes</option>
        </TextField>
        {decision === 'changes' && (
          <>
            <TextField fullWidth margin="normal" label="Change List (numbered)" value={changeList} onChange={e=>setChangeList(e.target.value)} multiline minRows={3} />
            <TextField fullWidth margin="normal" type="datetime-local" label="Next Due" value={nextDue} onChange={e=>setNextDue(e.target.value)} />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => onReview({ decision, change_list: decision==='changes'? changeList.split(/\n+/).filter(Boolean): undefined, next_due: nextDue? new Date(nextDue).toISOString(): undefined })}>Submit</Button>
      </DialogActions>
    </Dialog>
  );
};

const PostProdPanel = () => {
  const { eventId } = useParams();
  const qc = useQueryClient();
  const { data: job, isLoading } = useQuery(['postprodJob', eventId], () => getJob(eventId), { enabled: !!eventId });

  const [assignStream, setAssignStream] = useState(null);
  const [submitStream, setSubmitStream] = useState(null);
  const [reviewStream, setReviewStream] = useState(null);

  const assignMut = useMutation(({ stream, payload }) => assignEditors(eventId, stream, payload), { onSuccess: () => qc.invalidateQueries(['postprodJob', eventId]) });
  const submitMut = useMutation(({ stream, payload }) => submitVersion(eventId, stream, payload), { onSuccess: () => qc.invalidateQueries(['postprodJob', eventId]) });
  const reviewMut = useMutation(({ stream, payload }) => reviewVersion(eventId, stream, payload), { onSuccess: () => qc.invalidateQueries(['postprodJob', eventId]) });
  const waiveMut = useMutation((stream) => waiveStream(eventId, stream), { onSuccess: () => qc.invalidateQueries(['postprodJob', eventId]) });

  if (isLoading) return <Typography>Loading...</Typography>;
  if (!job) return <Typography>No job</Typography>;

  return (
    <Box p={2}>
      <Typography variant="h5" gutterBottom>Post Production – Event {eventId}</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <StreamCard streamKey="photo" job={job} onOpenAssign={setAssignStream} onOpenSubmit={setSubmitStream} onOpenReview={setReviewStream} onWaive={(s)=>waiveMut.mutate(s)} />
        </Grid>
        <Grid item xs={12} md={6}>
          <StreamCard streamKey="video" job={job} onOpenAssign={setAssignStream} onOpenSubmit={setSubmitStream} onOpenReview={setReviewStream} onWaive={(s)=>waiveMut.mutate(s)} />
        </Grid>
        <Grid item xs={12}>
          <ActivityFeed eventId={eventId} canNote />
        </Grid>
      </Grid>

      <AssignDialog open={!!assignStream} stream={assignStream} onClose={()=>setAssignStream(null)} onSave={(payload)=>{assignMut.mutate({stream: assignStream, payload}); setAssignStream(null);}} />
      <SubmitDialog open={!!submitStream} onClose={()=>setSubmitStream(null)} onSubmit={(payload)=>{submitMut.mutate({stream: submitStream, payload}); setSubmitStream(null);}} />
      <ReviewDialog open={!!reviewStream} onClose={()=>setReviewStream(null)} onReview={(payload)=>{reviewMut.mutate({stream: reviewStream, payload}); setReviewStream(null);}} />
    </Box>
  );
};

export default PostProdPanel;
