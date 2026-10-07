import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { GLAccountGroup, GL_ACCOUNT_GROUP_LABELS, type BatchRowResult, type Customer, type GLAccount, type Vendor } from "@/lib/types";

const GL_ACCOUNT_GROUP_OPTIONS = Object.values(GLAccountGroup).map((value) => ({
  value,
  label: GL_ACCOUNT_GROUP_LABELS[value],
}));

interface GlRow {
  id: string;
  gl1Id: string | null;
  gl2Id: string | null;
}

// Shared by SalesPage/PurchasesPage/VouchersPage — the Sr. Accountant's G/L
// mapping + bulk Approve/Reject actions (FRD Section 3 / implementation-plan.md
// Section 5), folded into the same table those pages already render instead
// of a separate /approvals route.
export function useGlApproval(
  resource: "sales" | "purchases" | "vouchers",
  listQueryKey: unknown[],
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  // Vouchers only: a G/L leg can also be a specific Customer's/Vendor's own
  // ledger account (its auto-created GLAccount, see server's masterDataRouter
  // `glAccountLink`) — this is what replaced the removed "Record Payment/
  // Receipt" feature (Path C). Sales/Purchases keep the plain GL account list.
  const includeParties = resource === "vouchers";
  const { data: glAccounts } = useQuery({
    queryKey: ["master-data", "/gl-accounts"],
    queryFn: () => api.get<GLAccount[]>("/gl-accounts"),
    enabled,
  });
  const { data: customers } = useQuery({
    queryKey: ["master-data", "/customers"],
    queryFn: () => api.get<Customer[]>("/customers"),
    enabled: enabled && includeParties,
  });
  const { data: vendors } = useQuery({
    queryKey: ["master-data", "/vendors"],
    queryFn: () => api.get<Vendor[]>("/vendors"),
    enabled: enabled && includeParties,
  });

  // Every Customer/Vendor gets its own auto-created GLAccount (see server's
  // masterDataRouter `glAccountLink`), which also shows up in the plain
  // `/gl-accounts` list — exclude those ids from the plain list so each
  // account appears once, labeled by party, instead of twice.
  const partyLinkedGlAccountIds = new Set(
    includeParties
      ? [
          ...(customers ?? []).map((c) => c.glAccountId).filter((id): id is string => Boolean(id)),
          ...(vendors ?? []).map((v) => v.glAccountId).filter((id): id is string => Boolean(id)),
        ]
      : [],
  );

  // Inactive accounts/parties can't be picked for a new G/L mapping — same
  // reasoning as User.active, "retired" master data instead of deleted.
  // (An already-mapped-but-now-inactive account on a still-pending row is
  // a known, accepted minor edge case — see MasterDataPage.tsx's isActive.)
  const glAccountOptions = [
    ...(glAccounts
      ?.filter((gl) => gl.isActive && !partyLinkedGlAccountIds.has(gl.id))
      .map((gl) => ({ value: gl.id, label: gl.name })) ?? []),
    ...(includeParties
      ? (customers ?? [])
          .filter((c): c is Customer & { glAccountId: string } => c.isActive && Boolean(c.glAccountId))
          .map((c) => ({ value: c.glAccountId, label: `${c.name} (Customer)` }))
      : []),
    ...(includeParties
      ? (vendors ?? [])
          .filter((v): v is Vendor & { glAccountId: string } => v.isActive && Boolean(v.glAccountId))
          .map((v) => ({ value: v.glAccountId, label: `${v.name} (Vendor)` }))
      : []),
  ];

  // A GL Account can never be quick-created from a name alone — `group` is
  // required (the server derives `type` from it, see
  // server/src/lib/chartOfAccounts.ts) — so this always carries `extraField`,
  // never a one-click name-only create.
  const glAccountQuickCreate = {
    label: "GL Account",
    extraField: { key: "group", label: "Group", options: GL_ACCOUNT_GROUP_OPTIONS },
    onCreate: async (name: string, group?: string) => {
      const created = await api.post<GLAccount>("/gl-accounts", { name, group });
      queryClient.invalidateQueries({ queryKey: ["master-data", "/gl-accounts"] });
      return { value: created.id, label: created.name };
    },
  };

  const [glDrafts, setGlDrafts] = useState<Record<string, { gl1Id?: string; gl2Id?: string }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function glFor(row: GlRow, field: "gl1Id" | "gl2Id") {
    return glDrafts[row.id]?.[field] ?? row[field] ?? "";
  }

  function setGlDraft(rowId: string, field: "gl1Id" | "gl2Id", value: string) {
    setGlDrafts((prev) => ({ ...prev, [rowId]: { ...prev[rowId], [field]: value } }));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const saveMapping = useMutation({
    mutationFn: (payload: { id: string; gl1Id: string; gl2Id: string }[]) =>
      api.patch<BatchRowResult[]>(`/${resource}/gl-mapping`, payload),
    onSuccess: (results) => {
      const failed = results.filter((r) => r.status === "error");
      if (failed.length) toast.error(`${failed.length} row(s) failed to map`);
      else toast.success("G/L mapping saved");
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  const approve = useMutation({
    mutationFn: (ids: string[]) => api.post<BatchRowResult[]>(`/${resource}/approve`, ids.map((id) => ({ id }))),
    onSuccess: (results) => {
      const failed = results.filter((r) => r.status === "error");
      if (failed.length) toast.error(`${failed.length} row(s) could not be approved`);
      const okCount = results.length - failed.length;
      if (okCount) toast.success(`${okCount} row(s) approved`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  const reject = useMutation({
    mutationFn: (ids: string[]) => api.post<BatchRowResult[]>(`/${resource}/reject`, ids.map((id) => ({ id }))),
    onSuccess: (results) => {
      const okCount = results.filter((r) => r.status === "created").length;
      if (okCount) toast.success(`${okCount} row(s) rejected`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  function saveAllMappings() {
    const payload = Object.entries(glDrafts)
      .filter(([, v]) => v.gl1Id && v.gl2Id)
      .map(([id, v]) => ({ id, gl1Id: v.gl1Id!, gl2Id: v.gl2Id! }));
    if (!payload.length) {
      toast.info("No G/L changes to save");
      return;
    }
    saveMapping.mutate(payload);
  }

  return {
    glAccounts,
    glAccountOptions,
    glAccountQuickCreate,
    glFor,
    setGlDraft,
    selected,
    toggle,
    saveMapping,
    approve,
    reject,
    saveAllMappings,
  };
}
