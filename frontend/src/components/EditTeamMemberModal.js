import React, { useState, useEffect } from 'react';
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField,
    Grid, CircularProgress, Typography, FormControl, InputLabel, Select, MenuItem,
    Chip, Box, OutlinedInput, Switch, FormControlLabel
} from '@mui/material';

const SKILLS_OPTIONS = ['Photography', 'Videography', 'Lighting', 'Directing', 'Sound', 'Editing', 'Drone Operation', 'Other'];
const ROLE_OPTIONS = { 'crew': 'Crew', 'editor': 'Editor', 'data-manager': 'Data Manager' };

const EditTeamMemberModal = ({ open, onClose, onSubmit, member }) => {
    const [name, setName] = useState('');
    const [role, setRole] = useState('crew');
    const [skills, setSkills] = useState([]);
    const [otherSkills, setOtherSkills] = useState('');
    const [availability, setAvailability] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (member) {
            const predefinedSkills = member.skills?.filter(s => SKILLS_OPTIONS.includes(s)) || [];
            const customSkills = member.skills?.filter(s => !SKILLS_OPTIONS.includes(s)) || [];
            
            setName(member.name || '');
            setRole(member.role || 'crew');
            setSkills(customSkills.length > 0 ? [...predefinedSkills, 'Other'] : predefinedSkills);
            setOtherSkills(customSkills.join(', '));
            setAvailability(member.availability === false ? false : true);
        }
    }, [member]);

    const handleSkillChange = (event) => {
        const { target: { value } } = event;
        setSkills(typeof value === 'string' ? value.split(',') : value);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        const customSkills = otherSkills.split(',').map(s => s.trim()).filter(s => s);
        const finalSkills = [...new Set([...skills.filter(s => s !== 'Other'), ...customSkills])];

        if (!name || !role || finalSkills.length === 0) {
            setError('Name, role, and at least one skill are required.');
            return;
        }
        setLoading(true);
        try {
            await onSubmit(member.id, { name, role, skills: finalSkills, availability });
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>Edit Team Member: {member?.name}</DialogTitle>
            <form onSubmit={handleSubmit}>
                <DialogContent>
                    {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
                    <Grid container spacing={2} sx={{mt: 1}}>
                        <Grid item xs={12}><TextField required fullWidth label="Full Name" value={name} onChange={e => setName(e.target.value)} autoFocus /></Grid>
                        <Grid item xs={12}>
                            <FormControl fullWidth required>
                                <InputLabel>Role</InputLabel>
                                <Select value={role} label="Role" onChange={e => setRole(e.target.value)}>
                                    {Object.entries(ROLE_OPTIONS).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <FormControl fullWidth required>
                                <InputLabel>Skills</InputLabel>
                                <Select multiple value={skills} onChange={handleSkillChange} input={<OutlinedInput label="Skills" />}
                                    renderValue={(selected) => (<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{selected.map((value) => <Chip key={value} label={value} />)}</Box>)}>
                                    {SKILLS_OPTIONS.map(skill => <MenuItem key={skill} value={skill}>{skill}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        {skills.includes('Other') && (
                            <Grid item xs={12}>
                                <TextField fullWidth label="Other Skills (comma-separated)" value={otherSkills} onChange={e => setOtherSkills(e.target.value)} />
                            </Grid>
                        )}
                        <Grid item xs={12}>
                            <FormControlLabel control={<Switch checked={availability} onChange={(e) => setAvailability(e.target.checked)} />} label="Is Available" />
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

export default EditTeamMemberModal;
