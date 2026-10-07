import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/ui/combobox";
import { BatchGrid, type GridColumn, type SavedGridRow } from "@/components/grid/BatchGrid";
import { StatusBadge } from "@/features/transactions/StatusBadge";
import { PendingRowActions } from "@/features/transactions/PendingRowActions";
import { useBatchEntry } from "@/features/transactions/useBatchEntry";
import { useGlApproval } from "@/features/transactions/useGlApproval";
import { useRowEditor } from "@/features/transactions/useRowEditor";
import { useAppUser } from "@/routes/guards";
import { useSiteSelection } from "@/lib/site-context";
import { Role, TransactionStatus, type Purchase, type Item, type Vendor, type Unit } from "@/lib/types";

const EMPTY_ROW = { vendorId: "", itemId: "", qty: "", amount: "", narration: "" };

export default function PurchasesPage() {
  const { user } = useAppUser();
  const canApprove = user?.role === Role.SR_ACCOUNTANT || user?.role === Role.ADMIN;
  // Any Accountant/Sr. Accountant/Admin can edit or remove a still-PENDING
  // row (not just the one they created) — Owner stays read-only.
  const canEditRow = user?.role !== Role.OWNER;
  const queryClient = useQueryClient();
  const { siteId, date } = useSiteSelection();
  const { data: items } = useQuery({ queryKey: ["master-data", "/items"], queryFn: () => api.get<Item[]>("/items") });
  const { data: vendors } = useQuery({
    queryKey: ["master-data", "/vendors"],
    queryFn: () => api.get<Vendor[]>("/vendors"),
  });
  const { data: units } = useQuery({ queryKey: ["master-data", "/units"], queryFn: () => api.get<Unit[]>("/units") });

  // Lets the Vendor combobox below create a brand-new vendor inline (see
  // Combobox's `quickCreate`) instead of requiring a trip to Master Data
  // first — invalidating this same query key keeps every consumer (this
  // page, VendorsPage.tsx, useGlApproval's party options) in sync.
  async function createVendor(name: string) {
    const created = await api.post<Vendor>("/vendors", { name });
    queryClient.invalidateQueries({ queryKey: ["master-data", "/vendors"] });
    return { value: created.id, label: created.name };
  }

  // Item can't be quick-created from a name alone — `itemSchema` requires
  // unitId — so its `quickCreate` carries `extraField` (Unit).
  async function createItem(name: string, unitId?: string) {
    const created = await api.post<Item>("/items", { name, unitId });
    queryClient.invalidateQueries({ queryKey: ["master-data", "/items"] });
    return { value: created.id, label: created.name };
  }
  const listQueryKey = ["purchases", siteId, date];
  const { data: purchases, isLoading } = useQuery({
    queryKey: listQueryKey,
    queryFn: () => api.get<Purchase[]>(`/purchases?siteId=${siteId}&date=${date}`),
  });

  const { rows, setRows, results, submit, clearSavedRows } = useBatchEntry<typeof EMPTY_ROW>("/purchases", [
    "purchases",
    siteId,
  ]);
  const glApproval = useGlApproval("purchases", listQueryKey, canApprove);
  const rowEditor = useRowEditor("purchases", listQueryKey);

  const columns: GridColumn[] = [
    {
      key: "vendorId",
      label: "Vendor",
      type: "select",
      // Inactive vendors can't be picked for a new Purchase — same
      // reasoning as User.active, "retired" master data instead of deleted.
      options: vendors?.filter((v) => v.isActive).map((v) => ({ value: v.id, label: v.name })),
      // Create-only master data — Accountant can quick-create a brand-new
      // Vendor/Item here (server's masterDataRouter grants ACCOUNTANT
      // createRoles for these two), but editing an existing one still
      // requires a trip to Master Data as Sr. Accountant/Owner.
      quickCreate: { label: "Vendor", onCreate: createVendor },
      width: "220px",
    },
    {
      key: "itemId",
      label: "Item",
      type: "select",
      options: items?.filter((i) => i.isActive).map((i) => ({ value: i.id, label: i.name })),
      quickCreate: {
        label: "Item",
        extraField: {
          key: "unitId",
          label: "Unit",
          options: units?.filter((u) => u.isActive).map((u) => ({ value: u.id, label: u.name })) ?? [],
        },
        onCreate: createItem,
      },
      width: "200px",
    },
    { key: "qty", label: "Qty", type: "number", summable: true, width: "70px" },
    { key: "amount", label: "Amount", type: "number", summable: true },
    { key: "narration", label: "Narration", type: "text" },
    ...(canApprove
      ? [
          { key: "gl1Id", label: "GL1 (Debit)", type: "text", editable: false } as const,
          { key: "gl2Id", label: "GL2 (Credit)", type: "text", editable: false } as const,
        ]
      : []),
    { key: "status", label: "Status", type: "text", editable: false },
  ];

  const savedRows: SavedGridRow[] = (purchases ?? []).map((purchase) => ({
    id: purchase.id,
    numericValues: { qty: Number(purchase.qty), amount: Number(purchase.amount) },
    cells: {
      vendorId: purchase.vendor?.name,
      itemId: purchase.item?.name,
      qty: purchase.qty,
      amount: Number(purchase.amount).toFixed(2),
      narration: purchase.narration,
      gl1Id:
        canApprove && purchase.status === TransactionStatus.PENDING ? (
          <Combobox
            value={glApproval.glFor(purchase, "gl1Id")}
            onValueChange={(value) => glApproval.setGlDraft(purchase.id, "gl1Id", value)}
            options={glApproval.glAccountOptions}
            quickCreate={glApproval.glAccountQuickCreate}
          />
        ) : (
          (purchase.gl1?.name ?? "—")
        ),
      gl2Id:
        canApprove && purchase.status === TransactionStatus.PENDING ? (
          <Combobox
            value={glApproval.glFor(purchase, "gl2Id")}
            onValueChange={(value) => glApproval.setGlDraft(purchase.id, "gl2Id", value)}
            options={glApproval.glAccountOptions}
            quickCreate={glApproval.glAccountQuickCreate}
          />
        ) : (
          (purchase.gl2?.name ?? "—")
        ),
      status: <StatusBadge status={purchase.status} />,
    },
    trailingCell: (
      <PendingRowActions
        editing={rowEditor.editingId === purchase.id}
        canEdit={canEditRow}
        isPending={purchase.status === TransactionStatus.PENDING}
        onEdit={() =>
          rowEditor.startEdit(purchase.id, {
            vendorId: purchase.vendorId,
            itemId: purchase.itemId,
            qty: purchase.qty,
            amount: purchase.amount,
            narration: purchase.narration ?? "",
          })
        }
        onDelete={() => rowEditor.remove.mutate(purchase.id)}
        onSave={() => rowEditor.update.mutate({ id: purchase.id, ...rowEditor.draft })}
        onCancel={rowEditor.cancelEdit}
        saving={rowEditor.update.isPending}
        deleting={rowEditor.remove.isPending}
      >
        {canApprove && purchase.status === TransactionStatus.PENDING ? (
          <Checkbox checked={glApproval.selected.has(purchase.id)} onCheckedChange={() => glApproval.toggle(purchase.id)} />
        ) : null}
      </PendingRowActions>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Purchases</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canApprove && (
            <>
              <Button variant="outline" size="sm" onClick={glApproval.saveAllMappings} disabled={glApproval.saveMapping.isPending}>
                Save G/L mapping
              </Button>
              <Button
                size="sm"
                onClick={() => glApproval.approve.mutate([...glApproval.selected])}
                disabled={glApproval.selected.size === 0 || glApproval.approve.isPending}
              >
                Approve selected ({glApproval.selected.size})
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => glApproval.reject.mutate([...glApproval.selected])}
                disabled={glApproval.selected.size === 0 || glApproval.reject.isPending}
              >
                Reject selected
              </Button>
            </>
          )}
          <Button
            size="sm"
            onClick={() => submit.mutate(rows.map((r) => ({ ...r, siteId, date })))}
            disabled={submit.isPending || rows.length === 0}
          >
            {submit.isPending ? "Submitting…" : "Submit batch"}
          </Button>
          {results && (
            <Button size="sm" variant="outline" onClick={clearSavedRows}>
              Clear saved rows
            </Button>
          )}
        </div>
      </div>

      <BatchGrid
        columns={columns}
        savedRows={savedRows}
        savedRowsLoading={isLoading}
        rows={rows}
        onChange={setRows}
        results={results}
        emptyRow={EMPTY_ROW}
        trailingWidth="150px"
        editingSavedRowId={rowEditor.editingId ?? undefined}
        savedRowDraft={rowEditor.draft}
        onSavedRowDraftChange={rowEditor.setDraftField}
      />
    </div>
  );
}
