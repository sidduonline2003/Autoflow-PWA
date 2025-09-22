import React, { useState } from 'react';
import { Card, CardContent, CardHeader, Typography, Button, Box, Chip } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext'; // Corrected path

// Modal stubs - will be created in later steps
const AssignEditorsModal = ({ open, onClose, eventId, stream, onAssigned }) => open ? <div style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: 20, border: '1px solid black'}}>AssignEditorsModal <Button onClick={onClose}>Close</Button></div> : null;
const ReviewModal = ({ open, onClose, eventId, stream, onDecided }) => open ? <div style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: 20, border: '1px solid black'}}>ReviewModal <Button onClick={onClose}>Close</Button></div> : null;
const ExtendDueModal = ({ open, onClose, eventId, stream, onExtended }) => open ? <div style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: 20, border: '1px solid black'}}>ExtendDueModal <Button onClick={onClose}>Close</Button></div> : null;
const ManifestForm = ({ open, onClose, eventId, stream, onSubmitted }) => open ? <div style={{position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'white', padding: 20, border: '1px solid black'}}>ManifestForm <Button onClick={onClose}>Close</Button></div> : null;


const StreamCard = ({ eventId, stream, data, refresh }) => {
    const { currentUser } = useAuth();
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [reviewModalOpen, setReviewModalOpen] = useState(false);
    const [extendDueModalOpen, setExtendDueModalOpen] = useState(false);
    const [manifestModalOpen, setManifestModalOpen] = useState(false);

    const isAdmin = currentUser?.roles?.includes('admin');
    const isLead = data?.editors?.find(e => e.role === 'LEAD' && e.uid === currentUser?.uid);

    const state = data?.state || 'NOT_STARTED';

    const renderAdminButtons = () => {
        if (!isAdmin) return null;
        return (
            <>
                {state.includes('REVIEW') && (
                    <>
                        <Button size="small" variant="contained" onClick={() => setReviewModalOpen(true)}>Approve Final</Button>
                        <Button size="small" variant="outlined" onClick={() => setReviewModalOpen(true)}>Request Changes</Button>
                    </>
                )}
                {!data?.editors?.length && <Button size="small" variant="contained" onClick={() => setAssignModalOpen(true)}>Assign Editors</Button>}
                {data?.editors?.length && !state.endsWith('DONE') && (
                    <>
                        <Button size="small" onClick={() => setExtendDueModalOpen(true)}>Extend Due</Button>
                        <Button size="small" onClick={() => setAssignModalOpen(true)}>Reassign</Button>
                        <Button size="small" color="error">Waive</Button>
                    </>
                )}
            </>
        );
    };

    const renderLeadButtons = () => {
        if (!isLead) return null;
        return (
            <>
                {state.endsWith('ASSIGNED') && <Button size="small" variant="contained">Start</Button>}
                {(state.includes('IN_PROGRESS') || state.includes('CHANGES')) && <Button size="small" variant="contained" onClick={() => setManifestModalOpen(true)}>Submit Draft</Button>}
            </>
        );
    };

    return (
        <Card variant="outlined">
            <CardHeader
                title={stream === 'photo' ? 'Photos' : 'Video'}
                action={<Chip label={state} color="primary" />}
            />
            <CardContent>
                {data?.risk?.atRisk && <Chip label="At Risk" color="error" size="small" sx={{ mb: 1 }} title={data.risk.reason} />}
                
                <Typography variant="body2" color="text.secondary">
                    Due: {data?.draftDue || data?.finalDue || 'N/A'}
                </Typography>

                <Box sx={{ my: 2 }}>
                    <Typography variant="subtitle2">Editors:</Typography>
                    {data?.editors?.length > 0 ? (
                        data.editors.map(editor => (
                            <Typography key={editor.uid} variant="body2">
                                {editor.role === 'LEAD' && '★ '}
                                {editor.displayName || editor.uid}
                            </Typography>
                        ))
                    ) : (
                        <Typography variant="body2" color="text.secondary">Not assigned</Typography>
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
            <AssignEditorsModal open={assignModalOpen} onClose={() => setAssignModalOpen(false)} eventId={eventId} stream={stream} onAssigned={refresh} />
            <ReviewModal open={reviewModalOpen} onClose={() => setReviewModalOpen(false)} eventId={eventId} stream={stream} onDecided={refresh} />
            <ExtendDueModal open={extendDueModalOpen} onClose={() => setExtendDueModalOpen(false)} eventId={eventId} stream={stream} onExtended={refresh} />
            <ManifestForm open={manifestModalOpen} onClose={() => setManifestModalOpen(false)} eventId={eventId} stream={stream} onSubmitted={refresh} />
        </Card>
    );
};

export default StreamCard;
