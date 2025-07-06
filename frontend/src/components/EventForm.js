import React, { useState } from 'react';
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField,
    Grid, CircularProgress, Typography, FormControl, InputLabel, Select, MenuItem,
    Chip, Box, OutlinedInput
} from '@mui/material';

const SKILLS_OPTIONS = ['Photography', 'Videography', 'Lighting', 'Directing', 'Sound', 'Editing', 'Drone Operation', 'Other'];
const EVENT_TYPES = ['Wedding', 'Corporate', 'Portrait', 'Product', 'Real Estate', 'Other'];
const PRIORITIES = ['High', 'Medium', 'Low'];

const EventForm = ({ open, onClose, onSubmit, clientName }) => {
    const [name, setName] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [venue, setVenue] = useState('');
    const [eventType, setEventType] = useState('');
    const [requiredSkills, setRequiredSkills] = useState([]);
    const [otherSkill, setOtherSkill] = useState(''); // State for custom skill
    const [priority, setPriority] = useState('Medium');
    const [estimatedDuration, setEstimatedDuration] = useState(0);
    const [expectedPhotos, setExpectedPhotos] = useState(0);
    const [specialRequirements, setSpecialRequirements] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSkillChange = (event) => {
        const { target: { value } } = event;
        setRequiredSkills(typeof value === 'string' ? value.split(',') : value);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        // Combine skills
        const finalSkills = [...requiredSkills.filter(s => s !== 'Other'), ...(otherSkill ? [otherSkill] : [])];

        if (!name || !date || !time || !venue || !eventType) {
            setError('Please fill all required fields.');
            return;
        }
        setLoading(true);
        try {
            await onSubmit({ name, date, time, venue, eventType, requiredSkills: finalSkills, priority, estimatedDuration, expectedPhotos, specialRequirements });
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>Create New Event for {clientName}</DialogTitle>
            <form onSubmit={handleSubmit}>
                <DialogContent>
                    {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}><TextField required fullWidth label="Event Name" value={name} onChange={e => setName(e.target.value)} /></Grid>
                        <Grid item xs={6}><TextField required fullWidth label="Date" type="date" InputLabelProps={{ shrink: true }} value={date} onChange={e => setDate(e.target.value)} /></Grid>
                        <Grid item xs={6}><TextField required fullWidth label="Time" type="time" InputLabelProps={{ shrink: true }} value={time} onChange={e => setTime(e.target.value)} /></Grid>
                        <Grid item xs={12}><TextField required fullWidth label="Venue Address" value={venue} onChange={e => setVenue(e.target.value)} /></Grid>
                        <Grid item xs={12} sm={6}><FormControl fullWidth required><InputLabel>Event Type</InputLabel><Select value={eventType} label="Event Type" onChange={e => setEventType(e.target.value)}>{EVENT_TYPES.map(type => <MenuItem key={type} value={type}>{type}</MenuItem>)}</Select></FormControl></Grid>
                        <Grid item xs={12} sm={6}><FormControl fullWidth required><InputLabel>Priority</InputLabel><Select value={priority} label="Priority" onChange={e => setPriority(e.target.value)}>{PRIORITIES.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}</Select></FormControl></Grid>
                        <Grid item xs={12}>
                            <FormControl fullWidth>
                                <InputLabel>Required Skills</InputLabel>
                                <Select multiple value={requiredSkills} onChange={handleSkillChange} input={<OutlinedInput label="Required Skills" />} renderValue={(selected) => (<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{selected.map((value) => <Chip key={value} label={value} />)}</Box>)}>{SKILLS_OPTIONS.map(skill => <MenuItem key={skill} value={skill}>{skill}</MenuItem>)}</Select>
                            </FormControl>
                        </Grid>
                        {requiredSkills.includes('Other') && (
                            <Grid item xs={12}>
                                <TextField fullWidth label="Please specify other skill(s)" value={otherSkill} onChange={e => setOtherSkill(e.target.value)} />
                            </Grid>
                        )}
                        <Grid item xs={6}><TextField fullWidth label="Estimated Duration (hours)" type="number" value={estimatedDuration} onChange={e => setEstimatedDuration(parseInt(e.target.value, 10))} /></Grid>
                        <Grid item xs={6}><TextField fullWidth label="Expected Photos" type="number" value={expectedPhotos} onChange={e => setExpectedPhotos(parseInt(e.target.value, 10))} /></Grid>
                        <Grid item xs={12}><TextField fullWidth multiline rows={3} label="Special Requirements" value={specialRequirements} onChange={e => setSpecialRequirements(e.target.value)} /></Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: '0 24px 20px' }}>
                    <Button onClick={onClose} disabled={loading}>Cancel</Button>
                    <Button type="submit" variant="contained" disabled={loading}>
                        {loading ? <CircularProgress size={24} /> : 'Create Event'}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default EventForm;
