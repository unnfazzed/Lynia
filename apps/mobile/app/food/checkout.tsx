import { haversineKm, isMerchantOpenNow, nextOpenDescription, normalizePhone, roundToCents, tokens, type MerchantPaymentMethod } from "@lynia/shared";
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
import { AppBar, Button, Card, EmptyState, ErrorText, Field, Icon, OfflineBanner, Screen, SkeletonList } from "../../src/ui";
import type { PickedPoint } from "../../src/ui/MapPicker";
import { MapPicker } from "../../src/ui/MapPicker";
import { AddressConfirmSheet } from "../../src/ui/AddressConfirmSheet";
import { AddressSearch } from "../../src/ui/AddressSearch";
import { PaymentMethodRow } from "../../src/ui/food/PaymentMethodRow";
import { CheckoutPlacingView } from "./checkout-placing.view";
// RC.checkout_cash region fragments (Foundation-E) — generated from the mock, guarded by the
// structural-snapshot spec. The container composes them and owns the data seam (see adopted.mjs).
import { CheckoutPlaceBarView } from "./checkout-place-bar.view";
import { CheckoutSummaryView } from "./checkout-summary.view";

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

  // A searched address resolves to a building CENTROID — for a food drop-off that lands the rider at
  // the block, not the gate. Mirror send.tsx: a search result opens the drag-to-adjust confirm sheet
  // (nudge the pin + name the landmark in context) rather than committing the centroid straight to
  // the pin. A pin tapped/dragged directly on the map above is already its own confirmation and stays
  // direct-commit.
  const [confirming, setConfirming] = useState<ResolvedPlace | null>(null);
  const onDropResolved = useCallback((place: ResolvedPlace): void => {
    setConfirming(place);
  }, []);
  // Committed from the confirm sheet: the (possibly dragged) point + the landmark the customer typed.
  // Marked touched so the reverse-geocode that fires when the map recenters can't overwrite it.
  const onConfirmAddress = useCallback((point: PickedPoint, landmark: string): void => {
    setConfirming(null);
    setDropPoint(point);
    setDropLandmark(landmark);
    setDropLandmarkTouched(true);
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
        <AppBar title="Checkout" onBack={() => router.back()} />
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
        <AppBar title="Checkout" onBack={() => router.back()} />
        <SkeletonList count={3} />
      </Screen>
    );
  }

  if (busy) {
    // RC.placing — the presentational "Sending your order to the kitchen…" beat is GENERATED from the
    // mock (checkout-placing.view.tsx) and locked to it by the structural-snapshot guardrail; this
    // container owns only WHEN it shows (the in-flight placeFoodOrder mutation). Composition, not a
    // rewrite: the placing LOGIC is unchanged, only its look moves to the generated view.
    return <CheckoutPlacingView />;
  }

  const open = isMerchantOpenNow(restaurant.hours, now);
  const merchantHasLocation = restaurant.location != null;
  const estimatedDeliveryFee = dropPoint ? estimateDeliveryFee(restaurant.location, { lat: dropPoint.lat, lng: dropPoint.lng }) : null;
  const total = cart.total + (estimatedDeliveryFee ?? 0);
  // The honest drop distance the delivery fee is derived from (same haversineKm→roundToCents as
  // estimateDeliveryFee) — feeds the kit PriceMath's per-km delivery sub-line. Null until a drop is set.
  const dropDistanceKm =
    dropPoint && restaurant.location ? roundToCents(haversineKm(restaurant.location, { lat: dropPoint.lat, lng: dropPoint.lng })) : null;
  // RC.checkout_cash summary note: the kit PriceMath has no small-order-fee row, so — exactly as the
  // design's own cart_min mock does — a small-order fee is disclosed in the note, not hidden.
  const summaryNote = [
    cart.smallOrderFee > 0 ? `Includes a ${formatMoney(cart.smallOrderFee)} small-order fee.` : null,
    paymentMethod === "cash"
      ? "Have the exact amount if you can — riders carry little change. The exact delivery fee is confirmed the moment you place this order."
      : `Paid straight to ${restaurant.name}. LyniaGo never holds your money. The exact delivery fee is confirmed the moment you place this order.`,
  ]
    .filter(Boolean)
    .join(" ");

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
    <Screen
      footer={
        // RC.checkout_cash footer region (r-customer-a.jsx:424, 469): the pay bar is the kit's
        // `<Screen footer=…>` pinned Button (Foundation-D slot), now a GENERATED, guarded fragment
        // (checkout-place-bar.view.tsx) the container composes. The CTA names how the money moves, not
        // just the figure — "pay $X cash" for CASH, "pay after they accept" for mobile money.
        <CheckoutPlaceBarView
          label={paymentMethod === "cash" ? `Place order · pay ${formatMoney(total)} cash` : "Place order · pay after they accept"}
          onPlace={() => void submit()}
          disabled={!canSubmit}
          loading={busy}
        />
      }
    >
      <OfflineBanner state={reachable ? "online" : "offline"} />
      {/* Kit RC.checkout_cash (r-customer-a.jsx:426): the header is the shared AppBar — 16/700
          title + 11.5 muted sub (the kitchen's name) + a rotated-chevron back. */}
      <AppBar title="Checkout" sub={restaurant.name} onBack={() => router.back()} />

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
            placeholder="0771234567"
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
          {/* Kit RC.checkout_wallet (r-customer-a.jsx:487): once mobile money is the choice the
              subtitle becomes the provider list; unselected it states when the money moves. */}
          <PaymentMethodRow
            icon="wallet"
            title="Mobile money"
            subtitle={paymentMethod === "wallet" ? "EcoCash · InnBucks · O'mari" : "Pay the restaurant after they accept"}
            selected={paymentMethod === "wallet"}
            onPress={() => setPaymentMethod("wallet")}
          >
            {/* Kit RC.checkout_wallet (r-customer-a.jsx:491-494): clock glyph, ink copy, lead bold. */}
            <Icon name="clock" size={15} color={tokens.color.accentText} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 12.5, color: tokens.color.ink, lineHeight: 18 }}>
              <Text style={{ fontWeight: "700" }}>You pay only after the restaurant accepts.</Text> They&apos;ll call you to confirm, then send the payment request — no deadline, the kitchen starts once it lands.
            </Text>
          </PaymentMethodRow>

          {/* RC.checkout_cash summary region (r-customer-a.jsx:456): the kit PriceMath goods/fee/km/total
              card, wrapped in the mock's `<Card style={{padding:14}}>`, now a GENERATED, guarded fragment
              (checkout-summary.view.tsx). CHECKOUT has a real drop-off, so the delivery fee AND the drop
              distance are HONEST here — the app adopts the kit PriceMath (goods/fee/km/total), retiring the
              food {rows,...} variant. The small-order fee, which the kit PriceMath has no row for, folds
              into the note exactly as the design's cart_min mock does — no money hidden or fabricated. */}
          <Card style={{ padding: 14 }}>
            <CheckoutSummaryView
              goods={cart.subtotal}
              fee={estimatedDeliveryFee ?? 0}
              km={dropDistanceKm ?? 0}
              total={total}
              note={summaryNote}
            />
          </Card>

          <Card style={{ backgroundColor: tokens.color.surface, borderColor: "transparent" }}>
            <View style={{ flexDirection: "row", gap: 9 }}>
              <Icon name="circle-alert" size={15} color={tokens.color.muted} />
              <Text style={{ flex: 1, fontSize: 12.5, color: tokens.color.muted, lineHeight: 17 }}>
                {/* Kit RC.checkout_cash (r-customer-a.jsx:459): the cash consequence names the full
                    figure, not a vague "amount". */}
                {paymentMethod === "cash"
                  ? `Free to cancel until the rider collects your food. After that the food is cooked and paid for, and cancelling costs the full ${formatMoney(total)}.`
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

      {/* Drag-to-adjust confirm for a searched delivery address (drop slot only) — same component the
          parcel composer uses, so food riders get a precise pin + in-context landmark, not a centroid. */}
      <AddressConfirmSheet
        place={confirming}
        slot="drop"
        initialLandmark={dropLandmark}
        onConfirm={onConfirmAddress}
        onCancel={() => setConfirming(null)}
      />
    </Screen>
  );
}
