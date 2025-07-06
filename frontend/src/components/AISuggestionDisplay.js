import React from 'react';
import { Box, Typography, Card, CardContent, Chip, Grid, CircularProgress } from '@mui/material';

const AISuggestionDisplay = ({ suggestions, loading, error }) => {
    if (loading) {
        return <Box sx={{ display: 'flex', alignItems: 'center', mt: 2 }}><CircularProgress size={24} sx={{ mr: 1 }} /> <Typography>Getting AI suggestions...</Typography></Box>;
    }

    if (error) {
        return <Typography color="error" sx={{ mt: 2 }}>Error: {error}</Typography>;
    }

    if (!suggestions) {
        return null;
    }

    let parsedSuggestions = { reasoning: '', suggestions: [] };
    try {
        // The AI response is a stringified JSON, so we need to parse it.
        parsedSuggestions = JSON.parse(suggestions);
    } catch (e) {
        return <Typography color="error" sx={{ mt: 2 }}>Error: Could not parse AI response.</Typography>;
    }

    return (
        <Box sx={{ mt: 3, p: 2, border: '1px dashed grey', borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>AI-Powered Team Suggestions</Typography>
            <Typography variant="body2" sx={{ mb: 2, fontStyle: 'italic' }}>
                <strong>Reasoning:</strong> {parsedSuggestions.reasoning}
            </Typography>
            <Grid container spacing={2}>
                {parsedSuggestions.suggestions?.map((suggestion, index) => (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="h6">{suggestion.name}</Typography>
                                <Typography color="text.secondary" gutterBottom>{suggestion.role}</Typography>
                                <Chip label={`Confidence: ${suggestion.confidence}%`} color="primary" variant="outlined" />
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};

export default AISuggestionDisplay;
