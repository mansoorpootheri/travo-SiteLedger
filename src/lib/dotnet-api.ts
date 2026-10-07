import { ApiError } from "./api-error";
import { getDotnetTenantId, getDotnetToken } from "./dotnet-token";

// The real ASP.NET Zero API. In dev, Vite's proxy (vite.config.ts) forwards
// /api/* to the actual backend (http://localhost:5001 by default), so this
// stays same-origin and relative — no CORS, no hardcoded port here. In a
// production build, VITE_API_BASE_URL points at the deployed API origin.
// The "/api" suffix is required in both cases — every ABP dynamic-API route
// (e.g. /services/app/...) and TokenAuthController live under it.
export const DOTNET_API_BASE = (import.meta.env.PROD ? (import.meta.env.VITE_API_BASE_URL ?? "") : "") + "/api";

interface AbpError {
  message?: string;
  details?: unknown;
}

interface AbpEnvelope<T> {
  result: T;
  success: boolean;
  error?: AbpError | null;
}

// Low-level fetch wrapper for the ABP dynamic-API-controller convention:
// attaches the bearer token + tenant header, and unwraps the
// {result, success, error} envelope every ABP response carries into the
// same ApiError shape used throughout the app.
export async function dotnetRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getDotnetToken();
  const tenantId = getDotnetTenantId();
  const res = await fetch(`${DOTNET_API_BASE}${path}`, {
    ...init,
    headers: {
      // A FormData body (file upload) must NOT get an explicit
      // Content-Type — the browser sets its own multipart boundary when
      // the header is left unset.
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      // "Abp.TenantId" (dot, not hyphen) is ABP's default tenant-resolver
      // header name — confirmed against the main Travo ui/ app's
      // httpClient.ts. Omitted entirely for a host-side login.
      ...(tenantId ? { "Abp.TenantId": tenantId } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  let body: AbpEnvelope<T> | undefined;
  try {
    body = (await res.json()) as AbpEnvelope<T>;
  } catch {
    // No/invalid JSON body (e.g. a 204 from a Delete action).
  }

  if (!res.ok || body?.success === false) {
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, body?.error?.details);
  }

  return body!.result;
}
