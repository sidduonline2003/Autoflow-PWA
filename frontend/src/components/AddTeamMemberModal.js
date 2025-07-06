import React, { useState } from 'react';
import {
    Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField,
    Grid, CircularProgress, Typography, FormControl, InputLabel, Select, MenuItem,
    Chip, Box, OutlinedInput, IconButton
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import toast from 'react-hot-toast';

const SKILLS_OPTIONS = ['Photography', 'Videography', 'Lighting', 'Directing', 'Sound', 'Editing', 'Drone Operation', 'Other'];
const ROLE_OPTIONS = { 'crew': 'Crew', 'editor': 'Editor', 'data-manager': 'Data Manager' };

const AddTeamMemberModal = ({ open, onClose, onSubmit }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState('crew');
    const [skills, setSkills] = useState([]);
    const [otherSkills, setOtherSkills] = useState(''); // New state for custom skills text
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [inviteLink, setInviteLink] = useState('');

    const handleSkillChange = (event) => {
        const { target: { value } } = event;
        setSkills(typeof value === 'string' ? value.split(',') : value);
    };

    const resetForm = () => {
        setName(''); setEmail(''); setRole('crew'); setSkills([]); setOtherSkills(''); setError(''); setInviteLink('');
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        // Combine predefined skills with comma-separated custom skills
        const customSkills = otherSkills.split(',').map(s => s.trim()).filter(s => s);
        const finalSkills = [...new Set([...skills.filter(s => s !== 'Other'), ...customSkills])];

        if (!name || !email || !role || finalSkills.length === 0) {
            setError('All fields, including at least one skill, are required.');
            return;
        }
        setLoading(true);
        try {
            const result = await onSubmit({ name, email, role, skills: finalSkills });
            const joinUrl = `${window.location.origin}/join/${result.orgId}/${result.inviteId}`;
            setInviteLink(joinUrl);
            toast.success('Invite link created!');
        } catch (err) {
            toast.error(err.message);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(inviteLink);
            toast.success('Invite link copied!');
        } else {
            toast.error('Clipboard not supported in this environment.');
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
            <DialogTitle>{inviteLink ? 'Invite Link Created' : 'Invite New Team Member'}</DialogTitle>
            
            {inviteLink ? (
                <DialogContent>
                    <Typography gutterBottom>Share this link with the new team member to join your organization.</Typography>
                    <Box sx={{ mt: 2, p: 2, border: '1px solid #ccc', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography sx={{ overflowX: 'auto' }}>{inviteLink}</Typography>
                        <IconButton onClick={copyToClipboard}><ContentCopyIcon /></IconButton>
                    </Box>
                </DialogContent>
            ) : (
                <form onSubmit={handleSubmit}>
                    <DialogContent>
                        {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
                        <Grid container spacing={2} sx={{mt: 1}}>
                            <Grid item xs={12}><TextField required fullWidth label="Full Name" value={name} onChange={e => setName(e.target.value)} autoFocus /></Grid>
                            <Grid item xs={12}><TextField required fullWidth label="Email Address" type="email" value={email} onChange={e => setEmail(e.target.value)} /></Grid>
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
                        </Grid>
                    </DialogContent>
                    <DialogActions sx={{ p: '0 24px 20px' }}>
                        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
                        <Button type="submit" variant="contained" disabled={loading}>
                            {loading ? <CircularProgress size={24} /> : 'Create Invite Link'}
                        </Button>
                    </DialogActions>
                </form>
            )}

            {inviteLink && <DialogActions sx={{p: '0 24px 20px'}}><Button onClick={handleClose} variant="contained">Done</Button></DialogActions>}
        </Dialog>
    );
};

export default AddTeamMemberModal;
