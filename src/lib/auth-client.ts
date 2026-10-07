import { useQuery } from "@tanstack/react-query";
import type { AppUser, Role } from "./types";
import { ApiError } from "./api-error";
import { dotnetRequest } from "./dotnet-api";
import { getDotnetToken, setDotnetToken, setDotnetTenantId } from "./dotnet-token";
import { queryClient } from "./query-client";

// Replaces Better Auth's cookie-session client with one backed by ASP.NET
// Zero's JWT bearer auth (TokenAuth/Authenticate — see
// dotnet-migration-plan.md Phase 6). Exports the exact same interface
// (useSession/signIn/signOut/asAppUser) the Better Auth version had, so
// every consumer (guards.tsx, Login.tsx, AppLayout.tsx) needed zero
// changes.
const SESSION_QUERY_KEY = ["dotnet-session"];

// ASP.NET Identity's standard claim type URIs — see the JWT
// TokenAuthController issues (aspnet-core/src/SiteLedger.Web.Core/
// Controllers/TokenAuthController.cs's CreateJwtClaims).
const CLAIM = {
  id: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
  name: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  email: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  role: "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
} as const;

// Only "Admin" is actually seeded server-side today (EnterpriseBase.Core/
// Authorization/Roles/StaticRoleNames.cs) — every tenant's bootstrap admin
// user gets it, which RequireRole (guards.tsx) already treats as
// full-access. Accountant/SrAccountant/Owner are *not* seeded yet; create
// them via the Roles/Users management screens once real per-role testing
// is needed, using these exact names so they map correctly here.
const ROLE_FROM_CLAIM: Record<string, Role> = {
  Admin: "ADMIN",
  Accountant: "ACCOUNTANT",
  SrAccountant: "SR_ACCOUNTANT",
  Owner: "OWNER",
};

function decodeJwtClaims(token: string): Record<string, string> | null {
  try {
    const payload = token.split(".")[1];
    // atob expects standard base64; JWTs use the URL-safe variant.
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, string>;
  } catch {
    return null;
  }
}

function userFromToken(token: string | null): AppUser | null {
  if (!token) return null;
  const claims = decodeJwtClaims(token);
  const id = claims?.[CLAIM.id];
  const role = claims?.[CLAIM.role] ? ROLE_FROM_CLAIM[claims[CLAIM.role]] : undefined;
  if (!claims || !id || !role) return null;
  return {
    id,
    name: claims[CLAIM.name] ?? "",
    email: claims[CLAIM.email] ?? "",
    role,
    // Not yet carried by this backend: every seeded user is active, and
    // per-user site assignment doesn't exist yet on this User model (see
    // dotnet-migration-plan.md Phase 5's Daybook note) — revisit both if
    // either becomes a real per-user setting.
    active: true,
    siteId: null,
  };
}

export function useSession() {
  const { data, isLoading } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => userFromToken(getDotnetToken()),
    initialData: () => userFromToken(getDotnetToken()),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return { data: data ? { user: data } : null, isPending: isLoading };
}

// Account/IsTenantAvailable's State enum — no custom JSON converter is
// configured on the real backend, so this comes over the wire as a plain
// int (EnterpriseBase.Application/Authorization/Accounts/Dto/
// TenantAvailabilityState.cs): Available = 1, InActive = 2, NotFound = 3.
const TENANT_AVAILABILITY_STATE = { AVAILABLE: 1, IN_ACTIVE: 2, NOT_FOUND: 3 } as const;

export const signIn = {
  email: async ({
    email,
    password,
    tenancyName,
  }: {
    email: string;
    password: string;
    // Blank/omitted means a host-side login (the separate, non-tenant
    // `admin` account) — SiteLedger only grants real access to tenant
    // users anyway (see checkSiteLedgerAccess below), but the tenant-id
    // header still needs to be set to the right tenant up front so
    // TokenAuth/Authenticate resolves the right tenant's user.
    tenancyName?: string;
  }): Promise<{ error?: { message: string } }> => {
    try {
      const trimmedTenancyName = tenancyName?.trim();
      if (trimmedTenancyName) {
        const availability = await dotnetRequest<{ state: number; tenantId: number | null }>(
          "/services/app/Account/IsTenantAvailable",
          { method: "POST", body: JSON.stringify({ tenancyName: trimmedTenancyName }) },
        );
        if (availability.state !== TENANT_AVAILABILITY_STATE.AVAILABLE || availability.tenantId == null) {
          return {
            error: {
              message:
                availability.state === TENANT_AVAILABILITY_STATE.IN_ACTIVE
                  ? "This company's account is inactive."
                  : "Company not found.",
            },
          };
        }
        setDotnetTenantId(String(availability.tenantId));
      } else {
        setDotnetTenantId(null);
      }

      const result = await dotnetRequest<{ accessToken: string }>("/TokenAuth/Authenticate", {
        method: "POST",
        body: JSON.stringify({ userNameOrEmailAddress: email, password }),
      });
      setDotnetToken(result.accessToken);

      // Real server-side gate: only a BusinessType.SiteLedger tenant's
      // users may proceed past this point (see the backend's
      // SessionAppService.CheckSiteLedgerAccess). A TravelAgency tenant's
      // otherwise-valid credentials are rejected here, not just hidden by
      // a client-side flag.
      try {
        // Not a "Get*"-prefixed method, so ABP's dynamic-API convention
        // maps it to POST (same reasoning as dotnet-shim.ts's Update/Create
        // verb notes) — a bare GET here 405s.
        await dotnetRequest<void>("/services/app/Session/CheckSiteLedgerAccess", { method: "POST" });
      } catch (accessErr) {
        setDotnetToken(null);
        setDotnetTenantId(null);
        const message =
          accessErr instanceof ApiError ? accessErr.message : "This account is not provisioned for Site Ledger.";
        return { error: { message } };
      }

      queryClient.setQueryData(SESSION_QUERY_KEY, userFromToken(result.accessToken));
      return {};
    } catch (err) {
      // ASP.NET Zero's login failure wraps the useful message in
      // error.details ("Invalid user name or password"), with error.message
      // itself just the generic "Login failed!" — prefer details when
      // present.
      const message =
        err instanceof ApiError && typeof err.details === "string"
          ? err.details
          : err instanceof Error
            ? err.message
            : "Sign in failed";
      return { error: { message } };
    }
  },
};

export async function signOut() {
  setDotnetToken(null);
  queryClient.setQueryData(SESSION_QUERY_KEY, null);
}

export function asAppUser(user: unknown): AppUser | null {
  if (!user || typeof user !== "object") return null;
  const u = user as Record<string, unknown>;
  if (typeof u.id !== "string" || typeof u.role !== "string") return null;
  return {
    id: u.id,
    name: String(u.name ?? ""),
    email: String(u.email ?? ""),
    role: u.role as AppUser["role"],
    active: u.active !== false,
    siteId: (u.siteId as string | null) ?? null,
  };
}
