import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { StatusBadge } from "@/features/transactions/StatusBadge";
import { useSiteSelection } from "@/lib/site-context";
import { GL_ACCOUNT_TYPE_LABELS, TransactionStatus, type GLAccount, type JournalVoucher, type BatchRowResult } from "@/lib/types";

interface DraftLine {
  glAccountId: string;
  debitAmount: string;
  creditAmount: string;
  narration: string;
}

const EMPTY_LINE: DraftLine = { glAccountId: "", debitAmount: "", creditAmount: "", narration: "" };

function linesFromExisting(voucher: JournalVoucher): DraftLine[] {
  return voucher.lines.map((l) => ({
    glAccountId: l.glAccountId,
    debitAmount: l.debitAmount ?? "",
    creditAmount: l.creditAmount ?? "",
    narration: l.narration ?? "",
  }));
}

// Sr. Accountant/Owner only (route-guarded) — creates AND approves its own
// entries, no maker/checker split, unlike Accountant-created Sale/Purchase/
// standalone Voucher. A separate resource from Voucher entirely, since an
// entry can split either side across any number of GL accounts (compound
// double-entry), not the flat one-Debit/one-Credit shape Voucher has.
//
// One entry per selected site+date (not a list of many) — the page shows
// whatever Journal Voucher already exists for that date, editable while
// PENDING, or a blank form to create one if none exists yet. Switch dates
// via the site/date selector to see a different day's entry.
export default function JournalVouchersPage() {
  const { siteId, date } = useSiteSelection();
  const queryClient = useQueryClient();

  const { data: glAccounts } = useQuery({
    queryKey: ["master-data", "/gl-accounts"],
    queryFn: () => api.get<GLAccount[]>("/gl-accounts"),
  });
  // Read-only display (an already-saved line, once approved/rejected) needs
  // every account so a line referencing a now-inactive one still shows its
  // name — only the editable picker for a new/still-pending line excludes
  // inactive accounts.
  const allAccountOptions = (glAccounts ?? []).map((a) => ({
    value: a.id,
    label: `[${GL_ACCOUNT_TYPE_LABELS[a.type]}] ${a.name}`,
  }));
  const accountOptions = (glAccounts ?? [])
    .filter((a) => a.isActive)
    .map((a) => ({ value: a.id, label: `[${GL_ACCOUNT_TYPE_LABELS[a.type]}] ${a.name}` }));

  const listQueryKey = ["journal-vouchers", siteId, date];
  const { data: vouchers, isLoading } = useQuery({
    queryKey: listQueryKey,
    queryFn: () => api.get<JournalVoucher[]>(`/journal-vouchers?siteId=${siteId}&date=${date}`),
  });
  const existing = vouchers?.[0];
  const isPending = !existing || existing.status === TransactionStatus.PENDING;

  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);

  // Load whatever entry already exists for this site+date into the form —
  // re-runs whenever the selected date (or the entry itself) changes.
  useEffect(() => {
    if (existing) {
      setNarration(existing.narration ?? "");
      setLines(linesFromExisting(existing));
    } else {
      setNarration("");
      setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, existing?.status, siteId, date]);

  function updateLine(index: number, field: keyof DraftLine, value: string) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { ...EMPTY_LINE }]);
  }
  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  const debitTotal = lines.reduce((sum, l) => sum + (Number(l.debitAmount) || 0), 0);
  const creditTotal = lines.reduce((sum, l) => sum + (Number(l.creditAmount) || 0), 0);
  const difference = debitTotal - creditTotal;
  const linesValid = lines.every((l) => {
    const hasDebit = (Number(l.debitAmount) || 0) > 0;
    const hasCredit = (Number(l.creditAmount) || 0) > 0;
    return Boolean(l.glAccountId) && hasDebit !== hasCredit;
  });
  const canSave = lines.length >= 2 && linesValid && debitTotal > 0 && Math.abs(difference) < 0.005;

  function linePayload() {
    return {
      narration: narration || undefined,
      lines: lines.map((l) => ({
        glAccountId: l.glAccountId,
        debitAmount: l.debitAmount || undefined,
        creditAmount: l.creditAmount || undefined,
        narration: l.narration || undefined,
      })),
    };
  }

  const create = useMutation({
    mutationFn: () => api.post("/journal-vouchers", { siteId, date, ...linePayload() }),
    onSuccess: () => {
      toast.success("Journal voucher saved as Pending");
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  const update = useMutation({
    mutationFn: () => api.patch(`/journal-vouchers/${existing!.id}`, linePayload()),
    onSuccess: () => {
      toast.success("Journal voucher updated");
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  const approve = useMutation({
    mutationFn: () => api.post<BatchRowResult[]>("/journal-vouchers/approve", [{ id: existing!.id }]),
    onSuccess: (results) => {
      if (results.some((r) => r.status === "error")) toast.error(results[0]?.error ?? "Could not approve");
      else toast.success("Approved");
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  const reject = useMutation({
    mutationFn: () => api.post<BatchRowResult[]>("/journal-vouchers/reject", [{ id: existing!.id }]),
    onSuccess: () => {
      toast.success("Rejected");
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/journal-vouchers/${existing!.id}`),
    onSuccess: () => {
      toast.success("Removed");
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not remove"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Journal Voucher</h1>
        {existing && <StatusBadge status={existing.status} />}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-3 rounded-md border bg-background p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground">Journal Lines</h2>
            {isPending && (
              <Button size="sm" variant="outline" onClick={addLine}>
                <Plus className="mr-1 h-4 w-4" /> Add Line
              </Button>
            )}
          </div>
          <Input
            placeholder="Narration for this entry (optional)"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            disabled={!isPending}
          />
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-9">#</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="w-28">Debit (Dr)</TableHead>
                <TableHead className="w-28">Credit (Cr)</TableHead>
                <TableHead className="w-80">Narration</TableHead>
                {isPending && <TableHead className="w-9" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => (
                <TableRow key={index}>
                  <TableCell className="text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="p-1">
                    {isPending ? (
                      <Combobox value={line.glAccountId} onValueChange={(v) => updateLine(index, "glAccountId", v)} options={accountOptions} />
                    ) : (
                      allAccountOptions.find((o) => o.value === line.glAccountId)?.label ?? "—"
                    )}
                  </TableCell>
                  <TableCell className="p-1 text-right tabular-nums">
                    {isPending ? (
                      <Input
                        className="text-right tabular-nums"
                        type="number"
                        value={line.debitAmount}
                        onChange={(e) => updateLine(index, "debitAmount", e.target.value)}
                      />
                    ) : line.debitAmount ? (
                      Number(line.debitAmount).toFixed(2)
                    ) : (
                      ""
                    )}
                  </TableCell>
                  <TableCell className="p-1 text-right tabular-nums">
                    {isPending ? (
                      <Input
                        className="text-right tabular-nums"
                        type="number"
                        value={line.creditAmount}
                        onChange={(e) => updateLine(index, "creditAmount", e.target.value)}
                      />
                    ) : line.creditAmount ? (
                      Number(line.creditAmount).toFixed(2)
                    ) : (
                      ""
                    )}
                  </TableCell>
                  <TableCell className="p-1">
                    {isPending ? (
                      <Input value={line.narration} onChange={(e) => updateLine(index, "narration", e.target.value)} />
                    ) : (
                      (line.narration ?? "—")
                    )}
                  </TableCell>
                  {isPending && (
                    <TableCell className="p-1">
                      {lines.length > 2 && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLine(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            {isPending && <p className="text-xs text-muted-foreground">* Minimum 2 lines required. Total Debit must equal Total Credit.</p>}
            <div className="ml-auto flex items-center gap-4">
              <span>
                Total Debit: <span className="font-semibold tabular-nums">{debitTotal.toFixed(2)}</span>
              </span>
              <span>
                Total Credit: <span className="font-semibold tabular-nums">{creditTotal.toFixed(2)}</span>
              </span>
              {isPending && Math.abs(difference) >= 0.005 && (
                <span className="font-semibold text-destructive">⚠ Difference: {Math.abs(difference).toFixed(2)}</span>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {existing && existing.status === TransactionStatus.PENDING && (
              <>
                <Button variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending}>
                  Delete
                </Button>
                <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending}>
                  Reject
                </Button>
                <Button variant="outline" onClick={() => update.mutate()} disabled={!canSave || update.isPending}>
                  {update.isPending ? "Saving…" : "Save changes"}
                </Button>
                <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
                  Approve
                </Button>
              </>
            )}
            {!existing && (
              <Button onClick={() => create.mutate()} disabled={!canSave || create.isPending}>
                {create.isPending ? "Saving…" : "Save"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
