import { Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useSiteSelection } from "@/lib/site-context";
import { GL_ACCOUNT_GROUP_LABELS, type GLAccountGroup, type GLAccountType } from "@/lib/types";

interface TrialBalanceRow {
  accountId: string;
  accountName: string;
  accountType: GLAccountType;
  accountGroup: GLAccountGroup | null;
  debit: number;
  credit: number;
  net: number;
}

const TYPE_LABELS: Record<GLAccountType, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
};

export default function TrialBalancePage() {
  const { siteId } = useSiteSelection();
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "trial-balance", siteId],
    queryFn: () => api.get<TrialBalanceRow[]>(`/reports/trial-balance?siteId=${siteId}`),
  });

  // Already sorted server-side (Asset -> Liability -> Equity -> Income ->
  // Expense, then group, then name) — group into contiguous type sections
  // here purely for the subtotal rows, not to re-sort anything.
  const sections: { type: GLAccountType; rows: TrialBalanceRow[] }[] = [];
  for (const row of data ?? []) {
    const current = sections[sections.length - 1];
    if (current && current.type === row.accountType) current.rows.push(row);
    else sections.push({ type: row.accountType, rows: [row] });
  }

  // Each account contributes to exactly one column (whichever side its net
  // balance sits on) — the conventional Trial Balance presentation, unlike
  // G/L Summary's gross debit/credit per account — so subtotals below are
  // summed the same way, not from the raw gross debit/credit the server
  // also returns.
  function netTotals(rows: TrialBalanceRow[]) {
    return rows.reduce(
      (acc, row) => ({
        debit: acc.debit + (row.net >= 0 ? row.net : 0),
        credit: acc.credit + (row.net < 0 ? -row.net : 0),
      }),
      { debit: 0, credit: 0 },
    );
  }

  const grandTotal = netTotals(data ?? []);

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Trial Balance</h2>
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Group</TableHead>
              <TableHead>Debit</TableHead>
              <TableHead>Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No GL accounts yet.
                </TableCell>
              </TableRow>
            )}
            {sections.map((section) => {
              const subtotal = netTotals(section.rows);
              return (
                <Fragment key={section.type}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={4} className="font-semibold">
                      {TYPE_LABELS[section.type]}
                    </TableCell>
                  </TableRow>
                  {section.rows.map((row) => (
                    <TableRow key={row.accountId}>
                      <TableCell>{row.accountName}</TableCell>
                      <TableCell>{row.accountGroup ? GL_ACCOUNT_GROUP_LABELS[row.accountGroup] : "—"}</TableCell>
                      <TableCell>{row.net >= 0 ? row.net.toFixed(2) : ""}</TableCell>
                      <TableCell>{row.net < 0 ? (-row.net).toFixed(2) : ""}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-medium text-muted-foreground">
                    <TableCell colSpan={2}>{TYPE_LABELS[section.type]} total</TableCell>
                    <TableCell>{subtotal.debit.toFixed(2)}</TableCell>
                    <TableCell>{subtotal.credit.toFixed(2)}</TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
            {data && data.length > 0 && (
              <TableRow className="font-semibold">
                <TableCell colSpan={2}>Grand total</TableCell>
                <TableCell>{grandTotal.debit.toFixed(2)}</TableCell>
                <TableCell>{grandTotal.credit.toFixed(2)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
