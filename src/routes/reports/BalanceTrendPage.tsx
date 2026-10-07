import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useSiteSelection } from "@/lib/site-context";

interface TrendRow {
  date: string;
  bankClosingBalance: number;
  cashClosingBalance: number;
}

export default function BalanceTrendPage() {
  const { siteId } = useSiteSelection();

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "balance-trend", siteId],
    queryFn: () => api.get<TrendRow[]>(`/reports/balance-trend?siteId=${siteId}`),
    enabled: !!siteId,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Bank Closing Balance</TableHead>
              <TableHead>Cash Closing Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {data?.map((row) => (
              <TableRow key={row.date}>
                <TableCell>{row.date}</TableCell>
                <TableCell>{row.bankClosingBalance.toFixed(2)}</TableCell>
                <TableCell>{row.cashClosingBalance.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
