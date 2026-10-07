import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { SiteSelectionProvider } from "@/lib/site-context";
import { queryClient } from "@/lib/query-client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SiteSelectionProvider>
          <App />
          <Toaster richColors position="top-right" />
        </SiteSelectionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
