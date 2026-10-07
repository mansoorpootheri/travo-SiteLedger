export { ApiError } from "./api-error";
import { ApiError } from "./api-error";
import { isDotnetResource, dotnetGet, dotnetPost, dotnetPatch, dotnetDelete } from "./dotnet-shim";

// The API is mounted under /api (server/src/app.ts) so its routes never
// collide with same-named client-side routes (/sales, /users, ...) when the
// Express server also serves the built SPA. Callers pass bare resource paths
// ("/sales"); the prefix is added here, in one place.
export const API_PREFIX = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      // A FormData body (file upload) must NOT get an explicit Content-Type
      // — the browser sets its own multipart boundary when the header is
      // left unset.
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let details: unknown;
    try {
      const body = await res.json();
      message = body.error ?? message;
      details = body.details;
    } catch {
      // response had no JSON body
    }
    throw new ApiError(message, res.status, details);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Resources listed in dotnet-shim.ts's DOTNET_RESOURCES are wired to the
// real .NET backend; every call site below keeps the same {path, body}
// shape regardless of which backend actually serves it. Bulk CSV
// import/export (postFile/downloadFile) has no real backend counterpart
// yet (see CLAUDE.md / the Phase 1 plan) — canBulkImport is false on every
// master-data page for now, so these two stay on the old (unreachable)
// Node-shaped path and are effectively dead code until that's built.
export const api = {
  get: <T>(path: string) => (isDotnetResource(path) ? dotnetGet<T>(path) : request<T>(path)),
  post: <T>(path: string, body?: unknown) =>
    isDotnetResource(path) ? dotnetPost<T>(path, body) : request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    isDotnetResource(path) ? dotnetPatch<T>(path, body) : request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => (isDotnetResource(path) ? dotnetDelete<T>(path) : request<T>(path, { method: "DELETE" })),
  postFile: <T>(path: string, formData: FormData) => request<T>(path, { method: "POST", body: formData }),
  downloadFile: (path: string) => Promise.resolve(window.open(`${API_PREFIX}${path}`, "_blank")),
};
