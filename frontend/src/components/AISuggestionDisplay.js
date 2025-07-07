import React from 'react';
import { Box, Typography, Card, CardContent, Chip, Grid, CircularProgress, Button, CardActions } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import SettingsIcon from '@mui/icons-material/Settings';

const AISuggestionDisplay = ({ eventId, suggestions, loading, error, onAssign, onManualAssign }) => {
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
        // Handle both string and object types from the backend
        if (typeof suggestions === 'string') {
            parsedSuggestions = JSON.parse(suggestions);
        } else if (typeof suggestions === 'object') {
            parsedSuggestions = suggestions;
        } else {
            throw new Error('Invalid suggestions format');
        }
    } catch (e) {
        console.error('Error parsing AI suggestions:', e, 'Raw suggestions:', suggestions);
        return <Typography color="error" sx={{ mt: 2 }}>Error: Could not parse AI response.</Typography>;
    }

    return (
        <Box sx={{ mt: 3, p: 2, border: '1px dashed grey', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">AI-Powered Team Suggestions</Typography>
                <Button 
                    variant="outlined" 
                    startIcon={<SettingsIcon />} 
                    onClick={onManualAssign}
                    size="small"
                >
                    Manual Assignment
                </Button>
            </Box>
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
                            <CardActions>
                                <Button 
                                    size="small" 
                                    startIcon={<PersonAddIcon />}
                                    onClick={() => onAssign && suggestion.userId && onAssign(eventId, [{
                                        userId: suggestion.userId,
                                        name: suggestion.name,
                                        role: suggestion.role,
                                        skills: suggestion.skills || []
                                    }])}
                                    disabled={!suggestion.userId}
                                >
                                    Assign
                                </Button>
                            </CardActions>
                        </Card>
                    </Grid>
                ))}
            </Grid>
            
            {parsedSuggestions.suggestions?.length > 0 && (
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                    <Button 
                        variant="contained" 
                        startIcon={<PersonAddIcon />}
                        onClick={() => onAssign && onAssign(eventId, parsedSuggestions.suggestions.filter(s => s.userId).map(s => ({
                            userId: s.userId,
                            name: s.name,
                            role: s.role,
                            skills: s.skills || []
                        })))}
                        disabled={!parsedSuggestions.suggestions.some(s => s.userId)}
                    >
                        Assign All Suggested Members
                    </Button>
                </Box>
            )}
        </Box>
    );
};

export default AISuggestionDisplay;
