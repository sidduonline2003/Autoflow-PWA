import React, { useState } from 'react';
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField,
    Grid, CircularProgress, Typography
} from '@mui/material';
import toast from 'react-hot-toast';

const RequestLeaveModal = ({ open, onClose, onSubmit }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!startDate || !endDate || !reason) {
            setError('All fields are required.');
            return;
        }
        if (new Date(startDate) > new Date(endDate)) {
            setError('Start date cannot be after the end date.');
            return;
        }
        setLoading(true);
        try {
            await onSubmit({ startDate, endDate, reason });
            toast.success('Leave request submitted successfully!');
            onClose();
        } catch (err) {
            toast.error(err.message);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Request Leave of Absence</DialogTitle>
            <form onSubmit={handleSubmit}>
                <DialogContent>
                    {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12} sm={6}>
                            <TextField required fullWidth label="Start Date" type="date" InputLabelProps={{ shrink: true }} value={startDate} onChange={e => setStartDate(e.target.value)} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField required fullWidth label="End Date" type="date" InputLabelProps={{ shrink: true }} value={endDate} onChange={e => setEndDate(e.target.value)} />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField required fullWidth multiline rows={3} label="Reason for Leave" value={reason} onChange={e => setReason(e.target.value)} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: '0 24px 20px' }}>
                    <Button onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={loading}>
                        {loading ? <CircularProgress size={24} /> : 'Submit Request'}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default RequestLeaveModal;
