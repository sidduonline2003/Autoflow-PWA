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

    if (claims?.role === 'admin') {
        return <Outlet />;
    }

    // When claims are missing or non-admin, route to appropriate dashboard
    const role = claims?.role;
    if (!role) {
      return <Navigate to="/team/dashboard" replace />;
    }

    switch(role) {
        case 'client':
            return <Navigate to="/client/dashboard" replace />;
        case 'crew':
        case 'editor':
        case 'data-manager':
            return <Navigate to="/team/dashboard" replace />;
        default:
            return <Navigate to="/team/dashboard" replace />;
    }
};

export default AdminRoute;
