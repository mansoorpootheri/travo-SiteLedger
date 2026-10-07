import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Target the real EnterpriseBase API on this port for the dev proxy below
// (see CLAUDE.md — `dotnet run --project src/EnterpriseBase.Web.Host` serves
// on :5001). Override with VITE_API_PORT=<port> npm run dev if that's taken.
const apiPort = process.env.VITE_API_PORT ?? "5001";
const apiTarget = `http://localhost:${apiPort}`;

// All API routes live under /api (see src/lib/api.ts), so the proxy needs just
// this one prefix and can never swallow a client-side route on page reload.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    // Distinct from ui/'s :5173 so both apps can run side by side in dev.
    port: 5174,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
});
