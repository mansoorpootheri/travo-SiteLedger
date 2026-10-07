import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSiteSelection } from "@/lib/site-context";

interface OutstandingRow {
  id: string;
  date: string;
  customer?: { name: string };
  vendor?: { name: string };
  amount: string;
  amountPaid: number;
  balanceDue: number;
}

interface OutstandingSummaryRow {
  id: string;
  name: string;
  balanceDue: number;
}

interface OutstandingResponse {
  sales: OutstandingRow[];
  purchases: OutstandingRow[];
  salesSummary: OutstandingSummaryRow[];
  purchasesSummary: OutstandingSummaryRow[];
}

export default function OutstandingPage() {
  const { siteId } = useSiteSelection();
  const { data, isLoading } = useQuery({
    queryKey: ["reports", "outstanding", siteId],
    queryFn: () => api.get<OutstandingResponse>(`/reports/outstanding?siteId=${siteId}`),
  });

  return (
    <Tabs defaultValue="detail">
      <TabsList>
        <TabsTrigger value="detail">Detail</TabsTrigger>
        <TabsTrigger value="summary">Summary</TabsTrigger>
      </TabsList>

      <TabsContent value="detail">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <OutstandingTable
            title="Sale-wise Balance Due"
            rows={data?.sales}
            partyLabel="Customer"
            partyName={(row) => row.customer?.name}
            isLoading={isLoading}
          />
          <OutstandingTable
            title="Purchase-wise Balance Due"
            rows={data?.purchases}
            partyLabel="Vendor"
            partyName={(row) => row.vendor?.name}
            isLoading={isLoading}
          />
        </div>
      </TabsContent>

      <TabsContent value="summary">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <SummaryTable title="Outstanding by Customer" partyLabel="Customer" rows={data?.salesSummary} isLoading={isLoading} />
          <SummaryTable title="Outstanding by Vendor" partyLabel="Vendor" rows={data?.purchasesSummary} isLoading={isLoading} />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function OutstandingTable({
  title,
  rows,
  partyLabel,
  partyName,
  isLoading,
}: {
  title: string;
  rows?: OutstandingRow[];
  partyLabel: string;
  partyName: (row: OutstandingRow) => string | undefined;
  isLoading: boolean;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>{partyLabel}</TableHead>
              <TableHead>Amount</TableHead>
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
            {!isLoading && (rows?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Nothing outstanding.
                </TableCell>
              </TableRow>
            )}
            {rows?.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{new Date(row.date).toLocaleDateString()}</TableCell>
                <TableCell>{partyName(row)}</TableCell>
                <TableCell>{Number(row.amount).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// One row per party — starts from their openingBalance (if set) and adds
// every approved transaction's balanceDue, so a party with only an opening
// balance and no transactions yet still shows up. Server pre-sorts largest
// balance first and drops parties that net to (near) zero.
function SummaryTable({
  title,
  partyLabel,
  rows,
  isLoading,
}: {
  title: string;
  partyLabel: string;
  rows?: OutstandingSummaryRow[];
  isLoading: boolean;
}) {
  const total = rows?.reduce((sum, r) => sum + r.balanceDue, 0) ?? 0;
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{partyLabel}</TableHead>
              <TableHead>Outstanding Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (rows?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Nothing outstanding.
                </TableCell>
              </TableRow>
            )}
            {rows?.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.balanceDue.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            {rows && rows.length > 0 && (
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell>{total.toFixed(2)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
