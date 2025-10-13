import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { financeTheme } from './theme/financeTheme';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Box, CircularProgress } from '@mui/material';

// Immediate imports for critical pages only
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';

// Loading component
const LoadingFallback = () => (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
    <CircularProgress />
  </Box>
);

// Lazy load all other pages
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ClientListPage = lazy(() => import('./pages/ClientListPage'));
const ClientDashboardPage = lazy(() => import('./pages/ClientDashboardPage'));
const ClientWorkspacePage = lazy(() => import('./pages/ClientWorkspacePage'));
const TeamManagementPage = lazy(() => import('./pages/TeamManagementPage'));
const TeamDashboardPage = lazy(() => import('./pages/TeamDashboardPage'));
const TeamMemberWorkspacePage = lazy(() => import('./pages/TeamMemberWorkspacePage'));
const AttendanceManagementPage = lazy(() => import('./pages/AttendanceManagementPage'));
const FinancialHubPage = lazy(() => import('./pages/FinancialHubPage'));
const AccountsReceivablePage = lazy(() => import('./pages/AccountsReceivablePage'));
const ClientARPortal = lazy(() => import('./pages/ClientARPortal'));
const AdminReceiptPage = lazy(() => import('./pages/AdminReceiptPage'));
const JoinPage = lazy(() => import('./pages/JoinPage'));
const PostProdPanel = lazy(() => import('./pages/PostProdPanel.jsx'));
const PostProdHub = lazy(() => import('./pages/PostProdHub.jsx'));
const DataManagerPortal = lazy(() => import('./pages/DataManagerPortal'));
const EventIngestTrackingPage = lazy(() => import('./pages/EventIngestTrackingPage.jsx'));
const AdminSettingsPage = lazy(() => import('./pages/AdminSettingsPage.jsx'));

// Equipment Inventory Pages - Lazy loaded
const EquipmentDashboardPage = lazy(() => import('./pages/equipment/EquipmentDashboardPage.jsx'));
const EquipmentDetailPage = lazy(() => import('./pages/equipment/EquipmentDetailPage.jsx'));
const EquipmentHistoryPage = lazy(() => import('./pages/equipment/EquipmentHistoryPage.jsx'));
const QRScannerPage = lazy(() => import('./pages/equipment/QRScannerPage.jsx'));
const AddEquipmentPage = lazy(() => import('./pages/equipment/AddEquipmentPage.jsx'));
const BulkUploadPage = lazy(() => import('./pages/equipment/BulkUploadPage.jsx'));
const CheckoutFlowPage = lazy(() => import('./pages/equipment/CheckoutFlowPage.jsx'));
const CheckinFlowPage = lazy(() => import('./pages/equipment/CheckinFlowPage.jsx'));
const MyEquipmentPage = lazy(() => import('./pages/equipment/MyEquipmentPage.jsx'));
const MyHistoryPage = lazy(() => import('./pages/equipment/MyHistoryPage.jsx'));
const MaintenancePage = lazy(() => import('./pages/equipment/MaintenancePage.jsx'));
const AnalyticsDashboardPage = lazy(() => import('./pages/equipment/AnalyticsDashboardPage.jsx'));

function App() {
  const queryClient = React.useMemo(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes
        cacheTime: 10 * 60 * 1000, // 10 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  }), []);

  return (
    <ThemeProvider theme={financeTheme}>
      <CssBaseline />
      <Toaster position="top-right" />
      <QueryClientProvider client={queryClient}>
        <Router>
          <Suspense fallback={<LoadingFallback />}>
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
              <Route path="/settings" element={<AdminSettingsPage />} />
              {/* Post-Production - Admin only routes */}
              <Route path="/postprod/ingest-tracking" element={<EventIngestTrackingPage />} />
              <Route path="/postprod" element={<PostProdHub />} />
              {/* Equipment Inventory - Admin routes */}
              <Route path="/equipment" element={<EquipmentDashboardPage />} />
              <Route path="/equipment/scan" element={<QRScannerPage />} />
              <Route path="/equipment/create" element={<AddEquipmentPage />} />
              <Route path="/equipment/bulk-upload" element={<BulkUploadPage />} />
              <Route path="/equipment/maintenance" element={<MaintenancePage />} />
              <Route path="/equipment/analytics" element={<AnalyticsDashboardPage />} />
              <Route path="/equipment/:assetId/history" element={<EquipmentHistoryPage />} />
              <Route path="/equipment/:assetId" element={<EquipmentDetailPage />} />
            </Route>

            {/* Shared Routes - Accessible by all authenticated users (including editors) */}
            <Route path="/events/:eventId/postprod" element={<PostProdPanel />} />
            <Route path="/data-manager" element={<DataManagerPortal />} />
            
            {/* Equipment Inventory - Teammate routes */}
            <Route path="/equipment/checkout" element={<CheckoutFlowPage />} />
            <Route path="/equipment/checkin" element={<CheckinFlowPage />} />
            <Route path="/equipment/my-checkouts" element={<MyEquipmentPage />} />
            <Route path="/equipment/my-history" element={<MyHistoryPage />} />
            
            {/* Team Member Route */}
            <Route path="/team/dashboard" element={<TeamDashboardPage />} />
           
            {/* Client Route */}
            <Route path="/client/dashboard" element={<ClientDashboardPage />} />
            <Route path="/client/invoices" element={<ClientARPortal />} />
            <Route path="/client/ar" element={<ClientARPortal />} />
          </Route>
          </Routes>
          </Suspense>
        </Router>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
