import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, CircularProgress, Alert, Button,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    Grid, Chip, IconButton, Select, MenuItem, FormControl, InputLabel,
    FormHelperText, Divider, Card, CardContent
} from '@mui/material';
import {
    Edit as EditIcon,
    Add as AddIcon,
    Delete as DeleteIcon,
    Save as SaveIcon
} from '@mui/icons-material';
import { auth, db } from '../../firebase';
import { collection, query, getDocs, doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

// Helper to format currency
const formatCurrency = (amount, currency = 'INR') => {
    return new Intl.NumberFormat('en-IN', { 
        style: 'currency', 
        currency: currency,
        maximumFractionDigits: 2
    }).format(amount);
};

const SalaryProfilesManager = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [teamMembers, setTeamMembers] = useState([]);
    const [profiles, setProfiles] = useState({});
    
    // Modal states
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState(null);
    const [profileData, setProfileData] = useState({
        baseSalary: 0,
        frequency: 'monthly',
        allowances: [],
        deductions: [],
        taxRate: 0,
        tdsEnabled: false
    });
    
    // Line item states
    const [itemType, setItemType] = useState('allowance'); // 'allowance' or 'deduction'
    const [newItem, setNewItem] = useState({ key: '', label: '', amount: '', type: 'fixed' });
    const [tempAllowances, setTempAllowances] = useState([]);
    const [tempDeductions, setTempDeductions] = useState([]);

    // Fetch team members
    const fetchTeamMembers = async () => {
        try {
            setLoading(true);
            setError('');
            
            // Check if user is authenticated
            if (!auth.currentUser) {
                throw new Error('You are not authenticated. Please sign in again.');
            }
            
            // Get the ID token result to access custom claims
            const idTokenResult = await auth.currentUser.getIdTokenResult(true);
            const orgId = idTokenResult.claims.orgId;
            
            if (!orgId) throw new Error('Organization ID not found in user claims');
            
            console.log('Using organization ID:', orgId);
            
            const teamQuery = query(collection(db, 'organizations', orgId, 'team'));
            const snapshot = await getDocs(teamQuery);
            
            const members = [];
            snapshot.forEach(doc => {
                const memberData = doc.data();
                members.push({
                    id: doc.id,
                    name: memberData.name || 'Unnamed',
                    email: memberData.email || '',
                    role: memberData.role || 'crew',
                    availability: memberData.availability === undefined ? true : memberData.availability
                });
            });
            
            console.log(`Found ${members.length} team members`);
            setTeamMembers(members);
            
            // Fetch salary profiles for each member
            const profilesData = {};
            for (const member of members) {
                try {
                    const idToken = await auth.currentUser.getIdToken();
                    const response = await fetch(`/api/salaries/profiles/${member.id}`, {
                        headers: { 'Authorization': `Bearer ${idToken}` }
                    });
                    
                    if (response.ok) {
                        profilesData[member.id] = await response.json();
                    }
                } catch (error) {
                    console.error(`Error fetching profile for ${member.id}:`, error);
                    // Continue with other members even if one fails
                }
            }
            
            setProfiles(profilesData);
        } catch (error) {
            console.error('Error fetching team members:', error);
            setError(error.message);
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    // Handle editing a profile
    const handleEditProfile = (member) => {
        setSelectedMember(member);
        
        // If member has a profile, use it; otherwise use defaults
        if (profiles[member.id]) {
            const profile = profiles[member.id];
            setProfileData({
                baseSalary: profile.baseSalary || 0,
                frequency: profile.frequency || 'monthly',
                allowances: profile.allowances || [],
                deductions: profile.deductions || [],
                taxRate: profile.taxRate || 0,
                tdsEnabled: profile.tdsEnabled || false
            });
            setTempAllowances(profile.allowances || []);
            setTempDeductions(profile.deductions || []);
        } else {
            // Default values for new profile
            setProfileData({
                baseSalary: 0,
                frequency: 'monthly',
                allowances: [],
                deductions: [],
                taxRate: 0,
                tdsEnabled: false
            });
            setTempAllowances([]);
            setTempDeductions([]);
        }
        
        setIsProfileModalOpen(true);
    };

    // Handle adding a line item (allowance or deduction)
    const handleAddItem = () => {
        // Validate
        if (!newItem.key || !newItem.label || !newItem.amount) {
            toast.error('Please fill in all fields for the new item');
            return;
        }
        
        const amount = parseFloat(newItem.amount);
        if (isNaN(amount) || amount < 0) {
            toast.error('Amount must be a positive number');
            return;
        }
        
        const item = {
            ...newItem,
            amount: amount,
            key: newItem.key.replace(/\s+/g, '_').toLowerCase() // Ensure key is slug-like
        };
        
        // Add to the appropriate list
        if (itemType === 'allowance') {
            setTempAllowances([...tempAllowances, item]);
        } else {
            setTempDeductions([...tempDeductions, item]);
        }
        
        // Reset form
        setNewItem({ key: '', label: '', amount: '', type: 'fixed' });
    };

    // Handle removing a line item
    const handleRemoveItem = (type, index) => {
        if (type === 'allowance') {
            const newAllowances = [...tempAllowances];
            newAllowances.splice(index, 1);
            setTempAllowances(newAllowances);
        } else {
            const newDeductions = [...tempDeductions];
            newDeductions.splice(index, 1);
            setTempDeductions(newDeductions);
        }
    };

    // Handle saving the profile
    const handleSaveProfile = async () => {
        if (!selectedMember) return;
        
        try {
            const idToken = await auth.currentUser.getIdToken();
            
            const data = {
                ...profileData,
                allowances: tempAllowances,
                deductions: tempDeductions,
                baseSalary: parseFloat(profileData.baseSalary),
                taxRate: parseFloat(profileData.taxRate)
            };
            
            // Add name for new profiles
            if (!profiles[selectedMember.id]) {
                data.name = selectedMember.name;
                data.userId = selectedMember.id;
            }
            
            const endpoint = profiles[selectedMember.id]
                ? `/api/salaries/profiles/${selectedMember.id}`
                : '/api/salaries/profiles';
                
            const method = profiles[selectedMember.id] ? 'PUT' : 'POST';
            
            const response = await fetch(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                toast.success(`Salary profile ${profiles[selectedMember.id] ? 'updated' : 'created'} successfully!`);
                setIsProfileModalOpen(false);
                fetchTeamMembers(); // Refresh the data
            } else {
                const error = await response.json();
                throw new Error(error.detail || `Failed to ${profiles[selectedMember.id] ? 'update' : 'create'} salary profile`);
            }
        } catch (error) {
            console.error('Error saving salary profile:', error);
            toast.error(error.message);
        }
    };

    // Initialize data fetch
    useEffect(() => {
        fetchTeamMembers();
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (error) {
        return <Alert severity="error">{error}</Alert>;
    }

    return (
        <Box>
            <Typography variant="h6" gutterBottom>Team Salary Profiles</Typography>
            
            {teamMembers.length === 0 ? (
                <Alert severity="info">No team members found.</Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Role</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Base Salary</TableCell>
                                <TableCell>Allowances</TableCell>
                                <TableCell>Deductions</TableCell>
                                <TableCell>Tax</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {teamMembers.map((member) => {
                                const profile = profiles[member.id];
                                return (
                                    <TableRow key={member.id}>
                                        <TableCell>{member.name}</TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={member.role} 
                                                size="small"
                                                color={member.role === 'admin' ? 'primary' : 'default'}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={member.availability ? 'Active' : 'Inactive'} 
                                                size="small"
                                                color={member.availability ? 'success' : 'error'}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            {profile 
                                                ? formatCurrency(profile.baseSalary || 0)
                                                : '—'}
                                        </TableCell>
                                        <TableCell>
                                            {profile && profile.allowances && profile.allowances.length > 0
                                                ? profile.allowances.length
                                                : '—'}
                                        </TableCell>
                                        <TableCell>
                                            {profile && profile.deductions && profile.deductions.length > 0
                                                ? profile.deductions.length
                                                : '—'}
                                        </TableCell>
                                        <TableCell>
                                            {profile && profile.tdsEnabled
                                                ? `${profile.taxRate}%`
                                                : 'No TDS'}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Button 
                                                startIcon={profile ? <EditIcon /> : <AddIcon />}
                                                variant="outlined"
                                                size="small"
                                                onClick={() => handleEditProfile(member)}
                                            >
                                                {profile ? 'Edit' : 'Add'}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Profile Edit/Create Modal */}
            <Dialog 
                open={isProfileModalOpen} 
                onClose={() => setIsProfileModalOpen(false)}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    {profiles[selectedMember?.id] 
                        ? `Edit Salary Profile: ${selectedMember?.name}`
                        : `Create Salary Profile: ${selectedMember?.name}`}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <Grid container spacing={3}>
                            {/* Basic Salary Information */}
                            <Grid item xs={12} md={6}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="h6" gutterBottom>Basic Salary</Typography>
                                        <Grid container spacing={2}>
                                            <Grid item xs={12}>
                                                <TextField
                                                    label="Base Salary"
                                                    type="number"
                                                    fullWidth
                                                    value={profileData.baseSalary}
                                                    onChange={(e) => setProfileData({
                                                        ...profileData,
                                                        baseSalary: e.target.value
                                                    })}
                                                    InputProps={{ inputProps: { min: 0 } }}
                                                />
                                            </Grid>
                                            <Grid item xs={12}>
                                                <FormControl fullWidth>
                                                    <InputLabel>Frequency</InputLabel>
                                                    <Select
                                                        value={profileData.frequency}
                                                        label="Frequency"
                                                        onChange={(e) => setProfileData({
                                                            ...profileData,
                                                            frequency: e.target.value
                                                        })}
                                                    >
                                                        <MenuItem value="monthly">Monthly</MenuItem>
                                                        <MenuItem value="bi-weekly">Bi-Weekly</MenuItem>
                                                        <MenuItem value="weekly">Weekly</MenuItem>
                                                    </Select>
                                                </FormControl>
                                            </Grid>
                                        </Grid>
                                        
                                        <Box sx={{ mt: 3 }}>
                                            <Typography variant="h6" gutterBottom>Tax Settings</Typography>
                                            <Grid container spacing={2}>
                                                <Grid item xs={12}>
                                                    <FormControl fullWidth>
                                                        <InputLabel>TDS Enabled</InputLabel>
                                                        <Select
                                                            value={profileData.tdsEnabled}
                                                            label="TDS Enabled"
                                                            onChange={(e) => setProfileData({
                                                                ...profileData,
                                                                tdsEnabled: e.target.value
                                                            })}
                                                        >
                                                            <MenuItem value={true}>Yes</MenuItem>
                                                            <MenuItem value={false}>No</MenuItem>
                                                        </Select>
                                                        <FormHelperText>
                                                            Enable Tax Deducted at Source
                                                        </FormHelperText>
                                                    </FormControl>
                                                </Grid>
                                                
                                                {profileData.tdsEnabled && (
                                                    <Grid item xs={12}>
                                                        <TextField
                                                            label="Tax Rate (%)"
                                                            type="number"
                                                            fullWidth
                                                            value={profileData.taxRate}
                                                            onChange={(e) => setProfileData({
                                                                ...profileData,
                                                                taxRate: e.target.value
                                                            })}
                                                            InputProps={{ inputProps: { min: 0, max: 100 } }}
                                                            helperText="Percentage of tax to deduct"
                                                        />
                                                    </Grid>
                                                )}
                                            </Grid>
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                            
                            {/* Allowances and Deductions */}
                            <Grid item xs={12} md={6}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Box sx={{ mb: 3 }}>
                                            <Typography variant="h6" gutterBottom>
                                                Add {itemType === 'allowance' ? 'Allowance' : 'Deduction'}
                                            </Typography>
                                            <Grid container spacing={2}>
                                                <Grid item xs={12}>
                                                    <FormControl fullWidth>
                                                        <InputLabel>Item Type</InputLabel>
                                                        <Select
                                                            value={itemType}
                                                            label="Item Type"
                                                            onChange={(e) => setItemType(e.target.value)}
                                                        >
                                                            <MenuItem value="allowance">Allowance</MenuItem>
                                                            <MenuItem value="deduction">Deduction</MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                </Grid>
                                                <Grid item xs={12}>
                                                    <TextField
                                                        label="Key"
                                                        fullWidth
                                                        value={newItem.key}
                                                        onChange={(e) => setNewItem({
                                                            ...newItem,
                                                            key: e.target.value
                                                        })}
                                                        helperText="Unique identifier (e.g., hra, medical)"
                                                    />
                                                </Grid>
                                                <Grid item xs={12}>
                                                    <TextField
                                                        label="Label"
                                                        fullWidth
                                                        value={newItem.label}
                                                        onChange={(e) => setNewItem({
                                                            ...newItem,
                                                            label: e.target.value
                                                        })}
                                                        helperText="Display name (e.g., HRA, Medical Allowance)"
                                                    />
                                                </Grid>
                                                <Grid item xs={8}>
                                                    <TextField
                                                        label="Amount"
                                                        type="number"
                                                        fullWidth
                                                        value={newItem.amount}
                                                        onChange={(e) => setNewItem({
                                                            ...newItem,
                                                            amount: e.target.value
                                                        })}
                                                        InputProps={{ inputProps: { min: 0 } }}
                                                    />
                                                </Grid>
                                                <Grid item xs={4}>
                                                    <FormControl fullWidth>
                                                        <InputLabel>Type</InputLabel>
                                                        <Select
                                                            value={newItem.type}
                                                            label="Type"
                                                            onChange={(e) => setNewItem({
                                                                ...newItem,
                                                                type: e.target.value
                                                            })}
                                                        >
                                                            <MenuItem value="fixed">Fixed</MenuItem>
                                                            <MenuItem value="percentage">Percentage</MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                </Grid>
                                                <Grid item xs={12}>
                                                    <Button
                                                        variant="contained"
                                                        startIcon={<AddIcon />}
                                                        onClick={handleAddItem}
                                                        fullWidth
                                                    >
                                                        Add {itemType}
                                                    </Button>
                                                </Grid>
                                            </Grid>
                                        </Box>
                                        
                                        <Divider sx={{ my: 3 }} />
                                        
                                        {/* Display current allowances */}
                                        <Typography variant="h6" gutterBottom>
                                            Allowances ({tempAllowances.length})
                                        </Typography>
                                        {tempAllowances.length === 0 ? (
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                                No allowances defined
                                            </Typography>
                                        ) : (
                                            <Box sx={{ mb: 3 }}>
                                                {tempAllowances.map((item, index) => (
                                                    <Box 
                                                        key={`allowance-${index}`}
                                                        sx={{ 
                                                            display: 'flex', 
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            mb: 1,
                                                            p: 1,
                                                            border: '1px solid',
                                                            borderColor: 'divider',
                                                            borderRadius: 1
                                                        }}
                                                    >
                                                        <Box>
                                                            <Typography variant="body1">
                                                                {item.label}
                                                            </Typography>
                                                            <Typography variant="body2" color="text.secondary">
                                                                {item.type === 'fixed' 
                                                                    ? formatCurrency(item.amount)
                                                                    : `${item.amount}% of base`}
                                                            </Typography>
                                                        </Box>
                                                        <IconButton 
                                                            size="small"
                                                            color="error"
                                                            onClick={() => handleRemoveItem('allowance', index)}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Box>
                                                ))}
                                            </Box>
                                        )}
                                        
                                        {/* Display current deductions */}
                                        <Typography variant="h6" gutterBottom>
                                            Deductions ({tempDeductions.length})
                                        </Typography>
                                        {tempDeductions.length === 0 ? (
                                            <Typography variant="body2" color="text.secondary">
                                                No deductions defined
                                            </Typography>
                                        ) : (
                                            <Box>
                                                {tempDeductions.map((item, index) => (
                                                    <Box 
                                                        key={`deduction-${index}`}
                                                        sx={{ 
                                                            display: 'flex', 
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            mb: 1,
                                                            p: 1,
                                                            border: '1px solid',
                                                            borderColor: 'divider',
                                                            borderRadius: 1
                                                        }}
                                                    >
                                                        <Box>
                                                            <Typography variant="body1">
                                                                {item.label}
                                                            </Typography>
                                                            <Typography variant="body2" color="text.secondary">
                                                                {item.type === 'fixed' 
                                                                    ? formatCurrency(item.amount)
                                                                    : `${item.amount}% of base`}
                                                            </Typography>
                                                        </Box>
                                                        <IconButton 
                                                            size="small"
                                                            color="error"
                                                            onClick={() => handleRemoveItem('deduction', index)}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Box>
                                                ))}
                                            </Box>
                                        )}
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setIsProfileModalOpen(false)}>Cancel</Button>
                    <Button 
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={handleSaveProfile}
                    >
                        Save Profile
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default SalaryProfilesManager;
