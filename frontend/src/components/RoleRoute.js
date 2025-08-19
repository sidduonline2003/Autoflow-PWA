import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { normalizeRole } from '../utils/roles';

export default function RoleRoute({ allowed = [] }) {
  const { user, claims, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  const role = normalizeRole(claims?.role || (claims?.admin ? 'admin' : undefined));
  if (allowed.length && !allowed.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Outlet />;
}
