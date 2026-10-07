import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getSaleEmployees } from "@/lib/dotnet-shim";
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
import { Role, TransactionStatus, type Sale, type Item, type Customer, type Unit } from "@/lib/types";

const EMPTY_ROW = { customerId: "", itemId: "", employeeId: "", qty: "", amount: "", narration: "" };

export default function SalesPage() {
  const { user } = useAppUser();
  const canApprove = user?.role === Role.SR_ACCOUNTANT || user?.role === Role.ADMIN;
  // Any Accountant/Sr. Accountant/Admin can edit or remove a still-PENDING
  // row (not just the one they created) — Owner stays read-only.
  const canEditRow = user?.role !== Role.OWNER;
  const queryClient = useQueryClient();
  const { siteId, date } = useSiteSelection();
  const { data: items } = useQuery({ queryKey: ["master-data", "/items"], queryFn: () => api.get<Item[]>("/items") });
  const { data: customers } = useQuery({
    queryKey: ["master-data", "/customers"],
    queryFn: () => api.get<Customer[]>("/customers"),
  });
  const { data: units } = useQuery({ queryKey: ["master-data", "/units"], queryFn: () => api.get<Unit[]>("/units") });
  const { data: employees } = useQuery({ queryKey: ["sale-employees"], queryFn: getSaleEmployees });

  // Lets the Customer combobox below create a brand-new customer inline
  // (see Combobox's `quickCreate`) instead of requiring a trip to Master
  // Data first — invalidating this same query key keeps every consumer
  // (this page, CustomersPage.tsx, useGlApproval's party options) in sync.
  async function createCustomer(name: string) {
    const created = await api.post<Customer>("/customers", { name });
    queryClient.invalidateQueries({ queryKey: ["master-data", "/customers"] });
    return { value: created.id, label: created.name };
  }

  // Item can't be quick-created from a name alone — `itemSchema` requires
  // unitId — so its `quickCreate` carries `extraField` (Unit), which makes
  // Combobox show that picker in the create dialog too.
  async function createItem(name: string, unitId?: string) {
    const created = await api.post<Item>("/items", { name, unitId });
    queryClient.invalidateQueries({ queryKey: ["master-data", "/items"] });
    return { value: created.id, label: created.name };
  }
  const listQueryKey = ["sales", siteId, date];
  const { data: sales, isLoading } = useQuery({
    queryKey: listQueryKey,
    queryFn: () => api.get<Sale[]>(`/sales?siteId=${siteId}&date=${date}`),
  });

  const { rows, setRows, results, submit, clearSavedRows } = useBatchEntry<typeof EMPTY_ROW>("/sales", ["sales", siteId]);
  const glApproval = useGlApproval("sales", listQueryKey, canApprove);
  const rowEditor = useRowEditor("sales", listQueryKey);

  const columns: GridColumn[] = [
    {
      key: "customerId",
      label: "Customer",
      type: "select",
      // Inactive customers can't be picked for a new Sale — same
      // reasoning as User.active, "retired" master data instead of deleted.
      options: customers?.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name })),
      // Create-only master data — Accountant can quick-create a brand-new
      // Customer/Item here (server's masterDataRouter grants ACCOUNTANT
      // createRoles for these two), but editing an existing one still
      // requires a trip to Master Data as Sr. Accountant/Owner.
      quickCreate: { label: "Customer", onCreate: createCustomer },
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
    {
      key: "employeeId",
      label: "Supervisor",
      type: "select",
      options: employees,
      width: "160px",
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

  const savedRows: SavedGridRow[] = (sales ?? []).map((sale) => ({
    id: sale.id,
    numericValues: { qty: Number(sale.qty), amount: Number(sale.amount) },
    cells: {
      customerId: sale.customer?.name,
      itemId: sale.item?.name,
      employeeId: sale.employeeName ?? "—",
      qty: sale.qty,
      amount: Number(sale.amount).toFixed(2),
      narration: sale.narration,
      gl1Id:
        canApprove && sale.status === TransactionStatus.PENDING ? (
          <Combobox
            value={glApproval.glFor(sale, "gl1Id")}
            onValueChange={(value) => glApproval.setGlDraft(sale.id, "gl1Id", value)}
            options={glApproval.glAccountOptions}
            quickCreate={glApproval.glAccountQuickCreate}
          />
        ) : (
          (sale.gl1?.name ?? "—")
        ),
      gl2Id:
        canApprove && sale.status === TransactionStatus.PENDING ? (
          <Combobox
            value={glApproval.glFor(sale, "gl2Id")}
            onValueChange={(value) => glApproval.setGlDraft(sale.id, "gl2Id", value)}
            options={glApproval.glAccountOptions}
            quickCreate={glApproval.glAccountQuickCreate}
          />
        ) : (
          (sale.gl2?.name ?? "—")
        ),
      status: <StatusBadge status={sale.status} />,
    },
    trailingCell: (
      <PendingRowActions
        editing={rowEditor.editingId === sale.id}
        canEdit={canEditRow}
        isPending={sale.status === TransactionStatus.PENDING}
        onEdit={() =>
          rowEditor.startEdit(sale.id, {
            customerId: sale.customerId,
            itemId: sale.itemId,
            employeeId: sale.employeeId,
            qty: sale.qty,
            amount: sale.amount,
            narration: sale.narration ?? "",
          })
        }
        onDelete={() => rowEditor.remove.mutate(sale.id)}
        onSave={() => rowEditor.update.mutate({ id: sale.id, ...rowEditor.draft })}
        onCancel={rowEditor.cancelEdit}
        saving={rowEditor.update.isPending}
        deleting={rowEditor.remove.isPending}
      >
        {canApprove && sale.status === TransactionStatus.PENDING ? (
          <Checkbox checked={glApproval.selected.has(sale.id)} onCheckedChange={() => glApproval.toggle(sale.id)} />
        ) : null}
      </PendingRowActions>
    ),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Sales</h1>
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
