import React from 'react';
import { Container, Typography, Button, AppBar, Toolbar, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

const DashboardPage = () => {
    const { user, claims } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Failed to log out', error);
        }
    };

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>Dashboard</Typography>
                    <Button color="inherit" onClick={() => navigate('/team')}>Team Management</Button>
                    <Button color="inherit" onClick={() => navigate('/clients')}>Client Management</Button>
                    <Button color="inherit" onClick={handleLogout}>Logout</Button>
                </Toolbar>
            </AppBar>
            <Container sx={{ mt: 4 }}>
                <Typography component="h1" variant="h4">
                    Hello, {user?.displayName || user?.email}!
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

export default DashboardPage;
