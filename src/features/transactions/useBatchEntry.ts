import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { BatchRowResult } from "@/lib/types";

export function useBatchEntry<Row extends Record<string, string>>(endpoint: string, listQueryKey: unknown[]) {
  const queryClient = useQueryClient();
  // Starts empty — no blank row is pre-seeded on page load; the user adds
  // one explicitly via the grid's own "+" (add row) button.
  const [rows, setRows] = useState<Row[]>([]);
  const [results, setResults] = useState<BatchRowResult[] | undefined>();

  const submit = useMutation({
    mutationFn: (payload: Row[]) => api.post<BatchRowResult[]>(`${endpoint}/batch`, payload),
    onSuccess: (data) => {
      const successCount = data.filter((r) => r.status === "created").length;
      const errorCount = data.length - successCount;
      if (successCount) toast.success(`${successCount} row(s) saved as Pending`);
      if (errorCount) toast.error(`${errorCount} row(s) failed — see highlighted rows below`);
      queryClient.invalidateQueries({ queryKey: listQueryKey });

      // Drop rows that saved successfully — they now appear as saved rows via
      // the invalidated query above, so leaving them in the draft grid too
      // would show every submitted row twice. Failed rows stay put for
      // correction, kept aligned with `results` by index.
      setRows((prev) => prev.filter((_, i) => data[i]?.status !== "created"));
      setResults(errorCount ? data.filter((r) => r.status !== "created") : undefined);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  function clearSavedRows() {
    if (!results) return;
    setRows(rows.filter((_, i) => results[i]?.status !== "created"));
    setResults(undefined);
  }

  return { rows, setRows, results, submit, clearSavedRows };
}
