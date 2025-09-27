import React, { useState } from 'react';
import { Container, Typography, Box, TextField, Button, Grid, Link } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');
        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            const idTokenResult = await user.getIdTokenResult(true);
            const userRole = idTokenResult.claims.role;

            // --- Updated Role-Based Redirect Logic ---
            if (userRole === 'admin') {
                navigate('/');
            } else if (userRole === 'client') {
                navigate('/client/dashboard');
            } else if (userRole === 'data-manager') {
                navigate('/data-manager');
            } else if (['crew', 'editor'].includes(userRole)) {
                navigate('/team/dashboard');
            } else {
                // Default fallback
                navigate('/'); 
            }

        } catch (err) {
            setError(err.message);
        }
    };

    return (
        <Container maxWidth="xs">
            <Box sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography component="h1" variant="h5">Sign In</Typography>
                {error && <Typography color="error" sx={{ mt: 2 }}>{error}</Typography>}
                <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
                    <TextField margin="normal" required fullWidth label="Email Address" name="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
                    <TextField margin="normal" required fullWidth name="password" label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }}>Sign In</Button>
                    <Grid container>
                        <Grid item>
                            <Link href="/signup" variant="body2">{"Don't have an account? Sign Up"}</Link>
                        </Grid>
                    </Grid>
                </Box>
            </Box>
        </Container>
    );
};

export default LoginPage;
