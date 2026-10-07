import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";

// Shared by SalesPage/PurchasesPage/VouchersPage — inline edit/remove for a
// still-PENDING saved row. Any Accountant/Sr. Accountant/Admin may act on
// any pending row (not just the one they created); the server enforces the
// same rule and additionally rejects once a row is no longer PENDING.
export function useRowEditor(resource: "sales" | "purchases" | "vouchers", listQueryKey: unknown[]) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});

  function startEdit(id: string, initial: Record<string, string>) {
    setEditingId(id);
    setDraft(initial);
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  function setDraftField(key: string, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) => api.patch(`/${resource}/${id}`, body),
    onSuccess: () => {
      toast.success("Row updated");
      cancelEdit();
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not update row"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/${resource}/${id}`),
    onSuccess: () => {
      toast.success("Row removed");
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not remove row"),
  });

  return { editingId, draft, startEdit, cancelEdit, setDraftField, update, remove };
}
