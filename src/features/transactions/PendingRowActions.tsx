import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Check, X } from "lucide-react";

interface PendingRowActionsProps {
  editing: boolean;
  /** Whether the current user is allowed to edit/remove this row at all (any Accountant/Sr. Accountant/Admin — not Owner). */
  canEdit: boolean;
  isPending: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
  deleting?: boolean;
  /** Shown alongside the edit/delete icons when not editing — e.g. an approve checkbox or a "Record Receipt" button. */
  children?: ReactNode;
}

// Shared by SalesPage/PurchasesPage/VouchersPage's saved-row trailing cell —
// edit/remove a still-PENDING row in place, alongside whatever other
// per-row action that page already shows (approve checkbox, linked-payment
// button). Once a row is Approved/Rejected, `isPending` is false and the
// pencil/trash icons disappear entirely — there is no edit/resubmit path
// past that point (see server/src/lib/transactionRouter.ts's PATCH/DELETE
// /:id, which enforces the same rule server-side).
export function PendingRowActions({
  editing,
  canEdit,
  isPending,
  onEdit,
  onDelete,
  onSave,
  onCancel,
  saving,
  deleting,
  children,
}: PendingRowActionsProps) {
  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSave} disabled={saving} title="Save">
          <Check className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel} title="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1">
      {children}
      {canEdit && isPending && (
        <>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Edit">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            disabled={deleting}
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </div>
  );
}
