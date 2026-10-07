import { Badge } from "@/components/ui/badge";
import type { TransactionStatus } from "@/lib/types";

// Muted, ink-family status tones (see the palette in index.css's --primary) —
// tuned quieter than stock Tailwind shades so they sit in the same system.
const VARIANTS: Record<TransactionStatus, string> = {
  PENDING: "bg-[#AD7A16]/10 text-[#8A620F] hover:bg-[#AD7A16]/10",
  APPROVED: "bg-[#12805A]/10 text-[#0E6647] hover:bg-[#12805A]/10",
  REJECTED: "bg-[#B33B2E]/10 text-[#8F2F25] hover:bg-[#B33B2E]/10",
};

export function StatusBadge({ status }: { status: TransactionStatus | null }) {
  if (!status) return <Badge variant="outline">Standalone</Badge>;
  return <Badge className={VARIANTS[status]}>{status}</Badge>;
}
