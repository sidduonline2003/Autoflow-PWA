import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { financeTheme } from './theme/financeTheme';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import ClientListPage from './pages/ClientListPage';
import ClientDashboardPage from './pages/ClientDashboardPage';
import ClientWorkspacePage from './pages/ClientWorkspacePage';
import TeamManagementPage from './pages/TeamManagementPage';
import TeamDashboardPage from './pages/TeamDashboardPage';
import TeamMemberWorkspacePage from './pages/TeamMemberWorkspacePage'; // Import Workspace
import DataManagerPortal from './pages/DataManagerPortal';
import AttendanceManagementPage from './pages/AttendanceManagementPage';
import FinancialHubPage from './pages/FinancialHubPage';
import AccountsReceivablePage from './pages/AccountsReceivablePage';
import ClientARPortal from './pages/ClientARPortal';
import ReceiptVerificationPage from './pages/ReceiptVerificationPage';
import AdminReceiptPage from './pages/AdminReceiptPage';
import JoinPage from './pages/JoinPage';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PostProdPanel from './pages/PostProdPanel';
import MyWork from './pages/MyWork';
import PostProdHub from './pages/PostProdHub'; // Import Post Production Hub

function App() {
  const queryClient = React.useMemo(() => new QueryClient(), []);
  const featurePostprod = process.env.REACT_APP_FEATURE_POSTPROD !== 'false';
  return (
    <ThemeProvider theme={financeTheme}>
      <CssBaseline />
      <Toaster position="top-right" />
      <QueryClientProvider client={queryClient}>
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
                <Route path="/financial" element={<FinancialHubPage />} />
                <Route path="/accounts-receivable" element={<AccountsReceivablePage />} />
                <Route path="/receipts" element={<AdminReceiptPage />} />
                {featurePostprod && <Route path="/postprod" element={<PostProdHub />} />}
                {featurePostprod && <Route path="/events/:eventId/postprod" element={<PostProdPanel />} />}
              </Route>
              
              {/* Team Member Route */}
              <Route path="/team/dashboard" element={<TeamDashboardPage />} />
              <Route path="/data-manager" element={<DataManagerPortal />} />
              {featurePostprod && <Route path="/my-work" element={<MyWork />} />}
              {/* Post-production route temporarily removed */}
              
              {/* Client Route */}
              <Route path="/client/dashboard" element={<ClientDashboardPage />} />
              <Route path="/client/invoices" element={<ClientARPortal />} />
              <Route path="/client/ar" element={<ClientARPortal />} />
            </Route>
          </Routes>
        </Router>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
