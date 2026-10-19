import { CreateOrderRequest, formatPhoneDisplay, normalizePhone, quoteFare } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, BackHandler, Keyboard, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getMe, type Me } from "../src/api/auth";
import { ApiError, currentProfileId } from "../src/api/client";
import { createOrder, type OrderSnapshot } from "../src/api/orders";
import { routeAfterOrderPlaced } from "../src/push/ask-in-context";
import type { ResolvedPlace } from "../src/api/places";
import { fareBand, isBelowBand, isFarAboveBand } from "../src/logic/fare-band";
import { landmarkFromAddress } from "../src/logic/geocode";
import { isOutOfServiceArea, isWithinServiceCorridor } from "../src/logic/gates";
import { draftFromParams, emptyItem, first, type ItemRow, MAX_ITEMS, type RebroadcastParams } from "../src/logic/order-draft";
import { loadMyPickupPhone, loadRecipients, type Recipient, rememberRecipient, saveMyPickupPhone } from "../src/logic/saved-recipients";
import { clearSendDraft, loadSendDraft, SEND_DRAFT_DEBOUNCE_MS, type SendDraft, saveSendDraft } from "../src/logic/send-draft";
import {
  coordName,
  firstIncompleteStep,
  inArea,
  isDefinitiveSendFailure,
  kmLabel,
  money,
  phoneOk,
  priceFromText,
  priceOk,
  sanitizePriceText,
  type SendStep,
  sendAgainBanner,
  sendRefusal,
  type SendRefusal,
  type Stop,
  stepPrice,
  stopName,
  tripTooShort,
  whatMissingHint,
  whatOk,
  whereOk,
} from "../src/logic/send-steps";
import { useAddressSuggest } from "../src/logic/use-address-suggest";
import { usePickupAutolocate } from "../src/logic/use-pickup-autolocate";
import { useWebBackGuard } from "../src/logic/web-back-guard";
import { useReachability } from "../src/net/use-reachability";
import { orderKey } from "../src/query/client";
import { haptic, TestBuildBanner, useActionError } from "../src/ui";
import { ComposeMap } from "../src/ui/ComposeMap";
import type { PickedPoint } from "../src/ui/MapPicker";
import { AddressCard, type Slot } from "../src/ui/send/AddressCard";
import { Notice, RouteStrip, SEND_COPY, SendCtaBar, SendHeader, SendToast } from "../src/ui/send/kit";
import { SendHoldView } from "../src/ui/send/SendHoldView";
import { SendPriceStep } from "../src/ui/send/SendPriceStep";
import { SendReviewPriceBar, SendReviewStep } from "../src/ui/send/SendReviewStep";
import { SendWhatStep } from "../src/ui/send/SendWhatStep";
import { parseNum, randomUuidV4, uuidV4FromSeed, withTimeout } from "../src/util";
import { LOCATION_OFF_MSG } from "../src/permissions/location";

/**
 * Send a parcel — the stepped compose flow (ledger D-52; handoff `packages/design/handoff/send-compose-v2`):
 * 1 Where · 2 What · 3 Price · 4 Review. Addresses are edited INLINE on the map screen (the address row
 * becomes the search field; picking a result moves the pin on the same map). There is no search screen,
 * no confirm-pin screen, no landmark field, no declared value and no disclaimer: "Send to riders" on the
 * Review step broadcasts straight to the live auction.
 *
 * Everything entered is kept across steps, app backgrounding, an app kill and a page reload (U17: a
 * debounced draft in `src/logic/send-draft.ts`, without the phone numbers); Back walks one step back and
 * leaves the flow from step 1 — the browser's Back too (U40, `useWebBackGuard`).
 */

const LOCATE_TIMEOUT_MS = 9_000;
/** The address card's two idle rows (2 × 56 + divider) plus its 8px top gap — the dropdown starts below. */
const CARD_TOP = 8;
const CARD_ROWS_H = 117;
/** Framing both pins must clear the card above and the map pills below. */
const EDGE_PADDING = { top: CARD_TOP + CARD_ROWS_H + 40, right: 60, bottom: 80, left: 60 };

/** U48: the account's own number in the drawn form ("+263 77 245 1180"), or "" when it isn't a phone. */
function accountPhoneShown(me: Me | null | undefined): string {
  const shown = me?.phone ? formatPhoneDisplay(me.phone) : "";
  return shown && phoneOk(shown) ? shown : "";
}


export default function SendScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const online = useReachability();
  const setError = useActionError();

  // "Send again" / re-broadcast: the past order rides in as `rb…` route params (phones excluded — a
  // courier app keeps third-party numbers out of routing state). Resolved once, before the first paint,
  // so the pickup auto-locate below never races a prefilled pickup.
  const params = useLocalSearchParams<RebroadcastParams>();
  const [rbDraft] = useState(() => draftFromParams(params));
  const isSendAgain = rbDraft != null;
  const sendAgainText = useMemo(() => sendAgainBanner(first(params.rbDate)), [params.rbDate]);

  const [step, setStep] = useState<SendStep>(1);

  // ── Step 1 · Where ────────────────────────────────────────────────────────────────────────────────
  const [pickup, setPickup] = useState<Stop | null>(null);
  const [drop, setDrop] = useState<Stop | null>(null);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [query, setQuery] = useState("");
  /** The row the map edits when nothing is being typed: the last row the customer touched. */
  const [lastEdited, setLastEdited] = useState<Slot>("drop");
  const [locating, setLocating] = useState(false);
  /** The server refused a stop as out of area (the corridor edge / a stale client constant). */
  const [serverOutOfArea, setServerOutOfArea] = useState(false);
  const [bodyH, setBodyH] = useState(0);
  // Once the customer has placed the pickup themselves, a late GPS fix must never drag it away.
  const pickupTouched = useRef(isSendAgain);

  const suggest = useAddressSuggest(query, editing != null, online);

  // ── Step 2 · What and who ─────────────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [note, setNote] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [senderBlurred, setSenderBlurred] = useState(false);
  const [recipientBlurred, setRecipientBlurred] = useState(false);
  const [recipients, setRecipients] = useState<Recipient[]>([]);

  // ── Step 3 · Price ────────────────────────────────────────────────────────────────────────────────
  const [priceText, setPriceText] = useState("");

  // ── Step 4 · Send ─────────────────────────────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [idempotencyNonce, setIdempotencyNonce] = useState<string>(() => randomUuidV4());
  // U16: the key of a send that got no definitive answer (a timeout, a dropped link, a 5xx). The order may
  // already be live, so every later send replays THIS key — even after an edit — until a 2xx or 4xx
  // settles it. Without it an edit minted a new key and opened a second auction for the same parcel.
  const sentKey = useRef<string | null>(null);
  /** When `sentKey` last went out — a stored key is only replayed within SEND_DRAFT_SENT_KEY_TTL_MS of it. */
  const sentAt = useRef<number | null>(null);
  // U17: the stored draft is read once before anything is written, and a placed order writes nothing more.
  const draftReady = useRef(false);
  const draftDone = useRef(false);
  /** The suggested fare the price was last set from; a restored or Send again price is not re-suggested. */
  const lastSuggested = useRef<number | null>(null);

  /** U17: put a stored compose back — on the first step still missing something, never past it. */
  const restoreDraft = (d: SendDraft, myPhone: string): void => {
    if (d.pickup) pickupTouched.current = true;
    if (d.pickup && d.drop) {
      lastSuggested.current = quoteFare({ lat: d.pickup.lat, lng: d.pickup.lng }, { lat: d.drop.lat, lng: d.drop.lng }).suggestedFare;
    }
    sentKey.current = d.sentKey;
    sentAt.current = d.sentAt;
    setPickup((p) => d.pickup ?? p);
    setDrop(d.drop);
    setItems(d.items);
    setNote(d.note);
    setPriceText(d.priceText);
    const open = firstIncompleteStep({ pickup: d.pickup, drop: d.drop, items: d.items, senderPhone: myPhone, recipientPhone: "", price: parseNum(d.priceText) });
    setStep(Math.min(d.step, open) as SendStep);
  };

  // Account on hold — checked before step 1 opens. Polls once a minute while the hold stands (a lift is
  // an ops action with nothing to push it), and stops the moment it clears.
  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    refetchInterval: (q) => (q.state.data?.onHold === true ? 60_000 : false),
  });
  // A broadcast the server refused for the account's standing (U45): a hold, or a banned / suspended rider
  // sending as a customer. `at` is when, so only a /auth/me read AFTER it can lift the wall (U46).
  const [heldFromBroadcast, setHeldFromBroadcast] = useState<{ reason: SendRefusal; at: number } | null>(null);
  const accountOnHold = heldFromBroadcast != null || meQ.data?.onHold === true;
  // U46: support lifted the hold while the wall was up — the minute poll reads onHold false, and the
  // compose comes back with everything still filled in. (A banned / suspended standing has no field on
  // /auth/me to watch; that wall stays until the customer leaves.)
  useEffect(() => {
    if (heldFromBroadcast?.reason !== "hold") return;
    if (meQ.data?.onHold === false && meQ.dataUpdatedAt > heldFromBroadcast.at) setHeldFromBroadcast(null);
  }, [heldFromBroadcast, meQ.data?.onHold, meQ.dataUpdatedAt]);

  const goBack = useCallback((): void => {
    if (router.canGoBack()) router.back();
    else router.replace("/home");
  }, [router]);

  // Prefill: the past order (Send again), the sender's own remembered number, and recent recipients.
  // A Send again lands on the first step still missing something — usually Review, or What when the
  // recipient's number (never carried in route params) is the gap.
  const [myPhoneLoaded, setMyPhoneLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadRecipients().then((r) => {
      if (alive) setRecipients(r);
    });
    void (async () => {
      const myPhone = (await loadMyPickupPhone().catch(() => null)) ?? "";
      if (!alive) return;
      if (myPhone) setSenderPhone((p) => p || myPhone);
      setMyPhoneLoaded(true);
      if (!rbDraft) {
        // U17: the compose the customer left (app killed, page reloaded, swiped away), when there is one.
        const saved = await loadSendDraft(currentProfileId());
        if (!alive) return;
        if (saved) restoreDraft(saved, myPhone || accountPhoneShown(qc.getQueryData<Me>(["me"])));
        draftReady.current = true;
        return;
      }
      // Send again replaces the stored compose, but not a send of it that is still unanswered (U16): its key
      // is carried (while it is live, ≤ 10 min), so a resend can't open a second auction.
      const stored = await loadSendDraft(currentProfileId());
      if (!alive) return;
      if (stored?.sentKey) {
        sentKey.current = stored.sentKey;
        sentAt.current = stored.sentAt;
      }
      draftReady.current = true;
      const toStop = (pt: PickedPoint | null, name: string): Stop | null =>
        pt ? { lat: pt.lat, lng: pt.lng, name: stopName(name) || coordName(pt.lat, pt.lng), source: "prefill" } : null;
      const p = toStop(rbDraft.pickupPoint, rbDraft.pickupLandmark);
      const d = toStop(rbDraft.dropPoint, rbDraft.dropLandmark);
      setPickup(p);
      setDrop(d);
      setItems(rbDraft.items);
      setNote(rbDraft.note ?? "");
      setPriceText(rbDraft.proposedFare ? sanitizePriceText(rbDraft.proposedFare) : "");
      setStep(
        firstIncompleteStep({
          pickup: p,
          drop: d,
          items: rbDraft.items,
          senderPhone: myPhone || accountPhoneShown(qc.getQueryData<Me>(["me"])),
          recipientPhone: "",
          price: parseNum(rbDraft.proposedFare),
        }),
      );
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at mount.
  }, []);

  // U48: a first-time sender (no remembered number yet) gets the number they signed in with, as drawn
  // ("Your phone (sender)" prefilled, state 6). Once, and never over anything already typed.
  const accountPhone = accountPhoneShown(meQ.data);
  const accountPhoneSeeded = useRef(false);
  useEffect(() => {
    if (!myPhoneLoaded || accountPhoneSeeded.current || !accountPhone) return;
    accountPhoneSeeded.current = true;
    setSenderPhone((p) => p || accountPhone);
  }, [myPhoneLoaded, accountPhone]);

  // ── Addresses ─────────────────────────────────────────────────────────────────────────────────────

  const setStop = useCallback((slot: Slot, stop: Stop): void => {
    if (slot === "pickup") {
      pickupTouched.current = true;
      setPickup(stop);
    } else {
      setDrop(stop);
    }
    setLastEdited(slot);
    setServerOutOfArea(false);
  }, []);

  /** A reverse-geocoded name lands on a stop only if the pin hasn't moved since it was asked for. */
  const nameStopAt = useCallback((slot: Slot, lat: number, lng: number, name: string): void => {
    const set = slot === "pickup" ? setPickup : setDrop;
    set((s) => (s && s.lat === lat && s.lng === lng && name ? { ...s, name: stopName(name) } : s));
  }, []);

  // Pickup auto-locate on open (skipped for Send again). Writes only while the customer hasn't placed
  // the pickup themselves; failure is silent and leaves "Set pickup location" for them to fill.
  const onAutoPoint = useCallback((p: PickedPoint): void => {
    if (pickupTouched.current) return;
    setPickup((s) => ({ lat: p.lat, lng: p.lng, name: s?.source === "gps" && s.name ? s.name : coordName(p.lat, p.lng), source: "gps" }));
  }, []);
  const onAutoLandmark = useCallback((name: string): void => {
    if (pickupTouched.current || !name) return;
    setPickup((s) => (s && s.source === "gps" ? { ...s, name: stopName(name) } : s));
  }, []);
  usePickupAutolocate({ enabled: !isSendAgain, onPoint: onAutoPoint, onLandmark: onAutoLandmark });

  /** The row the map edits: the one being typed in, else the first empty one, else the last touched. */
  const mapSlot: Slot = editing ?? (pickup == null ? "pickup" : drop == null ? "drop" : lastEdited);

  // Map taps / marker drags. The pin moves at once (named by its coordinates); the reverse geocode
  // that ComposeMap fires right after replaces the name if it can. A tap while typing finishes the edit.
  const mapPoint = useCallback(
    (slot: Slot) =>
      (p: PickedPoint): void => {
        setStop(slot, { lat: p.lat, lng: p.lng, name: coordName(p.lat, p.lng), source: "map" });
        setEditing(null);
        Keyboard.dismiss();
      },
    [setStop],
  );
  const onMapPickup = useMemo(() => mapPoint("pickup"), [mapPoint]);
  const onMapDrop = useMemo(() => mapPoint("drop"), [mapPoint]);
  const onGeoPickup = useCallback(
    (name: string): void => setPickup((s) => (s && s.source === "map" && name ? { ...s, name: stopName(name) } : s)),
    [],
  );
  const onGeoDrop = useCallback(
    (name: string): void => setDrop((s) => (s && s.source === "map" && name ? { ...s, name: stopName(name) } : s)),
    [],
  );

  const startEdit = useCallback(
    (slot: Slot): void => {
      const current = slot === "pickup" ? pickup : drop;
      setQuery(current && current.source !== "map" && current.source !== "gps" ? current.name : "");
      setEditing(slot);
    },
    [pickup, drop],
  );

  const finishEdit = useCallback((): void => {
    setEditing(null);
    setQuery("");
    Keyboard.dismiss();
  }, []);

  const onPick = useCallback(
    (place: ResolvedPlace): void => {
      if (!editing) return;
      setStop(editing, { lat: place.lat, lng: place.lng, name: stopName(place.landmark) || coordName(place.lat, place.lng), placeId: place.placeId || undefined, source: "search" });
      finishEdit();
    },
    [editing, setStop, finishEdit],
  );

  /** "Use my location" (map pill) / "Use my current location" (dropdown): GPS → pin → reverse geocode. */
  const locate = useCallback(
    async (slot: Slot): Promise<void> => {
      setEditing(null);
      setQuery("");
      Keyboard.dismiss();
      setLocating(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") {
          setError(LOCATION_OFF_MSG);
          return;
        }
        const loc = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), LOCATE_TIMEOUT_MS);
        const { latitude: lat, longitude: lng } = loc.coords;
        // D-116: a customer abroad is not standing at a pickup we serve; say so instead of pinning London
        // (and framing a map from London to Harare).
        if (!isWithinServiceCorridor({ lat, lng })) {
          setError(SEND_COPY.outArea);
          return;
        }
        setStop(slot, { lat, lng, name: coordName(lat, lng), source: slot === "pickup" ? "gps" : "map" });
        try {
          const results = await withTimeout(Location.reverseGeocodeAsync({ latitude: lat, longitude: lng }), LOCATE_TIMEOUT_MS);
          const name = results[0] ? landmarkFromAddress(results[0]) : "";
          nameStopAt(slot, lat, lng, name);
        } catch {
          /* offline / no geocoder — the coordinates stay as the name */
        }
      } catch {
        setError("Couldn't get your location — tap the map to drop your pin.");
      } finally {
        setLocating(false);
      }
    },
    [setStop, nameStopAt, setError],
  );

  const locateMapSlot = useCallback((): void => void locate(mapSlot), [locate, mapSlot]);

  /** "Tap the map to set the pin": close the keyboard; the next map tap sets this row's pin. */
  const armMapTap = useCallback((): void => {
    if (editing) setLastEdited(editing);
    finishEdit();
  }, [editing, finishEdit]);

  // ── Derived ───────────────────────────────────────────────────────────────────────────────────────

  const outPickup = pickup != null && !inArea(pickup);
  const outDrop = drop != null && !inArea(drop);
  const outOfArea = outPickup || outDrop || serverOutOfArea;
  const step1Ok = whereOk(pickup, drop) && !serverOutOfArea;
  // U47: a drop-off on top of the pickup ("Use my location" twice) is not a drop-off yet.
  const dropMissing = pickup != null && (drop == null || tripTooShort(pickup, drop));

  const quote = pickup && drop ? quoteFare({ lat: pickup.lat, lng: pickup.lng }, { lat: drop.lat, lng: drop.lng }) : null;
  const band = quote ? fareBand(quote.suggestedFare) : null;
  const km = quote ? kmLabel(quote.distanceKm) : null;
  // Typed freely, asked to the nearest 50c: the review, the band and the request all read this.
  const price = priceFromText(priceText);
  const below = band != null && isBelowBand(price, band);
  const farAbove = band != null && isFarAboveBand(price, band);

  // The price starts at the suggested fare and is re-suggested whenever a pin moves, replacing whatever
  // was typed (the trip they priced is no longer the trip on screen). A Send again keeps its own price
  // for the first suggestion — that price is the point of re-sending it.
  const suggested = quote?.suggestedFare ?? null;
  useEffect(() => {
    if (suggested == null || lastSuggested.current === suggested) return;
    const isFirst = lastSuggested.current === null;
    lastSuggested.current = suggested;
    if (isFirst && isSendAgain) return;
    setPriceText(suggested.toFixed(2));
  }, [suggested, isSendAgain]);

  // Phone errors show on blur, never per keystroke; a field showing its own error drops out of the hint.
  const senderShowsError = senderBlurred && senderPhone.trim().length > 0 && !phoneOk(senderPhone);
  const recipientShowsError = recipientBlurred && recipientPhone.trim().length > 0 && !phoneOk(recipientPhone);
  const step2Ok = whatOk(items, senderPhone, recipientPhone);
  const step2Hint = step2Ok
    ? null
    : whatMissingHint(items, senderPhone, recipientPhone, { senderShown: senderShowsError, recipientShown: recipientShowsError });
  const step3Ok = priceOk(price);

  // ── Navigation ────────────────────────────────────────────────────────────────────────────────────

  const back = useCallback((): boolean => {
    if (editing) {
      finishEdit();
      return true;
    }
    if (step > 1) {
      setStep((s) => (s - 1) as SendStep);
      setFailed(false);
      return true;
    }
    goBack();
    return true;
  }, [editing, step, finishEdit, goBack]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", back);
      return () => sub.remove();
    }, [back]),
  );
  // U40: the browser's Back runs the same back() while there is a step (or an address edit) to walk back.
  const webBack = useWebBackGuard(!accountOnHold && (step > 1 || editing != null), back);
  const leaveTo = useCallback(
    (go: () => void): void => {
      void webBack.release().then(go);
    },
    [webBack],
  );

  const goTo = useCallback((s: SendStep): void => {
    Keyboard.dismiss();
    setFailed(false);
    setStep(s);
  }, []);

  // ── Items ─────────────────────────────────────────────────────────────────────────────────────────

  const updateItem = useCallback((i: number, patch: Partial<ItemRow>): void => {
    setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  }, []);
  const addItem = useCallback((): void => {
    setItems((arr) => (arr.length >= MAX_ITEMS ? arr : [...arr, emptyItem()]));
  }, []);
  const removeItem = useCallback((i: number): void => {
    setItems((arr) => (arr.length <= 1 ? arr : arr.filter((_, j) => j !== i)));
  }, []);

  // ── Send ──────────────────────────────────────────────────────────────────────────────────────────

  // Idempotency: a double-tap or timeout-retry of the SAME order dedupes server-side; the nonce rotates
  // after a successful create so a deliberate identical re-send isn't mistaken for a retry.
  const idempotencyKey = useMemo(
    () =>
      uuidV4FromSeed(
        `${idempotencyNonce}|${pickup?.lat},${pickup?.lng}|${drop?.lat},${drop?.lng}|${JSON.stringify(items)}|${note}|${priceText}`,
      ),
    [idempotencyNonce, pickup?.lat, pickup?.lng, drop?.lat, drop?.lng, items, note, priceText],
  );

  // ── Draft (U17) ───────────────────────────────────────────────────────────────────────────────────
  // A 500 ms trailing write after each change, flushed when the app leaves the foreground and when the
  // screen unmounts (PERF19-02: never a keychain round trip per keystroke). Phones are never in it.
  // S1: written only while signed in, and tagged with the account. A flush after an app-driven sign-out (an
  // expired refresh, another tab signing out) must not put the draft back after clearDeviceState wiped it.
  const draftNow = (profileId: string): SendDraft => ({
    savedAt: Date.now(),
    profileId,
    step,
    pickup,
    drop,
    items,
    note,
    priceText,
    sentKey: sentKey.current,
    sentAt: sentKey.current ? sentAt.current : null,
  });
  const latestDraft = useRef(draftNow);
  latestDraft.current = draftNow;
  const flushDraft = useCallback((): Promise<void> => {
    const profileId = currentProfileId();
    if (!draftReady.current || draftDone.current || !profileId) return Promise.resolve();
    return saveSendDraft(latestDraft.current(profileId));
  }, []);
  useEffect(() => {
    if (!draftReady.current || draftDone.current) return;
    const t = setTimeout(() => void flushDraft(), SEND_DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [step, pickup, drop, items, note, priceText, flushDraft]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st !== "active") void flushDraft();
    });
    return () => {
      sub.remove();
      void flushDraft();
    };
  }, [flushDraft]);

  const submit = async (): Promise<void> => {
    if (busy || !pickup || !drop || price == null || !step1Ok || !step2Ok || !step3Ok || !online) return;
    setFailed(false);
    // U16: a send still waiting on its answer is replayed with its own key, edits or not.
    const replay = sentKey.current != null;
    const key = sentKey.current ?? idempotencyKey;
    const candidate = {
      pickup: { point: { lat: pickup.lat, lng: pickup.lng }, landmark: pickup.name, contactPhone: normalizePhone(senderPhone) ?? senderPhone.trim() },
      dropoff: { point: { lat: drop.lat, lng: drop.lng }, landmark: drop.name, contactPhone: normalizePhone(recipientPhone) ?? recipientPhone.trim() },
      items: items.map((it) => ({ description: it.description.trim(), quantity: it.quantity })),
      note: note.trim() || undefined,
      declaredValue: 0,
      proposedFare: price,
      idempotencyKey: key,
    };
    const parsed = CreateOrderRequest.safeParse(candidate);
    if (!parsed.success) {
      setFailed(true);
      return;
    }
    // Zod strips unknown keys, so the Google place_id is spliced back onto the validated waypoints.
    const payload = {
      ...parsed.data,
      pickup: pickup.placeId ? { ...parsed.data.pickup, placeId: pickup.placeId } : parsed.data.pickup,
      dropoff: drop.placeId ? { ...parsed.data.dropoff, placeId: drop.placeId } : parsed.data.dropoff,
    };
    setBusy(true);
    // Frozen from the moment it goes out, and on disk before the request (LC-C06): an app killed while the
    // request is in flight still resends this key after the relaunch.
    sentKey.current = key;
    sentAt.current = Date.now();
    await flushDraft();
    try {
      // A replay answers with the order the lost send made — that order is the live one, edits or not, so
      // the app goes to it (a stored key is only replayed within SEND_DRAFT_SENT_KEY_TTL_MS of going out).
      const order = await createOrder(payload);
      sentKey.current = null;
      draftDone.current = true;
      void clearSendDraft();
      haptic("tap");
      void rememberRecipient({ name: "", phone: recipientPhone.trim() });
      void saveMyPickupPhone(senderPhone.trim());
      // D-55 / D-82 PC8: notifications are asked for after the order goes out — an explainer in front of
      // the order screen while the permission is undetermined (at most 3 times per install).
      const next = await routeAfterOrderPlaced(order.id);
      // Seed the order cache so the auction paints at once ("Finding riders near you…"). Not for a replay:
      // the order that answered may be the first attempt's, sent before an edit, so the screen reads it.
      if (!replay) qc.setQueryData<OrderSnapshot>(orderKey(order.id), {
        id: order.id,
        status: order.status,
        agreedFare: null,
        proposedFare: order.proposedFare,
        pickup: { point: { lat: pickup.lat, lng: pickup.lng }, landmark: pickup.name },
        dropoff: { point: { lat: drop.lat, lng: drop.lng }, landmark: drop.name },
        items: candidate.items,
        rider: null,
        events: [],
        counterpartyPhone: null,
        expiresAt: order.expiresAt,
        ridersNearby: order.ridersNearby ?? null,
      });
      setIdempotencyNonce(randomUuidV4());
      // Replace, not push (After Send handoff, D-53): Back from a live order must never land on Review —
      // nor, in a browser, on a step entry the back guard left behind (U40).
      leaveTo(() => router.replace(next as never));
    } catch (e) {
      // A 4xx settles it: nothing was created, so the next send may mint a new key. Anything else keeps it.
      if (isDefinitiveSendFailure(e)) {
        sentKey.current = null;
        sentAt.current = null;
        void flushDraft();
      }
      const refusal = e instanceof ApiError ? sendRefusal(e) : null;
      if (refusal) {
        setHeldFromBroadcast({ reason: refusal, at: Date.now() });
        if (refusal === "hold") void meQ.refetch();
      } else if (e instanceof ApiError && isOutOfServiceArea(e)) {
        setServerOutOfArea(true);
        setStep(1);
      } else {
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────────────────────────

  if (accountOnHold) {
    return <SendHoldView onBack={goBack} onHome={() => router.replace("/home")} />;
  }

  const offlineBanner = !online ? <Notice icon="wifi-off" text={SEND_COPY.offline} style={{ marginBottom: 10 }} /> : null;
  const againBanner = isSendAgain ? <Notice icon="history" tone="wash" text={sendAgainText} style={{ marginBottom: 10 }} /> : null;
  const strip = pickup && drop ? <RouteStrip pickup={pickup.name} drop={drop.name} onEdit={() => goTo(1)} /> : null;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
      <TestBuildBanner />
      <SendHeader step={step} bar={editing == null} onBack={() => void back()} />

      {/* Android resizes the window for the keyboard (Expo's default adjustResize); iOS needs padding so
          the CTA bar rides above the keyboard and the dropdown measures the space actually left. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* P36: the step-1 map stays mounted for the life of the screen — hidden, not torn down, on steps
          2–4 — so Back / Edit return to the same native map (its tiles, camera and two-pin fit) instead of
          a fresh one. Only the map is kept; the card and the CTA are step 1's alone. */}
      <View
        style={{ flex: 1, display: step === 1 ? "flex" : "none" }}
        onLayout={(e) => {
          if (e.nativeEvent.layout.height > 0) setBodyH(e.nativeEvent.layout.height);
        }}
      >
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
          <ComposeMap
            pickup={pickup}
            drop={drop}
            active={mapSlot}
            onChangePickup={onMapPickup}
            onChangeDrop={onMapDrop}
            onReverseGeocodePickup={onGeoPickup}
            onReverseGeocodeDrop={onGeoDrop}
            topOffset={CARD_TOP + CARD_ROWS_H + (outOfArea || !online ? 96 : 12)}
            bottomOffset={12}
            hint={!editing && pickup && !drop ? SEND_COPY.mapHintDrop : null}
            labels={editing == null}
            distanceLabel={!editing && step1Ok && km ? km : null}
            onUseMyLocation={editing ? undefined : locateMapSlot}
            locating={locating}
            edgePadding={EDGE_PADDING}
            hidden={step !== 1}
          />
        </View>
        {step === 1 ? (
          <View pointerEvents="box-none" style={{ position: "absolute", left: 12, right: 12, top: CARD_TOP }}>
            <AddressCard
              pickup={pickup}
              drop={drop}
              pickupMeta={pickup?.source === "gps" && drop == null ? SEND_COPY.fromGps : null}
              editing={editing}
              query={query}
              status={suggest.status}
              rows={suggest.rows}
              outPickup={outPickup || (serverOutOfArea && !outDrop)}
              outDrop={outDrop}
              dropdownMax={bodyH - CARD_TOP - CARD_ROWS_H - tokens.touchTargetMin}
              onEdit={startEdit}
              onChangeQuery={setQuery}
              onPick={onPick}
              onUseCurrent={() => editing && void locate(editing)}
              onTapMap={armMapTap}
            />
            {!editing && outOfArea ? (
              <Notice icon="map-pin" text={SEND_COPY.outArea} style={{ marginTop: 14, backgroundColor: tokens.color.bg, borderWidth: 0, ...tokens.shadow.card }} />
            ) : null}
            {!editing && !online && !outOfArea ? <Notice icon="wifi-off" text={SEND_COPY.offline} style={{ marginTop: 14, ...tokens.shadow.card }} /> : null}
          </View>
        ) : null}
      </View>
      {step === 1 ? (
        <>
          {editing ? null : (
            <View style={{ paddingBottom: insets.bottom, backgroundColor: tokens.color.bg }}>
              <SendCtaBar
                label={SEND_COPY.next}
                disabled={!step1Ok}
                hint={dropMissing ? SEND_COPY.needDrop : null}
                onPress={() => goTo(2)}
              />
            </View>
          )}
        </>
      ) : (
        <>
          <ScrollView
            key={step}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {offlineBanner}
            {step === 4 || step === 2 || step === 3 ? againBanner : null}
            {step === 2 ? (
              <>
                {strip}
                <SendWhatStep
                  items={items}
                  onChangeItem={updateItem}
                  onAddItem={addItem}
                  onRemoveItem={removeItem}
                  note={note}
                  onChangeNote={setNote}
                  senderPhone={senderPhone}
                  onChangeSenderPhone={setSenderPhone}
                  onBlurSenderPhone={() => setSenderBlurred(true)}
                  senderError={senderShowsError ? SEND_COPY.phoneErr : null}
                  recipientPhone={recipientPhone}
                  onChangeRecipientPhone={setRecipientPhone}
                  onBlurRecipientPhone={() => setRecipientBlurred(true)}
                  recipientError={recipientShowsError ? SEND_COPY.phoneErr : null}
                  recipients={recipients}
                />
              </>
            ) : null}
            {step === 3 ? (
              <>
                {strip}
                <SendPriceStep
                  priceText={priceText}
                  onChangePriceText={(t) => setPriceText(sanitizePriceText(t))}
                  onStep={(dir) => setPriceText(stepPrice(price, dir).toFixed(2))}
                  price={price}
                  band={band}
                  km={km}
                  below={below}
                  farAbove={farAbove}
                />
              </>
            ) : null}
            {step === 4 && pickup && drop ? (
              <SendReviewStep
                pickup={pickup.name}
                drop={drop.name}
                km={km}
                items={items}
                note={note}
                senderPhone={senderPhone}
                recipientPhone={recipientPhone}
                onEdit={goTo}
              />
            ) : null}
          </ScrollView>
          {failed && step === 4 ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
              {/* U16: offline, the banner and the CTA hint already say what to do; a Try again that can't
                  send would only repeat the toast. */}
              <SendToast text={SEND_COPY.failed} action={online ? SEND_COPY.retry : undefined} onAction={online ? () => void submit() : undefined} />
            </View>
          ) : null}
          <View style={{ paddingBottom: insets.bottom, backgroundColor: tokens.color.bg }}>
            {step === 2 ? <SendCtaBar label={SEND_COPY.next} disabled={!step2Ok} hint={step2Hint} onPress={() => goTo(3)} /> : null}
            {step === 3 ? (
              <SendCtaBar
                label={SEND_COPY.review}
                disabled={!step3Ok}
                onPress={() => {
                  // Coming back to the price shows the 50c the review asks for, not the typed cents.
                  if (price != null) setPriceText(price.toFixed(2));
                  goTo(4);
                }}
              />
            ) : null}
            {step === 4 ? (
              <SendCtaBar
                label={busy ? SEND_COPY.sending : SEND_COPY.send}
                loading={busy}
                disabled={!online || !step1Ok || !step2Ok || !step3Ok}
                hint={!online ? SEND_COPY.offlineCta : null}
                onPress={() => void submit()}
              >
                <SendReviewPriceBar price={price != null ? money(price) : "—"} onEdit={() => goTo(3)} />
              </SendCtaBar>
            ) : null}
          </View>
        </>
      )}
      </KeyboardAvoidingView>
    </View>
  );
}
