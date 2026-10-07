// The JWT ASP.NET Zero's TokenAuth/Authenticate issues on login — plain
// localStorage rather than a cookie, since the .NET API is cross-origin
// from the Vite dev server (no same-origin cookie handling needed for
// bearer-token auth the way client/src/lib/api.ts's cookie-based Node
// session required `credentials: "include"`). Read by dotnet-api.ts on
// every request; written by auth-client.ts on sign-in/sign-out.
const STORAGE_KEY = "siteledger:dotnet-token";

export function getDotnetToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setDotnetToken(token: string | null) {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (e.g. private browsing) — the token still
    // works for this tab's lifetime via the in-memory session query cache,
    // it just won't survive a reload.
  }
}

// The tenant id resolved at login (via Account/IsTenantAvailable against
// the tenancy name typed on the login screen), persisted alongside the
// token since every authenticated request also needs the Abp-TenantId
// header, not just the Authenticate call itself (dotnet-migration-plan.md
// Phase 1's "Multi-tenancy header requirement" note). Three states, not
// two: key absent (nothing ever chosen — e.g. a tab from before this
// feature existed) defaults to tenant "1" to keep that pre-existing
// single-tenant behavior; an explicit "" means a host-side login (blank
// tenancy name — no header sent at all, resolving the separate Host
// `admin`); any other value is a real tenant id.
const TENANT_STORAGE_KEY = "siteledger:dotnet-tenant-id";

export function getDotnetTenantId(): string | null {
  try {
    const stored = localStorage.getItem(TENANT_STORAGE_KEY);
    if (stored === null) return "1";
    return stored === "" ? null : stored;
  } catch {
    return "1";
  }
}

export function setDotnetTenantId(tenantId: string | null) {
  try {
    localStorage.setItem(TENANT_STORAGE_KEY, tenantId ?? "");
  } catch {
    // See setDotnetToken's note above — same per-tab fallback behavior.
  }
}
