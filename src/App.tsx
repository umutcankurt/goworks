import { ReactNode } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { AppConfigProvider, useAppConfig } from './contexts/AppConfigContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { VaultProvider, useVault } from './contexts/VaultContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './contexts/ToastContext';
import { VaultLockScreen } from './components/vault/VaultLockScreen';
import { GoogleReauthScreen } from './components/vault/GoogleReauthScreen';
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';

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
import { TermsAcceptanceModal } from './components/legal/TermsAcceptanceModal';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * Gates the whole app on the master-password vault. When the vault is LOCKED
 * (fresh launch / after idle) or needs a password set outside the wizard (legacy
 * upgrade / post-reset), a full-screen lock screen replaces all routes.
 * NEEDS_ONBOARDING passes through to OnboardingGate (the wizard sets the password
 * in its own step); UNLOCKED passes through to the app.
 */
function VaultGate({ children }: { children: ReactNode }) {
  const { state, isLoading } = useVault();
  if (isLoading) return null;
  const status = state?.status;
  if (status === 'LOCKED') return <VaultLockScreen mode="unlock" />;
  if (status === 'NEEDS_VAULT_SETUP') return <VaultLockScreen mode="setup" />;
  // Vault is unlocked but the silent Google session restore failed (refresh token
  // revoked/expired/issued for a different OAuth client). Gate here instead of
  // letting the user reach pages where every Google call fails cryptically.
  if (status === 'UNLOCKED' && state?.googleReauthNeeded) return <GoogleReauthScreen />;
  return <>{children}</>;
}

/**
 * Forces the user to /onboarding if onboarding is not complete; once complete,
 * redirects to the home page if /onboarding is visited. Fed by AppConfigProvider,
 * so it is active before login too.
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
          <VaultProvider>
            <ToastProvider>
              <Router>
                <VaultGate>
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
                </VaultGate>
              </Router>
              <TermsAcceptanceModal />
              <ToastContainer />
            </ToastProvider>
          </VaultProvider>
        </AuthProvider>
      </AppConfigProvider>
    </ThemeProvider>
  );
}

export default App;
