import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Combobox, type ComboboxQuickCreate } from "@/components/ui/combobox";
import { Badge } from "@/components/ui/badge";
import type { BatchRowResult } from "@/lib/types";

export interface MasterDataField {
  name: string;
  label: string;
  type: "text" | "select" | "number" | "date";
  options?: { value: string; label: string }[];
  /** Only meaningful when type is "select" — offers an inline "+ Add new" option in the combobox. */
  quickCreate?: ComboboxQuickCreate;
  /** "number"/"date" only: field can be left blank (e.g. opening balance) — skips the native `required` attribute. */
  optional?: boolean;
}

// The server's zod schemas use `z.coerce.number()`/`z.coerce.date()` for
// optional numeric/date fields, and coercing an empty string produces 0 /
// an Invalid Date rather than "not set" — so a blank optional field must be
// left out of the request body entirely, not sent as "".
function buildRequestBody(form: Record<string, string>, fields: MasterDataField[]) {
  const body: Record<string, string> = {};
  for (const field of fields) {
    const value = form[field.name];
    if ((field.type === "number" || field.type === "date") && !value) continue;
    if (value !== undefined) body[field.name] = value;
  }
  return body;
}

export interface MasterDataColumn<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
}

interface MasterDataPageProps<T extends { id: string; isActive: boolean }> {
  title: string;
  endpoint: string;
  columns: MasterDataColumn<T>[];
  fields: MasterDataField[];
  canWrite: boolean;
  /** Admin-only CSV bulk upload — only entities with `bulkImport` configured server-side (lib/masterDataRouter.ts) support this. */
  canBulkImport?: boolean;
  /**
   * Shown in the Import dialog for a CSV column that must match an existing
   * record/label (e.g. Items' "Unit" column, GL Accounts' "Group" column) —
   * without this, there's no way to know what value to type while filling
   * the CSV outside the app.
   */
  bulkImportReference?: { fieldLabel: string; values: string[] };
}

export function MasterDataPage<T extends { id: string; isActive: boolean }>({
  title,
  endpoint,
  columns,
  fields,
  canWrite,
  canBulkImport,
  bulkImportReference,
}: MasterDataPageProps<T>) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["master-data", endpoint],
    queryFn: () => api.get<T[]>(endpoint),
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editingRow, setEditingRow] = useState<T | null>(null);
  const singular = title.replace(/s$/, "");

  function closeDialog() {
    setOpen(false);
    setForm({});
    setEditingRow(null);
  }

  const createMutation = useMutation({
    mutationFn: (body: Record<string, string>) => api.post(endpoint, body),
    onSuccess: () => {
      toast.success(`${singular} created`);
      queryClient.invalidateQueries({ queryKey: ["master-data", endpoint] });
      closeDialog();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, string> }) => api.patch(`${endpoint}/${id}`, body),
    onSuccess: () => {
      toast.success(`${singular} updated`);
      queryClient.invalidateQueries({ queryKey: ["master-data", endpoint] });
      closeDialog();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  function startEdit(row: T) {
    setEditingRow(row);
    setForm(
      Object.fromEntries(
        fields.map((f) => {
          const raw = (row as Record<string, unknown>)[f.name];
          // A "date" field's stored value is a full ISO datetime string
          // (e.g. "2026-01-01T00:00:00.000Z"); <input type="date"> only
          // accepts the "YYYY-MM-DD" prefix.
          const value = f.type === "date" && typeof raw === "string" ? raw.slice(0, 10) : String(raw ?? "");
          return [f.name, raw == null ? "" : value];
        }),
      ),
    );
    setOpen(true);
  }

  const [importOpen, setImportOpen] = useState(false);
  const [importResults, setImportResults] = useState<BatchRowResult[] | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.postFile<BatchRowResult[]>(`${endpoint}/bulk-import`, formData);
    },
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.status === "created").length;
      const errorCount = results.length - successCount;
      if (successCount) toast.success(`${successCount} row(s) imported`);
      if (errorCount) toast.error(`${errorCount} row(s) failed — see details below`);
      setImportResults(results);
      queryClient.invalidateQueries({ queryKey: ["master-data", endpoint] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not import file"),
  });

  function closeImportDialog() {
    setImportOpen(false);
    setImportResults(undefined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // No delete for master data (see masterDataRouter.ts) — isActive is the
  // retire-a-record mechanism instead, same as User.active. Separate from
  // updateMutation since the server's isActive field is a plain boolean
  // (not z.coerce'd like the form fields), so this sends real JSON true/
  // false rather than the string-keyed form body the Edit dialog builds.
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`${endpoint}/${id}`, { isActive }),
    onSuccess: (_data, variables) => {
      toast.success(`${singular} ${variables.isActive ? "activated" : "deactivated"}`);
      queryClient.invalidateQueries({ queryKey: ["master-data", endpoint] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Something went wrong"),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="flex gap-2">
          {canBulkImport && (
            <Dialog open={importOpen} onOpenChange={(next) => (next ? setImportOpen(true) : closeImportDialog())}>
              <DialogTrigger asChild>
                <Button variant="outline">Import</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import {title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() =>
                      api
                        .downloadFile(`${endpoint}/bulk-import/template`)
                        .catch((err) => toast.error(err instanceof ApiError ? err.message : "Could not download template"))
                    }
                    className="text-sm text-primary underline underline-offset-2"
                  >
                    Download CSV template
                  </button>
                  {bulkImportReference && (
                    <div className="rounded-md border bg-muted/30 p-2 text-sm">
                      <p className="font-medium">Valid {bulkImportReference.fieldLabel}s</p>
                      <p className="text-muted-foreground">
                        {bulkImportReference.values.length > 0 ? bulkImportReference.values.join(", ") : "None saved yet."}
                      </p>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="bulk-import-file">Filled-in CSV</Label>
                    <Input id="bulk-import-file" ref={fileInputRef} type="file" accept=".csv,text/csv" />
                  </div>
                  {importResults && (
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2 text-sm">
                      {importResults.map((r) => (
                        <div key={r.index} className={r.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                          Row {r.index + 1}: {r.status === "created" ? "Imported" : r.error}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => {
                      const file = fileInputRef.current?.files?.[0];
                      if (!file) {
                        toast.error("Choose a CSV file first");
                        return;
                      }
                      importMutation.mutate(file);
                    }}
                    disabled={importMutation.isPending}
                  >
                    {importMutation.isPending ? "Importing…" : "Upload"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {canWrite && (
            <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeDialog())}>
              <DialogTrigger asChild>
                <Button onClick={() => setEditingRow(null)}>Add {singular}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingRow ? `Edit ${singular}` : `New ${singular}`}</DialogTitle>
                </DialogHeader>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const body = buildRequestBody(form, fields);
                    if (editingRow) updateMutation.mutate({ id: editingRow.id, body });
                    else createMutation.mutate(body);
                  }}
                >
                  {fields.map((field) => (
                    <div key={field.name} className="space-y-1.5">
                      <Label htmlFor={field.name}>{field.label}</Label>
                      {field.type === "select" ? (
                        <Combobox
                          id={field.name}
                          value={form[field.name] ?? ""}
                          onValueChange={(value) => setForm((f) => ({ ...f, [field.name]: value }))}
                          options={field.options ?? []}
                          placeholder={`Select ${field.label}`}
                          quickCreate={field.quickCreate}
                        />
                      ) : (
                        <Input
                          id={field.name}
                          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                          step={field.type === "number" ? "0.01" : undefined}
                          value={form[field.name] ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, [field.name]: e.target.value }))}
                          required={!field.optional}
                        />
                      )}
                    </div>
                  ))}
                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {createMutation.isPending || updateMutation.isPending ? "Saving…" : "Save"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key}>{col.label}</TableHead>
              ))}
              <TableHead>Status</TableHead>
              {canWrite && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={columns.length + 1 + (canWrite ? 1 : 0)} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + 1 + (canWrite ? 1 : 0)} className="text-center text-muted-foreground">
                  No records yet.
                </TableCell>
              </TableRow>
            )}
            {data?.map((row) => (
              <TableRow key={row.id} className={!row.isActive ? "opacity-60" : undefined}>
                {columns.map((col) => (
                  <TableCell key={col.key}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </TableCell>
                ))}
                <TableCell>
                  <Badge className={row.isActive ? "bg-[#12805A]/10 text-[#0E6647]" : "bg-[#B33B2E]/10 text-[#8F2F25]"}>
                    {row.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                {canWrite && (
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(row)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleActiveMutation.mutate({ id: row.id, isActive: !row.isActive })}
                        disabled={toggleActiveMutation.isPending}
                      >
                        {row.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
