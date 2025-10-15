import React, { useState } from 'react';
import { Card, CardContent, CardHeader, Typography, Button, Box, Chip, Stack, Alert } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import AssignEditorsModal from './AssignEditorsModal';
import ReviewModal from './ReviewModal';
import ExtendDueModal from './ExtendDueModal';
import ManifestForm from './ManifestForm';
import { startStream, waiveStream } from '../../api/postprod.api';
import toast from 'react-hot-toast';

const StreamCard = ({ eventId, stream, data, refresh }) => {
  const { user, claims } = useAuth();
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [extendDueModalOpen, setExtendDueModalOpen] = useState(false);
  const [manifestModalOpen, setManifestModalOpen] = useState(false);

  const isAdmin = (claims?.role === 'admin') || (claims?.roles || [])?.includes?.('admin');
  const isLead = data?.editors?.find((e) => e.role === 'LEAD' && e.uid === user?.uid);

  const state = data?.state || 'NOT_STARTED';

  const onStart = async () => {
    try {
      await startStream(eventId, stream);
      toast.success('Stream started');
      refresh && refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to start');
    }
  };

  const onWaive = async () => {
    try {
      await waiveStream(eventId, stream);
      toast.success('Stream waived');
      refresh && refresh();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Failed to waive');
    }
  };

  const renderAdminButtons = () => {
    if (!isAdmin) return null;
    
    // Check if there's actually something to review
    // Multiple checks: version > 0, OR has deliverables, OR has lastSubmissionAt
    const hasSubmission = 
      (data?.version && data.version > 0) || 
      (data?.deliverables && Object.keys(data.deliverables).length > 0) ||
      (data?.lastSubmissionAt);
    
    // Debug logging
    console.log('[StreamCard Debug]', {
      stream,
      state,
      version: data?.version,
      hasDeliverables: data?.deliverables ? Object.keys(data.deliverables).length : 0,
      lastSubmissionAt: data?.lastSubmissionAt,
      hasSubmission
    });
    
    return (
      <>
        {state.includes('REVIEW') && hasSubmission && (
          <Button 
            size="small" 
            variant="contained" 
            color="primary"
            onClick={() => setReviewModalOpen(true)}
          >
            Review Submission
          </Button>
        )}
        {state.includes('REVIEW') && !hasSubmission && (
          <Button 
            size="small" 
            variant="outlined" 
            disabled
            color="default"
          >
            Awaiting Submission
          </Button>
        )}
        {!data?.editors?.length && (
          <Button size="small" variant="contained" onClick={() => setAssignModalOpen(true)}>
            Assign Editors
          </Button>
        )}
        {data?.editors?.length && !state.endsWith('DONE') && (
          <>
            <Button size="small" onClick={() => setExtendDueModalOpen(true)}>Extend Due</Button>
            <Button size="small" onClick={() => setAssignModalOpen(true)}>Reassign</Button>
            <Button size="small" color="error" onClick={onWaive}>Waive</Button>
          </>
        )}
      </>
    );
  };

  const renderLeadButtons = () => {
    if (!isLead) return null;
    return (
      <>
        {state.endsWith('ASSIGNED') && (
          <Button size="small" variant="contained" onClick={onStart}>Start</Button>
        )}
        {(state.includes('IN_PROGRESS') || state.includes('CHANGES')) && (
          <Button size="small" variant="contained" onClick={() => setManifestModalOpen(true)}>
            Submit Draft
          </Button>
        )}
      </>
    );
  };

  return (
    <Card variant="outlined">
      <CardHeader 
        title={stream === 'photo' ? 'Photos' : 'Video'} 
        action={
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {data?.version > 0 && (
              <Chip label={`v${data.version}`} size="small" color="default" variant="outlined" />
            )}
            <Chip label={state} color="primary" />
          </Box>
        }
      />
      <CardContent>
        {data?.risk?.atRisk && (
          <Chip label="At Risk" color="error" size="small" sx={{ mb: 1 }} title={data.risk.reason} />
        )}

        {/* Show alert when state is REVIEW but no submission yet */}
        {state.includes('REVIEW') && 
         !(data?.version > 0 || (data?.deliverables && Object.keys(data.deliverables).length > 0) || data?.lastSubmissionAt) && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Waiting for editor to submit their work for review.
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary">
          Due: {data?.draftDue || data?.finalDue || 'N/A'}
        </Typography>

        <Box sx={{ my: 2 }}>
          <Typography variant="subtitle2">Editors:</Typography>
          {data?.editors?.length > 0 ? (
            data.editors.map((editor) => (
              <Typography key={editor.uid} variant="body2">
                {editor.role === 'LEAD' && '★ '}
                {editor.displayName || editor.uid}
              </Typography>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              Not assigned
            </Typography>
          )}
        </Box>

        {/* Display Deliverables if present */}
        {data?.deliverables && Object.keys(data.deliverables).length > 0 && (
          <Box sx={{ my: 2, p: 1.5, bgcolor: 'success.light', borderRadius: 1, borderLeft: '4px solid', borderColor: 'success.main' }}>
            <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              📎 Submitted Deliverables
            </Typography>
            <Stack spacing={0.5}>
              {data.deliverables.previewUrl && (
                <Box>
                  <Typography variant="caption" fontWeight="bold">Preview: </Typography>
                  <Typography variant="caption">
                    <a href={data.deliverables.previewUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                      {data.deliverables.previewUrl.length > 50 ? data.deliverables.previewUrl.substring(0, 50) + '...' : data.deliverables.previewUrl}
                    </a>
                  </Typography>
                </Box>
              )}
              {data.deliverables.finalUrl && (
                <Box>
                  <Typography variant="caption" fontWeight="bold">Final: </Typography>
                  <Typography variant="caption">
                    <a href={data.deliverables.finalUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                      {data.deliverables.finalUrl.length > 50 ? data.deliverables.finalUrl.substring(0, 50) + '...' : data.deliverables.finalUrl}
                    </a>
                  </Typography>
                </Box>
              )}
              {data.deliverables.downloadUrl && (
                <Box>
                  <Typography variant="caption" fontWeight="bold">Download: </Typography>
                  <Typography variant="caption">
                    <a href={data.deliverables.downloadUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                      {data.deliverables.downloadUrl.length > 50 ? data.deliverables.downloadUrl.substring(0, 50) + '...' : data.deliverables.downloadUrl}
                    </a>
                  </Typography>
                </Box>
              )}
              {data.deliverables.additionalUrl && (
                <Box>
                  <Typography variant="caption" fontWeight="bold">Additional: </Typography>
                  <Typography variant="caption">
                    <a href={data.deliverables.additionalUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                      {data.deliverables.additionalUrl.length > 50 ? data.deliverables.additionalUrl.substring(0, 50) + '...' : data.deliverables.additionalUrl}
                    </a>
                  </Typography>
                </Box>
              )}
              {data.deliverables.notes && (
                <Typography variant="caption" sx={{ fontStyle: 'italic', color: 'text.secondary', display: 'block', mt: 0.5 }}>
                  <strong>Notes:</strong> {data.deliverables.notes}
                </Typography>
              )}
            </Stack>
            {data?.lastSubmissionAt && (
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                Submitted: {new Date(data.lastSubmissionAt).toLocaleString()}
              </Typography>
            )}
          </Box>
        )}

        {data?.lastSubmission?.whatChanged && (
          <Typography variant="caption" color="text.secondary" display="block">
            Last: v{data.version} - {data.lastSubmission.whatChanged}
          </Typography>
        )}

        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {renderAdminButtons()}
          {renderLeadButtons()}
        </Box>
      </CardContent>

      {/* Modals */}
      <AssignEditorsModal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        eventId={eventId}
        stream={stream}
        onAssigned={refresh}
        mode={data?.editors?.length ? 'reassign' : 'assign'}
        initialEditors={data?.editors || []}
        initialDraftDue={data?.draftDue}
        initialFinalDue={data?.finalDue}
      />
      <ReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        eventId={eventId}
        stream={stream}
        onDecided={refresh}
      />
      <ExtendDueModal
        open={extendDueModalOpen}
        onClose={() => setExtendDueModalOpen(false)}
        eventId={eventId}
        stream={stream}
        onExtended={refresh}
      />
      <ManifestForm
        open={manifestModalOpen}
        onClose={() => setManifestModalOpen(false)}
        eventId={eventId}
        stream={stream}
        nextVersion={(data?.version || 0) + 1}
        kind="draft"
        onSubmitted={refresh}
      />
    </Card>
  );
};

export default StreamCard;
