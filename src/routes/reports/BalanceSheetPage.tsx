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

interface BalanceSheetResponse {
  rows: StatementRow[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

interface AccountLedgerRow {
  id: string;
  date: string;
  sourceType: "SALE" | "PURCHASE" | "VOUCHER" | "JOURNAL_VOUCHER";
  particulars: string | null;
  side: "DEBIT" | "CREDIT";
  amount: number;
}

export default function BalanceSheetPage() {
  const { siteId } = useSiteSelection();
  const [asOf, setAsOf] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<{ id: string; name: string } | null>(null);

  const params = new URLSearchParams({ siteId });
  if (asOf) params.set("asOf", asOf);
  const { data } = useQuery({
    queryKey: ["reports", "balance-sheet", siteId, asOf],
    queryFn: () => api.get<BalanceSheetResponse>(`/reports/balance-sheet?${params.toString()}`),
  });

  // Every posting is a balanced debit/credit pair (or a balanced set, for a
  // Journal Voucher's lines), so a Balance Sheet that only totals
  // Asset/Liability/Equity accounts is short by exactly the net effect that
  // landed in Income/Expense accounts instead — this app has no year-end
  // step that closes that into Retained Earnings, so it's folded in here as
  // a "Profit & Loss A/c" line, the standard way an interim (not-yet-closed)
  // balance sheet presents it.
  const plParams = new URLSearchParams({ siteId });
  if (asOf) plParams.set("to", asOf);
  const { data: pl } = useQuery({
    queryKey: ["reports", "profit-and-loss", siteId, "to", asOf],
    queryFn: () => api.get<{ netProfit: number }>(`/reports/profit-and-loss?${plParams.toString()}`),
  });

  const ledgerParams = new URLSearchParams({ siteId, accountId: selectedAccount?.id ?? "" });
  if (asOf) ledgerParams.set("to", asOf);
  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ["reports", "account-ledger", siteId, selectedAccount?.id, asOf],
    queryFn: () => api.get<AccountLedgerRow[]>(`/reports/account-ledger?${ledgerParams.toString()}`),
    enabled: !!selectedAccount,
  });

  const netProfit = pl?.netProfit ?? 0;
  const assetRows = (data?.rows ?? []).filter((r) => r.accountType === "ASSET" && Math.abs(r.net) > 0.005);
  const liabilityAndEquityRows = (data?.rows ?? []).filter(
    (r) => (r.accountType === "LIABILITY" || r.accountType === "EQUITY") && Math.abs(r.net) > 0.005,
  );
  const totalAssets = data?.totalAssets ?? 0;
  const totalLiabilitiesAndEquity = (data?.totalLiabilities ?? 0) + (data?.totalEquity ?? 0) + netProfit;

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <Input type="date" className="w-48" value={asOf} onChange={(e) => setAsOf(e.target.value)} placeholder="As on date" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Total Liabilities" value={totalLiabilitiesAndEquity} accent={Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.005} />
        <SummaryCard label="Total Assets" value={totalAssets} accent={Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.005} />
        <div className="rounded-xl border bg-background p-6">
          <p className="text-sm text-muted-foreground">As On Date</p>
          <p className="text-2xl font-bold">{asOf ? new Date(asOf).toLocaleDateString() : "Today"}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <BSColumn
          title="Liabilities"
          total={totalLiabilitiesAndEquity}
          rows={liabilityAndEquityRows}
          extraRow={Math.abs(netProfit) > 0.005 ? { label: "Profit & Loss A/c", amount: netProfit } : undefined}
          onSelect={setSelectedAccount}
        />
        <BSColumn title="Assets" total={totalAssets} rows={assetRows} onSelect={setSelectedAccount} />
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
                    No postings up to this date.
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

function SummaryCard({ label, value, accent }: { label: string; value: number; accent: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-background p-6">
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value.toFixed(2)}</p>
      </div>
      <div className={cn("h-10 w-10 rounded-lg", accent ? "bg-[#12805A]/15" : "bg-[#B33B2E]/15")} />
    </div>
  );
}

function BSColumn({
  title,
  total,
  rows,
  extraRow,
  onSelect,
}: {
  title: string;
  total: number;
  rows: StatementRow[];
  extraRow?: { label: string; amount: number };
  onSelect: (account: { id: string; name: string }) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between border-b pb-2">
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">{title}</h2>
        <span className="font-semibold">{total.toFixed(2)}</span>
      </div>
      {rows.length === 0 && !extraRow ? (
        <p className="py-3 text-sm text-muted-foreground">No activity yet.</p>
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
          {extraRow && (
            <li className="flex items-center justify-between py-2">
              <span className="text-sm">{extraRow.label}</span>
              <span className="text-sm tabular-nums">{extraRow.amount.toFixed(2)}</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
