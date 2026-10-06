import { isMerchantOpenNow, normalizePhone } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError } from "../../src/api/client";
import { placeFoodOrder } from "../../src/api/food-orders";
import { useFoodCart } from "../../src/food/cart-context";
import { addLine, cartService, MAX_ITEM_QTY, removeLine, type FoodCartLine } from "../../src/logic/food-cart";
import { estimateDeliveryFee, goToPlacedFoodOrder } from "../../src/logic/food-checkout";
import { deliverToLabel, etaRange, restaurantMeta } from "../../src/logic/food-list";
import { isWithinServiceCorridor } from "../../src/logic/gates";
import { landmarkFromAddress } from "../../src/logic/geocode";
import { useHomeLocation } from "../../src/logic/home-location";
import {
  arrivalWindow,
  areaOf,
  displayPhone,
  firstSlot,
  hhmm,
  lineKey,
  placeOrderBody,
  reconcileCart,
  reviewBreakdown,
  slotDay,
  startsAt,
  type ChosenSlot,
  type ReconcileResult,
} from "../../src/logic/review";
import { loadMyPickupPhone, saveMyPickupPhone } from "../../src/logic/saved-recipients";
import { useAddressSuggest, type SuggestRow } from "../../src/logic/use-address-suggest";
import { usePlacingGuard } from "../../src/logic/use-placing-guard";
import { useNow } from "../../src/logic/use-now";
import { formatMoney } from "../../src/logic/money";
import { useReachability } from "../../src/net/use-reachability";
import { routeAfterOrderPlaced } from "../../src/push/ask-in-context";
import { seedFoodOrder } from "../../src/query/use-food-order";
import { useOrderFlags } from "../../src/net/use-order-flags";
import { useCarriedBalance, useScheduleSlots } from "../../src/query/use-order-flow";
import { RX_MAX_PAGES, usePrescriptionPhotos } from "../../src/query/use-prescription-photos";
import { useRestaurantMenu } from "../../src/query/use-restaurants";
import { useShopCatalogue } from "../../src/query/use-shops";
import { uuidV4FromSeed, withTimeout } from "../../src/util";
import { EmptyState, emptyCopy, Icon } from "../../src/ui";
import { B } from "../../src/ui/browse/copy";
import { ServiceSticker } from "../../src/ui/browse/kit";
import { AddressEdit } from "../../src/ui/orderflow/AddressEdit";
import { O, ofFmt } from "../../src/ui/orderflow/copy";
import {
  Breakdown,
  ItemLine,
  LineStepper,
  OutOfStockChoice,
  PrimaryButton,
  ReviewBar,
  ReviewBlock,
  ReviewField,
  ReviewHeader,
  ReviewNote,
  ReviewToast,
  RxBlock,
  ScheduleSheet,
  WhenAsap,
  WhenScheduled,
} from "../../src/ui/orderflow/review";

/**
 * Review & place — Order flow v2.1 R1, R3a/b, R4, R6a/b, R7a–c, R9a/b (packages/design/handoff/order-flow-v2,
 * ledger D-59). Cart and checkout are ONE screen, pushed from the storefront cart bar: white blocks on a
 * grey page, items edited in place, the address edited inline with a map, the cash total pinned in the
 * 52px CTA. Place → the order screen REPLACES the food stack, so Back from the order goes Home.
 *
 * One screen for every venue: the cart says which kind it holds (restaurant, shop, pharmacy). A shop or
 * pharmacy adds "If something's out of stock" (R2a/R2b) and the pharmacy its OTC notice (R2b). WHEN's
 * Schedule opens the slot sheet (R5a/R5b; a closed venue's "Order for when they open" bar arrives with
 * `?schedule=first`, R5c). Behind `rxEnabled`, a pharmacy cart with a "Prescription needed" item carries
 * the prescription block and can't be placed without a photo (R8a/R8b). A balance owed from a cancel after
 * collection (BRIEF D3f) is its own breakdown row, inside the total.
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
  const params = useLocalSearchParams<{ schedule?: string }>();
  const service = cartService(cart.cart.venue);
  const isShop = service !== "food";
  const rid = cart.cart.restaurantId ?? undefined;
  // The venue's latest catalogue: a restaurant's menu, or a shop's / pharmacy's catalogue (same shapes).
  const restaurantMenu = useRestaurantMenu(rid, !!rid && !isShop);
  const shopCatalogue = useShopCatalogue(rid, !!rid && isShop);
  const restaurant = isShop ? shopCatalogue.catalogue?.shop : restaurantMenu.menu?.restaurant;
  const categories = isShop ? shopCatalogue.catalogue?.categories : restaurantMenu.menu?.categories;
  const refetch = isShop ? shopCatalogue.refetch : restaurantMenu.refetch;
  const venue = cart.cart.restaurantName ?? restaurant?.name ?? "";
  const svc = O.svc[service];
  const flags = useOrderFlags();

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
    if (!categories) return;
    const latest = new Map<string, { priceUsd: number; outOfStock: boolean }>();
    for (const c of categories) for (const d of c.dishes) latest.set(d.id, { priceUsd: d.priceUsd, outOfStock: d.outOfStock });
    const r = reconcileCart(cart.cart.lines, latest);
    if (r.gone.length === 0 && Object.keys(r.priceChanges).length === 0) return;
    cart.replaceLines(r.lines);
    setChanges((prev) => ({ gone: [...prev.gone, ...r.gone], priceChanges: { ...prev.priceChanges, ...r.priceChanges } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per fetched menu, not per cart edit.
  }, [categories]);

  // ── WHEN: ASAP or a slot (R5a–c) ────────────────────────────────────────────────────────────────
  // The slots are for THIS drop-off (the lead time includes the ride), so they follow the address.
  const slotsQ = useScheduleSlots(rid, drop ? { lat: drop.lat, lng: drop.lng } : null, !!rid);
  const slots = slotsQ.slots ?? null;
  const [sched, setSched] = useState<ChosenSlot | null>(null);
  const [schedOpen, setSchedOpen] = useState(false);
  // R5c: the closed venue's cart bar ("Order for when they open · 10:30–11:00") opens Review on that slot.
  const wantFirst = params.schedule === "first";
  const autoPicked = useRef(false);
  useEffect(() => {
    if (!slots) return;
    if (sched && slotDay(slots, sched.slot.start) == null) setSched(null); // the slot went away (new address, or it passed)
    if (wantFirst && !autoPicked.current && !sched) {
      autoPicked.current = true;
      const f = firstSlot(slots);
      if (f) setSched(f);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-checked when the slots change, not per pick.
  }, [slots]);
  const openSchedule = (): void => {
    if (!slots) {
      setToast({ text: O.c.noData, retry: false });
      return;
    }
    setSchedOpen(true);
  };

  // ── Shops and pharmacies: "If something's out of stock" (R2a/R2b) ──────────────────────────────────
  const [oos, setOos] = useState<"ask" | "remove">("ask");

  // ── Prescription (R8a/R8b, behind rxEnabled) ──────────────────────────────────────────────────────
  const rxOn = flags.rxEnabled && service === "pharmacy";
  const rxNeeded = rxOn && cart.cart.lines.some((l) => l.rxRequired);
  const rx = usePrescriptionPhotos(() => setToast({ text: O.c.noData, retry: false }));
  const [patient, setPatient] = useState("");
  const [consent, setConsent] = useState(false);
  const rxEmpty = rxNeeded && rx.pages.length === 0;
  const rxKeys = rx.keys.join(",");

  // ── BRIEF D3f: a balance owed from a cancel after collection rides on this order ──────────────────
  const owed = useCarriedBalance(cart.ready && !!rid);

  const idempotencyKey = useMemo(
    () =>
      uuidV4FromSeed(
        `food-order|${cart.cart.restaurantId}|${JSON.stringify(cart.cart.lines)}|${cart.cart.orderNote}|${drop?.lat},${drop?.lng}|cash|${sched?.slot.start ?? "asap"}|${isShop ? oos : ""}|${rxKeys}`,
      ),
    [cart.cart.restaurantId, cart.cart.lines, cart.cart.orderNote, drop?.lat, drop?.lng, sched?.slot.start, isShop, oos, rxKeys],
  );

  const deliveryFee = drop && restaurant ? estimateDeliveryFee(restaurant.location, drop) : null;
  const money = reviewBreakdown(cart.cart.lines, deliveryFee, owed, restaurant?.freeDelivery === true);
  const eta = drop && restaurant ? arrivalWindow(etaRange([restaurantMeta(restaurant, drop)]), now) : null;
  const closed = restaurant != null && !isMerchantOpenNow(restaurant.hours, now);
  const phoneOk = normalizePhone(phone) !== null;
  const first = slots ? firstSlot(slots) : null;
  const dayWord = (c: ChosenSlot): string => (c.day === "today" ? O.r.today : O.r.tomorrow);

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
    else router.push(`/${service}/${cart.cart.restaurantId}` as never);
  };

  // ── Place ─────────────────────────────────────────────────────────────────────────────────────────
  const submit = async (): Promise<void> => {
    setToast(null);
    if (!drop) return openAddress();
    if (!phoneOk) return setEditingPhone(true);
    if (!cart.cart.restaurantId) return;
    // R8b: the prescription travels whole — a patient name and the consent tick with the pages. Missing
    // either is said once in the toast (hints never block except the Rx photo itself).
    if (rxNeeded && !patient.trim()) return setToast({ text: O.r.rxPatient, retry: false });
    if (rxNeeded && !consent) return setToast({ text: O.r.rxConsent, retry: false });
    setBusy(true);
    try {
      const order = await placeFoodOrder(
        cart.cart.restaurantId,
        placeOrderBody({
          lines: cart.cart.lines,
          orderNote: cart.cart.orderNote,
          drop,
          riderNote,
          phone,
          idempotencyKey,
          scheduledFor: sched?.slot.start ?? null,
          outOfStockPref: isShop ? oos : null,
          prescription: rxNeeded ? { photoKeys: rx.keys, patientName: patient.trim(), consent: true } : null,
        }),
      );
      void saveMyPickupPhone(phone.trim());
      seedFoodOrder(queryClient, order);
      cart.clear();
      // D-82 PC8: the "Know when it's at the gate" explainer in front of the order, while it should ask.
      const next = await routeAfterOrderPlaced(order.id);
      if (!mounted.current) return;
      goToPlacedFoodOrder(router, order.id, next);
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
        <EmptyState icon="shopping-bag" title={emptyCopy.cart.empty.title} primary={{ label: emptyCopy.cart.empty.primary, onPress: () => router.replace("/food") }} />
      </View>
    );
  }

  const changed = changes.gone.length > 0 || Object.keys(changes.priceChanges).length > 0;
  const placeLabel = ofFmt(O.r.place, { p: formatMoney(money.total) });
  const hint = editingAddr
    ? draftOut
      ? outAreaBlock(venue)
      : null
    : busy
      ? O.r.placingSub
      : !reachable
        ? O.r.offline
        : !drop
          ? O.r.noLocBlock
          : rxEmpty
            ? O.r.rxBlocked
            : null;
  const phoneOpen = editingPhone || !phone.trim();
  // R6b: the venue closed while the customer was reviewing an ASAP order. A slot answers it (no modal);
  // arriving from R5c waits for the slots before deciding.
  const closedModal = closed && !sched && !busy && !(wantFirst && slotsQ.isLoading);

  const rxBlock = rxNeeded ? (
    <RxBlock
      pages={rx.pages.map((p) => ({ id: p.id, uri: p.uri, uploading: p.key == null }))}
      canAddMore={rx.pages.length < RX_MAX_PAGES}
      onAdd={rx.add}
      patient={patient}
      onPatient={setPatient}
      consent={consent}
      onConsent={() => setConsent((c) => !c)}
    />
  ) : null;

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
                <ServiceSticker service={service} size={40} art={30} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 17, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{venue}</Text>
                  <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{svc.Place}</Text>
                </View>
              </View>

              {/* "Over-the-counter medicine only" is untrue while prescriptions are on (E2E 2026-10-05 FS-5,
                  owner: hide it, as the browse notice). useOrderFlags fails closed, so an unknown flag keeps it. */}
              {service === "pharmacy" && !flags.rxEnabled ? (
                <ReviewNote tone="ok" icon="shield-check">
                  {O.r.otc}
                </ReviewNote>
              ) : null}

              {rxEmpty ? rxBlock : null}

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
                      rx={rxOn && !!l.rxRequired}
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
                              placeholder={svc.note}
                              accessibilityLabel={`${svc.note}: ${l.name}`}
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

              {rxEmpty ? null : rxBlock}

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

          <ReviewBlock label={O.r.when} edit={sched && !editingAddr ? { label: O.c.edit, onPress: openSchedule } : null}>
            {sched ? (
              <WhenScheduled
                title={ofFmt(O.r.schRow, { d: dayWord(sched), s: sched.slot.label })}
                sub={ofFmt(O.r.schRowSub, { v: venue, making: svc.making.toLowerCase(), t: startsAt(sched.slot.start, slots?.leadMinutes ?? 0) })}
              />
            ) : (
              <WhenAsap window={editingAddr ? null : eta} onSchedule={openSchedule} />
            )}
          </ReviewBlock>

          {editingAddr ? null : (
            <>
              {isShop ? (
                <ReviewBlock label={O.r.oos}>
                  <OutOfStockChoice value={oos} place={svc.place} onChange={setOos} />
                </ReviewBlock>
              ) : null}

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

              <Breakdown
                food={money.food}
                goodsLabel={isShop ? O.r.itemsK : O.r.food}
                deliveryFee={money.deliveryFee}
                freeDeliveryBy={money.freeDelivery ? venue : null}
                smallOrderFee={money.smallOrderFee}
                owed={money.owed}
                total={money.total}
              />
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
            disabled={!reachable || !drop || (!restaurant && !busy) || rxEmpty || (rxNeeded && rx.uploading)}
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

      <ScheduleSheet
        visible={schedOpen}
        venue={venue}
        making={svc.making.toLowerCase()}
        slots={slots}
        initial={sched}
        bottomInset={insets.bottom}
        onPick={(c) => {
          setSched(c);
          setSchedOpen(false);
        }}
        onClose={() => setSchedOpen(false)}
      />

      {/* R6b — the venue closed while the customer was reviewing. The cart is kept; "Schedule for …" picks
          the first slot they can meet (R5), "See open places" goes back to the section. */}
      <Modal visible={closedModal} transparent animationType="fade" onRequestClose={() => router.back()} statusBarTranslucent>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: DIM }}>
          <View accessibilityViewIsModal style={{ backgroundColor: tokens.color.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 16 + insets.bottom, gap: 10 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
              <Icon name="clock" size={28} color={tokens.color.muted} />
            </View>
            <Text accessibilityRole="header" style={{ fontSize: 21, lineHeight: 25.2, fontWeight: tokens.font.weight.extrabold, letterSpacing: -0.5, color: tokens.color.ink }}>
              {ofFmt(O.r.closedT, { v: venue })}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 19.6, color: tokens.color.muted }}>{O.r.closedS}</Text>
            {first ? (
              <PrimaryButton icon="calendar" label={ofFmt(O.r.closedCta, { s: `${dayWord(first).toLowerCase()} ${first.slot.label}` })} onPress={() => setSched(first)} />
            ) : null}
            <PrimaryButton ghost label={B.justClosed.yes} onPress={() => router.replace(`/${service}` as never)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
