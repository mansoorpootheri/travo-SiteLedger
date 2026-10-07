// Mirrors the `Role` enum in server/prisma/schema.prisma. Written as a
// `const` object + derived union type rather than a real TS `enum` —
// `tsconfig.app.json`'s `erasableSyntaxOnly` forbids `enum` (it's
// non-erasable syntax), so this is the standard erasable-safe substitute,
// used the same way (`Role.ADMIN`) everywhere in this file/codebase.
// ADMIN is never assignable through the app (no role picker offers it) —
// the only ADMIN account is bootstrapped server-side from ADMIN_EMAIL /
// ADMIN_PASSWORD. It's here purely so an ADMIN session's role can be
// represented; RequireRole/AppLayout both treat it as full access.
export const Role = {
  ACCOUNTANT: "ACCOUNTANT",
  SR_ACCOUNTANT: "SR_ACCOUNTANT",
  OWNER: "OWNER",
  ADMIN: "ADMIN",
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  siteId: string | null;
}

export interface Site {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
}

export interface Unit {
  id: string;
  name: string;
  narration: string | null;
  isActive: boolean;
}

export interface Item {
  id: string;
  name: string;
  unitId: string;
  unit?: Unit;
  isActive: boolean;
}

export interface Customer {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  glAccountId: string | null;
  glAccount?: GLAccount | null;
  openingBalance: number | null;
  isActive: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  glAccountId: string | null;
  glAccount?: GLAccount | null;
  openingBalance: number | null;
  isActive: boolean;
}

// Mirrors the `GLAccountType` enum in server/prisma/schema.prisma (see the
// `Role` comment above for why this is a const object, not a TS `enum`).
// NOT wired to the real backend yet — kept only so the not-yet-migrated
// transaction/report pages (Phase 2) keep compiling; the Phase 1
// GLAccountsPage no longer uses this (see headerId/headerName below).
export const GLAccountType = {
  ASSET: "ASSET",
  LIABILITY: "LIABILITY",
  EQUITY: "EQUITY",
  INCOME: "INCOME",
  EXPENSE: "EXPENSE",
} as const;
export type GLAccountType = (typeof GLAccountType)[keyof typeof GLAccountType];

export const GL_ACCOUNT_TYPE_LABELS: Record<GLAccountType, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expenses",
};

// Mirrors the `GLAccountGroup` enum in server/prisma/schema.prisma. Same
// "kept for Phase 2 pages only" note as GLAccountType above — the real
// AccountMaster/GetHeaders group list (dotnet-shim.ts's
// AccountHeaderOption) is dynamic/tenant-specific, not this fixed enum.
export const GLAccountGroup = {
  CASH_AND_BANK: "CASH_AND_BANK",
  SUNDRY_DEBTORS: "SUNDRY_DEBTORS",
  FIXED_ASSETS: "FIXED_ASSETS",
  INVENTORY: "INVENTORY",
  SUNDRY_CREDITORS: "SUNDRY_CREDITORS",
  SECURED_LOANS: "SECURED_LOANS",
  PROVISIONS: "PROVISIONS",
  SHARE_CAPITAL: "SHARE_CAPITAL",
  RETAINED_EARNINGS: "RETAINED_EARNINGS",
  DIRECT_INCOME: "DIRECT_INCOME",
  INDIRECT_INCOME: "INDIRECT_INCOME",
  DIRECT_EXPENSE: "DIRECT_EXPENSE",
  INDIRECT_EXPENSE: "INDIRECT_EXPENSE",
} as const;
export type GLAccountGroup = (typeof GLAccountGroup)[keyof typeof GLAccountGroup];

export const GL_ACCOUNT_GROUP_LABELS: Record<GLAccountGroup, string> = {
  CASH_AND_BANK: "Cash & Bank",
  SUNDRY_DEBTORS: "Sundry Debtors",
  FIXED_ASSETS: "Fixed Assets",
  INVENTORY: "Inventory",
  SUNDRY_CREDITORS: "Sundry Creditors",
  SECURED_LOANS: "Secured Loans",
  PROVISIONS: "Provisions",
  SHARE_CAPITAL: "Share Capital",
  RETAINED_EARNINGS: "Retained Earnings",
  DIRECT_INCOME: "Direct Income",
  INDIRECT_INCOME: "Indirect Income",
  DIRECT_EXPENSE: "Direct Expense",
  INDIRECT_EXPENSE: "Indirect Expense",
};

export interface GLAccount {
  id: string;
  name: string;
  /** The selected AccountHeader's id — see AccountHeaderOption in dotnet-shim.ts */
  headerId: string | null;
  headerName: string | null;
  openingBalance: number | null;
  isActive: boolean;
  /** Unused by Phase 1 (GLAccountsPage) — kept only for Phase 2 pages below. */
  type: GLAccountType;
}

// Mirrors the `TransactionStatus` enum in server/prisma/schema.prisma (see
// the `Role` comment above for why this is a const object, not a TS `enum`).
export const TransactionStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

export interface Sale {
  id: string;
  siteId: string;
  date: string;
  customerId: string;
  customer?: Customer;
  itemId: string;
  item?: Item;
  qty: string;
  amount: string;
  gl1Id: string | null;
  gl2Id: string | null;
  gl1?: GLAccount | null;
  gl2?: GLAccount | null;
  status: TransactionStatus;
  approvedById: string | null;
  approvedAt: string | null;
  narration: string | null;
  amountPaid: number;
  balanceDue: number;
}

export interface Purchase {
  id: string;
  siteId: string;
  date: string;
  vendorId: string;
  vendor?: Vendor;
  vendorInvoiceNo: string | null;
  itemId: string;
  item?: Item;
  qty: string;
  amount: string;
  gl1Id: string | null;
  gl2Id: string | null;
  gl1?: GLAccount | null;
  gl2?: GLAccount | null;
  status: TransactionStatus;
  approvedById: string | null;
  approvedAt: string | null;
  narration: string | null;
  amountPaid: number;
  balanceDue: number;
}

// Mirrors the `VoucherType` enum in server/prisma/schema.prisma (see the
// `Role` comment above for why this is a const object, not a TS `enum`).
export const VoucherType = {
  PAYMENT: "PAYMENT",
  RECEIPT: "RECEIPT",
} as const;
export type VoucherType = (typeof VoucherType)[keyof typeof VoucherType];

// Mirrors the `LinkedTransactionType` enum in server/prisma/schema.prisma
// (see the `Role` comment above for why this is a const object, not a TS
// `enum`).
export const LinkedTransactionType = {
  SALE: "SALE",
  PURCHASE: "PURCHASE",
} as const;
export type LinkedTransactionType = (typeof LinkedTransactionType)[keyof typeof LinkedTransactionType];

export interface Voucher {
  id: string;
  siteId: string;
  date: string;
  type: VoucherType;
  particulars: string;
  bankAmount: string | null;
  cashAmount: string | null;
  gl1Id: string | null;
  gl2Id: string | null;
  gl1?: GLAccount | null;
  gl2?: GLAccount | null;
  status: TransactionStatus | null;
  linkedTransactionType: LinkedTransactionType | null;
  linkedTransactionId: string | null;
  narration: string | null;
}

export interface JournalVoucherLine {
  id: string;
  journalVoucherId: string;
  glAccountId: string;
  glAccount?: GLAccount;
  debitAmount: string | null;
  creditAmount: string | null;
  narration: string | null;
}

// No status/approvedBy/approvedAt — direct entry, no approval step (the
// real backend posts it immediately; see dotnet-shim.ts's
// handleJournalVouchers and JournalVouchersPage.tsx).
export interface JournalVoucher {
  id: string;
  siteId: string;
  date: string;
  narration: string | null;
  lines: JournalVoucherLine[];
}

export interface BatchRowResult {
  index: number;
  status: "created" | "error";
  id?: string;
  error?: string;
}

export interface BankCashAmount {
  bank: number;
  cash: number;
}

// Opening/closing balance for the Vouchers batch-entry page — plain signed
// sums over the Voucher table itself (see dotnet-shim.ts's handleVouchers),
// not a posted-ledger balance. Folded into the vouchers list response
// instead of a separate /daybook endpoint.
export interface VoucherListResponse {
  items: Voucher[];
  openingBalance: BankCashAmount;
  closingBalance: BankCashAmount;
}
