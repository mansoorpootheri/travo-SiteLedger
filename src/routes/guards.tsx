import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession, asAppUser } from "@/lib/auth-client";
import { useSiteSelection } from "@/lib/site-context";
import { Role } from "@/lib/types";

export function useAppUser() {
  const { data, isPending } = useSession();
  return { user: asAppUser(data?.user), isPending };
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isPending } = useAppUser();
  const location = useLocation();

  if (isPending) return <CenteredMessage>Loading…</CenteredMessage>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, isPending } = useAppUser();
  const location = useLocation();

  if (isPending) return <CenteredMessage>Loading…</CenteredMessage>;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  // ADMIN always passes, mirroring requireRole's server-side bypass — see
  // its comment in server/src/middleware/auth.ts.
  if (user.role !== Role.ADMIN && !roles.includes(user.role)) {
    return <CenteredMessage>You don't have access to this page.</CenteredMessage>;
  }
  return <>{children}</>;
}

export function RequireSiteSelection({ children }: { children: ReactNode }) {
  const { siteId } = useSiteSelection();
  const location = useLocation();

  if (!siteId) return <Navigate to="/select-site" state={{ from: location }} replace />;
  return <>{children}</>;
}

function CenteredMessage({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">{children}</div>;
}
