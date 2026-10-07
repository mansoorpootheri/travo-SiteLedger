import { useQuery } from "@tanstack/react-query";
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
import { Role, TransactionStatus, VoucherType, type VoucherListResponse } from "@/lib/types";

const EMPTY_ROW = { particulars: "", bankAmount: "", cashAmount: "", narration: "" };

// Receipt (money in) / Payment (money out) is no longer a separate manual
// toggle — the sign of the typed amount is the direction: positive = Receipt,
// negative = Payment. Colors match the app's existing ledger palette
// (emerald = credit/in, red = debit/out).
function amountColorForValue(value: string | undefined) {
  const n = Number(value);
  if (!n) return undefined;
  return n > 0 ? "text-[#0E6647]" : "text-[#8F2F25]";
}

function deriveVoucherType(row: { bankAmount?: string; cashAmount?: string }) {
  const net = (Number(row.bankAmount) || 0) + (Number(row.cashAmount) || 0);
  return net < 0 ? VoucherType.PAYMENT : VoucherType.RECEIPT;
}

// Shared by "Submit batch" and the inline row editor's Save — the grid
// always holds the signed amount the user typed; the API always wants an
// unsigned amount plus a separate type, derived from that sign.
function toVoucherPayload<T extends { bankAmount?: string; cashAmount?: string }>(row: T) {
  return {
    ...row,
    type: deriveVoucherType(row),
    bankAmount: row.bankAmount ? String(Math.abs(Number(row.bankAmount))) : row.bankAmount,
    cashAmount: row.cashAmount ? String(Math.abs(Number(row.cashAmount))) : row.cashAmount,
  };
}

export default function VouchersPage() {
  const { user } = useAppUser();
  const canApprove = user?.role === Role.SR_ACCOUNTANT || user?.role === Role.ADMIN;
  // Any Accountant/Sr. Accountant/Admin can edit or remove a still-PENDING
  // row (not just the one they created) — Owner stays read-only.
  const canEditRow = user?.role !== Role.OWNER;
  const { siteId, date } = useSiteSelection();
  const listQueryKey = ["vouchers", siteId, date];
  // Opening/closing balance for the currently-selected site+date comes back
  // alongside the voucher list itself (plain signed sums over the Voucher
  // table — see dotnet-shim.ts's handleVouchers) so it's visible while
  // entering vouchers, regardless of whether today's entries are pending.
  const { data: voucherData, isLoading } = useQuery({
    queryKey: listQueryKey,
    queryFn: () => api.get<VoucherListResponse>(`/vouchers?siteId=${siteId}&date=${date}`),
  });
  const vouchers = voucherData?.items;

  const { rows, setRows, results, submit, clearSavedRows } = useBatchEntry<typeof EMPTY_ROW>("/vouchers", [
    "vouchers",
    siteId,
  ]);
  const glApproval = useGlApproval("vouchers", listQueryKey, canApprove);
  const rowEditor = useRowEditor("vouchers", listQueryKey);

  const columns: GridColumn[] = [
    { key: "particulars", label: "Particulars", type: "text" },
    {
      key: "bankAmount",
      label: "Bank Amount",
      type: "number",
      summable: true,
      cellClassName: (row) => amountColorForValue(row.bankAmount),
    },
    {
      key: "cashAmount",
      label: "Cash Amount",
      type: "number",
      summable: true,
      cellClassName: (row) => amountColorForValue(row.cashAmount),
    },
    { key: "narration", label: "Narration", type: "text" },
    ...(canApprove
      ? [
          { key: "gl1Id", label: "GL1 (Debit)", type: "text", editable: false } as const,
          { key: "gl2Id", label: "GL2 (Credit)", type: "text", editable: false } as const,
        ]
      : []),
    { key: "status", label: "Status", type: "text", editable: false },
  ];

  // Standalone vouchers only — e.g. expenses, owner drawings. Historical
  // rows from the removed Path C flow (linked receipts/payments against a
  // Sale/Purchase, status left null) are excluded here; they're not
  // actionable from this grid. Journal Vouchers are a separate resource
  // entirely now — see JournalVouchersPage.tsx.
  const standalone = vouchers?.filter((v) => !v.linkedTransactionId) ?? [];

  // Opening balance pinned as the table's first row (read-only, no
  // trailing action). Its amounts also feed the grid's own live column
  // totals via `numericValues`, so the footer (relabeled "Closing Balance"
  // below) updates in real time as rows are added/edited/typed, the same
  // way the grid's "Total" footer always has — not a static server-computed
  // figure that would only refresh on reload.
  const openingBalanceRow: SavedGridRow[] = voucherData
    ? [
        {
          id: "__opening_balance__",
          className: "bg-muted/40 font-medium",
          numericValues: { bankAmount: voucherData.openingBalance.bank, cashAmount: voucherData.openingBalance.cash },
          cells: {
            particulars: "Opening Balance",
            bankAmount: voucherData.openingBalance.bank.toFixed(2),
            cashAmount: voucherData.openingBalance.cash.toFixed(2),
          },
        },
      ]
    : [];

  const savedRows: SavedGridRow[] = [
    ...openingBalanceRow,
    ...standalone.map((voucher) => {
      const sign = voucher.type === VoucherType.PAYMENT ? -1 : 1;
      const signedBank = Number(voucher.bankAmount ?? 0) * sign;
      const signedCash = Number(voucher.cashAmount ?? 0) * sign;
      // A REJECTED voucher was never posted (no PostingEntry was written for
      // it — see transactionRouter.ts's reject handler) so it must not move
      // the running balance, even though its amount still displays in the row.
      const countsTowardBalance = voucher.status !== TransactionStatus.REJECTED;
      return {
        id: voucher.id,
        ...(countsTowardBalance ? { numericValues: { bankAmount: signedBank, cashAmount: signedCash } } : {}),
        cells: {
          particulars: voucher.particulars,
          bankAmount: <span className={amountColorForValue(String(signedBank))}>{signedBank.toFixed(2)}</span>,
          cashAmount: <span className={amountColorForValue(String(signedCash))}>{signedCash.toFixed(2)}</span>,
          narration: voucher.narration,
          gl1Id:
            canApprove && voucher.status === TransactionStatus.PENDING ? (
              <Combobox
                value={glApproval.glFor(voucher, "gl1Id")}
                onValueChange={(value) => glApproval.setGlDraft(voucher.id, "gl1Id", value)}
                options={glApproval.glAccountOptions}
                quickCreate={glApproval.glAccountQuickCreate}
              />
            ) : (
              (voucher.gl1?.name ?? "—")
            ),
          gl2Id:
            canApprove && voucher.status === TransactionStatus.PENDING ? (
              <Combobox
                value={glApproval.glFor(voucher, "gl2Id")}
                onValueChange={(value) => glApproval.setGlDraft(voucher.id, "gl2Id", value)}
                options={glApproval.glAccountOptions}
                quickCreate={glApproval.glAccountQuickCreate}
              />
            ) : (
              (voucher.gl2?.name ?? "—")
            ),
          status: <StatusBadge status={voucher.status} />,
        },
        trailingCell: (
          <PendingRowActions
            editing={rowEditor.editingId === voucher.id}
            canEdit={canEditRow}
            isPending={voucher.status === TransactionStatus.PENDING}
            onEdit={() =>
              rowEditor.startEdit(voucher.id, {
                particulars: voucher.particulars,
                bankAmount: String(signedBank),
                cashAmount: String(signedCash),
                narration: voucher.narration ?? "",
              })
            }
            onDelete={() => rowEditor.remove.mutate(voucher.id)}
            onSave={() => rowEditor.update.mutate({ id: voucher.id, ...toVoucherPayload(rowEditor.draft) })}
            onCancel={rowEditor.cancelEdit}
            saving={rowEditor.update.isPending}
            deleting={rowEditor.remove.isPending}
          >
            {canApprove && voucher.status === TransactionStatus.PENDING ? (
              <Checkbox checked={glApproval.selected.has(voucher.id)} onCheckedChange={() => glApproval.toggle(voucher.id)} />
            ) : null}
          </PendingRowActions>
        ),
      };
    }),
  ];

  // Combined Bank+Cash running balance for the extra "Closing Balance"
  // footer row — same inputs (opening balance + saved rows + draft rows)
  // the grid's own per-column "Total" row sums, just netted into one figure.
  const combinedClosingBalance =
    savedRows.reduce((acc, r) => acc + (r.numericValues?.bankAmount ?? 0) + (r.numericValues?.cashAmount ?? 0), 0) +
    rows.reduce((acc, r) => acc + (Number(r.bankAmount) || 0) + (Number(r.cashAmount) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Standalone Vouchers</h1>
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
            onClick={() => submit.mutate(rows.map((r) => toVoucherPayload({ ...r, siteId, date })))}
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
        trailingWidth="110px"
        editingSavedRowId={rowEditor.editingId ?? undefined}
        savedRowDraft={rowEditor.draft}
        onSavedRowDraftChange={rowEditor.setDraftField}
        extraFooterRow={
          voucherData
            ? {
                label: "Closing Balance",
                spanKeys: ["bankAmount", "cashAmount"],
                value: combinedClosingBalance.toFixed(2),
                valueClassName: combinedClosingBalance < 0 ? "text-[#8F2F25]" : "text-[#0E6647]",
              }
            : undefined
        }
      />
    </div>
  );
}
