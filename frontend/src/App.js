import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import theme from './theme';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import ClientListPage from './pages/ClientListPage';
import ClientDashboardPage from './pages/ClientDashboardPage';
import ClientWorkspacePage from './pages/ClientWorkspacePage';
import TeamManagementPage from './pages/TeamManagementPage';
import TeamDashboardPage from './pages/TeamDashboardPage';
import TeamMemberWorkspacePage from './pages/TeamMemberWorkspacePage'; // Import Workspace
import AttendanceManagementPage from './pages/AttendanceManagementPage';
import PostProductionDashboard from './pages/PostProductionDashboard';
import JoinPage from './pages/JoinPage';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import { Toaster } from 'react-hot-toast';
import CrewIntakePage from './pages/CrewIntakePage';
import DataManagerConsolePage from './pages/DataManagerConsolePage';
import PostProdBoardPage from './pages/PostProdBoardPage';
import RoleRoute from './components/RoleRoute';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Toaster position="top-right" />
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/join/:orgId/:inviteId" element={<JoinPage />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            {/* Admin Routes */}
            <Route element={<AdminRoute />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/clients" element={<ClientListPage />} />
              <Route path="/client/:clientId" element={<ClientWorkspacePage />} />
              <Route path="/team" element={<TeamManagementPage />} />
              <Route path="/team/:memberId" element={<TeamMemberWorkspacePage />} /> {/* Add new route */}
              <Route path="/attendance" element={<AttendanceManagementPage />} />
            </Route>

            {/* Crew-only */}
            <Route element={<RoleRoute allowed={["crew"]} />}>
              <Route path="/crew/intake" element={<CrewIntakePage />} />
            </Route>

            {/* Data Manager-only */}
            <Route element={<RoleRoute allowed={["data-manager", "admin"]} />}>
              <Route path="/data-manager" element={<DataManagerConsolePage />} />
            </Route>

            {/* Editor/Post team-only views */}
            <Route element={<RoleRoute allowed={["editor", "admin", "data-manager"]} />}>
              <Route path="/post-production" element={<PostProductionDashboard />} />
              <Route path="/post-production/board" element={<PostProdBoardPage />} />
            </Route>

            {/* Team Member Route */}
            <Route path="/team/dashboard" element={<TeamDashboardPage />} />

            {/* Client Route */}
            <Route path="/client/dashboard" element={<ClientDashboardPage />} />
          </Route>
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;
