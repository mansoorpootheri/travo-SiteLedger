import { dotnetRequest } from "./dotnet-api";

// Phase 1 scope: master data only (Sites, GL Accounts, Customers, Vendors,
// Items, Units) wired to the real EnterpriseBase API. Transactions
// (Sales/Purchases/Vouchers/Journal Vouchers) and Reports are a follow-up
// phase — their routes still exist in App.tsx but have no handler here, so
// visiting them will surface a clear "No .NET handler" error instead of
// silently hitting the old (dead) Node backend.
const DOTNET_RESOURCES = ["/sites", "/units", "/items", "/gl-accounts", "/customers", "/vendors"];

export function isDotnetResource(path: string): boolean {
  const bare = path.split("?")[0];
  return DOTNET_RESOURCES.some((prefix) => bare === prefix || bare.startsWith(`${prefix}/`));
}

function idFromPath(path: string, resourcePrefix: string): string | undefined {
  const bare = path.split("?")[0];
  if (bare === resourcePrefix) return undefined;
  return bare.slice(resourcePrefix.length + 1);
}

// None of the real entities behind these resources (Branch, Party,
// AccountMaster, Item, Unit) have a persisted "active/inactive" flag — they
// use hard delete or nothing at all. MasterDataPage.tsx's Activate/
// Deactivate toggle sends a pure `{isActive}` PATCH; until a real
// soft-activate concept exists server-side, that toggle is a client-only
// no-op here (every row always reports isActive: true — see toIsActiveRow
// below). Detecting "this PATCH is only the toggle" lets real field edits
// still go through to CreateOrEdit/UpdateAsync normally.
function isPureActiveToggle(body: unknown): boolean {
  return !!body && typeof body === "object" && Object.keys(body as object).every((k) => k === "isActive");
}

function withIsActive<T extends object>(row: T): T & { isActive: true } {
  return { ...row, isActive: true };
}

// --- Sites (-> Branch) --------------------------------------------------
// Branch is a much richer entity (GST/PAN/IsHeadOffice/geography) than
// SiteLedger's two-field Site form — only name/address round-trip here.
// GetAll/GetBranchForEdit both nest the real fields one level down
// (`.branch`), unlike Party/AccountMaster's flat DTOs.

interface DotnetBranchDto {
  id: number;
  branchName: string;
  addressLine1: string | null;
}

function reshapeBranch(branch: DotnetBranchDto) {
  return withIsActive({ id: String(branch.id), name: branch.branchName, address: branch.addressLine1 });
}

async function handleSites<T>(method: string, path: string, body: unknown): Promise<T> {
  const id = idFromPath(path, "/sites");

  if (method === "GET" && !id) {
    const result = await dotnetRequest<{ items: { branch: DotnetBranchDto }[] }>("/services/app/Branch/GetAll");
    return result.items.map((x) => reshapeBranch(x.branch)) as T;
  }
  if (method === "POST" && !id) {
    const input = body as Record<string, unknown>;
    const created = await dotnetRequest<DotnetBranchDto>("/services/app/Branch/CreateOrEdit", {
      method: "POST",
      body: JSON.stringify({ id: 0, branchName: input.name, addressLine1: input.address }),
    });
    return reshapeBranch(created) as T;
  }
  if (method === "PATCH" && id) {
    if (isPureActiveToggle(body)) return withIsActive({ id }) as T;
    const input = body as Record<string, unknown>;
    await dotnetRequest<void>("/services/app/Branch/CreateOrEdit", {
      method: "POST",
      body: JSON.stringify({ id: Number(id), branchName: input.name, addressLine1: input.address }),
    });
    return withIsActive({ id, name: input.name, address: input.address }) as T;
  }

  throw new Error(`No .NET route for ${method} ${path}`);
}

// --- GL Accounts (-> AccountMaster) -------------------------------------
// SiteLedger's "Group" select used to be a fixed enum; the real backend's
// equivalent (HeaderId) is a dynamic, tenant-specific list fetched via
// GetHeadersAsync — see getAccountHeaders(), used by GLAccountsPage.tsx the
// same way ItemsPage.tsx fetches Units. OpeningBalanceDate has no backend
// column (AccountMaster tracks a balance, not a dated balance) and is
// dropped from the form.

export interface AccountHeaderOption {
  id: string;
  name: string;
  type: number;
}

export async function getAccountHeaders(): Promise<AccountHeaderOption[]> {
  const headers = await dotnetRequest<{ id: string; name: string; type: number }[]>("/services/app/AccountMaster/GetHeaders");
  return headers.map((h) => ({ id: h.id, name: h.name, type: h.type }));
}

interface DotnetAccountMasterDto {
  id: string;
  accountName: string;
  headerId: string | null;
  headerName: string | null;
  type: number;
  openingBalance: number;
}

function reshapeAccountMaster(dto: DotnetAccountMasterDto) {
  return withIsActive({
    id: dto.id,
    name: dto.accountName,
    headerId: dto.headerId,
    headerName: dto.headerName,
    type: dto.type,
    openingBalance: dto.openingBalance,
  });
}

async function handleGLAccounts<T>(method: string, path: string, body: unknown): Promise<T> {
  const id = idFromPath(path, "/gl-accounts");

  if (method === "GET" && !id) {
    const result = await dotnetRequest<{ items: DotnetAccountMasterDto[] }>("/services/app/AccountMaster/GetAll");
    return result.items.map(reshapeAccountMaster) as T;
  }
  if (method === "POST" && !id) {
    const input = body as Record<string, unknown>;
    const created = await dotnetRequest<DotnetAccountMasterDto>("/services/app/AccountMaster/Create", {
      method: "POST",
      body: JSON.stringify({ accountName: input.name, headerId: input.headerId, openingBalance: input.openingBalance ?? 0 }),
    });
    return reshapeAccountMaster(created) as T;
  }
  if (method === "PATCH" && id) {
    if (isPureActiveToggle(body)) return withIsActive({ id }) as T;
    const input = body as Record<string, unknown>;
    // ABP's dynamic-API verb-by-name-prefix convention maps "Update*" to
    // PUT (unlike "Create*"/everything-else, which map to POST).
    const updated = await dotnetRequest<DotnetAccountMasterDto>("/services/app/AccountMaster/Update", {
      method: "PUT",
      body: JSON.stringify({ id, accountName: input.name, headerId: input.headerId, openingBalance: input.openingBalance ?? 0 }),
    });
    return reshapeAccountMaster(updated) as T;
  }

  throw new Error(`No .NET route for ${method} ${path}`);
}

// --- Customers / Vendors (-> Party) --------------------------------------
// Party unifies both via `type` (1 = Client/Customer, 2 = Vendor). It
// auto-links an AccountGroupId server-side on create (no group picker
// needed client-side, unlike GL Accounts above). OpeningBalanceDate has no
// backend column here either and is dropped from the form.

interface DotnetPartyDto {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  openingBalance: number;
  accountGroupId: string | null;
}

function reshapeParty(dto: DotnetPartyDto) {
  return withIsActive({
    id: dto.id,
    name: dto.name,
    address: dto.address,
    phone: dto.phone,
    openingBalance: dto.openingBalance,
    glAccountId: dto.accountGroupId,
  });
}

function handleParty(partyType: 1 | 2, resourcePrefix: string) {
  return async <T,>(method: string, path: string, body: unknown): Promise<T> => {
    const id = idFromPath(path, resourcePrefix);

    if (method === "GET" && !id) {
      const result = await dotnetRequest<{ items: DotnetPartyDto[] }>(`/services/app/Party/GetAll?Type=${partyType}`);
      return result.items.map(reshapeParty) as T;
    }
    if (method === "POST" && !id) {
      const input = body as Record<string, unknown>;
      const created = await dotnetRequest<DotnetPartyDto>("/services/app/Party/Create", {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          type: partyType,
          address: input.address,
          phone: input.phone,
          openingBalance: input.openingBalance ?? 0,
        }),
      });
      return reshapeParty(created) as T;
    }
    if (method === "PATCH" && id) {
      if (isPureActiveToggle(body)) return withIsActive({ id }) as T;
      const input = body as Record<string, unknown>;
      const updated = await dotnetRequest<DotnetPartyDto>("/services/app/Party/Update", {
        method: "PUT",
        body: JSON.stringify({
          id,
          name: input.name,
          type: partyType,
          address: input.address,
          phone: input.phone,
          openingBalance: input.openingBalance ?? 0,
        }),
      });
      return reshapeParty(updated) as T;
    }

    throw new Error(`No .NET route for ${method} ${path}`);
  };
}

const handleCustomers = handleParty(1, "/customers");
const handleVendors = handleParty(2, "/vendors");

// --- Items / Units (new, built to match the UI 1:1) ----------------------
// No reshaping needed — IItemAppService/IUnitAppService were designed
// against SiteLedger's exact field names.

function simpleNewMasterData(serviceName: string, resourcePrefix: string) {
  return <T,>(method: string, path: string, body: unknown): Promise<T> => {
    const id = idFromPath(path, resourcePrefix);

    if (method === "GET" && !id) {
      return dotnetRequest<{ items: unknown[] }>(`/services/app/${serviceName}/GetAll`).then(
        (r) => r.items.map((x) => withIsActive(x as object)) as T,
      );
    }
    if (method === "POST" && !id) {
      return dotnetRequest<object>(`/services/app/${serviceName}/Create`, { method: "POST", body: JSON.stringify(body) }).then(
        (x) => withIsActive(x) as T,
      );
    }
    if (method === "PATCH" && id) {
      if (isPureActiveToggle(body)) return Promise.resolve(withIsActive({ id }) as T);
      // "Update*" maps to PUT by ABP convention (see AccountMaster note above).
      return dotnetRequest<object>(`/services/app/${serviceName}/Update`, {
        method: "PUT",
        body: JSON.stringify({ ...(body as object), id }),
      }).then((x) => withIsActive(x) as T);
    }

    throw new Error(`No .NET route for ${method} ${path}`);
  };
}

const handleItems = simpleNewMasterData("Item", "/items");
const handleUnits = simpleNewMasterData("Unit", "/units");

// --- Dispatch --------------------------------------------------------------

function resolve<T>(method: string, path: string, body: unknown): Promise<T> {
  if (matches(path, "/sites")) return handleSites<T>(method, path, body);
  if (matches(path, "/units")) return handleUnits<T>(method, path, body);
  if (matches(path, "/gl-accounts")) return handleGLAccounts<T>(method, path, body);
  if (matches(path, "/items")) return handleItems<T>(method, path, body);
  if (matches(path, "/customers")) return handleCustomers<T>(method, path, body);
  if (matches(path, "/vendors")) return handleVendors<T>(method, path, body);
  throw new Error(`No .NET handler registered for ${method} ${path}`);
}

function matches(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}

export const dotnetGet = <T>(path: string) => resolve<T>("GET", path, undefined);
export const dotnetPost = <T>(path: string, body: unknown) => resolve<T>("POST", path, body);
export const dotnetPatch = <T>(path: string, body: unknown) => resolve<T>("PATCH", path, body);
export const dotnetDelete = <T>(path: string) => resolve<T>("DELETE", path, undefined);
