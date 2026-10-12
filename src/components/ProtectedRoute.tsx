import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuthContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueueContext";
import type { UserRole } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, userRole, loading, isOfflineSession } = useAuth();
  const { isOnline } = useOfflineQueue();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Offline sessions are strictly sandboxed to /sales (Checkout / Register)
  if ((isOfflineSession || !isOnline) && location.pathname !== "/sales") {
    return <Navigate to="/sales" replace />;
  }

  // Enforce role-based access control for protected routes
  if (allowedRoles && allowedRoles.length > 0) {
    if (!userRole || !allowedRoles.includes(userRole)) {
      return <Navigate to="/sales" replace />;
    }
  }

  return <>{children}</>;
}

