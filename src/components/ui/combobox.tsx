import { useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxQuickCreate {
  /** Entity name shown in "+ Add "<name>" as new {label}" and the create dialog's title. */
  label: string;
  /** A second required field the create dialog collects alongside Name — for entities that
   * can't be created from a name alone (e.g. Item needs a Unit, GLAccount needs a Group). */
  extraField?: { key: string; label: string; options: ComboboxOption[] };
  onCreate: (name: string, extraValue?: string) => Promise<ComboboxOption>;
}

interface ComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  hasError?: boolean;
  id?: string;
  quickCreate?: ComboboxQuickCreate;
}

// A searchable single-select — same trigger footprint as `Select`, but the
// popover opens on a filterable list instead of a plain scroll list, since
// the grid's lookup columns (customer/item/vendor/G-L account) can run to
// dozens of options. Optionally offers inline "+ Add new" creation via
// `quickCreate`: picking it opens a proper create dialog (the same
// Dialog/Input/Label shape MasterDataPage.tsx's own "New X" form already
// uses elsewhere in this app), not a cramped form squeezed into the
// dropdown itself — so a brand-new Customer/Vendor/Item/Unit/GL Account can
// be created without leaving the current page, in a UI that still feels
// like a deliberate "create a record" action rather than an accidental
// one-click side effect.
export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches",
  className,
  hasError,
  id,
  quickCreate,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createExtraValue, setCreateExtraValue] = useState("");
  const [creating, setCreating] = useState(false);

  const selected = options.find((o) => o.value === value);
  const trimmedQuery = query.trim();
  const filtered = trimmedQuery
    ? options.filter((o) => o.label.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : options;
  const exactMatch = options.some((o) => o.label.toLowerCase() === trimmedQuery.toLowerCase());
  const showQuickCreate = Boolean(quickCreate) && trimmedQuery.length > 0 && !exactMatch;
  // Arrow keys move through this same list (options first, "+ Add new" last)
  // so Enter/Tab can commit whichever one is highlighted — including
  // triggering quick-create, not just picking an existing option.
  const navItems: ({ type: "option"; opt: ComboboxOption } | { type: "create" })[] = [
    ...filtered.map((opt) => ({ type: "option" as const, opt })),
    ...(showQuickCreate ? [{ type: "create" as const }] : []),
  ];

  function openCreateDialog() {
    setCreateName(trimmedQuery);
    setCreateExtraValue("");
    setOpen(false);
    setQuery("");
    setDialogOpen(true);
  }

  function selectOption(opt: ComboboxOption) {
    onValueChange(opt.value);
    setOpen(false);
    setQuery("");
  }

  function commitHighlighted() {
    const item = navItems[highlightedIndex];
    if (!item) return;
    if (item.type === "option") selectOption(item.opt);
    else openCreateDialog();
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, navItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitHighlighted();
    } else if (e.key === "Tab") {
      // Commit but don't preventDefault — Tab should still move focus to
      // the next cell/field the same way it always did.
      commitHighlighted();
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  async function handleCreate() {
    if (!quickCreate) return;
    setCreating(true);
    try {
      const result = await quickCreate.onCreate(createName.trim(), createExtraValue || undefined);
      onValueChange(result.value);
      toast.success(`${quickCreate.label} created`);
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Could not create ${quickCreate.label.toLowerCase()}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setHighlightedIndex(0);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            className={cn(
              "flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              hasError && "border-destructive",
              className,
            )}
          >
            <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>{selected?.label ?? placeholder}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-48">
          <div className="flex items-center gap-1.5 border-b px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              className="h-6 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {navItems.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</p>}
            {navItems.map((item, index) =>
              item.type === "option" ? (
                <button
                  key={item.opt.value}
                  type="button"
                  onClick={() => selectOption(item.opt)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted",
                    (index === highlightedIndex || item.opt.value === value) && "bg-muted",
                    item.opt.value === value && "font-medium",
                  )}
                >
                  <span className="truncate">{item.opt.label}</span>
                  {item.opt.value === value && <Check className="h-3.5 w-3.5 shrink-0" />}
                </button>
              ) : (
                <button
                  key="__create__"
                  type="button"
                  onClick={openCreateDialog}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-primary outline-none hover:bg-muted",
                    index === highlightedIndex && "bg-muted",
                  )}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    Add &quot;{trimmedQuery}&quot; as new {quickCreate?.label}
                  </span>
                </button>
              ),
            )}
          </div>
        </PopoverContent>
      </Popover>

      {quickCreate && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New {quickCreate.label}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleCreate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="quick-create-name">Name</Label>
                <Input
                  id="quick-create-name"
                  autoFocus
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  required
                />
              </div>
              {quickCreate.extraField && (
                <div className="space-y-1.5">
                  <Label htmlFor="quick-create-extra">{quickCreate.extraField.label}</Label>
                  <Combobox
                    id="quick-create-extra"
                    value={createExtraValue}
                    onValueChange={setCreateExtraValue}
                    options={quickCreate.extraField.options}
                    placeholder={`Select ${quickCreate.extraField.label}`}
                  />
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!createName.trim() || (Boolean(quickCreate.extraField) && !createExtraValue) || creating}
                >
                  {creating ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
