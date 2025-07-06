import React, { useState } from 'react';
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField,
    Grid, CircularProgress, Box, Typography, IconButton
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import toast from 'react-hot-toast';

const AddClientModal = ({ open, onClose, onSubmit }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [businessType, setBusinessType] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successData, setSuccessData] = useState(null);

    const handleCopyToClipboard = (text) => {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
            toast.success('Copied to clipboard!');
        } else {
            toast.error('Clipboard not supported in this environment.');
        }
    };
    
    const resetForm = () => {
        setName('');
        setEmail('');
        setPhone('');
        setAddress('');
        setBusinessType('');
        setError('');
        setSuccessData(null);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!name || !email) {
            setError('Client name and email are required.');
            return;
        }
        setLoading(true);
        try {
            const result = await onSubmit({ name, email, phone, address, businessType });
            setSuccessData(result);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
            <DialogTitle>{successData ? 'Client Created Successfully' : 'Add New Client'}</DialogTitle>
            
            {successData ? (
                <DialogContent>
                    <Typography gutterBottom>
                        The client account has been created. Please share these credentials with your client.
                    </Typography>
                    <Box sx={{ mt: 2, p: 2, border: '1px solid #ccc', borderRadius: 1 }}>
                        <Typography><strong>Email / Username:</strong> {email}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography><strong>Temporary Password:</strong> {successData.tempPassword}</Typography>
                            <IconButton onClick={() => handleCopyToClipboard(successData.tempPassword)} size="small">
                                <ContentCopyIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Box>
                </DialogContent>
            ) : (
                <form onSubmit={handleSubmit}>
                    <DialogContent>
                        {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
                        <Grid container spacing={2}>
                            <Grid xs={12}>
                                <TextField required fullWidth label="Full Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                            </Grid>
                            <Grid xs={12}>
                                <TextField required fullWidth label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
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
                        </Grid>
                    </DialogContent>
                    <DialogActions sx={{ p: '0 24px 20px' }}>
                        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={loading}>
                            {loading ? <CircularProgress size={24} /> : 'Create Client'}
                        </Button>
                    </DialogActions>
                </form>
            )}

            {successData && (
                <DialogActions sx={{ p: '0 24px 20px' }}>
                    <Button onClick={handleClose} variant="contained">Close</Button>
                </DialogActions>
            )}
        </Dialog>
    );
};

export default AddClientModal;
