import { CreateOrderRequest, quoteFare, tokens } from "@lynia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, LayoutAnimation, Modal, Platform, Pressable, ScrollView, Text, UIManager, View } from "react-native";
import { ApiError } from "../src/api/client";
import { acceptDisclaimer, createOrder, type OrderSnapshot } from "../src/api/orders";
import { loadDisclaimerAccepted, saveDisclaimerAccepted } from "../src/auth/session";
import { orderKey } from "../src/query/client";
import { Button, Card, ErrorText, Field, Heading, Icon, type IconName, Label, Screen, Sub } from "../src/ui";
import { BottomSheet } from "../src/ui/BottomSheet";
import { MapPicker, type PickedPoint } from "../src/ui/MapPicker";
import { parseNum } from "../src/util";

// LayoutAnimation needs an explicit opt-in on old-architecture Android; a no-op on iOS / Fabric.
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// One compose row of "what are you sending?" — mirrors the contract's OrderItem.
interface ItemRow {
  description: string;
  quantity: number;
}
const emptyItem = (): ItemRow => ({ description: "", quantity: 1 });
// Contract caps: ≤10 rows, qty 1–99, description ≤140 (OrderItem).
const MAX_ITEMS = 10;
const MAX_QTY = 99;

// The form draft persisted between visits. PII (the two contact phone numbers) is DELIBERATELY
// excluded — a courier app must not stash a third party's phone in on-device storage. Everything
// here is the sender's own routing/pricing intent, which is safe to restore.
interface FormDraft {
  pickupPoint: PickedPoint | null;
  pickupLandmark: string;
  dropPoint: PickedPoint | null;
  dropLandmark: string;
  items: ItemRow[];
  declaredValue: string;
  proposedFare: string;
}

// The liability-disclaimer policy the customer must accept before a first broadcast (A1-8). Bump this
// string when the disclaimer copy/terms change and the accept-to-continue gate re-shows.
const DISCLAIMER_POLICY_VERSION = "2026-07-01";

// Reuse the same on-device primitive the auth session uses (expo-secure-store); a single key.
const DRAFT_KEY = "lynia.orderDraft";
// All three are best-effort: a SecureStore reject (native read/write failure) must never reject —
// otherwise a failed read would leave `hydrated` unset and silently disable draft saving for the
// whole session. A draft is a convenience, never load-bearing.
async function loadDraft(): Promise<FormDraft | null> {
  try {
    const raw = await SecureStore.getItemAsync(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as FormDraft & { itemDescription?: string };
    // Pre-line-items drafts stored a single `itemDescription` string — hydrate it as one row.
    // Rows are re-clamped to the contract caps in case a stale/foreign draft slips through.
    const rows = Array.isArray(d.items) ? d.items : [{ description: d.itemDescription ?? "", quantity: 1 }];
    d.items = rows.slice(0, MAX_ITEMS).map((r) => ({
      description: (typeof r?.description === "string" ? r.description : "").slice(0, 140),
      quantity: Math.min(MAX_QTY, Math.max(1, Math.round(Number(r?.quantity) || 1))),
    }));
    if (d.items.length === 0) d.items = [emptyItem()];
    return d;
  } catch {
    return null;
  }
}
async function saveDraft(draft: FormDraft): Promise<void> {
  try {
    await SecureStore.setItemAsync(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* best-effort */
  }
}
async function clearDraft(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(DRAFT_KEY);
  } catch {
    /* best-effort */
  }
}

export default function HomeScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();

  const [pickupPoint, setPickupPoint] = useState<PickedPoint | null>(null);
  const [pickupLandmark, setPickupLandmark] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [dropPoint, setDropPoint] = useState<PickedPoint | null>(null);
  const [dropLandmark, setDropLandmark] = useState("");
  const [dropPhone, setDropPhone] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [declaredValue, setDeclaredValue] = useState("");
  const [proposedFare, setProposedFare] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-broadcast liability disclaimer (A1-8). Gate the first broadcast behind an accept-to-continue
  // sheet; once accepted for the current policy version we don't re-show it. Kept in a ref (read at
  // tap time, not a render dependency) plus the modal's own visibility state.
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const disclaimerAccepted = useRef(false);
  useEffect(() => {
    let alive = true;
    void loadDisclaimerAccepted().then((v) => {
      if (alive && v === DISCLAIMER_POLICY_VERSION) disclaimerAccepted.current = true;
    });
    return () => {
      alive = false;
    };
  }, []);

  // Landmark auto-fill: once the user edits a landmark it's theirs — stop auto-filling from the map.
  const [pickupLandmarkTouched, setPickupLandmarkTouched] = useState(false);
  const [dropLandmarkTouched, setDropLandmarkTouched] = useState(false);
  // Whether the current landmark value came from the map (drives the "• from map" label hint).
  const [pickupLandmarkFromMap, setPickupLandmarkFromMap] = useState(false);
  const [dropLandmarkFromMap, setDropLandmarkFromMap] = useState(false);

  // "Draft restored" chip — shown when a draft is rehydrated on mount, dismissed on clear/submit.
  const [draftRestored, setDraftRestored] = useState(false);
  // Gate persistence until the initial load has run, so we don't clobber the stored draft with empties.
  const hydrated = useRef(false);

  // "Add details (optional)" collapsible — secondary fields (landmarks, declared value) live here
  // so the required path (pins → item → phones → price → Broadcast) stays primary and always
  // visible. The contact phones are NOT in here: the contract requires both (min 6), so hiding
  // them behind an "optional" toggle would enable Broadcast only to fail it on submit.
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Reduce-motion: read once (same pattern as LiveMap). When on, expand/collapse is instant, no anim.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!cancelled) setReduceMotion(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const toggleDetails = useCallback((): void => {
    if (!reduceMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDetailsOpen((v) => !v);
  }, [reduceMotion]);

  // Rehydrate the draft once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const draft = await loadDraft();
      if (cancelled) {
        hydrated.current = true;
        return;
      }
      if (draft) {
        setPickupPoint(draft.pickupPoint);
        setPickupLandmark(draft.pickupLandmark);
        setDropPoint(draft.dropPoint);
        setDropLandmark(draft.dropLandmark);
        setItems(draft.items);
        setDeclaredValue(draft.declaredValue);
        setProposedFare(draft.proposedFare);
        // Restored landmarks are user-owned text (not live from the map): treat them as typed.
        if (draft.pickupLandmark) setPickupLandmarkTouched(true);
        if (draft.dropLandmark) setDropLandmarkTouched(true);
        setDraftRestored(true);
      }
      hydrated.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the draft (PII-free) whenever a persisted field changes, after initial hydration.
  useEffect(() => {
    if (!hydrated.current) return;
    void saveDraft({
      pickupPoint,
      pickupLandmark,
      dropPoint,
      dropLandmark,
      items,
      declaredValue,
      proposedFare,
    });
  }, [pickupPoint, pickupLandmark, dropPoint, dropLandmark, items, declaredValue, proposedFare]);

  // Item-row edits — bounds mirror the contract (≥1 row always on screen, ≤MAX_ITEMS, qty 1–99).
  const updateItem = useCallback((i: number, patch: Partial<ItemRow>): void => {
    setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }, []);
  const addItem = useCallback((): void => {
    setItems((arr) => (arr.length >= MAX_ITEMS ? arr : [...arr, emptyItem()]));
  }, []);
  const removeItem = useCallback((i: number): void => {
    setItems((arr) => (arr.length <= 1 ? arr : arr.filter((_, j) => j !== i)));
  }, []);

  // Landmark edits: mark the field user-owned and drop the "from map" hint.
  const editPickupLandmark = useCallback((t: string): void => {
    setPickupLandmark(t);
    setPickupLandmarkTouched(true);
    setPickupLandmarkFromMap(false);
  }, []);
  const editDropLandmark = useCallback((t: string): void => {
    setDropLandmark(t);
    setDropLandmarkTouched(true);
    setDropLandmarkFromMap(false);
  }, []);

  // Auto-fill from reverse geocode — only while the field is untouched (user hasn't typed one).
  const onPickupReverseGeocode = useCallback(
    (landmark: string): void => {
      if (pickupLandmarkTouched) return;
      setPickupLandmark(landmark);
      setPickupLandmarkFromMap(true);
    },
    [pickupLandmarkTouched],
  );
  const onDropReverseGeocode = useCallback(
    (landmark: string): void => {
      if (dropLandmarkTouched) return;
      setDropLandmark(landmark);
      setDropLandmarkFromMap(true);
    },
    [dropLandmarkTouched],
  );

  const clearForm = useCallback((): void => {
    setPickupPoint(null);
    setPickupLandmark("");
    setDropPoint(null);
    setDropLandmark("");
    setItems([emptyItem()]);
    setDeclaredValue("");
    setProposedFare("");
    setPickupLandmarkTouched(false);
    setDropLandmarkTouched(false);
    setPickupLandmarkFromMap(false);
    setDropLandmarkFromMap(false);
    setDraftRestored(false);
    void clearDraft();
  }, []);

  const fare = parseNum(proposedFare);
  const coordsOk = pickupPoint != null && dropPoint != null;
  const quote = coordsOk
    ? quoteFare(
        { lat: pickupPoint.lat, lng: pickupPoint.lng },
        { lat: dropPoint.lat, lng: dropPoint.lng },
      )
    : null;
  // Mirror the contract's contactPhone floor (min 6, both waypoints) so Broadcast can't enable and
  // then bounce off a raw Zod message on submit.
  const pickupPhoneOk = pickupPhone.trim().length >= 6;
  const dropPhoneOk = dropPhone.trim().length >= 6;
  // Every row needs a description — an empty row must block submit, not silently drop.
  const itemsOk = items.every((it) => it.description.trim().length > 0);
  // Landmarks are contract-required too (Waypoint.landmark min 1). They're normally auto-filled
  // from the reverse geocode, but that can fail offline / keyless — same never-fail-Zod rule.
  const landmarksOk = pickupLandmark.trim().length > 0 && dropLandmark.trim().length > 0;
  const canSubmit = coordsOk && fare !== null && fare > 0 && itemsOk && pickupPhoneOk && dropPhoneOk && landmarksOk;

  const submit = async (): Promise<void> => {
    setError(null);
    if (!canSubmit || pickupPoint == null || dropPoint == null || fare === null) {
      setError("Drop a pin for pickup and drop-off, name an item, add both contact phones, and set a price.");
      return;
    }
    const candidate = {
      pickup: { point: { lat: pickupPoint.lat, lng: pickupPoint.lng }, landmark: pickupLandmark.trim(), contactPhone: pickupPhone.trim() },
      dropoff: { point: { lat: dropPoint.lat, lng: dropPoint.lng }, landmark: dropLandmark.trim(), contactPhone: dropPhone.trim() },
      // Line-items are the payload (the contract accepts either shape; `items` alone is the new
      // clients' path — the server derives the itemDesc summary).
      items: items.map((it) => ({ description: it.description.trim(), quantity: it.quantity })),
      declaredValue: parseNum(declaredValue) ?? 0,
      proposedFare: fare,
      // A1-8: bind the accepted disclaimer version onto the order itself; the server stamps the
      // acceptance time. The accept-to-continue gate guarantees this is set before broadcast.
      disclaimerVersion: DISCLAIMER_POLICY_VERSION,
    };
    const parsed = CreateOrderRequest.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please complete the form.");
      return;
    }
    setBusy(true);
    try {
      const order = await createOrder(parsed.data);
      // Seed the order cache from the response + the form we already have, so the order screen
      // paints the auction immediately instead of blank → skeleton → content on navigate.
      qc.setQueryData<OrderSnapshot>(orderKey(order.id), {
        id: order.id,
        status: order.status,
        agreedFare: null,
        proposedFare: order.proposedFare,
        pickup: { point: { lat: pickupPoint.lat, lng: pickupPoint.lng }, landmark: pickupLandmark.trim() },
        dropoff: { point: { lat: dropPoint.lat, lng: dropPoint.lng }, landmark: dropLandmark.trim() },
        items: candidate.items,
        rider: null,
        events: [],
        counterpartyPhone: null,
        expiresAt: order.expiresAt,
      });
      // Draft fulfilled — wipe it so the next visit starts clean.
      setDraftRestored(false);
      void clearDraft();
      router.push(`/order/${order.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create the order.");
    } finally {
      setBusy(false);
    }
  };

  // Broadcast tap: the disclaimer is an accept-to-continue GATE in front of the first order create.
  // If the customer has already accepted the current policy version, go straight to submit.
  const onBroadcast = (): void => {
    if (disclaimerAccepted.current) {
      void submit();
      return;
    }
    setShowDisclaimer(true);
  };
  const onAgreeAndBroadcast = (): void => {
    disclaimerAccepted.current = true;
    void saveDisclaimerAccepted(DISCLAIMER_POLICY_VERSION);
    // Record consent server-side (policyVersion + timestamp). Best-effort: a reject (incl. the route
    // not being wired yet) must never block the broadcast — the local flag already gates re-showing.
    void acceptDisclaimer({ policyVersion: DISCLAIMER_POLICY_VERSION }).catch(() => undefined);
    setShowDisclaimer(false);
    void submit();
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: tokens.space.lg }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
            <Heading>Send a parcel</Heading>
            <View style={{ flex: 1 }} />
            <Button label="Trips" variant="ghost" onPress={() => router.push("/history")} />
            <Button label="Account" variant="ghost" onPress={() => router.push("/profile")} />
          </View>
          <Sub>Drop a pin for pickup and drop-off, name your price, and riders will offer.</Sub>

          {draftRestored ? (
            <View
              accessibilityRole="text"
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                backgroundColor: tokens.color.surface,
                borderWidth: 1,
                borderColor: tokens.color.line,
                borderRadius: tokens.radius.pill,
                paddingLeft: 10,
                paddingRight: 4,
                paddingVertical: 4,
                marginBottom: tokens.space.md,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.accentText }}>Draft restored</Text>
              <Pressable
                onPress={clearForm}
                accessibilityRole="button"
                accessibilityLabel="Clear the restored draft"
                style={({ pressed }) => ({
                  minHeight: tokens.touchTargetMin,
                  justifyContent: "center",
                  paddingHorizontal: tokens.space.sm,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.muted }}>Clear</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Required path — the pins. Drop pickup + drop-off; these gate the CTA. */}
          <Card>
            <MapPicker
              label="Pickup"
              value={pickupPoint}
              onChange={setPickupPoint}
              onReverseGeocode={onPickupReverseGeocode}
              showMyLocation
              height={180}
            />
            <MapPicker
              label="Drop-off"
              value={dropPoint}
              onChange={setDropPoint}
              onReverseGeocode={onDropReverseGeocode}
              height={180}
            />
          </Card>

          {/* Secondary fields — collapsed by default under a tap-to-expand toggle so the required
              path stays short. Landmarks keep their "• from map" auto-fill hint (unchanged). */}
          <Card>
            <Pressable
              onPress={toggleDetails}
              accessibilityRole="button"
              accessibilityState={{ expanded: detailsOpen }}
              accessibilityLabel="Add details (optional)"
              style={{
                flexDirection: "row",
                alignItems: "center",
                minHeight: tokens.touchTargetMin,
              }}
            >
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>Add details (optional)</Text>
              <Icon name={detailsOpen ? "chevron-down" : "chevron-right"} size={16} color={tokens.color.muted} />
            </Pressable>

            {detailsOpen ? (
              <View style={{ marginTop: tokens.space.sm }}>
                <Field
                  label={pickupLandmarkFromMap ? "Pickup landmark  • from map" : "Pickup landmark"}
                  value={pickupLandmark}
                  onChangeText={editPickupLandmark}
                  placeholder="Eastgate Mall, CBD"
                  maxLength={160}
                />
                <Field
                  label={dropLandmarkFromMap ? "Drop-off landmark  • from map" : "Drop-off landmark"}
                  value={dropLandmark}
                  onChangeText={editDropLandmark}
                  placeholder="14 Glenara Ave, Avenues"
                  maxLength={160}
                />
                <Field label="Declared value (USD, max 150)" value={declaredValue} onChangeText={setDeclaredValue} placeholder="10" keyboardType="decimal-pad" />
              </View>
            ) : null}
          </Card>
        </ScrollView>

        {/* Hero action in the thumb zone: what you're sending, name your price, broadcast. */}
        <BottomSheet
          footer={
            <>
              {!canSubmit ? (
                // A disabled Pressable swallows the tap, so name what's still missing here rather
                // than only on an edge-complete submit — never a silent greyed dead-end.
                <Text style={{ fontSize: 14, color: tokens.color.muted, marginBottom: tokens.space.xs }}>
                  {`Add ${[
                    !coordsOk ? "pickup & drop-off pins" : null,
                    !itemsOk ? (items.length > 1 ? "a description for every item" : "an item") : null,
                    !pickupPhoneOk ? "a pickup contact phone" : null,
                    !dropPhoneOk ? "a recipient phone" : null,
                    !landmarksOk ? "pickup & drop-off landmarks (under \u201cAdd details\u201d)" : null,
                    !(fare !== null && fare > 0) ? "a price" : null,
                  ]
                    .filter(Boolean)
                    .join(", ")} to broadcast.`}
                </Text>
              ) : null}
              <Button label="Broadcast request" onPress={onBroadcast} loading={busy} disabled={!canSubmit} />
              <ErrorText message={error} />
            </>
          }
        >
          {/* Line items — repeatable description + quantity rows (ITEM-DESIGN-REVIEW: multiple
              {description, quantity}, nothing more for the pilot). Description stacks above the
              qty stepper so a row still works at 320px. */}
          <Label>What are you sending?</Label>
          {items.map((it, i) => (
            <View key={i}>
              <Field
                value={it.description}
                onChangeText={(t) => updateItem(i, { description: t })}
                placeholder={i === 0 ? "Documents" : "Another item"}
                maxLength={140}
              />
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: -tokens.space.sm, marginBottom: tokens.space.sm }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginRight: tokens.space.sm }}>Quantity</Text>
                <QtyStepper value={it.quantity} onChange={(q) => updateItem(i, { quantity: q })} />
                <View style={{ flex: 1 }} />
                {items.length > 1 ? (
                  <Pressable
                    onPress={() => removeItem(i)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove item ${i + 1}`}
                    style={({ pressed }) => ({
                      minHeight: tokens.touchTargetMin,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: tokens.space.xs,
                      paddingHorizontal: tokens.space.xs,
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Icon name="x" size={16} color={tokens.color.muted} />
                    {/* Icons are always paired with a text label (low-literacy market). */}
                    <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted }}>Remove</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
          {items.length < MAX_ITEMS ? (
            <Button label="Add another item" variant="ghost" onPress={addItem} />
          ) : (
            // The control never just vanishes — say why it's gone (every dead-end explains itself).
            <Text style={{ fontSize: 12, color: tokens.color.muted, marginBottom: tokens.space.sm }}>Up to 10 items per order.</Text>
          )}
          {/* Contract-required (both waypoints, min 6) — they live on the required path, not in the
              "optional" collapse, so Broadcast never enables only to fail Zod on submit. */}
          <Field label="Pickup contact phone" value={pickupPhone} onChangeText={setPickupPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} />
          <Field label="Recipient phone" value={dropPhone} onChangeText={setDropPhone} placeholder="+263..." keyboardType="phone-pad" maxLength={20} />
          {quote ? (
            <View style={{ marginBottom: tokens.space.sm }}>
              <Text style={{ fontSize: 14, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
                Suggested fare ${quote.suggestedFare.toFixed(2)} · {quote.distanceKm} km
              </Text>
              <Button label={`Use suggested $${quote.suggestedFare.toFixed(2)}`} variant="ghost" onPress={() => setProposedFare(quote.suggestedFare.toFixed(2))} />
            </View>
          ) : null}
          <Field label="Your price (USD)" value={proposedFare} onChangeText={setProposedFare} placeholder="2.50" keyboardType="decimal-pad" />
        </BottomSheet>
      </KeyboardAvoidingView>
      <DisclaimerSheet visible={showDisclaimer} onAgree={onAgreeAndBroadcast} onBack={() => setShowDisclaimer(false)} />
    </Screen>
  );
}

/**
 * A1-8 pre-broadcast liability disclaimer — an accept-to-continue sheet shown before the first order
 * is created. The primary "Agree & broadcast" stays disabled until the customer ticks the consent
 * box; agreeing records consent (policy version + timestamp) and proceeds. Modeled on the
 * new-flows.html disclaimer: three plain-language terms, then a mint consent row.
 */
const DISCLAIMER_ROWS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "triangle-alert",
    title: "Sending is at your own risk",
    body: "If your parcel is lost, damaged or not delivered, Lynia isn't liable — you're hiring an independent rider.",
  },
  {
    icon: "banknote",
    title: "Payment is between you and your rider",
    body: "You agree the price in the app and pay cash directly. Lynia isn't involved in payment or any money dispute.",
  },
  {
    icon: "user",
    title: "Lynia connects you — that's all",
    body: "We match you with a nearby rider. We don't carry, insure or guarantee your parcel.",
  },
];

function DisclaimerSheet({ visible, onAgree, onBack }: { visible: boolean; onAgree: () => void; onBack: () => void }): React.ReactElement {
  const [checked, setChecked] = useState(false);
  // Reset the consent tick each time the sheet opens — consent is per-broadcast, never pre-ticked.
  useEffect(() => {
    if (visible) setChecked(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onBack} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "rgba(20,24,27,0.45)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: tokens.color.bg,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: tokens.space.lg,
            paddingTop: tokens.space.md,
            paddingBottom: tokens.space.xl,
            maxHeight: "94%",
            ...tokens.shadow.sheet,
          }}
        >
          <View style={{ width: 36, height: 4, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.line, alignSelf: "center", marginBottom: tokens.space.md }} />
          <Heading>Before you send</Heading>
          <Sub>Please read and accept — this is how Lynia works.</Sub>
          <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
            {DISCLAIMER_ROWS.map((r) => (
              <View key={r.title} style={{ flexDirection: "row", gap: tokens.space.md, marginBottom: tokens.space.md }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
                  <Icon name={r.icon} size={17} color={tokens.color.accentText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{r.title}</Text>
                  <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18, marginTop: 1 }}>{r.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={() => setChecked((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel="I understand and accept these terms"
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: tokens.space.sm,
              padding: tokens.space.md,
              borderRadius: tokens.radius.input,
              backgroundColor: tokens.color.accentWash,
              marginTop: tokens.space.xs,
              minHeight: tokens.touchTargetMin,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                // Bright accent is a non-text fill here (the tick box) — the check glyph is white on it.
                backgroundColor: checked ? tokens.color.accent : tokens.color.bg,
                borderWidth: checked ? 0 : 1.5,
                borderColor: tokens.color.line,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {checked ? <Icon name="check" size={14} color={tokens.color.onAccent} /> : null}
            </View>
            <Text style={{ flex: 1, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
              I understand and accept these terms
            </Text>
          </Pressable>
          <Button label="Agree & broadcast" onPress={onAgree} disabled={!checked} />
          <Button label="Back" variant="ghost" onPress={onBack} />
        </View>
      </View>
    </Modal>
  );
}

/** Compact − / count / + quantity stepper. 44px round targets (touchTargetMin) so it's tappable on
 *  a cheap phone; the count renders in tabular numerals so rows don't shimmy as digits change. */
function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }): React.ReactElement {
  const btn = (glyph: "−" | "+", next: number, disabled: boolean, label: string): React.ReactElement => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: tokens.touchTargetMin,
        height: tokens.touchTargetMin,
        borderRadius: tokens.touchTargetMin / 2,
        borderWidth: 1,
        borderColor: tokens.color.line,
        backgroundColor: pressed ? tokens.color.accentWash : tokens.color.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Text style={{ fontSize: 20, fontWeight: "700", lineHeight: 22, color: tokens.color.accentText }}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}>
      {btn("−", Math.max(1, value - 1), value <= 1, "Decrease quantity")}
      <Text style={{ minWidth: 26, textAlign: "center", fontSize: 16, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      {btn("+", Math.min(MAX_QTY, value + 1), value >= MAX_QTY, "Increase quantity")}
    </View>
  );
}
