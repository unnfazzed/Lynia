/**
 * Render-isolation proof for the order screen's PERF split (deferred 2026-07-09): a GPS-only cache
 * write (what use-order-socket's "position" handler does every ~10s for a whole delivery) must
 * re-render ONLY the telemetry subscriber (LiveTrackingCard's slice) and never the shell subscriber
 * (the ~900-line screen). Two render-counting probes subscribe to the SAME query key through the two
 * production selectors — exactly the wiring order/[id].tsx and LiveTrackingCard use — and we count
 * renders across a position write vs. a status transition.
 *
 * Probes (not the real components) because the real card mounts react-native-maps; the mechanism
 * under test — select-sliced observers + structural sharing on a shared cache entry — is fully
 * exercised by the selectors + useQuery, which is what these probes run.
 */
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import React from "react";
import { Text } from "react-native";
import { act, create } from "react-test-renderer";
import type { OrderSnapshot } from "../../../api/orders";
import { selectOrderShell, selectRiderTelemetry } from "../../../logic/order-tracking";
import { orderKey } from "../../../query/client";

const baseSnapshot: OrderSnapshot = {
  id: "order-1",
  status: "en_route_dropoff",
  agreedFare: "5.00",
  proposedFare: "4.50",
  pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: "Eastgate" },
  dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" },
  rider: { profileId: "r1", currentLat: -17.825, currentLng: 31.055, updatedAt: "2026-07-12T12:00:00.000Z" },
  events: [{ status: "assigned", createdAt: "2026-07-12T11:50:00.000Z" }],
  counterpartyPhone: null,
  expiresAt: null,
};

let screenRenders = 0;
let cardRenders = 0;
/** The shell subscriber's data per render — lets us assert referential stability, not just counts. */
const screenData: (OrderSnapshot | undefined)[] = [];

// staleTime: Infinity only quiets mount-refetch noise in this harness (the cache is pre-seeded and
// all updates arrive via setQueryData, like the WS handlers); it plays no part in the isolation.
function ScreenProbe(): React.ReactElement {
  screenRenders += 1;
  const q = useQuery({
    queryKey: orderKey("order-1"),
    queryFn: () => Promise.resolve(baseSnapshot),
    select: selectOrderShell,
    staleTime: Infinity,
  });
  screenData.push(q.data);
  return <Text>{q.data?.status ?? "loading"}</Text>;
}

function CardProbe(): React.ReactElement {
  cardRenders += 1;
  const q = useQuery({
    queryKey: orderKey("order-1"),
    queryFn: () => Promise.resolve(baseSnapshot),
    select: selectRiderTelemetry,
    staleTime: Infinity,
  });
  return <Text>{q.data?.lat ?? "no-fix"}</Text>;
}

/** Observer notifications are scheduled through setTimeout(0) (notifyManager) — flush them. */
const flushNotifications = (): Promise<void> => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

/** Exactly what use-order-socket's "position" handler writes per GPS tick. */
function pushPosition(qc: QueryClient, lat: number, lng: number, at: string): void {
  qc.setQueryData<OrderSnapshot>(orderKey("order-1"), (prev) => {
    if (!prev) return prev;
    const rider = prev.rider ?? { profileId: "", currentLat: null, currentLng: null, updatedAt: null };
    return { ...prev, rider: { ...rider, currentLat: lat, currentLng: lng, updatedAt: at } };
  });
}

describe("order-screen re-render isolation across GPS ticks", () => {
  it("a position-only cache write re-renders the telemetry subscriber and NOT the shell subscriber", async () => {
    const qc = new QueryClient();
    qc.setQueryData(orderKey("order-1"), baseSnapshot);
    await act(async () => {
      create(
        <QueryClientProvider client={qc}>
          <ScreenProbe />
          <CardProbe />
        </QueryClientProvider>,
      );
    });
    await flushNotifications();
    const screen0 = screenRenders;
    const card0 = cardRenders;
    const shellBefore = screenData[screenData.length - 1];

    // Two GPS ticks land, ~10s apart in the real app.
    pushPosition(qc, -17.824, 31.056, "2026-07-12T12:00:10.000Z");
    await flushNotifications();
    pushPosition(qc, -17.823, 31.057, "2026-07-12T12:00:20.000Z");
    await flushNotifications();

    // The tracking slice repainted once per tick…
    expect(cardRenders).toBe(card0 + 2);
    // …and the screen never did: structural sharing kept its selected shell referentially identical.
    expect(screenRenders).toBe(screen0);
    expect(screenData[screenData.length - 1]).toBe(shellBefore);

    // A REAL change (status transition) must still reach the screen — the split must not go deaf.
    qc.setQueryData<OrderSnapshot>(orderKey("order-1"), (prev) => (prev ? { ...prev, status: "delivered" } : prev));
    await flushNotifications();
    expect(screenRenders).toBe(screen0 + 1);
    expect(screenData[screenData.length - 1]?.status).toBe("delivered");
  });
});
