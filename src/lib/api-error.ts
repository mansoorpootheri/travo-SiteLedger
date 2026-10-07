// Extracted from api.ts so dotnet-api.ts (the ABP-backed client used by
// resources cut over in Phase 6 — see dotnet-migration-plan.md) can throw
// the same error type without a circular import between the two.
export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
