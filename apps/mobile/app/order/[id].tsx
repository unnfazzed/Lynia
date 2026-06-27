import { ACTIVE_RIDE_STATUSES, CUSTOMER_CANCELLABLE_STATUSES, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { listOffers, selectOffer, type OfferRow } from "../../src/api/offers";
import { cancelOrder, getOrder, rateOrder, rotateDeliveryCode } from "../../src/api/orders";
import { loadDeliveryCode, saveDeliveryCode } from "../../src/auth/session";
import { offersKey, orderKey } from "../../src/query/client";
import { useOrderSocket } from "../../src/realtime/use-order-socket";
import { Button, Card, EmptyState, ErrorText, Heading, Screen, StatusPill, Stepper, Sub } from "../../src/ui";

const CUSTOMER_CANCELLABLE = new Set<string>(CUSTOMER_CANCELLABLE_STATUSES);
const ACTIVE = ACTIVE_RIDE_STATUSES as string[];

export default function OrderScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === "string" ? id : "";
  const qc = useQueryClient();
  const router = useRouter();
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [score, setScore] = useState(5);

  // Recover a previously-issued handover code across remount/relaunch (server keeps only the hash).
  useEffect(() => {
    let alive = true;
    void loadDeliveryCode(orderId).then((c) => {
      if (alive && c) setDeliveryCode(c);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  const orderQ = useQuery({
    queryKey: orderKey(orderId),
    queryFn: () => getOrder(orderId),
    enabled: orderId !== "",
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === "open_for_offers") return 4000;
      if (s !== undefined && ACTIVE.includes(s)) return 10_000; // self-heal if the WS drops
      return false;
    },
  });
  const status = orderQ.data?.status;
  const isActive = status !== undefined && ACTIVE.includes(status);

  useOrderSocket(isActive || status === "delivered" ? orderId : null);

  const offersQ = useQuery({
    queryKey: offersKey(orderId),
    queryFn: () => listOffers(orderId),
    enabled: status === "open_for_offers",
    refetchInterval: status === "open_for_offers" ? 4000 : false,
  });

  const selectM = useMutation({
    mutationFn: (offerId: string) => selectOffer(orderId, offerId),
    onSuccess: (res) => {
      setDeliveryCode(res.deliveryCode);
      void saveDeliveryCode(orderId, res.deliveryCode);
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
    },
  });
  const rotateM = useMutation({
    mutationFn: () => rotateDeliveryCode(orderId),
    onSuccess: (res) => {
      setDeliveryCode(res.deliveryCode);
      void saveDeliveryCode(orderId, res.deliveryCode);
    },
  });
  const rateM = useMutation({
    mutationFn: () => rateOrder(orderId, { score }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: orderKey(orderId) }),
  });
  const cancelM = useMutation({
    mutationFn: () => cancelOrder(orderId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: orderKey(orderId) }),
  });

  if (orderQ.isLoading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (!orderQ.data) {
    return (
      <Screen>
        <Heading>Order not found</Heading>
        <Button label="Back home" onPress={() => router.replace("/home")} />
      </Screen>
    );
  }

  const order = orderQ.data;
  const fare = order.agreedFare ?? order.proposedFare;
  const firstError = selectM.error ?? rotateM.error ?? rateM.error ?? cancelM.error;
  const mutationError = firstError instanceof Error ? firstError.message : null;
  const hasPosition = order.rider != null && order.rider.currentLat != null && order.rider.currentLng != null;

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Order {order.id.slice(0, 8)}</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status={order.status} />
        </View>

        {deliveryCode ? (
          <Card style={{ borderColor: tokens.color.accent }}>
            <Text style={{ fontSize: 13, color: tokens.color.muted }}>Give this code to the recipient — the rider enters it at hand-off:</Text>
            <Text style={{ fontSize: 32, fontWeight: "800", letterSpacing: 6, color: tokens.color.accent }}>{deliveryCode}</Text>
          </Card>
        ) : null}

        {order.status === "open_for_offers" ? (
          <View>
            <Sub>Waiting for riders to offer{offersQ.isFetching ? " …" : ""}.</Sub>
            {(offersQ.data ?? []).map((o: OfferRow) => (
              <Card key={o.id}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.ink }}>
                  {o.rider.profile.firstName} {o.rider.profile.lastName}
                </Text>
                <Text style={{ fontSize: 13, color: tokens.color.muted }}>
                  ★ {o.rider.ratingCount > 0 ? Number(o.rider.ratingAvg).toFixed(1) : "new"} · {o.rider.tripsCount} trips · ETA {o.etaMinutes} min
                </Text>
                <Text style={{ fontSize: 20, fontWeight: "800", marginVertical: 4 }}>${o.offeredFare}</Text>
                <Button label="Choose this rider" onPress={() => selectM.mutate(o.id)} loading={selectM.isPending} />
              </Card>
            ))}
            {(offersQ.data ?? []).length === 0 ? <Sub>No offers yet — hang tight.</Sub> : null}
          </View>
        ) : null}

        {isActive || order.status === "delivered" || order.status === "completed" ? (
          <Card>
            <Text style={{ fontSize: 13, color: tokens.color.muted, marginBottom: 4 }}>Agreed fare ${fare}</Text>
            {order.rider ? (
              <Text style={{ fontSize: 13, color: tokens.color.muted }}>
                Rider position: {hasPosition ? `${order.rider.currentLat?.toFixed(4)}, ${order.rider.currentLng?.toFixed(4)}` : "waiting for GPS"}
              </Text>
            ) : null}
            {order.counterpartyPhone ? (
              <Text style={{ fontSize: 14, color: tokens.color.ink, marginTop: 4 }}>Rider phone: {order.counterpartyPhone}</Text>
            ) : null}
            <View style={{ height: tokens.space.md }} />
            <Stepper events={order.events} currentStatus={order.status} view="customer" />
            {isActive ? (
              <Button label="Re-issue delivery code" variant="ghost" onPress={() => rotateM.mutate()} loading={rotateM.isPending} />
            ) : null}
          </Card>
        ) : null}

        {order.status === "delivered" ? (
          <Card>
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: tokens.space.sm }}>Rate your rider</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: tokens.space.sm }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setScore(n)} hitSlop={8}>
                  <Text style={{ fontSize: 28, color: n <= score ? tokens.color.highlight : tokens.color.line }}>★</Text>
                </Pressable>
              ))}
            </View>
            <Button label="Submit rating" onPress={() => rateM.mutate()} loading={rateM.isPending} />
          </Card>
        ) : null}

        {order.status === "completed" ? (
          <Card>
            <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.accent }}>Delivered &amp; completed. Thank you!</Text>
          </Card>
        ) : null}
        {order.status === "expired" ? (
          <EmptyState
            icon="🛵"
            title="No riders took this price yet"
            message="Your window closed with no offers. Nudging the price up usually gets a rider fast."
          >
            <Button label="Send another request" onPress={() => router.replace("/home")} />
          </EmptyState>
        ) : null}
        {order.status === "cancelled" ? (
          <Card>
            <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.danger }}>This order is cancelled.</Text>
          </Card>
        ) : null}

        {CUSTOMER_CANCELLABLE.has(order.status) ? (
          <Button label="Cancel order" variant="ghost" onPress={() => cancelM.mutate()} loading={cancelM.isPending} />
        ) : null}
        <Button label="Back home" variant="ghost" onPress={() => router.replace("/home")} />
        <ErrorText message={mutationError} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
