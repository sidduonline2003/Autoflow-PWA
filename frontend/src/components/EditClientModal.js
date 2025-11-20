import React, { useState, useEffect } from 'react';
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField,
    Grid, CircularProgress, Typography, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';

const EditClientModal = ({ open, onClose, onSubmit, client }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [businessType, setBusinessType] = useState('');
    const [status, setStatus] = useState('active');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (client) {
            setName(client.name || '');
            setPhone(client.phone || '');
            setAddress(client.address || '');
            setBusinessType(client.businessType || '');
            setStatus(client.status || 'active');
        }
    }, [client]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!name) {
            setError('Client name is required.');
            return;
        }
        setLoading(true);
        try {
            await onSubmit(client.id, { name, phone, address, businessType, status });
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Edit Client: {client?.name}</DialogTitle>
            <form onSubmit={handleSubmit}>
                <DialogContent>
                    {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
                    <Grid container spacing={2}>
                        <Grid xs={12}>
                            <TextField required fullWidth label="Full Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                        </Grid>
                        <Grid xs={12} sm={6}>
                            <TextField fullWidth label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </Grid>
                        <Grid xs={12} sm={6}>
                            <TextField fullWidth label="Business Type" value={businessType} onChange={(e) => setBusinessType(e.target.value)} />
                        </Grid>
                        <Grid xs={12}>
                            <TextField fullWidth label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
                        </Grid>
                        <Grid xs={12}>
                             <FormControl fullWidth>
                                <InputLabel id="status-select-label">Status</InputLabel>
                                <Select labelId="status-select-label" value={status} label="Status" onChange={(e) => setStatus(e.target.value)}>
                                    <MenuItem value="active">Active</MenuItem>
                                    <MenuItem value="inactive">Inactive</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: '0 24px 20px' }}>
                    <Button onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={loading}>
                        {loading ? <CircularProgress size={24} /> : 'Save Changes'}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default EditClientModal;
