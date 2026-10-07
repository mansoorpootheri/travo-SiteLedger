import { createContext, useContext, useState, type ReactNode } from "react";

const STORAGE_KEY = "siteledger:site-selection";

interface SiteSelection {
  siteId: string;
  date: string;
}

interface SiteSelectionContextValue extends SiteSelection {
  setSelection: (siteId: string, date: string) => void;
  clear: () => void;
}

const SiteSelectionContext = createContext<SiteSelectionContextValue | null>(null);

function readStored(): SiteSelection {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { siteId: "", date: "" };
    const parsed = JSON.parse(raw) as Partial<SiteSelection>;
    return { siteId: parsed.siteId ?? "", date: parsed.date ?? "" };
  } catch {
    return { siteId: "", date: "" };
  }
}

export function SiteSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionState] = useState<SiteSelection>(readStored);

  function setSelection(siteId: string, date: string) {
    setSelectionState({ siteId, date });
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ siteId, date }));
    } catch {
      // sessionStorage unavailable (e.g. private browsing) — selection still works for this render tree
    }
  }

  function clear() {
    setSelectionState({ siteId: "", date: "" });
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <SiteSelectionContext.Provider value={{ ...selection, setSelection, clear }}>
      {children}
    </SiteSelectionContext.Provider>
  );
}

export function useSiteSelection() {
  const ctx = useContext(SiteSelectionContext);
  if (!ctx) throw new Error("useSiteSelection must be used within a SiteSelectionProvider");
  return ctx;
}
