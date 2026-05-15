import { ReactNode } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { AppConfigProvider, useAppConfig } from './contexts/AppConfigContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfigWarningBanner } from './components/ConfigWarningBanner';

import { Offboard } from './pages/Offboard';
import { Reports } from './pages/Reports';
import { UsersPage } from './pages/Users';
import { UserDetail } from './pages/UserDetail';
import { Login } from './pages/Login';
import { BulkOperations } from './pages/BulkOperations';
import { NewUser } from './pages/NewUser';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { SignatureTemplates } from './pages/SignatureTemplates';
import { SignatureAudit } from './pages/SignatureAudit';
import { JobHistory } from './pages/JobHistory';
import { GroupsList } from './pages/GroupsList';
import { GroupForm } from './pages/GroupForm';
import { Onboarding } from './pages/Onboarding';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Onboarding tamamlanmadıysa kullanıcıyı /onboarding'e zorlar; tamamlanmışsa
 * /onboarding'e gidilirse ana sayfaya yönlendirir. AppConfigProvider'dan beslendiği
 * için login öncesi de aktiftir.
 */
function OnboardingGate({ children }: { children: ReactNode }) {
  const { config, isLoading } = useAppConfig();
  const location = useLocation();
  if (isLoading) return null;
  const onboardingDone = !!config.onboardingCompletedAt;
  if (!onboardingDone && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }
  if (onboardingDone && location.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider>
      <AppConfigProvider>
        <AuthProvider>
          <ToastProvider>
            <Router>
              <ConfigWarningBanner />
              <OnboardingGate>
                <Routes>
                  <Route path="/onboarding" element={<Onboarding />} />
                  <Route path="/login" element={<Login />} />

                  <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                    <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                    <Route path="/users" element={<ErrorBoundary><UsersPage /></ErrorBoundary>} />
                    <Route path="/users/:userKey" element={<ErrorBoundary><UserDetail /></ErrorBoundary>} />
                    <Route path="/new-user" element={<ErrorBoundary><NewUser /></ErrorBoundary>} />
                    <Route path="/groups" element={<ErrorBoundary><GroupsList /></ErrorBoundary>} />
                    <Route path="/groups/new" element={<ErrorBoundary><GroupForm mode="create" /></ErrorBoundary>} />
                    <Route path="/groups/:groupKey" element={<ErrorBoundary><GroupForm mode="edit" /></ErrorBoundary>} />
                    <Route path="/offboard" element={<ErrorBoundary><Offboard /></ErrorBoundary>} />
                    <Route path="/reports" element={<ErrorBoundary><Reports /></ErrorBoundary>} />
                    <Route path="/bulk-operations" element={<ErrorBoundary><BulkOperations /></ErrorBoundary>} />
                    <Route path="/job-history" element={<ErrorBoundary><JobHistory /></ErrorBoundary>} />
                    <Route path="/signature-templates" element={<ErrorBoundary><SignatureTemplates /></ErrorBoundary>} />
                    <Route path="/signature-audit" element={<ErrorBoundary><SignatureAudit /></ErrorBoundary>} />
                    <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
                  </Route>
                </Routes>
              </OnboardingGate>
            </Router>
            <ToastContainer />
          </ToastProvider>
        </AuthProvider>
      </AppConfigProvider>
    </ThemeProvider>
  );
}

export default App;
