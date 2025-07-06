import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import {
    Container, Typography, Box, TextField, Button, CircularProgress, Paper, Divider
} from '@mui/material';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import GoogleIcon from '@mui/icons-material/Google';
import toast from 'react-hot-toast';

const JoinPage = () => {
    const { inviteId, orgId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [inviteData, setInviteData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [password, setPassword] = useState('');

    useEffect(() => {
        const fetchInvite = async () => {
            try {
                const inviteDocRef = doc(db, 'organizations', orgId, 'invites', inviteId);
                const inviteDoc = await getDoc(inviteDocRef);
                if (inviteDoc.exists() && inviteDoc.data().status === 'pending') {
                    setInviteData(inviteDoc.data());
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

    useEffect(() => {
        if (user) {
            navigate('/team/dashboard'); // Redirect team members to their dashboard
        }
    }, [user, navigate]);


    const handleAcceptInvite = async (newUser) => {
        setLoading(true);
        try {
            await fetch(`/api/auth/accept-invite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${await newUser.getIdToken()}` },
                body: JSON.stringify({ uid: newUser.uid, inviteId, orgId }),
            });
            toast.success(`Welcome to ${inviteData.orgName}!`);
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
                ) : (
                    <>
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
