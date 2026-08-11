// Shared wrap for screens that read the auth context (useAuth). Several account/onboarding screens
// call useAuth(), which throws outside an AuthProvider — so those fixtures need the provider present
// even though the parity render never signs in. Composes QueryClientProvider (for the same screens'
// useQuery) OUTSIDE AuthProvider; AuthProvider only touches the singleton queryClient in its callbacks,
// so it renders its children immediately regardless of session state (session stays null → screens fall
// back to their session?.role ?? "customer" defaults, which is the signed-in-customer look we want).
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../../../../apps/mobile/src/auth/auth-context";

export function withAuthQuery(seed) {
  return (el) => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
    });
    if (seed) seed(qc);
    return React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(AuthProvider, null, el),
    );
  };
}
