import { ACTIVE_RIDE_STATUSES, type AdvanceStatusRequest, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { advanceStatus, cancelOrder, confirmDelivery, getActiveOrder, type OrderSnapshot } from "../../src/api/orders";
import { useRiderLocationStream } from "../../src/realtime/use-rider-location";
import { Button, Card, ErrorText, Field, Heading, Screen, SkeletonList, StatusPill, Stepper, Sub } from "../../src/ui";
import { LiveMap } from "../../src/ui/LiveMap";

const ACTIVE = ACTIVE_RIDE_STATUSES as string[];
const NEXT: Record<string, { to: AdvanceStatusRequest["to"]; label: string }> = {
  assigned: { to: "confirmed", label: "Confirm the job" },
  confirmed: { to: "en_route_pickup", label: "Head to pickup" },
  en_route_pickup: { to: "picked_up", label: "Mark parcel collected" },
  picked_up: { to: "en_route_dropoff", label: "Head to drop-off" },
};

export default function RiderJob(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const jobQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder, refetchInterval: 6000 });
  const order = jobQ.data ?? null;
  const orderId = order?.id ?? null;

  // Stream GPS only while the ride is genuinely active — stops on delivered AND cancelled/completed
  // (don't blocklist a single terminal state, or a cancelled job keeps broadcasting the rider's GPS).
  useRiderLocationStream(order && ACTIVE.includes(order.status) ? orderId : null);

  const refresh = (): void => void qc.invalidateQueries({ queryKey: ["activeJob"] });
  const fail = (e: unknown): void => setError(e instanceof ApiError ? e.message : "Something went wrong.");

  // Optimistic advance: the trip step is a frequent, near-always-succeeds tap, so paint the next
  // step instantly and reconcile in the background. cancelQueries first so the 6s poller can't
  // clobber the optimistic write mid-flight; rollback to the snapshot on error (onSettled always
  // re-syncs from the server).
  const advanceM = useMutation({
    mutationFn: (to: AdvanceStatusRequest["to"]) => advanceStatus(orderId!, to),
    onMutate: async (to) => {
      await qc.cancelQueries({ queryKey: ["activeJob"] });
      const prev = qc.getQueryData<OrderSnapshot | null>(["activeJob"]);
      qc.setQueryData<OrderSnapshot | null>(["activeJob"], (o) => (o ? { ...o, status: to } : o));
      return { prev };
    },
    onError: (e, _to, ctx) => {
      // Restore the snapshot (incl. a legitimate null), but never write `undefined` back over the cache.
      if (ctx?.prev !== undefined) qc.setQueryData(["activeJob"], ctx.prev);
      fail(e);
    },
    onSettled: refresh,
  });
  const deliverM = useMutation({
    mutationFn: () => confirmDelivery(orderId!, code.trim()),
    onSuccess: () => {
      setCode("");
      refresh();
    },
    onError: (e) => {
      // 403 = the 5-attempt lockout; the customer must re-issue the code. 401 = wrong code, retry.
      if (e instanceof ApiError && e.status === 403) {
        setError("Too many attempts — ask the customer to re-issue the delivery code.");
      } else {
        fail(e);
      }
      refresh();
    },
  });
  const cancelM = useMutation({ mutationFn: () => cancelOrder(orderId!), onSuccess: refresh, onError: fail });

  if (jobQ.isLoading) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }
  if (!order) {
    return (
      <Screen>
        <Heading>No active job</Heading>
        <Sub>Accept an order to start a delivery.</Sub>
        <Button label="Back" onPress={() => router.replace("/rider")} />
      </Screen>
    );
  }

  const next = NEXT[order.status];
  const isActive = ACTIVE.includes(order.status);
  const riderPoint =
    order.rider != null && order.rider.currentLat != null && order.rider.currentLng != null
      ? { lat: order.rider.currentLat, lng: order.rider.currentLng }
      : null;

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Your job</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status={order.status} />
        </View>

        <Card>
          <Text style={{ fontSize: 13, color: tokens.color.muted }}>Agreed fare ${order.agreedFare ?? order.proposedFare}</Text>
          {order.counterpartyPhone ? (
            <Text style={{ fontSize: 14, color: tokens.color.ink, marginTop: 4 }}>Customer phone: {order.counterpartyPhone}</Text>
          ) : null}
          <View style={{ height: tokens.space.sm }} />
          <LiveMap
            pickup={{ lat: order.pickup.point.lat, lng: order.pickup.point.lng }}
            dropoff={{ lat: order.dropoff.point.lat, lng: order.dropoff.point.lng }}
            rider={riderPoint}
          />
          <Stepper events={order.events} currentStatus={order.status} view="rider" />
        </Card>

        {next ? (
          <Button label={next.label} onPress={() => advanceM.mutate(next.to)} loading={advanceM.isPending} />
        ) : null}

        {order.status === "en_route_dropoff" ? (
          <Card>
            <Text style={{ fontWeight: "700", marginBottom: tokens.space.sm }}>Confirm hand-off</Text>
            <Sub>Ask the recipient for the 6-digit delivery code.</Sub>
            <Field label="Delivery code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
            <Button label="Confirm delivery" onPress={() => deliverM.mutate()} loading={deliverM.isPending} disabled={code.trim().length !== 6} />
          </Card>
        ) : null}

        {order.status === "delivered" ? (
          <Card>
            <Text style={{ fontWeight: "700", color: tokens.color.accent }}>Delivered. Waiting for the customer to rate — you're free for the next job.</Text>
          </Card>
        ) : null}

        {isActive ? (
          <Button label="Cancel job" variant="ghost" onPress={() => cancelM.mutate()} loading={cancelM.isPending} />
        ) : null}
        <Button label="Back" variant="ghost" onPress={() => router.replace("/rider")} />
        <ErrorText message={error} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
