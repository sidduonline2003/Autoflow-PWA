import React from 'react';
import { Container, Typography, Button, AppBar, Toolbar, Paper } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

const ClientDashboardPage = () => {
    const { user, claims } = useAuth();

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Failed to log out', error);
        }
    };

    return (
        <>
            <AppBar position="static" color="secondary">
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
                        Client Portal
                    </Typography>
                    <Button color="inherit" onClick={handleLogout}>Logout</Button>
                </Toolbar>
            </AppBar>
            <Container sx={{ mt: 4 }}>
                <Typography component="h1" variant="h4">
                    Welcome, {user?.displayName || user?.email}!
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                    This is your private client portal.
                </Typography>
                {claims && (
                    <Paper sx={{ mt: 4, p: 2, backgroundColor: '#f5f5f5' }}>
                        <Typography variant="h6">Your Custom Claims (for debugging):</Typography>
                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {JSON.stringify(claims, null, 2)}
                        </pre>
                    </Paper>
                )}
            </Container>
        </>
    );
};

export default ClientDashboardPage;
