import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getActivity, addNote } from '../../api/postprod.api';
import { Box, Typography, Stack, Paper, Divider, TextField, Button, Chip } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

/**
 * ActivityFeed displays chronological post-production activity and lets an admin add NOTE entries.
 * Expected backend endpoint shape (planned):
 *   GET /postprod/events/:eventId/activity?limit=50&cursor=... -> { items: ActivityItem[], nextCursor?: string }
 *   POST /postprod/events/:eventId/activity/note { summary, stream? } -> { ok: true }
 *
 * Until backend is finalized this component is resilient: if activity fetch fails it shows a fallback.
 */

/** @typedef {Object} ActivityItem
 *  @property {string} id
 *  @property {string} at ISO timestamp
 *  @property {string} kind ASSIGN|SUBMIT|REVIEW|WAIVE|DUE_EXTEND|NOTE
 *  @property {string=} stream photo|video
 *  @property {number=} version
 *  @property {string=} actorUid
 *  @property {string=} actorName
 *  @property {string=} summary
 */

const ActivityRow = ({ item }) => {
  const ts = item.at ? new Date(item.at) : null;
  const when = ts ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(ts) : '';
  
  // Check if this is a submission with deliverables
  const hasDeliverables = item.kind === 'SUBMIT' && item.deliverables;
  
  return (
    <Box sx={{ py: 1 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="caption" sx={{ minWidth: 140, color: 'text.secondary' }}>{when}</Typography>
        {item.stream && <Chip label={item.stream} size="small" />}
        <Chip label={item.kind} color={item.kind === 'NOTE' ? 'default' : item.kind === 'REVIEW' ? 'secondary' : 'primary'} size="small" />
        {item.version != null && <Chip size="small" label={'v'+item.version} />}
        <Typography variant="body2" noWrap title={item.summary || ''} sx={{ flexGrow: 1 }}>{item.summary || '—'}</Typography>
      </Stack>
      
      {/* Display deliverable URLs if present */}
      {hasDeliverables && (
        <Box sx={{ mt: 1, ml: 18, p: 1.5, bgcolor: 'action.hover', borderRadius: 1, borderLeft: '3px solid', borderColor: 'primary.main' }}>
          <Typography variant="caption" fontWeight="bold" display="block" sx={{ mb: 0.5 }}>
            📎 Submitted Deliverables:
          </Typography>
          <Stack spacing={0.5}>
            {item.deliverables.previewUrl && (
              <Typography variant="caption">
                <strong>Preview:</strong>{' '}
                <a href={item.deliverables.previewUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                  {item.deliverables.previewUrl}
                </a>
              </Typography>
            )}
            {item.deliverables.finalUrl && (
              <Typography variant="caption">
                <strong>Final:</strong>{' '}
                <a href={item.deliverables.finalUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                  {item.deliverables.finalUrl}
                </a>
              </Typography>
            )}
            {item.deliverables.downloadUrl && (
              <Typography variant="caption">
                <strong>Download:</strong>{' '}
                <a href={item.deliverables.downloadUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                  {item.deliverables.downloadUrl}
                </a>
              </Typography>
            )}
            {item.deliverables.additionalUrl && (
              <Typography variant="caption">
                <strong>Additional:</strong>{' '}
                <a href={item.deliverables.additionalUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                  {item.deliverables.additionalUrl}
                </a>
              </Typography>
            )}
            {item.deliverables.notes && (
              <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                <strong>Notes:</strong> {item.deliverables.notes}
              </Typography>
            )}
          </Stack>
        </Box>
      )}
    </Box>
  );
};

const ActivityFeed = ({ eventId, canNote = true }) => {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['postprodActivity', eventId],
    queryFn: () => getActivity(eventId),
    enabled: !!eventId,
  });
  const items = data?.items || [];

  const [note, setNote] = useState('');
  const [stream, setStream] = useState('');

  const noteMut = useMutation({
    mutationFn: (payload) => addNote(eventId, payload),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['postprodActivity', eventId] });
    },
  });

  return (
    <Paper variant="outlined" sx={{ p:2, mt:3 }}>
      <Typography variant="h6" gutterBottom>Activity</Typography>
      <Divider sx={{ mb:1 }} />
      {isLoading && <Typography variant="body2">Loading activity...</Typography>}
      {isError && <Typography variant="body2" color="error">Failed to load activity.</Typography>}
      {!isLoading && items.length === 0 && <Typography variant="body2">No activity yet.</Typography>}
      <Stack divider={<Divider flexItem />} spacing={0.5} sx={{ maxHeight: 300, overflow: 'auto' }}>
        {items.map(it => <ActivityRow key={it.id} item={it} />)}
      </Stack>
      {canNote && (
        <Box mt={2} component="form" onSubmit={(e)=>{ e.preventDefault(); if(!note.trim()) return; noteMut.mutate({ summary: note.trim(), stream: stream||undefined }); }}>
          <Stack direction={{ xs:'column', sm:'row' }} spacing={1} alignItems="stretch">
            <TextField size="small" label="Note (will be logged)" value={note} onChange={e=>setNote(e.target.value)} fullWidth />
            <TextField size="small" select SelectProps={{native:true}} label="Stream" value={stream} onChange={e=>setStream(e.target.value)} sx={{ width: 140 }}>
              <option value="">All</option>
              <option value="photo">Photo</option>
              <option value="video">Video</option>
            </TextField>
            <Button type="submit" variant="contained" disabled={!note.trim() || noteMut.isLoading} startIcon={<SendIcon />}>Add</Button>
          </Stack>
        </Box>
      )}
    </Paper>
  );
};

export default ActivityFeed;
