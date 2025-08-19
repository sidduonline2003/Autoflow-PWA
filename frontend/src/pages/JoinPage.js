import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    Container, Typography, Box, TextField, Button, CircularProgress, Paper, Divider
} from '@mui/material';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, fetchSignInMethodsForEmail, signInWithEmailAndPassword } from 'firebase/auth';
import GoogleIcon from '@mui/icons-material/Google';
import toast from 'react-hot-toast';

const JoinPage = () => {
    const { inviteId, orgId } = useParams();
    const navigate = useNavigate();
    const { user, claims } = useAuth();

    const [inviteData, setInviteData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [password, setPassword] = useState('');
    const [showLogin, setShowLogin] = useState(false);
    const [loginPassword, setLoginPassword] = useState('');

    useEffect(() => {
        const fetchInvite = async () => {
            try {
                const inviteDocRef = doc(db, 'organizations', orgId, 'invites', inviteId);
                const inviteDoc = await getDoc(inviteDocRef);
                if (inviteDoc.exists() && inviteDoc.data().status === 'pending') {
                    setInviteData(inviteDoc.data());
                    // Check if email is already registered
                    const methods = await fetchSignInMethodsForEmail(auth, inviteDoc.data().email);
                    if (methods && methods.length > 0) {
                        setShowLogin(true);
                    }
                } else {
                    setError('This invitation is invalid or has already been used.');
                }
            } catch (err) {
                setError('Failed to load invitation details.');
            } finally {
                setLoading(false);
            }
        };
        fetchInvite();
    }, [inviteId, orgId]);

    // Role-based redirect if already authenticated
    useEffect(() => {
        if (!user || !claims) return;
        const role = claims.role || (claims.admin ? 'admin' : undefined);
        if (!role) return;
        if (role === 'admin') navigate('/');
        else if (role === 'client') navigate('/client/dashboard');
        else if (role === 'data-manager') navigate('/data-manager');
        else if (['crew', 'editor'].includes(role)) navigate('/team/dashboard');
        else navigate('/');
    }, [user, claims, navigate]);


    const navigateByRole = (role) => {
        if (role === 'admin') navigate('/');
        else if (role === 'client') navigate('/client/dashboard');
        else if (role === 'data-manager') navigate('/data-manager');
        else if (['crew', 'editor'].includes(role)) navigate('/team/dashboard');
        else navigate('/');
    };

    const handleAcceptInvite = async (newUser) => {
        setLoading(true);
        try {
            const idToken = await newUser.getIdToken();
            await fetch(`/api/auth/accept-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
                body: JSON.stringify({ uid: newUser.uid, inviteId, orgId }),
            });
            // Refresh to get new custom claims, then route by role without reloading the page
            const idTokenResult = await newUser.getIdTokenResult(true);
            const role = idTokenResult.claims.role;
            toast.success(`Welcome to ${inviteData.orgName}!`);
            navigateByRole(role);
        } catch (err) {
            setError(err.message);
            toast.error(err.message);
            setLoading(false);
        }
    };

    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            return;
        }
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, inviteData.email, password);
            await handleAcceptInvite(userCredential.user);
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') {
                setShowLogin(true);
                setError('This email is already registered. Please log in to accept your invite.');
            } else {
                setError(err.message);
            }
        }
    };

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const userCredential = await signInWithEmailAndPassword(auth, inviteData.email, loginPassword);
            await handleAcceptInvite(userCredential.user);
        } catch (err) {
            setError(err.message);
        }
    };

    const handleGoogleSignIn = async () => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ login_hint: inviteData.email });
        try {
            const result = await signInWithPopup(auth, provider);
            if (result.user.email !== inviteData.email) {
                await auth.signOut();
                throw new Error("Please sign in with the Google account associated with the invited email address.");
            }
            await handleAcceptInvite(result.user);
        } catch (err) {
            setError(err.message);
        }
    };


    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;

    return (
        <Container component="main" maxWidth="sm" sx={{ mt: 8 }}>
            <Paper elevation={3} sx={{ p: 4 }}>
                <Typography component="h1" variant="h4" align="center">Join Your Team</Typography>
                {error ? (
                    <Typography color="error" sx={{ mt: 2, textAlign: 'center' }}>{error}</Typography>
                ) : null}
                {showLogin ? (
                    <>
                        <Typography align="center" sx={{ mt: 2 }}>
                            Please log in to accept your invite for: <strong>{inviteData?.email}</strong>
                        </Typography>
                        <Divider sx={{ my: 3 }}>Log In</Divider>
                        <Box component="form" onSubmit={handleLoginSubmit}>
                            <TextField margin="normal" required fullWidth name="password" label="Password" type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} helperText="Enter your password." />
                            <Button type="submit" fullWidth variant="contained" sx={{ mt: 2, mb: 1 }}>Log In & Accept Invite</Button>
                        </Box>
                    </>
                ) : (
                    !error && inviteData && <>
                        <Typography variant="h6" align="center" sx={{ mt: 2 }}>
                            You've been invited by <strong>{inviteData?.orgName}</strong> to join as a <strong>{inviteData?.role}</strong>.
                        </Typography>
                        <Typography align="center" color="text.secondary">
                            Complete your account setup for: {inviteData?.email}
                        </Typography>
                        <Divider sx={{ my: 3 }}>Create Your Account</Divider>
                        <Box component="form" onSubmit={handleEmailSubmit}>
                            <TextField margin="normal" required fullWidth name="password" label="Choose a Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} helperText="Must be at least 6 characters." />
                            <Button type="submit" fullWidth variant="contained" sx={{ mt: 2, mb: 1 }}>Set Password & Join Team</Button>
                        </Box>
                        <Button fullWidth variant="outlined" onClick={handleGoogleSignIn} startIcon={<GoogleIcon />}>
                            Sign Up with Google
                        </Button>
                    </>
                )}
            </Paper>
        </Container>
    );
};

export default JoinPage;
