import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Typography, CircularProgress, Alert, Paper, Grid } from '@mui/material';
import StreamCard from '../components/postprod/StreamCard';
import ActivityFeed from '../components/postprod/ActivityFeed';
import { getOverview, initPostprod } from '../api/postprod.api';
import { POSTPROD_ENABLED } from '../config';

const PostProdPanel = () => {
    const { eventId } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchOverview = async () => {
        if (!POSTPROD_ENABLED) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);
            setError(null);
            const overviewData = await getOverview(eventId);
            setData(overviewData);
        } catch (err) {
            console.error("Failed to load post-production overview:", err);
            // If job is not initialized, try to initialize it automatically
            if (err?.response?.status === 404) {
                try {
                    await initPostprod(eventId, {});
                    const overviewData = await getOverview(eventId);
                    setData(overviewData);
                    setError(null);
                } catch (e2) {
                    // If init fails (e.g., not admin), show the original guidance
                    setError("Post-Production not initialized. Ask Data Manager to approve intake.");
                }
            } else {
                setError('Failed to load post-production overview. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOverview();
    }, [eventId]);

    if (!POSTPROD_ENABLED) {
        return <Alert severity="warning">Post-production feature is currently disabled.</Alert>;
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return <Alert severity="error">{error}</Alert>;
    }

    // Backend uses singular keys: photo, video
    const photoState = data?.photo?.state || 'NOT_STARTED';
    const videoState = data?.video?.state || 'NOT_STARTED';

    return (
        <Box sx={{ p: 3 }}>
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h4" gutterBottom>
                    Post-Production Panel
                </Typography>
                <Typography variant="h6" color="text.secondary">
                    Photos: {photoState} • Video: {videoState}
                </Typography>
            </Paper>

            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 6 }}>
                    {/* pass singular key and stream */}
                    <StreamCard eventId={eventId} stream="photo" data={data?.photo} refresh={fetchOverview} />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                    <StreamCard eventId={eventId} stream="video" data={data?.video} refresh={fetchOverview} />
                </Grid>
                <Grid size={{ xs: 12 }}>
                    <ActivityFeed eventId={eventId} />
                </Grid>
            </Grid>
        </Box>
    );
};

export default PostProdPanel;
