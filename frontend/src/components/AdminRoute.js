import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Box, CircularProgress } from '@mui/material';

const AdminRoute = () => {
    const { user, claims, loading } = useAuth();

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (claims && claims.role === 'admin') {
        return <Outlet />;
    } else {
        switch(claims.role) {
            case 'client':
                return <Navigate to="/client/dashboard" replace />;
            case 'crew':
            case 'editor':
            case 'data-manager':
                return <Navigate to="/team/dashboard" replace />;
            default:
                return <Navigate to="/login" replace />;
        }
    }
};

export default AdminRoute;
