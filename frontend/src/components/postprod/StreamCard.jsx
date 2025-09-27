import React, { useState } from 'react';
import { Card, CardContent, CardHeader, Typography, Button, Box, Chip } from '@mui/material';
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
    return (
      <>
        {state.includes('REVIEW') && (
          <>
            <Button size="small" variant="contained" onClick={() => setReviewModalOpen(true)}>
              Approve Final
            </Button>
            <Button size="small" variant="outlined" onClick={() => setReviewModalOpen(true)}>
              Request Changes
            </Button>
          </>
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
      <CardHeader title={stream === 'photo' ? 'Photos' : 'Video'} action={<Chip label={state} color="primary" />} />
      <CardContent>
        {data?.risk?.atRisk && (
          <Chip label="At Risk" color="error" size="small" sx={{ mb: 1 }} title={data.risk.reason} />
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
