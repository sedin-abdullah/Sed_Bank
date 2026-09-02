/**
 * Client-side route guards.
 *
 * These are a UX affordance only — the API enforces the same rules server-side
 * (see backend/src/middleware/auth.js), so bypassing these reveals nothing.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, isStaff } from '../../lib/constants.js';
import { LoadingState } from '../ui/States.jsx';

/** Requires a signed-in user; remembers where they were headed. */
export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageLoader />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}

/** Restricts a subtree to the customer portal. */
export function RequireCustomer() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  // Staff landing on /app/* are redirected to the portal that is theirs.
  if (user.role !== ROLES.CUSTOMER) return <Navigate to="/admin" replace />;
  return <Outlet />;
}

/** Restricts a subtree to internal staff. */
export function RequireStaff() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isStaff(user.role)) return <Navigate to="/app" replace />;
  return <Outlet />;
}

/**
 * Restricts a subtree to specific staff roles (admin always passes).
 * Renders a plain "no access" panel rather than redirecting, so the user
 * understands why the screen is unavailable instead of bouncing silently.
 */
export function RequireRoles({ roles, children }) {
  const { user } = useAuth();
  const allowed = [...roles, ROLES.ADMIN];

  if (!user || !allowed.includes(user.role)) {
    return (
      <div className="card p-10 text-center">
        <h2 className="text-base font-semibold text-slate-900">You do not have access to this page</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          This section is limited to: {allowed.map((role) => role.replace(/_/g, ' ')).join(', ')}.
          Ask an administrator if you need access.
        </p>
      </div>
    );
  }

  return children;
}

/** Sends an already-signed-in visitor to their own portal. */
export function RedirectIfAuthenticated({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullPageLoader />;

  if (isAuthenticated) {
    const target = location.state?.from || (isStaff(user.role) ? '/admin' : '/app');
    return <Navigate to={target} replace />;
  }

  return children;
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <LoadingState label="Loading SedBank…" />
    </div>
  );
}

export default { RequireAuth, RequireCustomer, RequireStaff, RequireRoles, RedirectIfAuthenticated };
