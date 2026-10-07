import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useSiteSelection } from "@/lib/site-context";
import type { Sale, Customer } from "@/lib/types";

const ALL_CUSTOMERS = "__all__";

export default function SalesRegisterPage() {
  const { siteId } = useSiteSelection();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [customerId, setCustomerId] = useState(ALL_CUSTOMERS);
  const [showRejected, setShowRejected] = useState(false);
  const { data: customers } = useQuery({
    queryKey: ["master-data", "/customers"],
    queryFn: () => api.get<Customer[]>("/customers"),
  });

  const params = new URLSearchParams();
  params.set("siteId", siteId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (customerId !== ALL_CUSTOMERS) params.set("customerId", customerId);
  if (showRejected) params.set("status", "ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "sales", siteId, from, to, customerId, showRejected],
    queryFn: () => api.get<Sale[]>(`/reports/sales?${params.toString()}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CUSTOMERS}>All customers</SelectItem>
            {customers?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={showRejected} onCheckedChange={(v) => setShowRejected(Boolean(v))} />
          Show rejected
        </label>
      </div>
      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Qty</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {data?.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell>{new Date(sale.date).toLocaleDateString()}</TableCell>
                <TableCell>{sale.customer?.name}</TableCell>
                <TableCell>{sale.item?.name}</TableCell>
                <TableCell>{sale.qty}</TableCell>
                <TableCell>{Number(sale.amount).toFixed(2)}</TableCell>
                <TableCell>{sale.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
