import { isMerchantOpenNow, nextOpenDescription, normalizePhone, tokens, type MerchantPaymentMethod } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { placeFoodOrder } from "../../src/api/food-orders";
import type { ResolvedPlace } from "../../src/api/places";
import { useFoodCart } from "../../src/food/cart-context";
import { estimateDeliveryFee } from "../../src/logic/food-checkout";
import { loadMyPickupPhone, saveMyPickupPhone } from "../../src/logic/saved-recipients";
import { formatMoney } from "../../src/logic/money";
import { useReachability } from "../../src/net/use-reachability";
import { seedFoodOrder } from "../../src/query/use-food-order";
import { useRestaurantMenu } from "../../src/query/use-restaurants";
import { uuidV4FromSeed } from "../../src/util";
import { Button, Card, EmptyState, ErrorText, Field, Icon, OfflineBanner, Screen, SkeletonList } from "../../src/ui";
import type { PickedPoint } from "../../src/ui/MapPicker";
import { MapPicker } from "../../src/ui/MapPicker";
import { AddressSearch } from "../../src/ui/AddressSearch";
import { PaymentMethodRow } from "../../src/ui/food/PaymentMethodRow";
import { PriceMath } from "../../src/ui/food/PriceMath";

/** How often the checkout screen re-checks the kitchen's own hours while the customer is filling in
 *  the form — mirrors [id].tsx's 60s "just closed while browsing" poll, so a kitchen that closes
 *  between menu-browsing and Place Order is caught here too, not only on the menu screen. */
const HOURS_RECHECK_MS = 60_000;

export default function FoodCheckoutScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cart = useFoodCart();
  const reachable = useReachability();
  const { menu, isLoading } = useRestaurantMenu(cart.cart.restaurantId ?? undefined, !!cart.cart.restaurantId);
  const restaurant = menu?.restaurant;

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), HOURS_RECHECK_MS);
    return () => clearInterval(id);
  }, []);

  const [dropPoint, setDropPoint] = useState<PickedPoint | null>(null);
  const [dropLandmark, setDropLandmark] = useState("");
  const [dropLandmarkTouched, setDropLandmarkTouched] = useState(false);
  const [dropPhone, setDropPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<MerchantPaymentMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadMyPickupPhone().then((phone) => {
      if (phone) setDropPhone(phone);
    });
  }, []);

  // A fresh address-search resolve always wins over anything the map pin/reverse-geocode set before it
  // (mirrors send.tsx's onDropResolved) and clears "touched" so a LATER map drag can still auto-fill.
  const onDropResolved = useCallback((place: ResolvedPlace): void => {
    setDropPoint({ lat: place.lat, lng: place.lng, placeId: place.placeId });
    if (place.landmark) {
      setDropLandmark(place.landmark);
      setDropLandmarkTouched(false);
    }
  }, []);
  const onDropChange = useCallback((p: PickedPoint): void => {
    setDropPoint(p);
  }, []);
  const onDropReverseGeocode = useCallback(
    (landmark: string): void => {
      if (dropLandmarkTouched) return;
      setDropLandmark(landmark);
    },
    [dropLandmarkTouched],
  );

  if (cart.ready && (!cart.cart.restaurantId || cart.cart.lines.length === 0)) {
    return (
      <Screen>
        <Text style={{ fontSize: 19, fontWeight: "700", marginBottom: 14 }}>Checkout</Text>
        <EmptyState
          icon="shopping-bag"
          title="Your cart is empty"
          message="Add something from a kitchen near you — we'll show the delivery fee before you order."
        >
          <Button label="Browse restaurants" onPress={() => router.replace("/food")} />
        </EmptyState>
      </Screen>
    );
  }

  if (isLoading || !restaurant) {
    return (
      <Screen>
        <Text style={{ fontSize: 19, fontWeight: "700", marginBottom: 14 }}>Checkout</Text>
        <SkeletonList count={3} />
      </Screen>
    );
  }

  if (busy) {
    return (
      <Screen>
        <EmptyState icon="receipt" title="Sending your order to the kitchen…" message="Don't close the app. If this fails, nothing is ordered and nothing is paid." />
        <SkeletonList count={2} />
      </Screen>
    );
  }

  const open = isMerchantOpenNow(restaurant.hours, now);
  const merchantHasLocation = restaurant.location != null;
  const estimatedDeliveryFee = dropPoint ? estimateDeliveryFee(restaurant.location, { lat: dropPoint.lat, lng: dropPoint.lng }) : null;
  const total = cart.total + (estimatedDeliveryFee ?? 0);

  const landmarkOk = dropLandmark.trim().length > 0;
  const phoneOk = normalizePhone(dropPhone) !== null;
  const phoneError = dropPhone.trim().length > 0 && !phoneOk ? "That doesn't look like a phone number" : undefined;
  const canSubmit = !!dropPoint && landmarkOk && phoneOk && open && merchantHasLocation && reachable && !busy;

  const idempotencyKey = useMemo(
    () =>
      uuidV4FromSeed(
        `food-order|${cart.cart.restaurantId}|${JSON.stringify(cart.cart.lines)}|${cart.cart.orderNote}|${dropPoint?.lat},${dropPoint?.lng}|${paymentMethod}`,
      ),
    [cart.cart.restaurantId, cart.cart.lines, cart.cart.orderNote, dropPoint?.lat, dropPoint?.lng, paymentMethod],
  );

  const submit = async (): Promise<void> => {
    setError(null);
    if (!canSubmit || !dropPoint) {
      setError("Add a delivery address, a contact phone, and choose how you'll pay.");
      return;
    }
    setBusy(true);
    try {
      const order = await placeFoodOrder(cart.cart.restaurantId as string, {
        items: cart.cart.lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity, note: l.note || undefined })),
        note: cart.cart.orderNote || undefined,
        dropoff: { point: { lat: dropPoint.lat, lng: dropPoint.lng }, landmark: dropLandmark.trim(), contactPhone: dropPhone.trim() },
        paymentMethod,
        idempotencyKey,
      });
      void saveMyPickupPhone(dropPhone.trim());
      seedFoodOrder(queryClient, order);
      cart.clear();
      router.replace(`/food/order/${order.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't place your order — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <Text style={{ fontSize: 19, fontWeight: "700" }}>Checkout</Text>
      <Text style={{ fontSize: 13, color: tokens.color.muted, marginBottom: 12 }}>{restaurant.name}</Text>

      {!open ? (
        <Card style={{ backgroundColor: tokens.color.highlightWash, borderColor: "transparent" }}>
          <View style={{ flexDirection: "row", gap: 9 }}>
            <Icon name="circle-alert" size={17} color={tokens.color.highlightInk} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>{restaurant.name} just closed</Text>
              <Text style={{ fontSize: 12.5, color: tokens.color.highlightInk, marginTop: 3, lineHeight: 17 }}>
                {nextOpenDescription(restaurant.hours, now) ?? "You can't place this order right now."}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <MapPicker label="Deliver to" value={dropPoint} onChange={onDropChange} onReverseGeocode={onDropReverseGeocode} height={160} />
          <AddressSearch label="Search an address" placeholder="Search a delivery address" onResolved={onDropResolved} />
          <Field
            label="Landmark / delivery notes"
            value={dropLandmark}
            onChangeText={(t) => {
              setDropLandmark(t);
              setDropLandmarkTouched(true);
            }}
            placeholder="Blue gate, 3rd house on the left"
          />
          <Field
            label="Contact phone"
            value={dropPhone}
            onChangeText={setDropPhone}
            placeholder="+263..."
            keyboardType="phone-pad"
            maxLength={20}
            error={phoneError}
          />

          {/* Kit R4·1 (r-customer-a.jsx:439): section label is 13px, not the 11.5px micro-label. */}
          <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.muted, marginTop: 6, marginBottom: 7 }}>HOW YOU&apos;LL PAY</Text>
          <PaymentMethodRow
            icon="banknote"
            title="Cash at the door"
            subtitle={`Pay the rider ${formatMoney(total)} when the food arrives`}
            selected={paymentMethod === "cash"}
            onPress={() => setPaymentMethod("cash")}
          />
          <PaymentMethodRow
            icon="wallet"
            title="Mobile money"
            subtitle="Pay the restaurant after they accept"
            selected={paymentMethod === "wallet"}
            onPress={() => setPaymentMethod("wallet")}
          >
            <Icon name="clock" size={14} color={tokens.color.accentText} />
            <Text style={{ flex: 1, fontSize: 12, color: tokens.color.accentText, lineHeight: 16 }}>
              You pay only after the restaurant accepts. They&apos;ll call to confirm, then request payment — no deadline, the kitchen starts once it lands.
            </Text>
          </PaymentMethodRow>

          <PriceMath
            rows={[
              // Kit r-parts.jsx PriceMath labels the goods line "Food", not "Subtotal".
              { label: "Food", value: cart.subtotal },
              ...(cart.smallOrderFee > 0 ? [{ label: "Small-order fee", value: cart.smallOrderFee }] : []),
              { label: "Delivery fee (estimate)", value: estimatedDeliveryFee ?? 0 },
            ]}
            total={total}
            footnote={
              paymentMethod === "cash"
                ? "Have the exact amount if you can — riders carry little change. The exact delivery fee is confirmed the moment you place this order."
                : "Paid straight to the restaurant. LyniaGo never holds your money. The exact delivery fee is confirmed the moment you place this order."
            }
          />

          <Card style={{ backgroundColor: tokens.color.surface, borderColor: "transparent" }}>
            <View style={{ flexDirection: "row", gap: 9 }}>
              <Icon name="circle-alert" size={15} color={tokens.color.muted} />
              <Text style={{ flex: 1, fontSize: 12.5, color: tokens.color.muted, lineHeight: 17 }}>
                {paymentMethod === "cash"
                  ? "Free to cancel until the rider collects your food. After that the food is cooked and paid for, and cancelling costs the full amount."
                  : "Free to cancel any time before you pay — once payment is confirmed, the kitchen has started cooking."}
              </Text>
            </View>
          </Card>

          {!reachable ? (
            <Card style={{ backgroundColor: tokens.color.surface, borderColor: "transparent" }}>
              <Text style={{ fontSize: 13, color: tokens.color.muted, textAlign: "center" }}>
                No connection — your order can&apos;t be sent yet. Retrying automatically.
              </Text>
            </Card>
          ) : null}

          <ErrorText message={error} />
          <View style={{ height: tokens.space.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Kit R4·1/R4·2 (r-customer-a.jsx:424, 469): the CTA names how the money moves, not just the
          figure — "pay $X cash" for CASH, "pay after they accept" for mobile money. */}
      <Button
        label={paymentMethod === "cash" ? `Place order · pay ${formatMoney(total)} cash` : "Place order · pay after they accept"}
        onPress={() => void submit()}
        disabled={!canSubmit}
        loading={busy}
      />
    </Screen>
  );
}
