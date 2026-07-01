import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Serve cached data instantly on back-navigation (History → Order → back) and revalidate
      // quietly, instead of a skeleton on every remount. Live screens stay fresh via their own
      // refetchInterval + the WS pushes, which fire regardless of staleTime.
      staleTime: 30_000,
    },
  },
});

export const orderKey = (id: string): readonly ["order", string] => ["order", id];
export const offersKey = (id: string): readonly ["offers", string] => ["offers", id];
