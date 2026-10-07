import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useSiteSelection } from "@/lib/site-context";
import type { GLAccountType } from "@/lib/types";

interface StatementRow {
  accountId: string;
  accountName: string;
  accountType: GLAccountType;
  // The tenant's real GL header name (not rendered on this page, kept for
  // shape-parity with Trial Balance's identical row type).
  accountGroup: string | null;
  net: number;
}

interface ProfitAndLossResponse {
  rows: StatementRow[];
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
}

interface AccountLedgerRow {
  id: string;
  date: string;
  sourceType: "SALE" | "PURCHASE" | "VOUCHER" | "JOURNAL_VOUCHER";
  particulars: string | null;
  side: "DEBIT" | "CREDIT";
  amount: number;
}

export default function ProfitAndLossPage() {
  const { siteId } = useSiteSelection();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(null);

  const params = new URLSearchParams({ siteId });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const { data } = useQuery({
    queryKey: ["reports", "profit-and-loss", siteId, from, to],
    queryFn: () => api.get<ProfitAndLossResponse>(`/reports/profit-and-loss?${params.toString()}`),
  });

  // Zero-activity accounts (every GL account under Income/Expense, whether
  // or not anything's posted to it yet) are noise on this summary — unlike
  // Trial Balance, which lists every account on purpose.
  const expenseRows = (data?.rows ?? []).filter((r) => r.accountType === "EXPENSE" && Math.abs(r.net) > 0.005);
  const incomeRows = (data?.rows ?? []).filter((r) => r.accountType === "INCOME" && Math.abs(r.net) > 0.005);

  const ledgerParams = new URLSearchParams({ siteId, accountId: selectedAccount?.id ?? "" });
  if (from) ledgerParams.set("from", from);
  if (to) ledgerParams.set("to", to);
  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["reports", "account-ledger", siteId, selectedAccount?.id, from, to],
    queryFn: () => api.get<AccountLedgerRow[]>(`/reports/account-ledger?${ledgerParams.toString()}`),
    enabled: !!selectedAccount,
  });

  const netProfit = data?.netProfit ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <Input type="date" className="w-48" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
        <Input type="date" className="w-48" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
      </div>

      <div className="flex items-center justify-between rounded-xl border bg-background p-6">
        <div>
          <p className="text-sm text-muted-foreground">Net Profit</p>
          <p className="text-3xl font-bold">{netProfit.toFixed(2)}</p>
        </div>
        <div className={cn("h-12 w-12 rounded-lg", netProfit >= 0 ? "bg-[#12805A]/15" : "bg-[#B33B2E]/15")} />
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <PLColumn title="Expenses" total={data?.totalExpense ?? 0} rows={expenseRows} onSelect={setSelectedAccount} />
        <PLColumn title="Income" total={data?.totalIncome ?? 0} rows={incomeRows} onSelect={setSelectedAccount} />
      </div>

      <div className="flex justify-end gap-8 border-t pt-4">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total Expense</p>
          <p className="font-semibold">{(data?.totalExpense ?? 0).toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total Income</p>
          <p className="font-semibold">{(data?.totalIncome ?? 0).toFixed(2)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Net Profit</p>
          <p className="font-semibold">{netProfit.toFixed(2)}</p>
        </div>
      </div>

      <Dialog open={!!selectedAccount} onOpenChange={(open) => !open && setSelectedAccount(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedAccount?.name}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledgerLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!ledgerLoading && (ledger?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No postings in this range.
                  </TableCell>
                </TableRow>
              )}
              {ledger?.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{new Date(row.date).toLocaleDateString()}</TableCell>
                  <TableCell>{row.sourceType}</TableCell>
                  <TableCell>{row.particulars ?? "—"}</TableCell>
                  <TableCell>{row.amount.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PLColumn({
  title,
  total,
  rows,
  onSelect,
}: {
  title: string;
  total: number;
  rows: StatementRow[];
  onSelect: (account: { id: string; name: string }) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">{title}</h2>
        <span className="font-semibold">{total.toFixed(2)}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">No activity in this range.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.accountId} className="flex items-center justify-between border-b py-2 last:border-0">
              <button
                type="button"
                className="text-left text-sm underline decoration-muted-foreground/50 underline-offset-2 hover:text-primary"
                onClick={() => onSelect({ id: row.accountId, name: row.accountName })}
              >
                {row.accountName}
              </button>
              <span className="text-sm tabular-nums">{row.net.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
