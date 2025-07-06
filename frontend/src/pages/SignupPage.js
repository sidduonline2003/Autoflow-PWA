import React, { useState } from 'react';
import { Container, Typography, Box, TextField, Button, Grid, Link, Divider, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import GoogleIcon from '@mui/icons-material/Google';

const SignupPage = () => {
    const [orgName, setOrgName] = useState('');
    const [orgAddress, setOrgAddress] = useState('');
    const [orgEmail, setOrgEmail] = useState('');
    const [orgPhone, setOrgPhone] = useState('');
    const [orgWebUrl, setOrgWebUrl] = useState('');
    const [adminEmail, setAdminEmail] = useState('');
    const [adminPassword, setAdminPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const registerOrganization = async (user) => {
        setLoading(true);
        try {
            const idToken = await user.getIdToken();
            await fetch(`/api/auth/register-organization`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({
                    uid: user.uid,
                    orgName, orgAddress, orgEmail, orgPhone, orgWebUrl
                }),
            });
            navigate('/');
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!orgName || !adminEmail || !adminPassword) { setError('Organization name, admin email, and password are required.'); return; }
        if (adminPassword.length < 6) { setError('Password must be at least 6 characters long.'); return; }
        setLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
            await registerOrganization(userCredential.user);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError('');
        if (!orgName) { setError('Please fill in your organization name before signing up with Google.'); return; }
        setLoading(true);
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            await registerOrganization(result.user);
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <Container maxWidth="sm">
            <Box sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {loading ? (
                    <>
                        <Typography variant="h6">Finalizing Account Setup...</Typography>
                        <CircularProgress sx={{ mt: 2 }} />
                    </>
                ) : (
                    <>
                        <Typography component="h1" variant="h4">Register Your Organization</Typography>
                        {error && <Typography color="error" sx={{ mt: 2, textAlign: 'center' }}>{error}</Typography>}
                        <Box component="form" onSubmit={handleEmailSubmit} noValidate sx={{ mt: 3, width: '100%' }}>
                            <Grid container spacing={2}>
                                <Grid item xs={12}><TextField required fullWidth label="Organization Name" value={orgName} onChange={(e) => setOrgName(e.target.value)} autoFocus /></Grid>
                                <Grid item xs={12} sm={6}><TextField fullWidth label="Contact Email" type="email" value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} /></Grid>
                                <Grid item xs={12} sm={6}><TextField fullWidth label="Contact Phone" value={orgPhone} onChange={(e) => setOrgPhone(e.target.value)} /></Grid>
                                <Grid item xs={12}><TextField fullWidth label="Address" value={orgAddress} onChange={(e) => setOrgAddress(e.target.value)} /></Grid>
                                <Grid item xs={12}><TextField fullWidth label="Website URL" value={orgWebUrl} onChange={(e) => setOrgWebUrl(e.target.value)} /></Grid>
                                <Grid item xs={12}><Divider sx={{ my: 1 }}>Admin Account</Divider></Grid>
                                <Grid item xs={12}><TextField required fullWidth label="Admin Email" type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} /></Grid>
                                <Grid item xs={12}><TextField required fullWidth label="Admin Password" type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} helperText="Password must be at least 6 characters."/></Grid>
                            </Grid>
                            <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 1 }}>Create Organization & Admin</Button>
                            <Button fullWidth variant="outlined" onClick={handleGoogleSignIn} startIcon={<GoogleIcon />}>Sign Up with Google</Button>
                            <Grid container justifyContent="flex-end" sx={{ mt: 2 }}><Grid item><Link href="/login" variant="body2">Already have an account? Sign in</Link></Grid></Grid>
                        </Box>
                    </>
                )}
            </Box>
        </Container>
    );
};

export default SignupPage;
