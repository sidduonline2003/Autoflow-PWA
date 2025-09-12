import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Typography,
    Box,
    Grid,
    Card,
    CardContent,
    Chip,
    LinearProgress,
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Alert,
    Divider,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    ExpandMore as ExpandMoreIcon,
    Warning as WarningIcon,
    CheckCircle as CheckCircleIcon,
    Error as ErrorIcon,
    Info as InfoIcon,
    Security as SecurityIcon,
    ImageSearch as ImageSearchIcon,
    Fingerprint as FingerprintIcon,
    Assessment as AssessmentIcon,
    Visibility as VisibilityIcon,
    Close as CloseIcon
} from '@mui/icons-material';

const AdvancedReceiptAnalysisDialog = ({ open, onClose, receiptId }) => {
    const [analysisData, setAnalysisData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open && receiptId) {
            fetchDetailedAnalysis();
        }
    }, [open, receiptId]);

    const fetchDetailedAnalysis = async () => {
        setLoading(true);
        setError('');
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/receipts/${receiptId}/admin/analysis`, {
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setAnalysisData(data);
            } else {
                setError('Failed to load detailed analysis');
            }
        } catch (err) {
            console.error('Error fetching analysis:', err);
            setError('Error loading analysis data');
        } finally {
            setLoading(false);
        }
    };

    const getRiskLevelColor = (level) => {
        switch (level) {
            case 'VERY_LOW_RISK': return 'success';
            case 'LOW_RISK': return 'success';
            case 'MEDIUM_RISK': return 'warning';
            case 'HIGH_RISK': return 'error';
            default: return 'default';
        }
    };

    const getManipulationLevelColor = (level) => {
        switch (level) {
            case 'NO_MANIPULATION': return 'success';
            case 'LOW_MANIPULATION': return 'warning';
            case 'MEDIUM_MANIPULATION': return 'warning';
            case 'HIGH_MANIPULATION': return 'error';
            default: return 'default';
        }
    };

    const renderManipulationAnalysis = () => {
        if (!analysisData?.manipulation_analysis) return null;

        const { ela_analysis, ghost_analysis, noise_analysis, overall_summary } = analysisData.manipulation_analysis;

        return (
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <SecurityIcon />
                        <Typography variant="h6">Image Manipulation Analysis</Typography>
                        <Chip
                            label={overall_summary.is_manipulated ? 'MANIPULATION DETECTED' : 'NO MANIPULATION'}
                            color={overall_summary.is_manipulated ? 'error' : 'success'}
                            size="small"
                        />
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <Grid container spacing={3}>
                        {/* ELA Analysis */}
                        <Grid item xs={12} md={4}>
                            <Card>
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom>
                                        Error Level Analysis (ELA)
                                    </Typography>
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Manipulation Score: {ela_analysis.manipulation_score?.toFixed(1) || 0}/100
                                        </Typography>
                                        <LinearProgress
                                            variant="determinate"
                                            value={ela_analysis.manipulation_score || 0}
                                            color={getManipulationLevelColor(ela_analysis.manipulation_level)}
                                            sx={{ mt: 1, height: 8, borderRadius: 4 }}
                                        />
                                    </Box>
                                    <Chip
                                        label={ela_analysis.manipulation_level || 'Unknown'}
                                        color={getManipulationLevelColor(ela_analysis.manipulation_level)}
                                        size="small"
                                    />
                                    {ela_analysis.high_ela_regions_count > 0 && (
                                        <Alert severity="warning" sx={{ mt: 2 }}>
                                            {ela_analysis.high_ela_regions_count} high-difference regions detected
                                        </Alert>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* JPEG Ghost Analysis */}
                        <Grid item xs={12} md={4}>
                            <Card>
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom>
                                        JPEG Ghost Analysis
                                    </Typography>
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Ghost Score: {ghost_analysis.ghost_score?.toFixed(1) || 0}/100
                                        </Typography>
                                        <LinearProgress
                                            variant="determinate"
                                            value={ghost_analysis.ghost_score || 0}
                                            color={ghost_analysis.ghost_detected ? 'warning' : 'success'}
                                            sx={{ mt: 1, height: 8, borderRadius: 4 }}
                                        />
                                    </Box>
                                    <Chip
                                        label={ghost_analysis.ghost_detected ? 'GHOSTS DETECTED' : 'NO GHOSTS'}
                                        color={ghost_analysis.ghost_detected ? 'warning' : 'success'}
                                        size="small"
                                    />
                                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                                        Irregularity: {ghost_analysis.irregularity_measure?.toFixed(2) || 0}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Noise Analysis */}
                        <Grid item xs={12} md={4}>
                            <Card>
                                <CardContent>
                                    <Typography variant="subtitle1" gutterBottom>
                                        Noise Pattern Analysis
                                    </Typography>
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="body2" color="text.secondary">
                                            Suspicion Score: {noise_analysis.noise_suspicion_score?.toFixed(1) || 0}/100
                                        </Typography>
                                        <LinearProgress
                                            variant="determinate"
                                            value={noise_analysis.noise_suspicion_score || 0}
                                            color={noise_analysis.suspicious_noise ? 'warning' : 'success'}
                                            sx={{ mt: 1, height: 8, borderRadius: 4 }}
                                        />
                                    </Box>
                                    <Chip
                                        label={noise_analysis.suspicious_noise ? 'SUSPICIOUS NOISE' : 'NORMAL NOISE'}
                                        color={noise_analysis.suspicious_noise ? 'warning' : 'success'}
                                        size="small"
                                    />
                                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                                        Blocks analyzed: {noise_analysis.noise_blocks_analyzed || 0}
                                    </Typography>
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    {/* Overall Summary */}
                    <Box sx={{ mt: 3 }}>
                        <Typography variant="subtitle1" gutterBottom>
                            Overall Assessment
                        </Typography>
                        <Alert 
                            severity={overall_summary.is_manipulated ? 'error' : 'success'}
                            icon={overall_summary.is_manipulated ? <ErrorIcon /> : <CheckCircleIcon />}
                        >
                            <Typography variant="body2">
                                <strong>Confidence: {overall_summary.confidence || 0}%</strong><br />
                                Combined manipulation score: {overall_summary.overall_score?.toFixed(1) || 0}/100<br />
                                {overall_summary.is_manipulated 
                                    ? 'This image shows signs of digital manipulation and requires careful review.'
                                    : 'This image appears to be authentic with no signs of manipulation.'
                                }
                            </Typography>
                        </Alert>
                    </Box>
                </AccordionDetails>
            </Accordion>
        );
    };

    const renderDuplicateAnalysis = () => {
        if (!analysisData?.duplicate_analysis) return null;

        const { matches_found, perceptual_hashes } = analysisData.duplicate_analysis;

        return (
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FingerprintIcon />
                        <Typography variant="h6">Duplicate Detection Analysis</Typography>
                        <Chip
                            label={`${matches_found.length} matches found`}
                            color={matches_found.length > 0 ? 'warning' : 'success'}
                            size="small"
                        />
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    {matches_found.length > 0 ? (
                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Submitted By</TableCell>
                                        <TableCell>Similarity Level</TableCell>
                                        <TableCell>Confidence</TableCell>
                                        <TableCell>Hash Distance</TableCell>
                                        <TableCell>Submitted At</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {matches_found.map((match, index) => (
                                        <TableRow key={index}>
                                            <TableCell>{match.submitted_by}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={match.similarity_level}
                                                    color={
                                                        match.similarity_level === 'EXACT_DUPLICATE' ? 'error' :
                                                        match.similarity_level === 'NEAR_DUPLICATE' ? 'warning' : 'info'
                                                    }
                                                    size="small"
                                                />
                                            </TableCell>
                                            <TableCell>{match.confidence}%</TableCell>
                                            <TableCell>{match.min_distance}</TableCell>
                                            <TableCell>
                                                {new Date(match.submitted_at).toLocaleDateString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        <Alert severity="success">
                            No duplicate or similar images found in the database.
                        </Alert>
                    )}

                    {/* Hash Fingerprints */}
                    <Box sx={{ mt: 3 }}>
                        <Typography variant="subtitle1" gutterBottom>
                            Image Fingerprints
                        </Typography>
                        <Grid container spacing={2}>
                            {Object.entries(perceptual_hashes).map(([hashType, hashValue]) => (
                                <Grid item xs={12} md={6} key={hashType}>
                                    <Box sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                                        <Typography variant="body2" fontWeight="bold">
                                            {hashType.toUpperCase()}
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                            {hashValue || 'Not available'}
                                        </Typography>
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </Box>
                </AccordionDetails>
            </Accordion>
        );
    };

    const renderRiskAssessment = () => {
        if (!analysisData?.risk_assessment) return null;

        const { risk_score, risk_level, issues, recommendations, risk_factors } = analysisData.risk_assessment;

        return (
            <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AssessmentIcon />
                        <Typography variant="h6">Risk Assessment</Typography>
                        <Chip
                            label={`${risk_score}/100 - ${risk_level}`}
                            color={getRiskLevelColor(risk_level)}
                            size="small"
                        />
                    </Box>
                </AccordionSummary>
                <AccordionDetails>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="subtitle1" gutterBottom>
                                Risk Score Breakdown
                            </Typography>
                            <Box sx={{ mb: 2 }}>
                                <LinearProgress
                                    variant="determinate"
                                    value={risk_score}
                                    color={getRiskLevelColor(risk_level)}
                                    sx={{ height: 12, borderRadius: 6 }}
                                />
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                    {risk_score}/100 - {risk_level.replace('_', ' ')}
                                </Typography>
                            </Box>

                            {issues.length > 0 && (
                                <Box sx={{ mb: 2 }}>
                                    <Typography variant="subtitle2" color="error" gutterBottom>
                                        Issues Detected:
                                    </Typography>
                                    <List dense>
                                        {issues.map((issue, index) => (
                                            <ListItem key={index}>
                                                <ListItemIcon>
                                                    <WarningIcon color="warning" fontSize="small" />
                                                </ListItemIcon>
                                                <ListItemText primary={issue} />
                                            </ListItem>
                                        ))}
                                    </List>
                                </Box>
                            )}
                        </Grid>

                        <Grid item xs={12} md={6}>
                            {recommendations.length > 0 && (
                                <Box>
                                    <Typography variant="subtitle2" color="primary" gutterBottom>
                                        Recommendations:
                                    </Typography>
                                    <List dense>
                                        {recommendations.map((rec, index) => (
                                            <ListItem key={index}>
                                                <ListItemIcon>
                                                    <InfoIcon color="info" fontSize="small" />
                                                </ListItemIcon>
                                                <ListItemText primary={rec} />
                                            </ListItem>
                                        ))}
                                    </List>
                                </Box>
                            )}
                        </Grid>
                    </Grid>

                    {/* Risk Factors Detail */}
                    {risk_factors && (
                        <Box sx={{ mt: 3 }}>
                            <Typography variant="subtitle1" gutterBottom>
                                Detailed Risk Factors
                            </Typography>
                            <Grid container spacing={2}>
                                {Object.entries(risk_factors).map(([factor, data]) => (
                                    <Grid item xs={12} md={4} key={factor}>
                                        <Card variant="outlined">
                                            <CardContent>
                                                <Typography variant="subtitle2" gutterBottom>
                                                    {factor.replace('_', ' ').toUpperCase()}
                                                </Typography>
                                                <Box sx={{ fontSize: '0.875rem' }}>
                                                    {typeof data === 'object' ? 
                                                        Object.entries(data).map(([key, value]) => (
                                                            <Typography key={key} variant="caption" display="block">
                                                                {key}: {typeof value === 'boolean' ? (value ? '✓' : '✗') : String(value)}
                                                            </Typography>
                                                        )) :
                                                        <Typography variant="caption">{String(data)}</Typography>
                                                    }
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                        </Box>
                    )}
                </AccordionDetails>
            </Accordion>
        );
    };

    if (loading) {
        return (
            <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
                <DialogTitle>Loading Analysis...</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                        <LinearProgress sx={{ width: '100%' }} />
                    </Box>
                </DialogContent>
            </Dialog>
        );
    }

    if (error) {
        return (
            <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
                <DialogTitle color="error">Error Loading Analysis</DialogTitle>
                <DialogContent>
                    <Alert severity="error">{error}</Alert>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Close</Button>
                    <Button onClick={fetchDetailedAnalysis} variant="contained">Retry</Button>
                </DialogActions>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
            <DialogTitle>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h5">
                        Advanced Receipt Analysis
                    </Typography>
                    <IconButton onClick={onClose}>
                        <CloseIcon />
                    </IconButton>
                </Box>
            </DialogTitle>
            
            <DialogContent>
                {analysisData && (
                    <Box sx={{ mb: 3 }}>
                        {/* Basic Info */}
                        <Card sx={{ mb: 2 }}>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Receipt Information
                                </Typography>
                                <Grid container spacing={2}>
                                    <Grid item xs={12} md={3}>
                                        <Typography variant="body2" color="text.secondary">Submitted By</Typography>
                                        <Typography variant="body1">{analysisData.basic_info.submitted_by}</Typography>
                                    </Grid>
                                    <Grid item xs={12} md={3}>
                                        <Typography variant="body2" color="text.secondary">Event ID</Typography>
                                        <Typography variant="body1">{analysisData.basic_info.event_id}</Typography>
                                    </Grid>
                                    <Grid item xs={12} md={3}>
                                        <Typography variant="body2" color="text.secondary">Upload Time</Typography>
                                        <Typography variant="body1">
                                            {new Date(analysisData.basic_info.upload_time).toLocaleString()}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={12} md={3}>
                                        <Typography variant="body2" color="text.secondary">File Size</Typography>
                                        <Typography variant="body1">
                                            {(analysisData.basic_info.file_info.size / 1024 / 1024).toFixed(2)} MB
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </CardContent>
                        </Card>

                        {/* Analysis Sections */}
                        {renderManipulationAnalysis()}
                        {renderDuplicateAnalysis()}
                        {renderRiskAssessment()}
                    </Box>
                )}
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} variant="outlined">
                    Close
                </Button>
                <Button variant="contained" startIcon={<VisibilityIcon />}>
                    View Original Image
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AdvancedReceiptAnalysisDialog;
