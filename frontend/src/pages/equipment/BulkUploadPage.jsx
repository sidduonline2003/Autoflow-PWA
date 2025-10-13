import React, { useState, useCallback } from 'react';
import {
    Box,
    Container,
    Paper,
    Typography,
    Button,
    Alert,
    AlertTitle,
    CircularProgress,
    LinearProgress,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Card,
    CardContent,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Collapse,
    IconButton,
    Divider,
} from '@mui/material';
import {
    CloudUpload as UploadIcon,
    Download as DownloadIcon,
    CheckCircle as SuccessIcon,
    Error as ErrorIcon,
    Info as InfoIcon,
    ArrowBack as ArrowBackIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    Description as FileIcon,
    Warning as WarningIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { equipmentAPI } from '../../services/equipmentApi';
import toast from 'react-hot-toast';
import { useDropzone } from 'react-dropzone';

const BulkUploadPage = () => {
    const navigate = useNavigate();
    const [uploading, setUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [showInstructions, setShowInstructions] = useState(true);
    const [showErrors, setShowErrors] = useState(true);

    // Handle file selection with drag & drop
    const onDrop = useCallback((acceptedFiles) => {
        if (acceptedFiles && acceptedFiles.length > 0) {
            const file = acceptedFiles[0];
            
            // Validate file type
            if (!file.name.endsWith('.csv')) {
                toast.error('Please upload a CSV file');
                return;
            }

            setSelectedFile(file);
            setUploadResult(null);
            toast.success(`File selected: ${file.name}`);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
        },
        multiple: false,
    });

    // Download template
    const handleDownloadTemplate = async () => {
        try {
            toast.loading('Downloading template...', { id: 'download-template' });
            
            const response = await equipmentAPI.downloadBulkUploadTemplate();
            
            // The response.data is already a Blob when responseType: 'blob' is set
            const blob = response.data;
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'equipment_bulk_upload_template.csv';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            
            // Cleanup
            setTimeout(() => {
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }, 100);
            
            toast.success('Template downloaded successfully', { id: 'download-template' });
        } catch (error) {
            console.error('Template download error:', error);
            const errorMsg = error.response?.data?.detail || 'Failed to download template';
            toast.error(errorMsg, { id: 'download-template' });
        }
    };

    // Upload CSV
    const handleUpload = async () => {
        if (!selectedFile) {
            toast.error('Please select a CSV file first');
            return;
        }

        setUploading(true);
        setUploadResult(null);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await equipmentAPI.bulkUploadEquipment(formData);
            
            setUploadResult(response.data);
            
            if (response.data.success_count > 0) {
                toast.success(
                    `Successfully uploaded ${response.data.success_count} equipment items!`,
                    { duration: 5000 }
                );
            }
            
            if (response.data.failed_count > 0) {
                toast.error(
                    `${response.data.failed_count} items failed. Check errors below.`,
                    { duration: 5000 }
                );
            }
        } catch (error) {
            console.error('Upload error:', error);
            
            // Check if it's a network/timeout error
            if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || error.message === 'Network Error') {
                toast.error('Upload is taking longer than expected. Please check the Equipment Dashboard to verify if items were created.', { duration: 8000 });
                setUploadResult({
                    success: false,
                    message: 'Upload timed out or network error occurred. Items may have been created. Please check the Equipment Dashboard.',
                    success_count: 0,
                    failed_count: 0,
                    errors: ['Network timeout - please refresh the Equipment Dashboard to see if items were created']
                });
            } else {
                const errorMsg = error.response?.data?.detail || error.message || 'Upload failed';
                toast.error(errorMsg);
                setUploadResult({
                    success: false,
                    message: errorMsg,
                    success_count: 0,
                    failed_count: 0,
                    errors: [errorMsg]
                });
            }
        } finally {
            setUploading(false);
        }
    };

    // Clear selection
    const handleClear = () => {
        setSelectedFile(null);
        setUploadResult(null);
    };

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Button
                    startIcon={<ArrowBackIcon />}
                    onClick={() => navigate('/equipment')}
                    sx={{ mr: 2 }}
                >
                    Back
                </Button>
                <UploadIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                <Box>
                    <Typography variant="h4" fontWeight="bold">
                        Bulk Equipment Upload
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Upload equipment details in bulk using CSV file
                    </Typography>
                </Box>
            </Box>

            {/* Instructions Card */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <InfoIcon color="primary" sx={{ mr: 1 }} />
                            <Typography variant="h6">
                                How to Use Bulk Upload
                            </Typography>
                        </Box>
                        <IconButton onClick={() => setShowInstructions(!showInstructions)}>
                            {showInstructions ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                    </Box>
                    
                    <Collapse in={showInstructions}>
                        <List dense>
                            <ListItem>
                                <ListItemIcon><Typography color="primary" fontWeight="bold">1</Typography></ListItemIcon>
                                <ListItemText 
                                    primary="Download the CSV template"
                                    secondary="Click the 'Download Template' button below to get the sample CSV file"
                                />
                            </ListItem>
                            <ListItem>
                                <ListItemIcon><Typography color="primary" fontWeight="bold">2</Typography></ListItemIcon>
                                <ListItemText 
                                    primary="Fill in your equipment details"
                                    secondary="Open the template in Excel or Google Sheets and add your equipment data"
                                />
                            </ListItem>
                            <ListItem>
                                <ListItemIcon><Typography color="primary" fontWeight="bold">3</Typography></ListItemIcon>
                                <ListItemText 
                                    primary="Save as CSV format"
                                    secondary="Make sure to save the file as CSV (Comma-separated values)"
                                />
                            </ListItem>
                            <ListItem>
                                <ListItemIcon><Typography color="primary" fontWeight="bold">4</Typography></ListItemIcon>
                                <ListItemText 
                                    primary="Upload your CSV file"
                                    secondary="Drag & drop or click to select your completed CSV file"
                                />
                            </ListItem>
                        </List>

                        <Divider sx={{ my: 2 }} />

                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Required Fields:
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                            <Chip label="name" color="error" size="small" />
                            <Chip label="category" color="error" size="small" />
                        </Box>

                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Optional Fields:
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                            <Chip label="description" size="small" />
                            <Chip label="manufacturer" size="small" />
                            <Chip label="model" size="small" />
                            <Chip label="serialNumber" size="small" />
                            <Chip label="purchaseDate" size="small" />
                            <Chip label="purchasePrice" size="small" />
                            <Chip label="location" size="small" />
                            <Chip label="condition" size="small" />
                            <Chip label="notes" size="small" />
                        </Box>

                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Valid Categories:
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                            {['camera', 'lens', 'lighting', 'audio', 'tripod', 'gimbal', 'drone', 'monitor', 'storage', 'other'].map(cat => (
                                <Chip key={cat} label={cat} variant="outlined" size="small" />
                            ))}
                        </Box>

                        <Typography variant="subtitle2" fontWeight="bold" gutterBottom>
                            Valid Conditions:
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            {['excellent', 'good', 'fair', 'poor', 'needs_repair'].map(cond => (
                                <Chip key={cond} label={cond} variant="outlined" size="small" />
                            ))}
                        </Box>
                    </Collapse>
                </CardContent>
            </Card>

            {/* Download Template Button */}
            <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleDownloadTemplate}
                size="large"
                fullWidth
                sx={{ mb: 3 }}
            >
                Download CSV Template
            </Button>

            {/* File Upload Area */}
            <Paper
                {...getRootProps()}
                sx={{
                    p: 4,
                    mb: 3,
                    border: '2px dashed',
                    borderColor: isDragActive ? 'primary.main' : 'grey.300',
                    bgcolor: isDragActive ? 'action.hover' : 'background.paper',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                        borderColor: 'primary.main',
                        bgcolor: 'action.hover',
                    }
                }}
            >
                <input {...getInputProps()} />
                <UploadIcon sx={{ fontSize: 60, color: 'primary.main', mb: 2 }} />
                <Typography variant="h6" gutterBottom>
                    {isDragActive ? 'Drop your CSV file here' : 'Drag & drop your CSV file here'}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                    or click to browse files
                </Typography>
                {selectedFile && (
                    <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                        <FileIcon color="primary" />
                        <Typography variant="body1" fontWeight="medium">
                            {selectedFile.name}
                        </Typography>
                        <Chip 
                            label={`${(selectedFile.size / 1024).toFixed(2)} KB`} 
                            size="small" 
                            color="primary" 
                            variant="outlined"
                        />
                    </Box>
                )}
            </Paper>

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                <Button
                    variant="contained"
                    startIcon={uploading ? <CircularProgress size={20} color="inherit" /> : <UploadIcon />}
                    onClick={handleUpload}
                    disabled={!selectedFile || uploading}
                    size="large"
                    fullWidth
                >
                    {uploading ? 'Uploading...' : 'Upload Equipment'}
                </Button>
                <Button
                    variant="outlined"
                    onClick={handleClear}
                    disabled={!selectedFile || uploading}
                    size="large"
                >
                    Clear
                </Button>
            </Box>

            {/* Upload Progress */}
            {uploading && (
                <Paper sx={{ p: 2, mb: 3 }}>
                    <Typography variant="body2" gutterBottom>
                        Processing your CSV file...
                    </Typography>
                    <LinearProgress />
                </Paper>
            )}

            {/* Upload Result */}
            {uploadResult && (
                <Box>
                    {/* Summary */}
                    <Alert 
                        severity={uploadResult.success_count > 0 ? 'success' : 'error'} 
                        sx={{ mb: 3 }}
                    >
                        <AlertTitle>Upload Complete</AlertTitle>
                        {uploadResult.message}
                    </Alert>

                    {/* Statistics Cards */}
                    <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
                        <Card sx={{ flex: 1 }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <SuccessIcon color="success" sx={{ fontSize: 40, mb: 1 }} />
                                <Typography variant="h4" fontWeight="bold" color="success.main">
                                    {uploadResult.success_count}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Successfully Created
                                </Typography>
                            </CardContent>
                        </Card>

                        <Card sx={{ flex: 1 }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <ErrorIcon color="error" sx={{ fontSize: 40, mb: 1 }} />
                                <Typography variant="h4" fontWeight="bold" color="error.main">
                                    {uploadResult.failed_count}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Failed
                                </Typography>
                            </CardContent>
                        </Card>

                        <Card sx={{ flex: 1 }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <InfoIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
                                <Typography variant="h4" fontWeight="bold" color="primary.main">
                                    {uploadResult.total_rows}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Total Rows
                                </Typography>
                            </CardContent>
                        </Card>
                    </Box>

                    {/* Created Assets */}
                    {uploadResult.created_assets && uploadResult.created_assets.length > 0 && (
                        <Card sx={{ mb: 3 }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                                    <SuccessIcon color="success" sx={{ mr: 1 }} />
                                    Created Equipment ({uploadResult.total_created || uploadResult.created_assets.length})
                                </Typography>
                                {uploadResult.total_created > uploadResult.created_assets.length && (
                                    <Alert severity="info" sx={{ mb: 2 }}>
                                        Showing {uploadResult.created_assets.length} of {uploadResult.total_created} created items. 
                                        View all in Equipment Dashboard.
                                    </Alert>
                                )}
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                                    {uploadResult.created_assets.map((assetId) => (
                                        <Chip 
                                            key={assetId} 
                                            label={assetId} 
                                            color="success" 
                                            variant="outlined"
                                            size="small"
                                            onClick={() => navigate(`/equipment/${assetId}`)}
                                            sx={{ cursor: 'pointer' }}
                                        />
                                    ))}
                                </Box>
                            </CardContent>
                        </Card>
                    )}

                    {/* Errors */}
                    {uploadResult.errors && uploadResult.errors.length > 0 && (
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
                                        <ErrorIcon color="error" sx={{ mr: 1 }} />
                                        Errors ({uploadResult.total_errors || uploadResult.errors.length})
                                    </Typography>
                                    <IconButton onClick={() => setShowErrors(!showErrors)}>
                                        {showErrors ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                    </IconButton>
                                </Box>
                                
                                {uploadResult.total_errors > uploadResult.errors.length && (
                                    <Alert severity="warning" sx={{ mb: 2 }}>
                                        Showing {uploadResult.errors.length} of {uploadResult.total_errors} errors.
                                    </Alert>
                                )}
                                
                                <Collapse in={showErrors}>
                                    <TableContainer>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell width="60px">
                                                        <WarningIcon fontSize="small" color="error" />
                                                    </TableCell>
                                                    <TableCell>Error Details</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {uploadResult.errors.map((error, index) => (
                                                    <TableRow key={index}>
                                                        <TableCell>{index + 1}</TableCell>
                                                        <TableCell>
                                                            <Typography variant="body2" color="error">
                                                                {error}
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </Collapse>
                            </CardContent>
                        </Card>
                    )}

                    {/* Action Buttons After Upload */}
                    <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
                        <Button
                            variant="contained"
                            onClick={() => navigate('/equipment')}
                            fullWidth
                        >
                            View Equipment Dashboard
                        </Button>
                        <Button
                            variant="outlined"
                            onClick={handleClear}
                            fullWidth
                        >
                            Upload Another File
                        </Button>
                    </Box>
                </Box>
            )}
        </Container>
    );
};

export default BulkUploadPage;
