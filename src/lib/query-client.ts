import { QueryClient } from "@tanstack/react-query";

// Extracted from main.tsx to a standalone module so auth-client.ts can
// read/write the session query's cache from outside a component (signIn/
// signOut are plain async functions, not hooks) without importing the app
// entry point.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});
