import { dotnetRequest } from "./dotnet-api";

// Phase 1: master data (Sites, GL Accounts, Customers, Vendors, Items,
// Units). Phase 2: Sales/Purchases/Vouchers/Journal Vouchers. Phase 4:
// Reports. Every route in App.tsx now has a handler here.
const DOTNET_RESOURCES = [
  "/sites",
  "/units",
  "/items",
  "/gl-accounts",
  "/customers",
  "/vendors",
  "/sales",
  "/purchases",
  "/vouchers",
  "/journal-vouchers",
  "/users",
  "/reports",
];

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

// Real backend's AccountGroupType (Core/Accounting/AccountGroup.cs):
// Asset=1, Liability=2, Income=3, Expense=4, Capital=5 — translated onto
// the legacy string GLAccountType union (lib/types.ts) that
// GL_ACCOUNT_TYPE_LABELS and every Phase 2 page keying off `.type` expect
// (Capital -> "EQUITY", the closest existing label).
const GL_TYPE_FROM_NUMBER: Record<number, string> = {
  1: "ASSET",
  2: "LIABILITY",
  3: "INCOME",
  4: "EXPENSE",
  5: "EQUITY",
};

function reshapeAccountMaster(dto: DotnetAccountMasterDto) {
  return withIsActive({
    id: dto.id,
    name: dto.accountName,
    headerId: dto.headerId,
    headerName: dto.headerName,
    type: GL_TYPE_FROM_NUMBER[dto.type] ?? "ASSET",
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

// --- Sales / Purchases (new, batch-entry + GL-mapping + approve/reject) ----
// SaleAppService/PurchaseAppService return a flattened master+single-line
// DTO already shaped close to what the pages expect (see
// API/src/EnterpriseBase.Application/Sales/Dto/SaleDto.cs) — reshape here
// only nests the *Name fields into the {id,name} objects the pages read
// (sale.customer?.name, sale.item?.name, sale.gl1?.name/gl2?.name) and maps
// the numeric Status enum (Pending=1/Approved=2/Rejected=3) onto the
// frontend's string TransactionStatus.

const STATUS_FROM_NUMBER: Record<number, string> = { 1: "PENDING", 2: "APPROVED", 3: "REJECTED" };

// BatchGrid's Row type is Record<string,string> — every field the UI
// collects (qty, amount, bankAmount, cashAmount, ...) is a string, even
// though the real DTOs are decimal/int. System.Text.Json's default (strict)
// body deserialization rejects a JSON string for a numeric property, so
// every numeric field has to be coerced to an actual number before crossing
// the wire — same reasoning as the siteId coercion below.
function coerceNumbers<T extends Record<string, unknown>>(row: T, fields: string[]): T {
  const out = { ...row };
  for (const f of fields) {
    if (out[f] !== undefined && out[f] !== null && out[f] !== "") {
      (out as Record<string, unknown>)[f] = Number(out[f]);
    }
  }
  return out;
}

interface DotnetTxnDto {
  id: string;
  siteId: number;
  date: string;
  qty: number;
  amount: number;
  narration: string | null;
  gl1Id: string | null;
  gl1Name: string | null;
  gl2Id: string | null;
  gl2Name: string | null;
  status: number;
  approvedById: string | null;
  approvedAt: string | null;
  [key: string]: unknown;
}

function reshapeTxn(
  dto: DotnetTxnDto,
  partyKey: "customer" | "vendor",
  partyIdKey: "customerId" | "vendorId",
  partyNameKey: "customerName" | "vendorName",
) {
  const { gl1Name, gl2Name, itemName, [partyNameKey]: partyName, ...rest } = dto as DotnetTxnDto & {
    itemName: string | null;
  };
  return {
    ...rest,
    siteId: String(dto.siteId),
    status: STATUS_FROM_NUMBER[dto.status] ?? "PENDING",
    [partyKey]: { id: dto[partyIdKey], name: partyName },
    item: { id: dto.itemId, name: itemName },
    gl1: dto.gl1Id ? { id: dto.gl1Id, name: gl1Name } : null,
    gl2: dto.gl2Id ? { id: dto.gl2Id, name: gl2Name } : null,
  };
}

// ABP's dynamic-API verb-by-name-prefix convention: Create*/MapGL/Approve/
// Reject (no recognized prefix) -> POST, Update* -> PUT, Get* -> GET,
// Delete* -> DELETE — same rule already relied on throughout this file.
function transactionResource(
  serviceName: string,
  resourcePrefix: string,
  partyKey: "customer" | "vendor",
  partyIdKey: "customerId" | "vendorId",
  partyNameKey: "customerName" | "vendorName",
  numericFields: string[] = ["qty", "amount"],
) {
  const reshape = (dto: DotnetTxnDto) => reshapeTxn(dto, partyKey, partyIdKey, partyNameKey);

  return async <T,>(method: string, path: string, body: unknown): Promise<T> => {
    const [bare, query] = path.split("?");
    const tail = bare === resourcePrefix ? "" : bare.slice(resourcePrefix.length + 1);

    if (method === "GET" && tail === "") {
      const params = new URLSearchParams(query ?? "");
      const result = await dotnetRequest<DotnetTxnDto[]>(
        `/services/app/${serviceName}/GetAll?SiteId=${params.get("siteId")}&Date=${params.get("date")}`,
      );
      return result.map(reshape) as T;
    }
    if (method === "POST" && tail === "batch") {
      // siteId arrives as a string (site-context.tsx stores it that way);
      // the real DTO's SiteId is a C# int — System.Text.Json's default
      // (strict) body deserialization rejects a JSON string for an int
      // property, so it's coerced to a number here before crossing the wire.
      const rows = (body as Array<Record<string, unknown>>).map((row) =>
        coerceNumbers({ ...row, siteId: Number(row.siteId) }, numericFields),
      );
      return dotnetRequest<T>(`/services/app/${serviceName}/CreateBatch`, { method: "POST", body: JSON.stringify(rows) });
    }
    if (method === "PATCH" && tail === "gl-mapping") {
      return dotnetRequest<T>(`/services/app/${serviceName}/MapGL`, { method: "POST", body: JSON.stringify(body) });
    }
    if (method === "POST" && tail === "approve") {
      return dotnetRequest<T>(`/services/app/${serviceName}/Approve`, { method: "POST", body: JSON.stringify(body) });
    }
    if (method === "POST" && tail === "reject") {
      return dotnetRequest<T>(`/services/app/${serviceName}/Reject`, { method: "POST", body: JSON.stringify(body) });
    }
    if (method === "PATCH" && tail && !["batch", "gl-mapping", "approve", "reject"].includes(tail)) {
      const result = await dotnetRequest<DotnetTxnDto>(`/services/app/${serviceName}/Update`, {
        method: "PUT",
        body: JSON.stringify(coerceNumbers({ ...(body as object), id: tail }, numericFields)),
      });
      return reshape(result) as T;
    }
    if (method === "DELETE" && tail) {
      return dotnetRequest<T>(`/services/app/${serviceName}/Delete?Id=${tail}`, { method: "DELETE" });
    }

    throw new Error(`No .NET route for ${method} ${path}`);
  };
}

const handleSales = transactionResource("Sale", "/sales", "customer", "customerId", "customerName");
const handlePurchases = transactionResource("Purchase", "/purchases", "vendor", "vendorId", "vendorName");

// --- Vouchers (new, cash/bank movement — no party/item, no master/detail) -
// VoucherAppService's DTO is already close to flat (see
// API/src/EnterpriseBase.Application/SiteVouchers/Dto/VoucherDto.cs); this
// reshape nests gl1/gl2 the same way Sales/Purchases do, maps the numeric
// Type enum (Payment=1/Receipt=2) onto the frontend's string VoucherType,
// and always reports linkedTransactionType/linkedTransactionId as null — a
// removed legacy feature (see useGlApproval.ts's "Path C" comment) nothing
// here will ever populate, matching VouchersPage.tsx's existing
// `!v.linkedTransactionId` filter.

const VOUCHER_TYPE_TO_NUMBER: Record<string, number> = { PAYMENT: 1, RECEIPT: 2 };
const VOUCHER_TYPE_FROM_NUMBER: Record<number, string> = { 1: "PAYMENT", 2: "RECEIPT" };

interface DotnetVoucherDto {
  id: string;
  siteId: number;
  particulars: string;
  bankAmount: number | null;
  cashAmount: number | null;
  type: number;
  gl1Id: string | null;
  gl1Name: string | null;
  gl2Id: string | null;
  gl2Name: string | null;
  status: number;
  [key: string]: unknown;
}

function reshapeVoucher(dto: DotnetVoucherDto) {
  const { gl1Name, gl2Name, ...rest } = dto;
  return {
    ...rest,
    siteId: String(dto.siteId),
    type: VOUCHER_TYPE_FROM_NUMBER[dto.type] ?? "PAYMENT",
    status: STATUS_FROM_NUMBER[dto.status] ?? "PENDING",
    gl1: dto.gl1Id ? { id: dto.gl1Id, name: gl1Name } : null,
    gl2: dto.gl2Id ? { id: dto.gl2Id, name: gl2Name } : null,
    linkedTransactionType: null,
    linkedTransactionId: null,
  };
}

function voucherTypeToNumber(body: Record<string, unknown>) {
  return { ...body, type: VOUCHER_TYPE_TO_NUMBER[body.type as string] ?? 1 };
}

async function handleVouchers<T>(method: string, path: string, body: unknown): Promise<T> {
  const [bare, query] = path.split("?");
  const tail = bare === "/vouchers" ? "" : bare.slice("/vouchers".length + 1);

  if (method === "GET" && tail === "") {
    const params = new URLSearchParams(query ?? "");
    const result = await dotnetRequest<{
      items: DotnetVoucherDto[];
      openingBalance: { bank: number; cash: number };
      closingBalance: { bank: number; cash: number };
    }>(`/services/app/Voucher/GetAll?SiteId=${params.get("siteId")}&Date=${params.get("date")}`);
    return {
      items: result.items.map(reshapeVoucher),
      openingBalance: result.openingBalance,
      closingBalance: result.closingBalance,
    } as T;
  }
  if (method === "POST" && tail === "batch") {
    const rows = (body as Array<Record<string, unknown>>).map((row) =>
      coerceNumbers(voucherTypeToNumber({ ...row, siteId: Number(row.siteId) }), ["bankAmount", "cashAmount"]),
    );
    return dotnetRequest<T>("/services/app/Voucher/CreateBatch", { method: "POST", body: JSON.stringify(rows) });
  }
  if (method === "PATCH" && tail === "gl-mapping") {
    return dotnetRequest<T>("/services/app/Voucher/MapGL", { method: "POST", body: JSON.stringify(body) });
  }
  if (method === "POST" && tail === "approve") {
    return dotnetRequest<T>("/services/app/Voucher/Approve", { method: "POST", body: JSON.stringify(body) });
  }
  if (method === "POST" && tail === "reject") {
    return dotnetRequest<T>("/services/app/Voucher/Reject", { method: "POST", body: JSON.stringify(body) });
  }
  if (method === "PATCH" && tail && !["batch", "gl-mapping", "approve", "reject"].includes(tail)) {
    const input = coerceNumbers(voucherTypeToNumber({ ...(body as Record<string, unknown>), id: tail }), ["bankAmount", "cashAmount"]);
    const result = await dotnetRequest<DotnetVoucherDto>("/services/app/Voucher/Update", {
      method: "PUT",
      body: JSON.stringify(input),
    });
    return reshapeVoucher(result) as T;
  }
  if (method === "DELETE" && tail) {
    return dotnetRequest<T>(`/services/app/Voucher/Delete?Id=${tail}`, { method: "DELETE" });
  }

  throw new Error(`No .NET route for ${method} ${path}`);
}

// --- Journal Vouchers (reuse real JournalVoucher — direct entry, no
// approval step; see API/src/EnterpriseBase.Application/Vouchers) ---------
// Confirmed: saving posts immediately (IsPosted=true, real ledger entries
// written on the spot) — no Pending/Approve/Reject here at all, unlike
// Sales/Purchases/Vouchers above. Two gaps the real DTO has that the
// frontend form doesn't fill in itself are patched here: FinancialYearId
// (auto-resolved once via GetActiveFinancialYear and cached) and Update's
// required VoucherDate (carried forward from the existing record, since the
// form only edits narration/lines on an existing entry).

let cachedFinancialYearId: string | null = null;
async function getActiveFinancialYearId(): Promise<string> {
  if (cachedFinancialYearId) return cachedFinancialYearId;
  const fy = await dotnetRequest<{ id: string }>("/services/app/JournalVoucher/GetActiveFinancialYear");
  cachedFinancialYearId = fy.id;
  return fy.id;
}

interface DotnetJournalVoucherLine {
  accountId: string;
  accountName: string | null;
  debitAmount: number;
  creditAmount: number;
  narration: string | null;
}

interface DotnetJournalVoucherDto {
  id: string;
  branchId: number;
  voucherDate: string;
  narration: string | null;
  isCancelled: boolean;
  lines: DotnetJournalVoucherLine[];
}

// Frontend lines are {glAccountId, debitAmount, creditAmount, narration}
// with string (or undefined) amounts; the real CreateJournalVoucherLineDto
// is {AccountId, DebitAmount, CreditAmount, Narration} with decimal
// amounts — both the field rename and the string->number coercion are
// required, or AccountId silently defaults to Guid.Empty and
// debit/creditAmount deserialization fails.
function journalLinesToDotnet(lines: unknown[]) {
  return (lines as Array<Record<string, unknown>>).map((l) => ({
    accountId: l.glAccountId,
    debitAmount: l.debitAmount ? Number(l.debitAmount) : 0,
    creditAmount: l.creditAmount ? Number(l.creditAmount) : 0,
    narration: l.narration,
  }));
}

function reshapeJournalVoucher(dto: DotnetJournalVoucherDto) {
  return {
    id: dto.id,
    siteId: String(dto.branchId),
    date: dto.voucherDate,
    narration: dto.narration,
    lines: dto.lines.map((l) => ({
      glAccountId: l.accountId,
      debitAmount: l.debitAmount ? String(l.debitAmount) : null,
      creditAmount: l.creditAmount ? String(l.creditAmount) : null,
      narration: l.narration,
    })),
  };
}

async function handleJournalVouchers<T>(method: string, path: string, body: unknown): Promise<T> {
  const [bare, query] = path.split("?");
  const tail = bare === "/journal-vouchers" ? "" : bare.slice("/journal-vouchers".length + 1);

  if (method === "GET" && tail === "") {
    const params = new URLSearchParams(query ?? "");
    const date = params.get("date");
    const result = await dotnetRequest<{ items: DotnetJournalVoucherDto[] }>(
      `/services/app/JournalVoucher/GetAll?FromDate=${date}&ToDate=${date}&BranchId=${params.get("siteId")}`,
    );
    return result.items.filter((x) => !x.isCancelled).map(reshapeJournalVoucher) as T;
  }
  if (method === "POST" && tail === "") {
    const input = body as { siteId: string; date: string; narration?: string; lines: unknown[] };
    const financialYearId = await getActiveFinancialYearId();
    const result = await dotnetRequest<DotnetJournalVoucherDto>("/services/app/JournalVoucher/Create", {
      method: "POST",
      body: JSON.stringify({
        voucherDate: input.date,
        narration: input.narration,
        financialYearId,
        lines: journalLinesToDotnet(input.lines),
      }),
    });
    return reshapeJournalVoucher(result) as T;
  }
  if (method === "PATCH" && tail) {
    const existing = await dotnetRequest<DotnetJournalVoucherDto>(`/services/app/JournalVoucher/Get?id=${tail}`);
    const input = body as { narration?: string; lines: unknown[] };
    const result = await dotnetRequest<DotnetJournalVoucherDto>("/services/app/JournalVoucher/Update", {
      method: "PUT",
      body: JSON.stringify({
        id: tail,
        voucherDate: existing.voucherDate,
        narration: input.narration,
        lines: journalLinesToDotnet(input.lines),
      }),
    });
    return reshapeJournalVoucher(result) as T;
  }
  if (method === "DELETE" && tail) {
    // Soft-cancel (reverses ledger entries) — behaves like a delete from the frontend's point of view.
    return dotnetRequest<T>(`/services/app/JournalVoucher/Delete?id=${tail}`, { method: "DELETE" });
  }

  throw new Error(`No .NET route for ${method} ${path}`);
}

// --- Users (-> real IUserAppService/IRoleAppService) ------------------------
// No new backend service needed — the stock ASP.NET Zero UserAppService
// already does everything SiteLedger's /users page needs. Role names
// ("Accountant"/"SrAccountant"/"Owner") are seeded per-SiteLedger-tenant in
// TenantAppService.CreateAsync and must exactly match ROLE_FROM_CLAIM in
// auth-client.ts, which decodes the same names off the JWT role claim.

const ROLE_NAME_TO_FRONTEND: Record<string, string> = {
  Admin: "ADMIN",
  Accountant: "ACCOUNTANT",
  SrAccountant: "SR_ACCOUNTANT",
  Owner: "OWNER",
};
const ROLE_NAME_FROM_FRONTEND: Record<string, string> = {
  ADMIN: "Admin",
  ACCOUNTANT: "Accountant",
  SR_ACCOUNTANT: "SrAccountant",
  OWNER: "Owner",
};

interface DotnetUserDto {
  id: number;
  name: string;
  surname: string;
  emailAddress: string;
  isActive: boolean;
  roleNames: string[];
  branchIds: number[];
}

// "Name" is single-field in SiteLedger's form but the real User requires
// Name + Surname separately — split on the first space, falling back to
// duplicating the whole string if there isn't one.
function splitName(name: string): { name: string; surname: string } {
  const idx = name.trim().indexOf(" ");
  if (idx === -1) return { name: name.trim(), surname: name.trim() };
  return { name: name.slice(0, idx).trim(), surname: name.slice(idx + 1).trim() };
}

async function handleUsers<T>(method: string, path: string, body: unknown): Promise<T> {
  const id = idFromPath(path, "/users");

  if (method === "GET" && !id) {
    const [result, branches] = await Promise.all([
      dotnetRequest<{ items: DotnetUserDto[] }>("/services/app/User/GetAll?MaxResultCount=1000"),
      dotnetRequest<{ items: { branch: { id: number; branchName: string } }[] }>("/services/app/Branch/GetAll"),
    ]);
    const branchNames = new Map(branches.items.map((b) => [b.branch.id, b.branch.branchName]));
    return result.items.map((u) => {
      const sites = u.branchIds.map((branchId) => ({ id: String(branchId), name: branchNames.get(branchId) ?? "" }));
      return {
        id: String(u.id),
        name: `${u.name} ${u.surname}`.trim(),
        email: u.emailAddress,
        role: ROLE_NAME_TO_FRONTEND[u.roleNames[0]] ?? "ACCOUNTANT",
        active: u.isActive,
        siteId: sites[0]?.id ?? null,
        sites,
      };
    }) as T;
  }
  if (method === "POST" && !id) {
    const input = body as { name: string; email: string; password: string; role: string; siteIds: string[] };
    const { name, surname } = splitName(input.name);
    const created = await dotnetRequest<DotnetUserDto>("/services/app/User/Create", {
      method: "POST",
      body: JSON.stringify({
        userName: input.email,
        name,
        surname,
        emailAddress: input.email,
        password: input.password,
        isActive: true,
        roleNames: [ROLE_NAME_FROM_FRONTEND[input.role] ?? "Accountant"],
        branchIds: (input.siteIds ?? []).map(Number),
      }),
    });
    return { id: String(created.id), name: `${created.name} ${created.surname}`.trim(), email: created.emailAddress, active: created.isActive } as T;
  }
  if (method === "PATCH" && id) {
    const input = body as { active: boolean };
    const action = input.active ? "Activate" : "DeActivate";
    await dotnetRequest<void>(`/services/app/User/${action}`, { method: "POST", body: JSON.stringify({ id: Number(id) }) });
    return { id, active: input.active } as T;
  }

  throw new Error(`No .NET route for ${method} ${path}`);
}

// --- Reports (read-only) -------------------------------------------------
// Backed by SiteLedgerReportAppService (API/src/EnterpriseBase.Application/
// SiteLedgerReports) — Trial Balance/P&L/Account Ledger delegate server-side
// to the real travel-agency TrialBalance/ProfitLoss/Ledger AppServices
// (which already operate purely on AccountLedgerEntry/AccountGroup); Balance
// Sheet, Sales/Purchases Register, G/L Summary, Balance Trend and
// Outstanding are custom (see that file's comments for why each one is or
// isn't delegated — in particular Balance Sheet is deliberately NOT
// delegated: the frontend computes its own "Profit & Loss A/c" plug by
// fetching /reports/profit-and-loss separately, so the backend must return
// raw, unplugged Asset/Liability/Equity balances with Liability and Equity
// kept as distinct accountType buckets).

interface DotnetStatementRow {
  accountId: string;
  accountName: string;
  accountType: number;
  accountGroup: string | null;
  net: number;
}

// accountGroup is always null from the backend (see SiteLedgerReportAppService
// comments — it maps to a fixed legacy GLAccountGroup enum the real dynamic
// GL header list can't be losslessly translated into), so it round-trips
// as-is; only accountType needs the number->string translation already
// established for GL Accounts in reshapeAccountMaster.
function reshapeStatementRow(row: DotnetStatementRow) {
  return { ...row, accountType: GL_TYPE_FROM_NUMBER[row.accountType] ?? "ASSET" };
}

// Real ledger entries are tagged with the shared EnterpriseBase.Accounting.
// VoucherType enum (Sales/Purchase/Payment/Receipt/Journal/...), not
// SiteLedger's own SALE/PURCHASE/VOUCHER/JOURNAL_VOUCHER union — Payment and
// Receipt (SiteLedger's two site-voucher types) both collapse to "VOUCHER".
const SOURCE_TYPE_FROM_VOUCHER_TYPE: Record<string, string> = {
  Sales: "SALE",
  Purchase: "PURCHASE",
  Payment: "VOUCHER",
  Receipt: "VOUCHER",
  Journal: "JOURNAL_VOUCHER",
};

interface DotnetAccountLedgerRow {
  id: string;
  date: string;
  sourceType: string;
  particulars: string | null;
  side: string;
  amount: number;
}

function reshapeAccountLedgerRow(row: DotnetAccountLedgerRow) {
  return { ...row, sourceType: SOURCE_TYPE_FROM_VOUCHER_TYPE[row.sourceType] ?? "VOUCHER" };
}

interface DotnetOutstandingRow {
  id: string;
  date: string;
  partyName: string | null;
  amount: number;
  amountPaid: number;
  balanceDue: number;
}

async function handleReports<T>(method: string, path: string): Promise<T> {
  if (method !== "GET") throw new Error(`No .NET route for ${method} ${path}`);

  const [bare, query] = path.split("?");
  const tail = bare === "/reports" ? "" : bare.slice("/reports".length + 1);
  const params = new URLSearchParams(query ?? "");
  const siteId = params.get("siteId") ?? "";

  if (tail === "sales") {
    const qs = new URLSearchParams({ SiteId: siteId });
    if (params.get("from")) qs.set("From", params.get("from")!);
    if (params.get("to")) qs.set("To", params.get("to")!);
    if (params.get("customerId")) qs.set("CustomerId", params.get("customerId")!);
    if (params.get("status")) qs.set("Status", params.get("status")!);
    const rows = await dotnetRequest<DotnetTxnDto[]>(`/services/app/SiteLedgerReport/GetSalesRegister?${qs}`);
    return rows.map((r) => reshapeTxn(r, "customer", "customerId", "customerName")) as T;
  }

  if (tail === "purchases") {
    const qs = new URLSearchParams({ SiteId: siteId });
    if (params.get("from")) qs.set("From", params.get("from")!);
    if (params.get("to")) qs.set("To", params.get("to")!);
    if (params.get("vendorId")) qs.set("VendorId", params.get("vendorId")!);
    if (params.get("status")) qs.set("Status", params.get("status")!);
    const rows = await dotnetRequest<DotnetTxnDto[]>(`/services/app/SiteLedgerReport/GetPurchasesRegister?${qs}`);
    return rows.map((r) => reshapeTxn(r, "vendor", "vendorId", "vendorName")) as T;
  }

  if (tail === "outstanding") {
    const result = await dotnetRequest<{
      sales: DotnetOutstandingRow[];
      purchases: DotnetOutstandingRow[];
      salesSummary: unknown[];
      purchasesSummary: unknown[];
    }>(`/services/app/SiteLedgerReport/GetOutstanding?SiteId=${siteId}`);
    return {
      sales: result.sales.map((r) => ({ ...r, customer: { name: r.partyName } })),
      purchases: result.purchases.map((r) => ({ ...r, vendor: { name: r.partyName } })),
      salesSummary: result.salesSummary,
      purchasesSummary: result.purchasesSummary,
    } as T;
  }

  if (tail === "trial-balance") {
    const rows = await dotnetRequest<DotnetStatementRow[]>(`/services/app/SiteLedgerReport/GetTrialBalance?SiteId=${siteId}`);
    return rows.map(reshapeStatementRow) as T;
  }

  if (tail === "profit-and-loss") {
    const qs = new URLSearchParams({ SiteId: siteId });
    if (params.get("from")) qs.set("From", params.get("from")!);
    if (params.get("to")) qs.set("To", params.get("to")!);
    const result = await dotnetRequest<{ rows: DotnetStatementRow[]; totalIncome: number; totalExpense: number; netProfit: number }>(
      `/services/app/SiteLedgerReport/GetProfitAndLoss?${qs}`,
    );
    return { ...result, rows: result.rows.map(reshapeStatementRow) } as T;
  }

  if (tail === "balance-sheet") {
    const qs = new URLSearchParams({ SiteId: siteId });
    // The page's single date field is called "asOf"; the backend's
    // equivalent field on every other cumulative-as-of report is just `To`.
    if (params.get("asOf")) qs.set("To", params.get("asOf")!);
    const result = await dotnetRequest<{ rows: DotnetStatementRow[]; totalAssets: number; totalLiabilities: number; totalEquity: number }>(
      `/services/app/SiteLedgerReport/GetBalanceSheet?${qs}`,
    );
    return { ...result, rows: result.rows.map(reshapeStatementRow) } as T;
  }

  if (tail === "gl-summary") {
    const rows = await dotnetRequest<Array<{ accountId: string; accountName: string; accountType: number | null; debit: number; credit: number; net: number }>>(
      `/services/app/SiteLedgerReport/GetGlSummary?SiteId=${siteId}`,
    );
    return rows.map((r) => ({ ...r, accountType: r.accountType != null ? GL_TYPE_FROM_NUMBER[r.accountType] ?? null : null })) as T;
  }

  if (tail === "balance-trend") {
    return dotnetRequest<T>(`/services/app/SiteLedgerReport/GetBalanceTrend?SiteId=${siteId}`);
  }

  if (tail === "account-ledger") {
    const qs = new URLSearchParams({ SiteId: siteId, AccountId: params.get("accountId") ?? "" });
    if (params.get("from")) qs.set("From", params.get("from")!);
    if (params.get("to")) qs.set("To", params.get("to")!);
    const rows = await dotnetRequest<DotnetAccountLedgerRow[]>(`/services/app/SiteLedgerReport/GetAccountLedger?${qs}`);
    return rows.map(reshapeAccountLedgerRow) as T;
  }

  throw new Error(`No .NET route for ${method} ${path}`);
}

// --- Dispatch --------------------------------------------------------------

function resolve<T>(method: string, path: string, body: unknown): Promise<T> {
  if (matches(path, "/sites")) return handleSites<T>(method, path, body);
  if (matches(path, "/units")) return handleUnits<T>(method, path, body);
  if (matches(path, "/gl-accounts")) return handleGLAccounts<T>(method, path, body);
  if (matches(path, "/items")) return handleItems<T>(method, path, body);
  if (matches(path, "/customers")) return handleCustomers<T>(method, path, body);
  if (matches(path, "/vendors")) return handleVendors<T>(method, path, body);
  if (matches(path, "/sales")) return handleSales<T>(method, path, body);
  if (matches(path, "/purchases")) return handlePurchases<T>(method, path, body);
  if (matches(path, "/vouchers")) return handleVouchers<T>(method, path, body);
  if (matches(path, "/journal-vouchers")) return handleJournalVouchers<T>(method, path, body);
  if (matches(path, "/users")) return handleUsers<T>(method, path, body);
  if (matches(path, "/reports")) return handleReports<T>(method, path);
  throw new Error(`No .NET handler registered for ${method} ${path}`);
}

function matches(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`);
}

export const dotnetGet = <T>(path: string) => resolve<T>("GET", path, undefined);
export const dotnetPost = <T>(path: string, body: unknown) => resolve<T>("POST", path, body);
export const dotnetPatch = <T>(path: string, body: unknown) => resolve<T>("PATCH", path, body);
export const dotnetDelete = <T>(path: string) => resolve<T>("DELETE", path, undefined);
