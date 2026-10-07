import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useSiteSelection } from "@/lib/site-context";

interface GlSummaryRow {
  accountId: string;
  accountName: string;
  accountType: string | null;
  debit: number;
  credit: number;
  net: number;
}

export default function GlSummaryPage() {
  const { siteId } = useSiteSelection();
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "gl-summary", siteId],
    queryFn: () => api.get<GlSummaryRow[]>(`/reports/gl-summary?siteId=${siteId}`),
  });

  const totals = data?.reduce(
    (acc, row) => ({ debit: acc.debit + row.debit, credit: acc.credit + row.credit }),
    { debit: 0, credit: 0 },
  );

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">G/L Summary (trial-balance style)</h2>
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Debit</TableHead>
              <TableHead>Credit</TableHead>
              <TableHead>Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {data?.map((row) => (
              <TableRow key={row.accountId}>
                <TableCell>{row.accountName}</TableCell>
                <TableCell>{row.accountType}</TableCell>
                <TableCell>{row.debit.toFixed(2)}</TableCell>
                <TableCell>{row.credit.toFixed(2)}</TableCell>
                <TableCell>{row.net.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {totals && (
              <TableRow className="font-semibold">
                <TableCell colSpan={2}>Total</TableCell>
                <TableCell>{totals.debit.toFixed(2)}</TableCell>
                <TableCell>{totals.credit.toFixed(2)}</TableCell>
                <TableCell>{(totals.debit - totals.credit).toFixed(2)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
