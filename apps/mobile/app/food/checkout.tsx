import { isMerchantOpenNow, normalizePhone } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../../src/api/client";
import { placeFoodOrder } from "../../src/api/food-orders";
import { useFoodCart } from "../../src/food/cart-context";
import { addLine, MAX_ITEM_QTY, removeLine, type FoodCartLine } from "../../src/logic/food-cart";
import { estimateDeliveryFee, goToPlacedFoodOrder } from "../../src/logic/food-checkout";
import { deliverToLabel, etaRange, restaurantMeta } from "../../src/logic/food-list";
import { isWithinServiceCorridor } from "../../src/logic/gates";
import { landmarkFromAddress } from "../../src/logic/geocode";
import { useHomeLocation } from "../../src/logic/home-location";
import { arrivalWindow, areaOf, displayPhone, hhmm, lineKey, placeOrderBody, reconcileCart, reviewBreakdown, type ReconcileResult } from "../../src/logic/review";
import { loadMyPickupPhone, saveMyPickupPhone } from "../../src/logic/saved-recipients";
import { useAddressSuggest, type SuggestRow } from "../../src/logic/use-address-suggest";
import { usePlacingGuard } from "../../src/logic/use-placing-guard";
import { useNow } from "../../src/logic/use-now";
import { formatMoney } from "../../src/logic/money";
import { useReachability } from "../../src/net/use-reachability";
import { askNotificationsInContext } from "../../src/push/ask-in-context";
import { seedFoodOrder } from "../../src/query/use-food-order";
import { useRestaurantMenu } from "../../src/query/use-restaurants";
import { uuidV4FromSeed, withTimeout } from "../../src/util";
import { Icon } from "../../src/ui";
import { B } from "../../src/ui/browse/copy";
import { ServiceSticker } from "../../src/ui/browse/kit";
import { AddressEdit } from "../../src/ui/orderflow/AddressEdit";
import { O, ofFmt } from "../../src/ui/orderflow/copy";
import {
  Breakdown,
  ItemLine,
  LineStepper,
  PrimaryButton,
  ReviewBar,
  ReviewBlock,
  ReviewField,
  ReviewHeader,
  ReviewNote,
  ReviewToast,
  WhenAsap,
} from "../../src/ui/orderflow/review";

/**
 * Review & place — Order flow v2.1 R1, R3a/b, R4, R6a/b, R7a–c, R9a/b (packages/design/handoff/order-flow-v2,
 * ledger D-59). Cart and checkout are ONE screen, pushed from the storefront cart bar: white blocks on a
 * grey page, items edited in place, the address edited inline with a map, the cash total pinned in the
 * 52px CTA. Place → the order screen REPLACES the food stack, so Back from the order goes Home.
 *
 * Not here yet (later PRs, not drawn ⇒ not rendered): Schedule (R5, slots API), shops/pharmacy (R2), Rx (R8).
 */

/** README "Errors are an ink toast for about 4 s". */
const TOAST_MS = 4000;
/** `ofAlpha.scrim` — the modal dim the handoff draws (the browse sheets use the same value). */
const DIM = "rgba(20,24,27,0.45)";
/** The R7a veil over the screen while placing (`rgba(255,255,255,.6)` in of-screens-rt.js). */
const VEIL = "rgba(255,255,255,0.6)";
/** Re-check the kitchen's hours while the customer reviews (R6b). */
const HOURS_RECHECK_MS = 60_000;
const LOCATE_TIMEOUT_MS = 9_000;
/** R3b's bar hint — drawn in of-screens-rt.js `addrEdit(out)`, not a key in `O`. */
const outAreaBlock = (v: string): string => `Pick an address ${v} delivers to`;

interface Drop {
  lat: number;
  lng: number;
  label: string;
}

export default function FoodReviewScreen(): React.ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const cart = useFoodCart();
  const reachable = useReachability();
  const now = useNow(HOURS_RECHECK_MS);
  const home = useHomeLocation();
  const { menu, refetch } = useRestaurantMenu(cart.cart.restaurantId ?? undefined, !!cart.cart.restaurantId);
  const restaurant = menu?.restaurant;
  const venue = cart.cart.restaurantName ?? restaurant?.name ?? "";

  // ── Deliver to ────────────────────────────────────────────────────────────────────────────────────
  // Starts at the customer's deliver-to (the address the storefront was browsed from) until they set one.
  const [drop, setDrop] = useState<Drop | null>(null);
  const dropTouched = useRef(false);
  useEffect(() => {
    if (dropTouched.current || !home.point) return;
    setDrop({ lat: home.point.lat, lng: home.point.lng, label: deliverToLabel(home.label, home.area) });
  }, [home.point, home.label, home.area]);

  const [editingAddr, setEditingAddr] = useState(false);
  const [draft, setDraft] = useState<Drop | null>(null);
  const [query, setQuery] = useState("");
  const [queryTyped, setQueryTyped] = useState(false);
  const suggest = useAddressSuggest(query, editingAddr && queryTyped, reachable);

  // ── Phone and the rider note ──────────────────────────────────────────────────────────────────────
  const [phone, setPhone] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const [riderNote, setRiderNote] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  useEffect(() => {
    void loadMyPickupPhone().then((p) => {
      if (p) setPhone((cur) => cur || p);
    });
  }, []);

  // A line's note, edited in place (the line key it belongs to + the draft text).
  const [lineNote, setLineNote] = useState<{ key: string; text: string } | null>(null);

  // ── Placing, toasts, offline ──────────────────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; retry: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const lastOnline = useRef(new Date());
  if (reachable) lastOnline.current = now;

  // P0-3: while the order is in flight the screen is `held` — Android back is swallowed and iOS swipe-back
  // is off, so the request can't be orphaned (R7a: "Don't close the app").
  usePlacingGuard(busy);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // ── R6a: reconcile against the latest menu, once per fetch ──────────────────────────────────────
  const [changes, setChanges] = useState<Pick<ReconcileResult, "gone" | "priceChanges">>({ gone: [], priceChanges: {} });
  useEffect(() => {
    if (!menu) return;
    const latest = new Map<string, { priceUsd: number; outOfStock: boolean }>();
    for (const c of menu.categories) for (const d of c.dishes) latest.set(d.id, { priceUsd: d.priceUsd, outOfStock: d.outOfStock });
    const r = reconcileCart(cart.cart.lines, latest);
    if (r.gone.length === 0 && Object.keys(r.priceChanges).length === 0) return;
    cart.replaceLines(r.lines);
    setChanges((prev) => ({ gone: [...prev.gone, ...r.gone], priceChanges: { ...prev.priceChanges, ...r.priceChanges } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per fetched menu, not per cart edit.
  }, [menu]);

  const idempotencyKey = useMemo(
    () =>
      uuidV4FromSeed(`food-order|${cart.cart.restaurantId}|${JSON.stringify(cart.cart.lines)}|${cart.cart.orderNote}|${drop?.lat},${drop?.lng}|cash`),
    [cart.cart.restaurantId, cart.cart.lines, cart.cart.orderNote, drop?.lat, drop?.lng],
  );

  const deliveryFee = drop && restaurant ? estimateDeliveryFee(restaurant.location, drop) : null;
  const money = reviewBreakdown(cart.cart.lines, deliveryFee);
  const eta = drop && restaurant ? arrivalWindow(etaRange([restaurantMeta(restaurant, drop)]), now) : null;
  const closed = restaurant != null && !isMerchantOpenNow(restaurant.hours, now);
  const phoneOk = normalizePhone(phone) !== null;

  // ── Address editing (R3a/R3b) ─────────────────────────────────────────────────────────────────────
  const openAddress = (): void => {
    setDraft(drop);
    setQuery(drop?.label ?? "");
    setQueryTyped(false);
    setEditingAddr(true);
  };
  const draftOut = draft != null && !isWithinServiceCorridor(draft);
  const commitAddress = (): void => {
    if (draft && !draftOut) {
      dropTouched.current = true;
      setDrop(draft);
    }
    setEditingAddr(false);
    Keyboard.dismiss();
  };
  const pickRow = (row: SuggestRow): void => {
    void row.resolve().then((place) => {
      if (!place || !mounted.current) return;
      setDraft({ lat: place.lat, lng: place.lng, label: place.landmark });
      setQuery(place.landmark);
      setQueryTyped(false);
      Keyboard.dismiss();
    });
  };
  const nameDraft = useCallback((p: { lat: number; lng: number }, name: string): void => {
    setDraft((d) => (d && d.lat === p.lat && d.lng === p.lng ? { ...d, label: name } : d));
    setQuery(name);
    setQueryTyped(false);
  }, []);
  const useCurrent = async (): Promise<void> => {
    Keyboard.dismiss();
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setToast({ text: "Location is off — tap the map to drop your pin, or turn it on in Settings.", retry: false });
        return;
      }
      const loc = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), LOCATE_TIMEOUT_MS);
      const p = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      setDraft({ ...p, label: draft?.label ?? "" });
      const res = await withTimeout(Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng }), LOCATE_TIMEOUT_MS).catch(() => []);
      const name = res[0] ? landmarkFromAddress(res[0]) : "";
      if (name && mounted.current) nameDraft(p, name);
    } catch {
      setToast({ text: "Couldn't get your location — tap the map to drop your pin.", retry: false });
    }
  };

  // ── Items ─────────────────────────────────────────────────────────────────────────────────────────
  const setQty = (line: FoodCartLine, qty: number): void => {
    if (qty <= 0) cart.removeItem(line.dishId, line.note);
    else cart.setQuantity(line.dishId, line.note, Math.min(MAX_ITEM_QTY, qty));
  };
  const saveLineNote = (line: FoodCartLine, text: string): void => {
    setLineNote(null);
    const note = text.trim().slice(0, 200);
    if (note === line.note) return;
    cart.replaceLines(addLine(removeLine(cart.cart.lines, line.dishId, line.note), { ...line, note }));
  };
  const addMore = (): void => {
    if (router.canGoBack()) router.back();
    else router.push(`/food/${cart.cart.restaurantId}`);
  };

  // ── Place ─────────────────────────────────────────────────────────────────────────────────────────
  const submit = async (): Promise<void> => {
    setToast(null);
    if (!drop) return openAddress();
    if (!phoneOk) return setEditingPhone(true);
    if (!cart.cart.restaurantId) return;
    setBusy(true);
    try {
      const order = await placeFoodOrder(
        cart.cart.restaurantId,
        placeOrderBody({ lines: cart.cart.lines, orderNote: cart.cart.orderNote, drop, riderNote, phone, idempotencyKey }),
      );
      void saveMyPickupPhone(phone.trim());
      void askNotificationsInContext();
      seedFoodOrder(queryClient, order);
      cart.clear();
      if (!mounted.current) return;
      goToPlacedFoodOrder(router, order.id);
    } catch (err) {
      if (!mounted.current) return;
      // A 4xx carries the server's reason (on hold, a dish just sold out); anything else is R7b.
      const told = err instanceof ApiError && err.status >= 400 && err.status < 500 && err.message;
      if (err instanceof ApiError && err.status === 409) refetch();
      setToast(told ? { text: err.message, retry: false } : { text: O.r.failed, retry: true });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  // ── R9a · empty cart ──────────────────────────────────────────────────────────────────────────────
  if (cart.ready && (!cart.cart.restaurantId || cart.cart.lines.length === 0)) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
        <ReviewHeader onBack={() => router.back()} />
        <View style={{ alignItems: "center", gap: 8, paddingTop: 44, paddingHorizontal: 32 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
            <Icon name="shopping-bag" size={28} color={tokens.color.muted} />
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 21, lineHeight: 25.2, fontWeight: tokens.font.weight.extrabold, letterSpacing: -0.5, color: tokens.color.ink, textAlign: "center" }}>
            {O.r.empty}
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 19.6, color: tokens.color.muted, textAlign: "center" }}>{O.r.emptySub}</Text>
          <View style={{ alignSelf: "stretch", marginTop: 8 }}>
            <PrimaryButton label={O.r.emptyCta} onPress={() => router.replace("/food")} />
          </View>
        </View>
      </View>
    );
  }

  const changed = changes.gone.length > 0 || Object.keys(changes.priceChanges).length > 0;
  const placeLabel = ofFmt(O.r.place, { p: formatMoney(money.total) });
  const hint = editingAddr ? (draftOut ? outAreaBlock(venue) : null) : busy ? O.r.placingSub : !reachable ? O.r.offline : !drop ? O.r.noLocBlock : null;
  const phoneOpen = editingPhone || !phone.trim();

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.surface, paddingTop: insets.top }}>
      <ReviewHeader onBack={() => (editingAddr ? setEditingAddr(false) : router.back())} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 24, gap: 12 }}>
          {editingAddr ? (
            <AddressEdit
              draft={draft}
              query={query}
              rows={queryTyped ? suggest.rows : []}
              outOf={draft && draftOut ? { venue, area: areaOf(draft.label || query) } : null}
              onQuery={(q) => {
                setQuery(q);
                setQueryTyped(true);
              }}
              onSubmitQuery={() => {
                const top = suggest.rows[0];
                if (top) pickRow(top);
              }}
              onPick={pickRow}
              onUseCurrent={() => void useCurrent()}
              onMove={(p) => setDraft((d) => ({ ...p, label: d?.label ?? "" }))}
              onName={nameDraft}
              onDone={commitAddress}
            />
          ) : (
            <>
              {!reachable ? (
                <ReviewNote tone="plain" icon="wifi-off">
                  {ofFmt(O.c.offline, { t: hhmm(lastOnline.current) })}
                </ReviewNote>
              ) : null}
              {changed ? (
                <ReviewNote tone="hi" icon="circle-alert">
                  <Text style={{ fontWeight: tokens.font.weight.bold }}>{O.r.chgT}</Text>
                </ReviewNote>
              ) : null}

              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4 }}>
                <ServiceSticker service="food" size={40} art={30} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 17, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{venue}</Text>
                  <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{O.svc.food.Place}</Text>
                </View>
              </View>

              <ReviewBlock label={O.r.items}>
                {changes.gone.map((l) => (
                  <ItemLine key={`gone-${lineKey(l)}`} name={l.name} price={l.priceUsd * l.quantity} gone note="" flag={{ text: O.r.soldOut, tone: "muted" }} />
                ))}
                {cart.cart.lines.map((l) => {
                  const k = lineKey(l);
                  const ch = changes.priceChanges[k];
                  const editing = lineNote?.key === k;
                  return (
                    <ItemLine
                      key={k}
                      name={l.name}
                      price={l.priceUsd * l.quantity}
                      was={ch ? ch.from * l.quantity : null}
                      flag={ch ? { text: ofFmt(O.r.priceUp, { a: formatMoney(ch.from), b: formatMoney(ch.to) }), tone: "hi" } : null}
                      note={l.note}
                      onNote={() => setLineNote({ key: k, text: l.note })}
                      noteEditor={
                        editing ? (
                          <View style={{ marginTop: 6 }}>
                            <ReviewField
                              autoFocus
                              value={lineNote.text}
                              onChangeText={(t) => setLineNote({ key: k, text: t })}
                              onSubmitEditing={() => saveLineNote(l, lineNote.text)}
                              onBlur={() => saveLineNote(l, lineNote.text)}
                              placeholder={O.svc.food.note}
                              accessibilityLabel={`${O.svc.food.note}: ${l.name}`}
                              maxLength={200}
                              returnKeyType="done"
                            />
                          </View>
                        ) : undefined
                      }
                      stepper={
                        <LineStepper
                          qty={l.quantity}
                          name={l.name}
                          onMinus={() => setQty(l, l.quantity - 1)}
                          onPlus={() => setQty(l, l.quantity + 1)}
                          plusDisabled={l.quantity >= MAX_ITEM_QTY}
                        />
                      }
                    />
                  );
                })}
                <Text
                  accessibilityRole="button"
                  onPress={addMore}
                  suppressHighlighting
                  style={{ minHeight: tokens.touchTargetMin, paddingVertical: 12, fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}
                >
                  {O.r.addMore}
                </Text>
              </ReviewBlock>

              {money.belowMinimum ? (
                <ReviewNote tone="hi" icon="circle-alert">
                  {ofFmt(O.r.minHint, { d: formatMoney(money.shortfall), f: formatMoney(money.smallOrderFee) })}
                </ReviewNote>
              ) : null}

              <ReviewBlock label={O.r.to} edit={{ label: O.c.edit, onPress: openAddress }}>
                {drop ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Icon name="map-pin" size={18} color={tokens.color.danger} />
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{drop.label}</Text>
                  </View>
                ) : (
                  <>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Icon name="map-pin" size={18} color={tokens.color.danger} />
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.dangerInk }}>{O.r.noLoc}</Text>
                    </View>
                    <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{O.r.noLocSub}</Text>
                  </>
                )}
              </ReviewBlock>
            </>
          )}

          <ReviewBlock label={O.r.when}>
            <WhenAsap window={editingAddr ? null : eta} />
          </ReviewBlock>

          {editingAddr ? null : (
            <>
              <ReviewBlock label={O.r.phone} edit={{ label: phoneOpen ? O.c.done : O.c.edit, onPress: () => setEditingPhone(!phoneOpen) }}>
                {phoneOpen ? (
                  <ReviewField
                    autoFocus={editingPhone}
                    value={phone}
                    onChangeText={setPhone}
                    onSubmitEditing={() => setEditingPhone(false)}
                    placeholder="0771 234 567"
                    keyboardType="phone-pad"
                    maxLength={20}
                    accessibilityLabel={O.r.phone}
                  />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{displayPhone(phone)}</Text>
                )}
                <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{O.r.phoneSub}</Text>
              </ReviewBlock>

              <ReviewBlock label={O.r.riderNote} edit={{ label: editingNote ? O.c.done : O.c.edit, onPress: () => setEditingNote(!editingNote) }}>
                {editingNote ? (
                  <ReviewField
                    autoFocus
                    value={riderNote}
                    onChangeText={setRiderNote}
                    placeholder={O.r.riderNoteEmpty}
                    maxLength={160}
                    multiline
                    accessibilityLabel={O.r.riderNote}
                  />
                ) : riderNote.trim() ? (
                  <Text style={{ fontSize: 15, lineHeight: 21, color: tokens.color.ink }}>{riderNote.trim()}</Text>
                ) : (
                  <Text style={{ fontSize: 15, lineHeight: 21, color: tokens.color.muted }}>{O.r.riderNoteEmpty}</Text>
                )}
              </ReviewBlock>

              <ReviewBlock label={O.r.pay}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Icon name="banknote" size={20} color={tokens.color.accentText} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{O.r.cash}</Text>
                    <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{ofFmt(O.r.cashSub, { p: formatMoney(money.total) })}</Text>
                  </View>
                </View>
              </ReviewBlock>

              <Breakdown food={money.food} deliveryFee={money.deliveryFee} smallOrderFee={money.smallOrderFee} total={money.total} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {busy ? <View pointerEvents="auto" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: VEIL, zIndex: 20 }} /> : null}

      <ReviewBar hint={hint} bottomInset={insets.bottom}>
        {editingAddr ? (
          <PrimaryButton label={O.r.addrSave} onPress={commitAddress} disabled={!draft || draftOut} />
        ) : (
          <PrimaryButton
            label={busy ? O.r.placing : placeLabel}
            onPress={() => void submit()}
            loading={busy}
            disabled={!reachable || !drop || (!restaurant && !busy)}
          />
        )}
      </ReviewBar>

      {toast ? (
        <ReviewToast
          text={toast.text}
          action={toast.retry ? O.c.tryAgain : undefined}
          onAction={() => void submit()}
          bottom={insets.bottom + 88}
        />
      ) : null}

      {/* R6b — the kitchen closed while the customer was reviewing. The cart is kept; "Schedule for …"
          waits for the slots API (R5), so only "See open places" is offered. */}
      <Modal visible={closed && !busy} transparent animationType="fade" onRequestClose={() => router.back()} statusBarTranslucent>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: DIM }}>
          <View accessibilityViewIsModal style={{ backgroundColor: tokens.color.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 + insets.bottom, gap: 10 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
              <Icon name="clock" size={28} color={tokens.color.muted} />
            </View>
            <Text accessibilityRole="header" style={{ fontSize: 21, lineHeight: 25.2, fontWeight: tokens.font.weight.extrabold, letterSpacing: -0.5, color: tokens.color.ink }}>
              {ofFmt(O.r.closedT, { v: venue })}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 19.6, color: tokens.color.muted }}>{O.r.closedS}</Text>
            <PrimaryButton ghost label={B.justClosed.yes} onPress={() => router.replace("/food")} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
