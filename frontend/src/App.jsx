/**
 * Route tree.
 *
 * Two guarded branches share one shell:
 *   /app/*   — customer portal   (RequireCustomer)
 *   /admin/* — operations portal (RequireStaff, plus per-screen role checks)
 *
 * Every screen below the shells is code-split, so the initial bundle only
 * carries the landing and auth pages.
 */
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import AppShell from './components/layout/AppShell.jsx';
import {
  RequireAuth,
  RequireCustomer,
  RequireStaff,
  RequireRoles,
  RedirectIfAuthenticated,
  FullPageLoader,
} from './components/layout/Guards.jsx';
import { LoadingState } from './components/ui/States.jsx';
import { ROLES } from './lib/constants.js';

import LandingPage from './pages/public/LandingPage.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import RegisterPage from './pages/auth/RegisterPage.jsx';

// --- Customer portal ---
const CustomerDashboard = lazy(() => import('./pages/customer/DashboardPage.jsx'));
const EligibilityPage = lazy(() => import('./pages/customer/EligibilityPage.jsx'));
const ApplyPage = lazy(() => import('./pages/customer/ApplyPage.jsx'));
const ApplicationsPage = lazy(() => import('./pages/customer/ApplicationsPage.jsx'));
const ApplicationDetailPage = lazy(() => import('./pages/customer/ApplicationDetailPage.jsx'));
const CustomerLoansPage = lazy(() => import('./pages/customer/LoansPage.jsx'));
const CustomerLoanDetailPage = lazy(() => import('./pages/customer/LoanDetailPage.jsx'));
const CustomerPaymentsPage = lazy(() => import('./pages/customer/PaymentsPage.jsx'));

// --- Admin portal ---
const AdminDashboard = lazy(() => import('./pages/admin/DashboardPage.jsx'));
const AdminApplicationsPage = lazy(() => import('./pages/admin/ApplicationsPage.jsx'));
const AdminReviewPage = lazy(() => import('./pages/admin/ApplicationReviewPage.jsx'));
const AdminDocumentsPage = lazy(() => import('./pages/admin/DocumentsPage.jsx'));
const AdminLoansPage = lazy(() => import('./pages/admin/LoansPage.jsx'));
const AdminLoanDetailPage = lazy(() => import('./pages/admin/LoanDetailPage.jsx'));
const AdminCollectionsPage = lazy(() => import('./pages/admin/CollectionsPage.jsx'));
const AdminUsersPage = lazy(() => import('./pages/admin/UsersPage.jsx'));
const AdminBanksPage = lazy(() => import('./pages/admin/BanksPage.jsx'));
const AdminSettingsPage = lazy(() => import('./pages/admin/SettingsPage.jsx'));
const AdminAuditPage = lazy(() => import('./pages/admin/AuditPage.jsx'));

// --- Shared ---
const ProfilePage = lazy(() => import('./pages/shared/ProfilePage.jsx'));
const NotFoundPage = lazy(() => import('./pages/shared/NotFoundPage.jsx'));

const Screen = ({ children }) => (
  <Suspense fallback={<LoadingState className="py-20" />}>{children}</Suspense>
);

export default function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        {/* ---------------- Public ---------------- */}
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <LoginPage />
            </RedirectIfAuthenticated>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuthenticated>
              <RegisterPage />
            </RedirectIfAuthenticated>
          }
        />

        {/* ---------------- Customer portal ---------------- */}
        <Route element={<RequireAuth />}>
          <Route element={<RequireCustomer />}>
            <Route path="/app" element={<AppShell portal="customer" />}>
              <Route index element={<Screen><CustomerDashboard /></Screen>} />
              <Route path="eligibility" element={<Screen><EligibilityPage /></Screen>} />
              <Route path="apply" element={<Screen><ApplyPage /></Screen>} />
              <Route path="applications" element={<Screen><ApplicationsPage /></Screen>} />
              <Route path="applications/:id" element={<Screen><ApplicationDetailPage /></Screen>} />
              <Route path="loans" element={<Screen><CustomerLoansPage /></Screen>} />
              <Route path="loans/:id" element={<Screen><CustomerLoanDetailPage /></Screen>} />
              <Route path="payments" element={<Screen><CustomerPaymentsPage /></Screen>} />
              <Route path="profile" element={<Screen><ProfilePage /></Screen>} />
              <Route path="*" element={<Screen><NotFoundPage portal="customer" /></Screen>} />
            </Route>
          </Route>

          {/* ---------------- Admin / operations portal ---------------- */}
          <Route element={<RequireStaff />}>
            <Route path="/admin" element={<AppShell portal="admin" />}>
              <Route index element={<Screen><AdminDashboard /></Screen>} />

              <Route
                path="applications"
                element={
                  <RequireRoles roles={[ROLES.CREDIT_OFFICER, ROLES.OPS_OFFICER]}>
                    <Screen><AdminApplicationsPage /></Screen>
                  </RequireRoles>
                }
              />
              <Route
                path="applications/:id"
                element={
                  <RequireRoles roles={[ROLES.CREDIT_OFFICER, ROLES.OPS_OFFICER]}>
                    <Screen><AdminReviewPage /></Screen>
                  </RequireRoles>
                }
              />
              <Route
                path="documents"
                element={
                  <RequireRoles roles={[ROLES.OPS_OFFICER, ROLES.CREDIT_OFFICER]}>
                    <Screen><AdminDocumentsPage /></Screen>
                  </RequireRoles>
                }
              />
              <Route
                path="loans"
                element={
                  <RequireRoles roles={[ROLES.OPS_OFFICER, ROLES.COLLECTIONS_OFFICER]}>
                    <Screen><AdminLoansPage /></Screen>
                  </RequireRoles>
                }
              />
              <Route
                path="loans/:id"
                element={
                  <RequireRoles roles={[ROLES.OPS_OFFICER, ROLES.COLLECTIONS_OFFICER]}>
                    <Screen><AdminLoanDetailPage /></Screen>
                  </RequireRoles>
                }
              />
              <Route
                path="collections"
                element={
                  <RequireRoles roles={[ROLES.COLLECTIONS_OFFICER]}>
                    <Screen><AdminCollectionsPage /></Screen>
                  </RequireRoles>
                }
              />
              <Route
                path="users"
                element={
                  <RequireRoles roles={[]}>
                    <Screen><AdminUsersPage /></Screen>
                  </RequireRoles>
                }
              />
              <Route
                path="banks"
                element={
                  <RequireRoles roles={[]}>
                    <Screen><AdminBanksPage /></Screen>
                  </RequireRoles>
                }
              />
              <Route
                path="settings"
                element={
                  <RequireRoles roles={[]}>
                    <Screen><AdminSettingsPage /></Screen>
                  </RequireRoles>
                }
              />
              <Route
                path="audit"
                element={
                  <RequireRoles roles={[]}>
                    <Screen><AdminAuditPage /></Screen>
                  </RequireRoles>
                }
              />

              <Route path="profile" element={<Screen><ProfilePage /></Screen>} />
              <Route path="*" element={<Screen><NotFoundPage portal="admin" /></Screen>} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
