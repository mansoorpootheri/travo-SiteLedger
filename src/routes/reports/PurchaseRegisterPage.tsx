import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useSiteSelection } from "@/lib/site-context";
import type { Purchase, Vendor } from "@/lib/types";

const ALL_VENDORS = "__all__";

export default function PurchaseRegisterPage() {
  const { siteId } = useSiteSelection();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vendorId, setVendorId] = useState(ALL_VENDORS);
  const [showRejected, setShowRejected] = useState(false);
  const { data: vendors } = useQuery({
    queryKey: ["master-data", "/vendors"],
    queryFn: () => api.get<Vendor[]>("/vendors"),
  });

  const params = new URLSearchParams();
  params.set("siteId", siteId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (vendorId !== ALL_VENDORS) params.set("vendorId", vendorId);
  if (showRejected) params.set("status", "ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "purchases", siteId, from, to, vendorId, showRejected],
    queryFn: () => api.get<Purchase[]>(`/reports/purchases?${params.toString()}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
        <Select value={vendorId} onValueChange={setVendorId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="All vendors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VENDORS}>All vendors</SelectItem>
            {vendors?.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
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
              <TableHead>Vendor</TableHead>
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
            {data?.map((purchase) => (
              <TableRow key={purchase.id}>
                <TableCell>{new Date(purchase.date).toLocaleDateString()}</TableCell>
                <TableCell>{purchase.vendor?.name}</TableCell>
                <TableCell>{purchase.item?.name}</TableCell>
                <TableCell>{purchase.qty}</TableCell>
                <TableCell>{Number(purchase.amount).toFixed(2)}</TableCell>
                <TableCell>{purchase.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
