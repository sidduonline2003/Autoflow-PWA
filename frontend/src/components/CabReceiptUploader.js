import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    Grid,
    CircularProgress,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Chip,
    Divider,
    List,
    ListItem,
    ListItemText,
    LinearProgress,
    Stepper,
    Step,
    StepLabel,
    StepContent,
    IconButton,
    Tooltip,
    Paper
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    Receipt as ReceiptIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Error as ErrorIcon,
    Info as InfoIcon,
    Delete as DeleteIcon,
    Visibility as ViewIcon,
    History as HistoryIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import toast from 'react-hot-toast';

const CabReceiptUploader = ({ eventId, eventData, onUploadSuccess }) => {
    const { user } = useAuth();
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [verificationResult, setVerificationResult] = useState(null);
    const [teamMembers, setTeamMembers] = useState([]);
    const [selectedTeamMembers, setSelectedTeamMembers] = useState([]);
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    const [receipts, setReceipts] = useState([]);
    const [receiptsLoading, setReceiptsLoading] = useState(false);

    // Debug props
    console.log('CabReceiptUploader props:', { eventId, eventData: eventData ? 'present' : 'missing' });

    // Fetch team members for this event
    useEffect(() => {
        if (eventData && eventData.assignedCrew) {
            setTeamMembers(eventData.assignedCrew || []);
        }
    }, [eventData]);

    // Fetch existing receipts for this event
    const fetchReceipts = async () => {
        setReceiptsLoading(true);
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/receipts/event/${eventId}`, {
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setReceipts(data.receipts || []);
            } else {
                console.error('Failed to fetch receipts');
            }
        } catch (error) {
            console.error('Error fetching receipts:', error);
        } finally {
            setReceiptsLoading(false);
        }
    };

    useEffect(() => {
        if (eventId) {
            fetchReceipts();
        }
    }, [eventId]);

    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile) {
            // Validate file type
            if (!selectedFile.type.startsWith('image/')) {
                setError('Please select an image file');
                return;
            }

            // Validate file size (max 10MB)
            if (selectedFile.size > 10 * 1024 * 1024) {
                setError('File size must be less than 10MB');
                return;
            }

            setFile(selectedFile);
            setError('');
            setVerificationResult(null);

            // Create preview
            const reader = new FileReader();
            reader.onload = (e) => {
                setPreview(e.target.result);
            };
            reader.readAsDataURL(selectedFile);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setError('Please select a file first');
            return;
        }

        if (!eventId) {
            setError('Event ID is required for receipt upload');
            console.error('Missing eventId:', eventId);
            return;
        }

        console.log('Starting upload with eventId:', eventId);

        setUploading(true);
        setUploadProgress(0);
        setError('');

        try {
            const formData = new FormData();
            formData.append('file', file);

            console.log('FormData contents:', {
                eventId: eventId,
                teamMembers: selectedTeamMembers,
                notes: notes,
                fileName: file.name
            });

            const idToken = await auth.currentUser.getIdToken();

            // Simulate upload progress
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => {
                    if (prev >= 90) {
                        clearInterval(progressInterval);
                        return 90;
                    }
                    return prev + 10;
                });
            }, 200);

            const response = await fetch(`/api/receipts/upload?eventId=${encodeURIComponent(eventId)}&teamMembers=${encodeURIComponent(JSON.stringify(selectedTeamMembers))}&notes=${encodeURIComponent(notes)}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`
                },
                body: formData
            });

            console.log('Upload response status:', response.status);
            console.log('Upload response headers:', response.headers);

            clearInterval(progressInterval);
            setUploadProgress(100);

            if (response.ok) {
                const result = await response.json();
                console.log('Upload success result:', result);
                setVerificationResult(result.verification);
                
                // Show success message based on risk level
                const riskLevel = result.verification.riskLevel;
                if (riskLevel === 'LOW_RISK') {
                    toast.success('Receipt uploaded and auto-verified successfully!');
                } else if (riskLevel === 'MEDIUM_RISK') {
                    toast.success('Receipt uploaded! Pending admin review.');
                } else {
                    toast.error('Receipt uploaded but flagged for investigation.');
                }

                // Reset form
                setTimeout(() => {
                    setFile(null);
                    setPreview(null);
                    setSelectedTeamMembers([]);
                    setNotes('');
                    setUploadProgress(0);
                    fetchReceipts(); // Refresh receipts list
                    
                    if (onUploadSuccess) {
                        onUploadSuccess(result);
                    }
                }, 2000);

            } else {
                const errorText = await response.text();
                console.error('Upload failed - Status:', response.status);
                console.error('Upload failed - Response text:', errorText);
                
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch (parseError) {
                    errorData = { detail: `HTTP ${response.status}: ${errorText}` };
                }
                
                throw new Error(errorData.detail || `Upload failed with status ${response.status}`);
            }

        } catch (error) {
            console.error('Upload error:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            setError(`Upload failed: ${error.message}`);
            toast.error(`Failed to upload receipt: ${error.message}`);
            setUploadProgress(0);
        } finally {
            setUploading(false);
        }
    };

    const getRiskLevelColor = (riskLevel) => {
        switch (riskLevel) {
            case 'LOW_RISK': return 'success';
            case 'MEDIUM_RISK': return 'warning';
            case 'HIGH_RISK': return 'error';
            default: return 'default';
        }
    };

    const getRiskLevelIcon = (riskLevel) => {
        switch (riskLevel) {
            case 'LOW_RISK': return <CheckCircleIcon />;
            case 'MEDIUM_RISK': return <WarningIcon />;
            case 'HIGH_RISK': return <ErrorIcon />;
            default: return <InfoIcon />;
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'VERIFIED': return 'success';
            case 'PENDING': return 'warning';
            case 'REJECTED': return 'error';
            case 'SUSPICIOUS': return 'error';
            default: return 'default';
        }
    };

    return (
        <Box>
            <Typography variant="h6" gutterBottom>
                Cab Receipt Upload
            </Typography>

            {!eventId && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    No event selected. Please select an event to upload receipts.
                </Alert>
            )}

            {/* Upload Section */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Grid container spacing={3}>
                        {/* File Upload */}
                        <Grid size={{ xs: 12 }}>
                            <Box
                                sx={{
                                    border: '2px dashed',
                                    borderColor: file ? 'success.main' : 'grey.300',
                                    borderRadius: 2,
                                    p: 3,
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    transition: 'border-color 0.3s',
                                    '&:hover': {
                                        borderColor: 'primary.main'
                                    }
                                }}
                                component="label"
                            >
                                <input
                                    type="file"
                                    accept="image/*"
                                    hidden
                                    onChange={handleFileChange}
                                    disabled={uploading}
                                />
                                
                                {preview ? (
                                    <Box>
                                        <img
                                            src={preview}
                                            alt="Receipt preview"
                                            style={{
                                                maxWidth: '100%',
                                                maxHeight: 300,
                                                objectFit: 'contain',
                                                borderRadius: 8
                                            }}
                                        />
                                        <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                                            {file?.name}
                                        </Typography>
                                    </Box>
                                ) : (
                                    <Box>
                                        <UploadIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
                                        <Typography variant="h6" gutterBottom>
                                            Upload Cab Receipt
                                        </Typography>
                                        <Typography variant="body2" color="textSecondary">
                                            Click to select an image file (max 10MB)
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Grid>

                        {file && (
                            <>
                                {/* Team Members Selection */}
                                <Grid size={{ xs: 12 }}>
                                    <FormControl fullWidth>
                                        <InputLabel>Team Members (who shared this ride)</InputLabel>
                                        <Select
                                            multiple
                                            value={selectedTeamMembers}
                                            onChange={(e) => setSelectedTeamMembers(e.target.value)}
                                            renderValue={(selected) => (
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                    {selected.map((memberId) => {
                                                        const member = teamMembers.find(m => m.userId === memberId);
                                                        return (
                                                            <Chip
                                                                key={memberId}
                                                                label={member?.name || memberId}
                                                                size="small"
                                                            />
                                                        );
                                                    })}
                                                </Box>
                                            )}
                                        >
                                            {teamMembers.map((member) => (
                                                <MenuItem key={member.userId} value={member.userId}>
                                                    {member.name} ({member.role})
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>

                                {/* Notes */}
                                <Grid size={{ xs: 12 }}>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={3}
                                        label="Notes (Optional)"
                                        placeholder="Any additional information about this trip..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        disabled={uploading}
                                    />
                                </Grid>

                                {/* Upload Progress */}
                                {uploading && (
                                    <Grid size={{ xs: 12 }}>
                                        <Box sx={{ mb: 2 }}>
                                            <Typography variant="body2" color="textSecondary" gutterBottom>
                                                Processing receipt... {uploadProgress}%
                                            </Typography>
                                            <LinearProgress variant="determinate" value={uploadProgress} />
                                        </Box>
                                    </Grid>
                                )}

                                {/* Error Display */}
                                {error && (
                                    <Grid size={{ xs: 12 }}>
                                        <Alert severity="error">
                                            {error}
                                        </Alert>
                                    </Grid>
                                )}

                                {/* Action Buttons */}
                                <Grid size={{ xs: 12 }}>
                                    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                                        <Button
                                            onClick={() => {
                                                setFile(null);
                                                setPreview(null);
                                                setSelectedTeamMembers([]);
                                                setNotes('');
                                                setError('');
                                                setVerificationResult(null);
                                            }}
                                            disabled={uploading}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            variant="contained"
                                            startIcon={uploading ? <CircularProgress size={20} /> : <UploadIcon />}
                                            onClick={handleUpload}
                                            disabled={uploading}
                                        >
                                            {uploading ? 'Processing...' : 'Upload & Verify'}
                                        </Button>
                                    </Box>
                                </Grid>
                            </>
                        )}
                    </Grid>
                </CardContent>
            </Card>

            {/* Verification Result */}
            {verificationResult && (
                <Card sx={{ mb: 3 }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            {getRiskLevelIcon(verificationResult.riskLevel)}
                            <Typography variant="h6" sx={{ ml: 1 }}>
                                Verification Result
                            </Typography>
                            <Chip
                                label={verificationResult.riskLevel.replace('_', ' ')}
                                color={getRiskLevelColor(verificationResult.riskLevel)}
                                sx={{ ml: 2 }}
                            />
                        </Box>

                        <Typography variant="body2" gutterBottom>
                            Risk Score: {verificationResult.riskScore}/100
                        </Typography>

                        {verificationResult.issues && verificationResult.issues.length > 0 && (
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle2" gutterBottom>
                                    Issues Detected:
                                </Typography>
                                <List dense>
                                    {verificationResult.issues.map((issue, index) => (
                                        <ListItem key={index}>
                                            <ListItemText primary={issue} />
                                        </ListItem>
                                    ))}
                                </List>
                            </Box>
                        )}

                        {verificationResult.extractedData && (
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle2" gutterBottom>
                                    Extracted Information:
                                </Typography>
                                <Grid container spacing={2}>
                                    {verificationResult.extractedData.amount && (
                                        <Grid size={{ xs: 6 }}>
                                            <Typography variant="body2">
                                                <strong>Amount:</strong> ₹{verificationResult.extractedData.amount}
                                            </Typography>
                                        </Grid>
                                    )}
                                    {verificationResult.extractedData.rideId && (
                                        <Grid size={{ xs: 6 }}>
                                            <Typography variant="body2">
                                                <strong>Ride ID:</strong> {verificationResult.extractedData.rideId}
                                            </Typography>
                                        </Grid>
                                    )}
                                    {verificationResult.extractedData.timestamp && (
                                        <Grid size={{ xs: 12 }}>
                                            <Typography variant="body2">
                                                <strong>Date/Time:</strong> {verificationResult.extractedData.timestamp}
                                            </Typography>
                                        </Grid>
                                    )}
                                    {verificationResult.extractedData.locations?.pickup && (
                                        <Grid size={{ xs: 6 }}>
                                            <Typography variant="body2">
                                                <strong>From:</strong> {verificationResult.extractedData.locations.pickup}
                                            </Typography>
                                        </Grid>
                                    )}
                                    {verificationResult.extractedData.locations?.dropoff && (
                                        <Grid size={{ xs: 6 }}>
                                            <Typography variant="body2">
                                                <strong>To:</strong> {verificationResult.extractedData.locations.dropoff}
                                            </Typography>
                                        </Grid>
                                    )}
                                </Grid>
                            </Box>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Existing Receipts */}
            <Card>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6">
                            Submitted Receipts
                        </Typography>
                        <IconButton onClick={fetchReceipts} disabled={receiptsLoading}>
                            <HistoryIcon />
                        </IconButton>
                    </Box>

                    {receiptsLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : receipts.length === 0 ? (
                        <Typography color="textSecondary" textAlign="center" py={3}>
                            No receipts submitted yet
                        </Typography>
                    ) : (
                        <List>
                            {receipts.map((receipt, index) => (
                                <ListItem key={receipt.id || index} divider={index < receipts.length - 1}>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <ReceiptIcon fontSize="small" />
                                                <Typography variant="subtitle2">
                                                    {receipt.provider ? receipt.provider.toUpperCase() : 'Receipt'} - 
                                                    {receipt.extractedData?.amount 
                                                        ? ` ₹${receipt.extractedData.amount}` 
                                                        : ' Amount N/A'}
                                                </Typography>
                                                <Chip
                                                    label={receipt.status || 'PENDING'}
                                                    color={getStatusColor(receipt.status)}
                                                    size="small"
                                                />
                                            </Box>
                                        }
                                        secondary={
                                            <Box sx={{ mt: 1 }}>
                                                <Typography variant="caption" color="textSecondary">
                                                    Submitted by: {receipt.submittedByName} • 
                                                    {receipt.createdAt 
                                                        ? new Date(receipt.createdAt).toLocaleDateString()
                                                        : 'Date N/A'}
                                                </Typography>
                                                {receipt.riskAssessment && (
                                                    <Box sx={{ mt: 0.5 }}>
                                                        <Chip
                                                            label={`Risk: ${receipt.riskAssessment.riskLevel?.replace('_', ' ') || 'Unknown'}`}
                                                            color={getRiskLevelColor(receipt.riskAssessment.riskLevel)}
                                                            size="small"
                                                        />
                                                    </Box>
                                                )}
                                            </Box>
                                        }
                                    />
                                </ListItem>
                            ))}
                        </List>
                    )}
                </CardContent>
            </Card>
        </Box>
    );
};

export default CabReceiptUploader;
