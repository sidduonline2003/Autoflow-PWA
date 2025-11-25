import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    Grid,
    CircularProgress,
    Alert,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Chip,
    List,
    ListItem,
    ListItemText,
    LinearProgress,
    IconButton,
    Paper,
    Stack,
    Avatar,
    useTheme,
    Fade,
    Zoom,
    Divider
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
    CloudUpload as UploadIcon,
    ReceiptLong as ReceiptIcon,
    CheckCircle as CheckCircleIcon,
    Warning as WarningIcon,
    Error as ErrorIcon,
    Info as InfoIcon,
    Delete as DeleteIcon,
    History as HistoryIcon,
    Person as PersonIcon,
    DirectionsCar as CarIcon,
    AttachMoney as MoneyIcon,
    AccessTime as TimeIcon,
    Place as PlaceIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import toast from 'react-hot-toast';

const CabReceiptUploader = ({ eventId, eventData, onUploadSuccess }) => {
    const { user } = useAuth();
    const theme = useTheme();
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStage, setUploadStage] = useState(''); // 'uploading', 'analyzing', 'verifying'
    const [verificationResult, setVerificationResult] = useState(null);
    const [teamMembers, setTeamMembers] = useState([]);
    const [selectedTeamMembers, setSelectedTeamMembers] = useState([]);
    const [notes, setNotes] = useState('');
    const [error, setError] = useState('');
    const [receipts, setReceipts] = useState([]);
    const [receiptsLoading, setReceiptsLoading] = useState(false);
    const fileInputRef = useRef(null);

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
                console.log('Fetched receipts:', data.receipts);
                // Debug: Check for duplicates
                const duplicateReceipts = (data.receipts || []).filter(r => r.duplicateOf);
                if (duplicateReceipts.length > 0) {
                    console.log('Found receipts with duplicateOf:', duplicateReceipts);
                }
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
            processFile(selectedFile);
        }
    };

    const processFile = (selectedFile) => {
        // Validate file type
        if (!selectedFile.type.startsWith('image/')) {
            setError('Please select an image file');
            toast.error('Please select an image file');
            return;
        }

        // Validate file size (max 10MB)
        if (selectedFile.size > 10 * 1024 * 1024) {
            setError('File size must be less than 10MB');
            toast.error('File size must be less than 10MB');
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
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) {
            processFile(droppedFile);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setError('Please select a file first');
            return;
        }

        if (!eventId) {
            setError('Event ID is required for receipt upload');
            return;
        }

        setUploading(true);
        setUploadProgress(0);
        setUploadStage('uploading');
        setError('');

        try {
            const formData = new FormData();
            formData.append('file', file);

            const idToken = await auth.currentUser.getIdToken();

            // Simulate upload progress stages
            const progressInterval = setInterval(() => {
                setUploadProgress(prev => {
                    if (prev < 30) return prev + 5;
                    if (prev === 30 && uploadStage === 'uploading') return 30;
                    if (prev < 60 && uploadStage === 'analyzing') return prev + 2;
                    if (prev === 60 && uploadStage === 'analyzing') return 60;
                    if (prev < 90 && uploadStage === 'verifying') return prev + 1;
                    return prev;
                });
            }, 200);

            // Stage 1: Uploading
            setTimeout(() => setUploadStage('analyzing'), 1000);
            
            const response = await fetch(`/api/receipts/upload?eventId=${encodeURIComponent(eventId)}&teamMembers=${encodeURIComponent(JSON.stringify(selectedTeamMembers))}&notes=${encodeURIComponent(notes)}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${idToken}`
                },
                body: formData
            });

            // Stage 2: Analyzing & Verifying (happens on backend)
            setUploadStage('verifying');

            clearInterval(progressInterval);
            setUploadProgress(100);

            if (response.ok) {
                const result = await response.json();
                setVerificationResult(result.verification);
                
                // Check for duplicate first
                if (result.verification.isDuplicate && result.verification.duplicateOf) {
                    toast.error(`⚠️ DUPLICATE DETECTED! This receipt matches one already submitted by ${result.verification.duplicateOf.submitted_by || 'another user'}`, { 
                        duration: 6000,
                        icon: '🚨'
                    });
                } else {
                    // Show success message based on risk level
                    const riskLevel = result.verification.riskLevel;
                    if (riskLevel === 'LOW_RISK') {
                        toast.success('Receipt verified successfully!', { icon: '✅' });
                    } else if (riskLevel === 'MEDIUM_RISK') {
                        toast.success('Receipt uploaded. Pending review.', { icon: '⚠️' });
                    } else {
                        toast.error('Receipt flagged for investigation.', { icon: '🚨' });
                    }
                }

                // Reset form after delay
                setTimeout(() => {
                    setFile(null);
                    setPreview(null);
                    setSelectedTeamMembers([]);
                    setNotes('');
                    setUploadProgress(0);
                    setUploadStage('');
                    fetchReceipts(); // Refresh receipts list
                    
                    if (onUploadSuccess) {
                        onUploadSuccess(result);
                    }
                }, 3000); // Keep result visible for 3 seconds

            } else {
                const errorText = await response.text();
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
            setError(`Upload failed: ${error.message}`);
            toast.error(`Failed: ${error.message}`);
            setUploadProgress(0);
            setUploadStage('');
        } finally {
            setUploading(false);
        }
    };

    const getRiskLevelColor = (riskLevel) => {
        switch (riskLevel) {
            case 'LOW_RISK': return theme.palette.success.main;
            case 'MEDIUM_RISK': return theme.palette.warning.main;
            case 'HIGH_RISK': return theme.palette.error.main;
            default: return theme.palette.info.main;
        }
    };

    const getRiskLevelLabel = (riskLevel) => {
        switch (riskLevel) {
            case 'LOW_RISK': return 'Verified Safe';
            case 'MEDIUM_RISK': return 'Needs Review';
            case 'HIGH_RISK': return 'High Risk';
            default: return 'Unknown';
        }
    };

    return (
        <Box sx={{ maxWidth: 800, mx: 'auto', p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <ReceiptIcon sx={{ fontSize: 32, color: 'primary.main', mr: 1.5 }} />
                <Typography variant="h5" fontWeight="600" color="text.primary">
                    Smart Receipt Upload
                </Typography>
            </Box>

            {!eventId && (
                <Alert severity="warning" sx={{ mb: 3, borderRadius: 2 }}>
                    Please select an event to start uploading receipts.
                </Alert>
            )}

            <Grid container spacing={3}>
                {/* Left Column: Upload Area */}
                <Grid item xs={12} md={file ? 6 : 12}>
                    <Paper
                        elevation={0}
                        sx={{
                            border: '2px dashed',
                            borderColor: file ? 'success.main' : 'grey.300',
                            borderRadius: 4,
                            bgcolor: file ? alpha(theme.palette.success.main, 0.08) : 'grey.50',
                            p: 4,
                            textAlign: 'center',
                            cursor: uploading ? 'default' : 'pointer',
                            transition: 'all 0.3s ease',
                            height: file ? 'auto' : 300,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            '&:hover': {
                                borderColor: uploading ? 'grey.300' : 'primary.main',
                                bgcolor: uploading ? 'grey.50' : alpha(theme.palette.primary.main, 0.04),
                                transform: uploading ? 'none' : 'translateY(-2px)'
                            }
                        }}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onClick={() => !uploading && fileInputRef.current.click()}
                    >
                        <input
                            type="file"
                            accept="image/*"
                            hidden
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            disabled={uploading}
                        />
                        
                        {preview ? (
                            <Box sx={{ position: 'relative', width: '100%' }}>
                                <img
                                    src={preview}
                                    alt="Receipt preview"
                                    style={{
                                        width: '100%',
                                        maxHeight: 300,
                                        objectFit: 'contain',
                                        borderRadius: 12,
                                        boxShadow: theme.shadows[3]
                                    }}
                                />
                                {!uploading && (
                                    <IconButton
                                        sx={{
                                            position: 'absolute',
                                            top: -10,
                                            right: -10,
                                            bgcolor: 'background.paper',
                                            boxShadow: 2,
                                            '&:hover': { bgcolor: 'error.light', color: 'white' }
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setFile(null);
                                            setPreview(null);
                                        }}
                                    >
                                        <CloseIcon />
                                    </IconButton>
                                )}
                            </Box>
                        ) : (
                            <>
                                <Avatar sx={{ width: 64, height: 64, bgcolor: alpha(theme.palette.primary.main, 0.1), mb: 2 }}>
                                    <UploadIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                                </Avatar>
                                <Typography variant="h6" gutterBottom color="text.primary">
                                    Drop receipt here
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    or click to browse
                                </Typography>
                                <Typography variant="caption" color="text.disabled" sx={{ mt: 1 }}>
                                    Supports JPG, PNG (Max 10MB)
                                </Typography>
                            </>
                        )}
                    </Paper>
                </Grid>

                {/* Right Column: Form Details (Only visible when file selected) */}
                {file && (
                    <Grid item xs={12} md={6}>
                        <Fade in={!!file}>
                            <Box>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                                    <InfoIcon sx={{ mr: 1, fontSize: 20, color: 'text.secondary' }} />
                                    Trip Details
                                </Typography>
                                
                                <Stack spacing={3}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Shared with Team Members</InputLabel>
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
                                                                avatar={<Avatar sx={{ width: 24, height: 24 }}>{member?.name?.[0]}</Avatar>}
                                                            />
                                                        );
                                                    })}
                                                </Box>
                                            )}
                                        >
                                            {teamMembers.map((member) => (
                                                <MenuItem key={member.userId} value={member.userId}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <Avatar sx={{ width: 24, height: 24 }}>{member.name[0]}</Avatar>
                                                        <Typography variant="body2">{member.name}</Typography>
                                                        <Typography variant="caption" color="text.secondary">({member.role})</Typography>
                                                    </Box>
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>

                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={3}
                                        label="Notes / Comments"
                                        placeholder="E.g., Late night shift drop, Client meeting..."
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        disabled={uploading}
                                        size="small"
                                    />

                                    {uploading ? (
                                        <Box sx={{ mt: 2 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant="body2" color="primary" fontWeight="500">
                                                    {uploadStage === 'uploading' && 'Uploading Image...'}
                                                    {uploadStage === 'analyzing' && 'AI Analyzing Receipt...'}
                                                    {uploadStage === 'verifying' && 'Verifying Details...'}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">{uploadProgress}%</Typography>
                                            </Box>
                                            <LinearProgress 
                                                variant="determinate" 
                                                value={uploadProgress} 
                                                sx={{ height: 8, borderRadius: 4 }} 
                                            />
                                        </Box>
                                    ) : (
                                        <Button
                                            variant="contained"
                                            size="large"
                                            fullWidth
                                            startIcon={<UploadIcon />}
                                            onClick={handleUpload}
                                            sx={{ 
                                                mt: 2,
                                                height: 48,
                                                borderRadius: 2,
                                                textTransform: 'none',
                                                fontSize: '1rem',
                                                boxShadow: theme.shadows[4]
                                            }}
                                        >
                                            Process Receipt
                                        </Button>
                                    )}

                                    {error && (
                                        <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
                                            {error}
                                        </Alert>
                                    )}
                                </Stack>
                            </Box>
                        </Fade>
                    </Grid>
                )}
            </Grid>

            {/* Verification Result Section */}
            {verificationResult && (
                <Zoom in={!!verificationResult}>
                    <Paper 
                        elevation={3} 
                        sx={{ 
                            mt: 4, 
                            p: 3, 
                            borderRadius: 3, 
                            borderLeft: `6px solid ${getRiskLevelColor(verificationResult.riskLevel)}`,
                            bgcolor: 'background.paper'
                        }}
                    >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                            <Box>
                                <Typography variant="h6" fontWeight="bold" gutterBottom>
                                    Analysis Complete
                                </Typography>
                                <Chip 
                                    label={getRiskLevelLabel(verificationResult.riskLevel)}
                                    sx={{ 
                                        bgcolor: getRiskLevelColor(verificationResult.riskLevel), 
                                        color: 'white',
                                        fontWeight: 'bold'
                                    }} 
                                />
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="caption" display="block" color="text.secondary">Risk Score</Typography>
                                <Typography variant="h4" fontWeight="bold" color={getRiskLevelColor(verificationResult.riskLevel)}>
                                    {verificationResult.riskScore}
                                </Typography>
                            </Box>
                        </Box>

                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={6} sm={3}>
                                <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 2 }}>
                                    <Typography variant="caption" color="text.secondary" display="flex" alignItems="center">
                                        <MoneyIcon fontSize="inherit" sx={{ mr: 0.5 }} /> Amount
                                    </Typography>
                                    <Typography variant="subtitle1" fontWeight="600">
                                        ₹{verificationResult.extractedData?.amount || '0.00'}
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 2 }}>
                                    <Typography variant="caption" color="text.secondary" display="flex" alignItems="center">
                                        <CarIcon fontSize="inherit" sx={{ mr: 0.5 }} /> Ride ID
                                    </Typography>
                                    <Typography variant="subtitle1" fontWeight="600" sx={{ wordBreak: 'break-all' }}>
                                        {verificationResult.extractedData?.rideId || 'N/A'}
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 2 }}>
                                    <Typography variant="caption" color="text.secondary" display="flex" alignItems="center">
                                        <TimeIcon fontSize="inherit" sx={{ mr: 0.5 }} /> Date & Time
                                    </Typography>
                                    <Typography variant="subtitle1" fontWeight="600">
                                        {verificationResult.extractedData?.timestamp || 'Unknown'}
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={12}>
                                <Box sx={{ p: 1.5, bgcolor: 'grey.50', borderRadius: 2 }}>
                                    <Typography variant="caption" color="text.secondary" display="flex" alignItems="center">
                                        <PlaceIcon fontSize="inherit" sx={{ mr: 0.5 }} /> Route
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 0.5 }}>
                                        <Typography variant="body2" fontWeight="500">
                                            {verificationResult.extractedData?.locations?.pickup || 'Unknown'}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mx: 1 }}>→</Typography>
                                        <Typography variant="body2" fontWeight="500">
                                            {verificationResult.extractedData?.locations?.dropoff || 'Unknown'}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>
                        </Grid>
                    </Paper>
                </Zoom>
            )}

            {/* Recent Uploads List */}
            <Box sx={{ mt: 5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" fontWeight="600">
                        Recent Uploads
                    </Typography>
                    <IconButton onClick={fetchReceipts} disabled={receiptsLoading} size="small">
                        <HistoryIcon />
                    </IconButton>
                </Box>

                <Paper elevation={0} variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
                    {receiptsLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : receipts.length === 0 ? (
                        <Box sx={{ p: 4, textAlign: 'center' }}>
                            <Typography color="text.secondary">No receipts uploaded yet.</Typography>
                        </Box>
                    ) : (
                        <List disablePadding>
                            {receipts.map((receipt, index) => {
                                // Determine if receipt is flagged/rejected
                                const isFlagged = receipt.status === 'REJECT' || receipt.status === 'REJECTED' || 
                                                  receipt.status === 'FLAGGED' || receipt.riskScore >= 60;
                                const needsReview = receipt.status === 'MANUAL_REVIEW' || 
                                                    (receipt.riskScore >= 30 && receipt.riskScore < 60);
                                const isDuplicate = receipt.duplicateOf != null;
                                
                                // Get status color
                                const getStatusColor = () => {
                                    if (isFlagged) return 'error';
                                    if (needsReview) return 'warning';
                                    if (receipt.status === 'VERIFIED' || receipt.status === 'AUTO_APPROVE') return 'success';
                                    return 'default';
                                };
                                
                                // Get background color for flagged items
                                const getBgColor = () => {
                                    if (isFlagged) return alpha(theme.palette.error.main, 0.08);
                                    if (needsReview) return alpha(theme.palette.warning.main, 0.08);
                                    return 'transparent';
                                };

                                return (
                                    <React.Fragment key={receipt.id || index}>
                                        {index > 0 && <Divider />}
                                        <ListItem 
                                            sx={{ 
                                                py: 2, 
                                                bgcolor: getBgColor(),
                                                borderLeft: isFlagged ? `4px solid ${theme.palette.error.main}` : 
                                                           needsReview ? `4px solid ${theme.palette.warning.main}` : 'none',
                                                '&:hover': { bgcolor: isFlagged ? alpha(theme.palette.error.main, 0.12) : 
                                                                       needsReview ? alpha(theme.palette.warning.main, 0.12) : 'grey.50' } 
                                            }}
                                        >
                                            <ListItemText
                                                primary={
                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                            <Avatar sx={{ 
                                                                bgcolor: isFlagged ? alpha(theme.palette.error.main, 0.1) :
                                                                         needsReview ? alpha(theme.palette.warning.main, 0.1) :
                                                                         alpha(theme.palette.primary.main, 0.1), 
                                                                color: isFlagged ? 'error.main' : 
                                                                       needsReview ? 'warning.main' : 'primary.main' 
                                                            }}>
                                                                <ReceiptIcon />
                                                            </Avatar>
                                                            <Box>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                    <Typography variant="subtitle2" fontWeight="600">
                                                                        {receipt.extractedData?.provider?.toUpperCase() || receipt.provider?.toUpperCase() || 'TAXI'}
                                                                    </Typography>
                                                                    {isFlagged && (
                                                                        <Chip 
                                                                            icon={<WarningIcon sx={{ fontSize: 14 }} />}
                                                                            label="FLAGGED" 
                                                                            size="small" 
                                                                            color="error"
                                                                            sx={{ height: 20, fontSize: '0.65rem' }}
                                                                        />
                                                                    )}
                                                                    {isDuplicate && (
                                                                        <Chip 
                                                                            icon={<ErrorIcon sx={{ fontSize: 14 }} />}
                                                                            label="DUPLICATE" 
                                                                            size="small" 
                                                                            color="error"
                                                                            variant="outlined"
                                                                            sx={{ height: 20, fontSize: '0.65rem' }}
                                                                        />
                                                                    )}
                                                                </Box>
                                                                <Typography variant="caption" color="text.secondary">
                                                                    {receipt.createdAt ? new Date(receipt.createdAt).toLocaleDateString() : 'Date N/A'}
                                                                    {receipt.extractedData?.rideId && ` • ID: ${receipt.extractedData.rideId}`}
                                                                </Typography>
                                                            </Box>
                                                        </Box>
                                                        <Typography 
                                                            variant="subtitle1" 
                                                            fontWeight="bold" 
                                                            color={isFlagged ? 'error.main' : needsReview ? 'warning.main' : 'success.main'}
                                                        >
                                                            ₹{receipt.extractedData?.amount || '0'}
                                                        </Typography>
                                                    </Box>
                                                }
                                                secondary={
                                                    <Box component="span" sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                                                            <Chip 
                                                                label={receipt.status === 'VERIFIED' ? 'VERIFIED' : 
                                                                       receipt.status === 'AUTO_APPROVE' ? 'AUTO APPROVED' :
                                                                       receipt.status === 'REJECT' || receipt.status === 'REJECTED' ? 'REJECTED' :
                                                                       receipt.status === 'MANUAL_REVIEW' ? 'NEEDS REVIEW' :
                                                                       receipt.status || 'PENDING'} 
                                                                size="small" 
                                                                color={getStatusColor()}
                                                                variant={isFlagged ? 'filled' : 'outlined'}
                                                            />
                                                            {receipt.riskScore !== undefined && (
                                                                <Chip
                                                                    label={`Risk: ${receipt.riskScore}`}
                                                                    size="small"
                                                                    sx={{ 
                                                                        bgcolor: receipt.riskScore >= 60 ? theme.palette.error.main :
                                                                                 receipt.riskScore >= 30 ? theme.palette.warning.main :
                                                                                 theme.palette.success.main,
                                                                        color: 'white',
                                                                        height: 24
                                                                    }}
                                                                />
                                                            )}
                                                        </Box>
                                                        {/* Show duplicate reference */}
                                                        {isDuplicate && receipt.duplicateOf && (
                                                            <Box sx={{ 
                                                                mt: 0.5, 
                                                                p: 1, 
                                                                bgcolor: alpha(theme.palette.error.main, 0.1),
                                                                borderRadius: 1,
                                                                border: `1px dashed ${theme.palette.error.main}`
                                                            }}>
                                                                <Typography variant="caption" color="error.main" fontWeight="600">
                                                                    ⚠️ Duplicate of receipt submitted by {receipt.duplicateOf.submitted_by || 'another user'}
                                                                </Typography>
                                                                <Typography variant="caption" display="block" color="text.secondary">
                                                                    Original ID: {receipt.duplicateOf.receipt_id || 'Unknown'} • 
                                                                    Match: {receipt.duplicateOf.match_type || receipt.duplicateOf.type || 'DUPLICATE'} ({receipt.duplicateOf.confidence || 100}% confidence)
                                                                </Typography>
                                                            </Box>
                                                        )}
                                                        {/* Show issues/warnings for flagged receipts */}
                                                        {(isFlagged || needsReview) && receipt.issues && receipt.issues.length > 0 && (
                                                            <Box sx={{ 
                                                                mt: 0.5, 
                                                                p: 1, 
                                                                bgcolor: isFlagged ? alpha(theme.palette.error.main, 0.1) : alpha(theme.palette.warning.main, 0.1),
                                                                borderRadius: 1,
                                                                display: 'flex',
                                                                alignItems: 'flex-start',
                                                                gap: 0.5
                                                            }}>
                                                                <WarningIcon sx={{ fontSize: 16, color: isFlagged ? 'error.main' : 'warning.main', mt: 0.2 }} />
                                                                <Typography variant="caption" color={isFlagged ? 'error.main' : 'warning.main'}>
                                                                    {receipt.issues.join(' • ')}
                                                                </Typography>
                                                            </Box>
                                                        )}
                                                    </Box>
                                                }
                                                secondaryTypographyProps={{ component: 'div' }}
                                            />
                                        </ListItem>
                                    </React.Fragment>
                                );
                            })}
                        </List>
                    )}
                </Paper>
            </Box>
        </Box>
    );
};

export default CabReceiptUploader;
