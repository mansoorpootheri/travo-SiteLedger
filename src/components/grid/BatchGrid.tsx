import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxQuickCreate } from "@/components/ui/combobox";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell, TableFooter } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import type { BatchRowResult } from "@/lib/types";

export interface GridColumn {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "custom";
  options?: { value: string; label: string }[];
  /** Only meaningful when type is "select" — offers an inline "+ Add new" option in the combobox so a brand-new Customer/Vendor/Item doesn't require leaving the grid. */
  quickCreate?: ComboboxQuickCreate;
  /** Fixed CSS width (e.g. "72px") for a column that needs to stay narrow, such as an icon toggle. The table uses `table-fixed` layout, so columns left unset instead share the remaining width evenly — this is how the grid stays within the viewport with no horizontal scrollbar regardless of column count. */
  width?: string;
  /** Shown as a column total in the footer row. */
  summable?: boolean;
  /** false = not an entry field (e.g. G/L mapping, status) — left blank on a new row and only populated once a saved row provides it via `SavedGridRow.cells`. Defaults to true. */
  editable?: boolean;
  /** Required when type is "custom" — renders the draft-row editor for this column in place of the default Input/Combobox. */
  renderCell?: (value: string, onChange: (value: string) => void) => ReactNode;
  /** Extra className applied to a draft row's editor for this column, computed from the row (e.g. color an amount field by the row's own type). */
  cellClassName?: (row: Record<string, string>) => string | undefined;
  /** Multiplier applied to a draft row's raw value before it's added into the column total — e.g. -1 for a Payment row so the footer nets Receipts minus Payments instead of summing both as positive. Defaults to 1 (plain sum). */
  sign?: (row: Record<string, string>) => number;
}

/** A previously-saved, read-only row rendered above the editable draft rows in the same table. */
export interface SavedGridRow {
  id: string;
  cells: Partial<Record<string, ReactNode>>;
  /** Numeric value per summable column, added into the footer total alongside the draft rows. */
  numericValues?: Partial<Record<string, number>>;
  /** Rendered in the trailing action column (e.g. an approve checkbox or a "Record Receipt" button). */
  trailingCell?: ReactNode;
  className?: string;
}

interface BatchGridProps<Row extends Record<string, string>> {
  columns: GridColumn[];
  savedRows?: SavedGridRow[];
  savedRowsLoading?: boolean;
  rows: Row[];
  onChange: (rows: Row[]) => void;
  results?: BatchRowResult[];
  emptyRow: Row;
  /** Fixed width for the trailing action column (e.g. "150px" for a "Record Receipt" button). Defaults to a narrow checkbox-sized column — set this when a page's `trailingCell` needs more room, so that column's content doesn't force the table (which uses `table-fixed`) to overflow the viewport. */
  trailingWidth?: string;
  /** id of a saved row currently being edited in place — that row's cells render the same editors as a draft row (sourced from `savedRowDraft`) instead of its normal read-only `cells`. */
  editingSavedRowId?: string;
  savedRowDraft?: Record<string, string>;
  onSavedRowDraftChange?: (key: string, value: string) => void;
  /** Label for the footer row's first cell. Defaults to "Total". */
  footerLabel?: string;
  /** An additional footer row below the column-totals row (e.g. a combined Bank+Cash closing balance) — `spanKeys` are merged into one cell showing `value`. */
  extraFooterRow?: { label: string; spanKeys: string[]; value: string; valueClassName?: string };
}

/** The Input/Combobox/custom editor for one cell, shared between draft rows and a saved row in edit mode. `rowValues` is the full row being edited, passed to `col.cellClassName` (e.g. to color an amount field by that row's own sign). */
function FieldEditor({
  col,
  value,
  rowValues,
  onChange,
  hasError,
  title,
  onPaste,
  autoFocus,
}: {
  col: GridColumn;
  value: string;
  rowValues: Record<string, string>;
  onChange: (value: string) => void;
  hasError?: boolean;
  title?: string;
  onPaste?: (e: React.ClipboardEvent) => void;
  autoFocus?: boolean;
}) {
  if (col.editable === false) {
    return (
      <span className={cn("flex h-8 items-center px-2.5 text-muted-foreground", col.type === "number" && "justify-end tabular-nums")}>
        —
      </span>
    );
  }
  if (col.type === "select") {
    return (
      <Combobox
        value={value}
        onValueChange={onChange}
        options={col.options ?? []}
        hasError={hasError}
        quickCreate={col.quickCreate}
      />
    );
  }
  if (col.type === "custom") {
    return <>{col.renderCell?.(value, onChange)}</>;
  }
  return (
    <Input
      className={cn(
        "h-8",
        col.type === "number" && "text-right tabular-nums",
        col.cellClassName?.(rowValues),
        hasError && "border-destructive",
      )}
      type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      onPaste={onPaste}
      autoFocus={autoFocus}
    />
  );
}

// Renders the extra footer row's cells: the first column holds the label,
// any contiguous run of `spanKeys` columns is merged into one cell showing
// `value`, and everything else is left blank.
function renderExtraFooterCells(
  columns: GridColumn[],
  row: { label: string; spanKeys: string[]; value: string; valueClassName?: string },
) {
  const cells: ReactNode[] = [];
  let i = 0;
  while (i < columns.length) {
    const col = columns[i];
    if (i === 0) {
      cells.push(
        <TableCell key={col.key} className="font-semibold">
          {row.label}
        </TableCell>,
      );
      i += 1;
      continue;
    }
    if (row.spanKeys.includes(col.key)) {
      let span = 0;
      while (i + span < columns.length && row.spanKeys.includes(columns[i + span].key)) span += 1;
      cells.push(
        <TableCell key={col.key} colSpan={span} className={cn("text-right font-semibold tabular-nums", row.valueClassName)}>
          {row.value}
        </TableCell>,
      );
      i += span;
      continue;
    }
    cells.push(<TableCell key={col.key} />);
    i += 1;
  }
  return cells;
}

// Excel-style batch entry grid (FRD: spreadsheet-style entry rather than
// one-record-at-a-time forms). Saved rows (already persisted) and draft rows
// (being entered) share one table/numbering/footer — there is no separate
// list underneath. Each draft row is a plain object of string field values;
// parsing/coercion to the right types happens where the row is turned into a
// request body, not here — this component only owns layout, add/remove, and
// displaying the per-row batch-submit result.
export function BatchGrid<Row extends Record<string, string>>({
  columns,
  savedRows = [],
  savedRowsLoading,
  rows,
  onChange,
  results,
  emptyRow,
  trailingWidth,
  editingSavedRowId,
  savedRowDraft,
  onSavedRowDraftChange,
  footerLabel = "Total",
  extraFooterRow,
}: BatchGridProps<Row>) {
  const [pasteHint, setPasteHint] = useState(false);
  // Set on "Add row" so the new row's first column can autofocus once it
  // mounts; cleared right after so a later re-render (e.g. typing in some
  // other row) doesn't keep stealing focus back to it.
  const [focusRowIndex, setFocusRowIndex] = useState<number | null>(null);

  function updateCell(index: number, key: string, value: string) {
    const next = rows.slice();
    next[index] = { ...next[index], [key]: value };
    onChange(next);
  }

  function addRow() {
    setFocusRowIndex(rows.length);
    onChange([...rows, { ...emptyRow }]);
  }

  // autoFocus only matters at mount, so this only needs to run once per
  // "Add row" click — clearing it afterward prevents a stale index from
  // matching some unrelated row later (e.g. after rows are removed).
  useEffect(() => {
    if (focusRowIndex === null) return;
    const id = setTimeout(() => setFocusRowIndex(null), 0);
    return () => clearTimeout(id);
  }, [focusRowIndex]);

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  function handlePaste(index: number, colIndex: number, e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // let the default single-cell paste happen
    e.preventDefault();
    setPasteHint(true);
    const grid = text
      .trim()
      .split("\n")
      .map((line) => line.split("\t"));
    const next = rows.slice();
    grid.forEach((line, r) => {
      const rowIndex = index + r;
      while (next.length <= rowIndex) next.push({ ...emptyRow });
      line.forEach((value, c) => {
        const col = columns[colIndex + c];
        if (col) next[rowIndex] = { ...next[rowIndex], [col.key]: value.trim() };
      });
    });
    onChange(next);
  }

  function columnTotal(col: GridColumn) {
    const draftSum = rows.reduce((acc, row) => acc + (Number(row[col.key]) || 0) * (col.sign?.(row) ?? 1), 0);
    const savedSum = savedRows.reduce((acc, r) => acc + (r.numericValues?.[col.key] ?? 0), 0);
    const sum = draftSum + savedSum;
    return Number.isInteger(sum) ? String(sum) : sum.toFixed(2);
  }

  const colSpan = columns.length + 2;

  return (
    <div className="space-y-2">
      {pasteHint && <p className="text-xs text-muted-foreground">Pasted from clipboard — review highlighted rows before submitting.</p>}
      <div className="rounded-md border bg-background">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="border-b-2">
              <TableHead className="w-9 text-center text-muted-foreground">#</TableHead>
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn("truncate font-semibold", col.type === "number" && "text-right")}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.label}
                </TableHead>
              ))}
              <TableHead className={trailingWidth ? undefined : "w-9"} style={trailingWidth ? { width: trailingWidth } : undefined} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {savedRowsLoading && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {savedRows.map((saved, i) => {
              const isEditing = saved.id === editingSavedRowId;
              return (
                <TableRow key={saved.id} className={saved.className}>
                  <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                  {columns.map((col) =>
                    isEditing ? (
                      <TableCell key={col.key} className="p-1">
                        <FieldEditor
                          col={col}
                          value={savedRowDraft?.[col.key] ?? ""}
                          rowValues={savedRowDraft ?? {}}
                          onChange={(v) => onSavedRowDraftChange?.(col.key, v)}
                        />
                      </TableCell>
                    ) : (
                      <TableCell
                        key={col.key}
                        className={cn("truncate p-1", col.type === "number" && "text-right tabular-nums")}
                        title={typeof saved.cells[col.key] === "string" ? (saved.cells[col.key] as string) : undefined}
                      >
                        {saved.cells[col.key] ?? null}
                      </TableCell>
                    ),
                  )}
                  <TableCell className="p-1">{saved.trailingCell}</TableCell>
                </TableRow>
              );
            })}
            {rows.map((row, index) => {
              const result = results?.[index];
              const hasError = result?.status === "error";
              return (
                <Fragment key={index}>
                  <TableRow className={cn(hasError && "bg-destructive/5")}>
                    <TableCell className="text-center text-xs text-muted-foreground">{savedRows.length + index + 1}</TableCell>
                    {columns.map((col, colIndex) => (
                      <TableCell key={col.key} className="p-1">
                        <FieldEditor
                          col={col}
                          value={row[col.key] ?? ""}
                          rowValues={row}
                          onChange={(v) => updateCell(index, col.key, v)}
                          hasError={hasError}
                          title={hasError ? result?.error : undefined}
                          onPaste={(e) => handlePaste(index, colIndex, e)}
                          autoFocus={colIndex === 0 && index === focusRowIndex}
                        />
                      </TableCell>
                    ))}
                    <TableCell className="p-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeRow(index)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {hasError && (
                    <TableRow>
                      <TableCell colSpan={colSpan} className="py-1 text-xs text-destructive">
                        Row {savedRows.length + index + 1}: {result?.error}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="p-1 text-center">
                <Button
                  size="icon"
                  className="h-7 w-7 rounded-md bg-[#12805A] text-white hover:bg-[#0E6647]"
                  onClick={addRow}
                  title="Add row"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TableCell>
              {columns.map((col, i) => (
                <TableCell key={col.key} className={cn(col.type === "number" && "text-right tabular-nums")}>
                  {i === 0 ? footerLabel : col.summable ? columnTotal(col) : ""}
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
            {extraFooterRow && (
              <TableRow className="hover:bg-transparent">
                <TableCell />
                {renderExtraFooterCells(columns, extraFooterRow)}
                <TableCell />
              </TableRow>
            )}
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
