import { tokens } from "@lynia/shared";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { autocompletePlaces, placeDetails, placesEnabled, type PlaceSuggestion, type ResolvedPlace } from "../api/places";
import { addRecent, loadRecents, loadSaved, type SavedPlaces, type SavedSlot, saveSlot } from "../logic/saved-places";
import { Icon, type IconName, Label } from "./index";

/**
 * Search-first address entry (customer-journey §1·2). A search field → Google Places autocomplete
 * suggestions → tap resolves to a picked point (lat/lng + landmark + place_id), which feeds the SAME
 * flow the MapPicker produces. Pin-on-map stays the primary path below this — the search is the fast
 * path when a key is present.
 *
 * KEY-GATED, but never SILENT: with no Places key configured this used to render `null`, which shipped
 * a build whose address rows advertise a search magnifier and then offer only the pin picker — the exact
 * "the UI says search, the app gives pins" mismatch reported from the store build (see
 * docs/UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md §2). An unkeyed build now renders a visible, honest
 * disabled field naming the pin path instead, so a mis-provisioned build is obvious on screen rather
 * than invisible. Every network failure still degrades to a muted "set it on the map below" hint — it
 * never blocks or crashes the pin path.
 */

const DEBOUNCE_MS = 300;

/** A per-search session token — groups the autocomplete calls + the one details lookup into a single
 *  billable Places session. Regenerated when a fresh search begins, discarded after a resolve. */
function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Named-slot presentation. There is no "home" glyph in the house icon set, so Home/Work reuse existing
// icons (map-pin / package, package echoing the mockup's Work tile) on the accent tile.
const SLOT_META: Record<SavedSlot, { icon: IconName; label: string }> = {
  home: { icon: "map-pin", label: "Home" },
  work: { icon: "package", label: "Work" },
};

/** Split a stored landmark ("Name, area, city") into a bold primary + muted secondary for a two-line
 *  row, mirroring the autocomplete suggestion layout. No comma ⇒ everything is the primary line. */
function splitLandmark(landmark: string): { primary: string; secondary: string } {
  const i = landmark.indexOf(", ");
  if (i < 0) return { primary: landmark, secondary: "" };
  return { primary: landmark.slice(0, i), secondary: landmark.slice(i + 2) };
}

/**
 * "Powered by Google" attribution (kit `addr_search`, `ui_kits/mobile/app.js`). Google's Places terms
 * require this wherever autocomplete results are displayed outside a Google map — our suggestion list
 * floats over the map chrome, not inside it, so it must be shown. Rendered only alongside live results.
 * The wordmark's per-letter colours are Google's, not ours; they are deliberately hard-coded rather
 * than tokenised so a palette change can never restyle someone else's brand mark.
 */
const GOOGLE_LETTERS: ReadonlyArray<readonly [string, string]> = [
  ["G", "#4285F4"],
  ["o", "#EA4335"],
  ["o", "#FBBC05"],
  ["g", "#4285F4"],
  ["l", "#34A853"],
  ["e", "#EA4335"],
];

function PoweredByGoogle(): React.ReactElement {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel="Powered by Google"
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, paddingTop: 6, paddingHorizontal: tokens.space.sm }}
    >
      <Text style={{ fontSize: 11, color: tokens.color.muted }}>Powered by</Text>
      <View style={{ flexDirection: "row" }} importantForAccessibility="no-hide-descendants">
        {GOOGLE_LETTERS.map(([ch, col], i) => (
          <Text key={i} style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, color: col }}>
            {ch}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** A small bold, letter-spaced, muted section label ("SAVED" / "RECENTS") — matches the mockup. */
function SectionHeader({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, letterSpacing: 0.5, color: tokens.color.muted, marginTop: tokens.space.md, marginBottom: 2 }}>
      {children}
    </Text>
  );
}

/**
 * One idle-state place row: a circular icon tile + name/sub (the mockup's Result row). Saved slots use
 * the accent tile (accentWash fill + accent-text glyph) to read as "yours"; recents use a neutral tile.
 * `trailing` is an optional right-edge action (a bookmark to promote a recent, or ✕ to clear a slot).
 */
function PlaceRow(props: {
  icon: IconName;
  name: string;
  sub?: string;
  tone: "saved" | "recent";
  onPress: () => void;
  accessibilityLabel: string;
  trailing?: React.ReactNode;
}): React.ReactElement {
  const accent = props.tone === "saved";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: tokens.color.line }}>
      <Pressable
        onPress={props.onPress}
        accessibilityRole="button"
        accessibilityLabel={props.accessibilityLabel}
        style={({ pressed }) => ({
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: tokens.space.sm,
          minHeight: tokens.touchTargetMin,
          paddingVertical: tokens.space.sm,
          backgroundColor: pressed ? tokens.color.accentWash : tokens.color.bg,
        })}
      >
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: accent ? tokens.color.accentWash : tokens.color.surface }}>
          <Icon name={props.icon} size={16} color={accent ? tokens.color.accentText : tokens.color.muted} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
            {props.name}
          </Text>
          {props.sub ? (
            <Text numberOfLines={1} style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted }}>
              {props.sub}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {props.trailing ?? null}
    </View>
  );
}

export type AddressSearchProps = {
  label: string;
  placeholder?: string;
  /** Called with the resolved place when the customer taps a suggestion. Feeds the picked-point flow. */
  onResolved: (place: ResolvedPlace) => void;
  /**
   * Bump this to pull focus into the field — the address rows above are the customer's mental "edit
   * this address" control, and the kit routes that tap into a search screen. On this one-screen
   * composer the equivalent is: tapping a row focuses its search, so the magnifier on the row is a
   * real affordance rather than a decoration. Any change of value focuses; the initial value does not.
   */
  focusSignal?: number;
};

export function AddressSearch(props: AddressSearchProps): React.ReactElement {
  // The gate: no key → no live search. Render the disabled explainer instead of nothing, so the pin
  // path is named on screen and a build missing the key can't hide (see the file header).
  if (!placesEnabled()) return <AddressSearchUnavailable label={props.label} />;
  return <AddressSearchInner {...props} />;
}

/**
 * Keyless state: a non-interactive field that looks like the search it replaces and says plainly where
 * the address goes instead. Deliberately NOT a silent `null` — see the file header.
 */
function AddressSearchUnavailable({ label }: { label: string }): React.ReactElement {
  return (
    <View style={{ marginBottom: tokens.space.sm }}>
      <Label>{label}</Label>
      <View
        accessibilityRole="text"
        accessibilityLabel={`${label} search is unavailable — set this address on the map instead`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: tokens.space.sm,
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.input,
          paddingHorizontal: tokens.space.md,
          paddingVertical: tokens.space.md,
          minHeight: tokens.touchTargetMin,
          backgroundColor: tokens.color.surface,
        }}
      >
        <Icon name="map-pin" size={16} color={tokens.color.muted} />
        <Text style={{ flex: 1, fontSize: tokens.font.size.body, color: tokens.color.muted }}>
          Address search is unavailable — tap the map to set this pin.
        </Text>
      </View>
    </View>
  );
}

function AddressSearchInner(props: AddressSearchProps): React.ReactElement {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Idle-state shortcuts (customer-journey §1·2): the customer's Home/Work slots and last few picked
  // places, shown while the field is empty so a repeat drop-off is one tap. Best-effort — a load miss
  // just leaves these empty and the live search is unaffected.
  const [recents, setRecents] = useState<ResolvedPlace[]>([]);
  const [saved, setSaved] = useState<SavedPlaces>({ home: null, work: null });

  const sessionToken = useRef<string>(newSessionToken());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id so a slow autocomplete response can't overwrite a newer query's results.
  const reqSeq = useRef(0);
  const input = useRef<TextInput>(null);

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

  // Focus on demand (see `focusSignal`). A falsy signal means "nobody has asked yet", so the compose
  // screen never opens with the keyboard covering the map. This must also fire on MOUNT, not just on
  // change: switching slots swaps the component's key, so a tap on the other address row arrives as a
  // fresh mount carrying an already-raised signal.
  const { focusSignal } = props;
  useEffect(() => {
    if (!focusSignal) return;
    input.current?.focus();
  }, [focusSignal]);

  // Hydrate saved/recents once on mount (best-effort; both resolve to empty on any failure).
  useEffect(() => {
    let alive = true;
    void loadRecents().then((r) => { if (alive) setRecents(r); });
    void loadSaved().then((s) => { if (alive) setSaved(s); });
    return () => { alive = false; };
  }, []);

  const runSearch = useCallback(
    (text: string): void => {
      const seq = ++reqSeq.current;
      setLoading(true);
      void autocompletePlaces(text, sessionToken.current)
        .then((rows) => {
          if (seq !== reqSeq.current) return; // a newer keystroke already superseded this call
          setSuggestions(rows);
        })
        .finally(() => {
          if (seq === reqSeq.current) setLoading(false);
        });
    },
    [],
  );

  const onChangeText = useCallback(
    (text: string): void => {
      setQuery(text);
      setFailed(false);
      if (debounce.current) clearTimeout(debounce.current);
      const trimmed = text.trim();
      if (trimmed.length < 3) {
        // Too short to search — clear any stale rows and stop (also skips a wasted call).
        reqSeq.current++;
        setSuggestions([]);
        setLoading(false);
        return;
      }
      debounce.current = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
    },
    [runSearch],
  );

  const choose = useCallback(
    (s: PlaceSuggestion): void => {
      setResolving(true);
      setFailed(false);
      void placeDetails(s.placeId, sessionToken.current)
        .then((place) => {
          if (!place) {
            // Details failed — leave the customer on the pin path with a calm hint.
            setFailed(true);
            return;
          }
          props.onResolved(place);
          // Remember it at the head of the idle "recents" list for next time (best-effort).
          void addRecent(place).then(setRecents);
          // Collapse the search into the chosen place and start a fresh billable session.
          setQuery(place.landmark);
          setSuggestions([]);
          sessionToken.current = newSessionToken();
        })
        .finally(() => setResolving(false));
    },
    [props],
  );

  // Tapping an already-resolved place (a saved slot or a recent) short-circuits Details entirely — it
  // was resolved once, so we feed the picked point straight through and float it back up the recents.
  const pick = useCallback(
    (place: ResolvedPlace): void => {
      props.onResolved(place);
      void addRecent(place).then(setRecents);
      setQuery(place.landmark);
      setSuggestions([]);
      sessionToken.current = newSessionToken();
    },
    [props],
  );

  // "Save as Home/Work" affordance: a bookmark button on each recent row promotes it into the first
  // FREE slot (Home, then Work). This is the simplest discoverable path that lets a customer fill BOTH
  // slots — after the resolve the field is filled with the landmark, so the idle SAVED section isn't
  // visible; the recents list is, so the promotion lives there. A saved slot can be cleared (the row's
  // ✕) to re-assign it. Both writes are best-effort.
  const nextFreeSlot = saved.home === null ? "home" : saved.work === null ? "work" : null;
  const promote = useCallback(
    (place: ResolvedPlace, slot: SavedSlot): void => {
      void saveSlot(slot, place).then(setSaved);
    },
    [],
  );
  const clearSlot = useCallback((slot: SavedSlot): void => {
    void saveSlot(slot, null).then(setSaved);
  }, []);

  // The field is "idle" (not actively searching) below the 3-char autocomplete threshold — that's when
  // the SAVED/RECENTS shortcuts take over the space the suggestion list would occupy.
  const idle = query.trim().length < 3;

  const clear = useCallback((): void => {
    reqSeq.current++;
    setQuery("");
    setSuggestions([]);
    setFailed(false);
    sessionToken.current = newSessionToken();
  }, []);

  return (
    <View style={{ marginBottom: tokens.space.sm }}>
      <Label>{props.label}</Label>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.input,
          paddingHorizontal: tokens.space.md,
          backgroundColor: tokens.color.bg,
        }}
      >
        <Icon name="search" size={16} color={tokens.color.muted} />
        <TextInput
          ref={input}
          value={query}
          onChangeText={onChangeText}
          placeholder={props.placeholder ?? "Search an address or place"}
          placeholderTextColor={tokens.color.muted}
          accessibilityLabel={props.label}
          autoCorrect={false}
          style={{
            flex: 1,
            paddingVertical: tokens.space.md,
            paddingHorizontal: tokens.space.sm,
            fontSize: tokens.font.size.bodyLg,
            color: tokens.color.ink,
            minHeight: tokens.touchTargetMin,
          }}
        />
        {loading || resolving ? (
          <ActivityIndicator color={tokens.color.accentText} />
        ) : query.length > 0 ? (
          <Pressable
            onPress={clear}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            style={{ minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="x" size={16} color={tokens.color.muted} />
          </Pressable>
        ) : null}
      </View>

      {suggestions.length > 0 ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: tokens.color.line,
            borderRadius: tokens.radius.input,
            marginTop: tokens.space.xs,
            overflow: "hidden",
            backgroundColor: tokens.color.bg,
          }}
        >
          {suggestions.map((s, i) => (
            <Pressable
              key={s.placeId}
              onPress={() => choose(s)}
              accessibilityRole="button"
              accessibilityLabel={`${s.primary}${s.secondary ? `, ${s.secondary}` : ""}`}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.space.sm,
                minHeight: tokens.touchTargetMin,
                paddingHorizontal: tokens.space.md,
                paddingVertical: tokens.space.sm,
                backgroundColor: pressed ? tokens.color.accentWash : tokens.color.bg,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: tokens.color.line,
              })}
            >
              <Icon name="map-pin" size={16} color={tokens.color.accentText} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
                  {s.primary}
                </Text>
                {s.secondary ? (
                  <Text numberOfLines={1} style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted }}>
                    {s.secondary}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {suggestions.length > 0 ? <PoweredByGoogle /> : null}

      {/* Idle state (customer-journey §1·2): while the field is empty/below the search threshold, offer
          the customer's saved slots + recent picks in place of the (empty) suggestion list. */}
      {idle && (saved.home !== null || saved.work !== null || recents.length > 0) ? (
        <View style={{ marginTop: tokens.space.xs }}>
          {saved.home !== null || saved.work !== null ? (
            <>
              <SectionHeader>SAVED</SectionHeader>
              {(["home", "work"] as SavedSlot[]).map((slot) => {
                const place = saved[slot];
                if (!place) return null;
                const meta = SLOT_META[slot];
                return (
                  <PlaceRow
                    key={slot}
                    icon={meta.icon}
                    name={meta.label}
                    sub={place.landmark}
                    tone="saved"
                    onPress={() => pick(place)}
                    accessibilityLabel={`${meta.label}: ${place.landmark}`}
                    trailing={
                      <Pressable
                        onPress={() => clearSlot(slot)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove saved ${meta.label}`}
                        hitSlop={8}
                        style={{ minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" }}
                      >
                        <Icon name="x" size={16} color={tokens.color.muted} />
                      </Pressable>
                    }
                  />
                );
              })}
            </>
          ) : null}

          {recents.length > 0 ? (
            <>
              <SectionHeader>RECENTS</SectionHeader>
              {recents.map((place) => {
                const { primary, secondary } = splitLandmark(place.landmark);
                return (
                  <PlaceRow
                    key={place.placeId}
                    icon="map-pin"
                    name={primary}
                    sub={secondary}
                    tone="recent"
                    onPress={() => pick(place)}
                    accessibilityLabel={primary}
                    trailing={
                      // Promote to the first free slot (Home, then Work). Hidden once both are set.
                      nextFreeSlot ? (
                        <Pressable
                          onPress={() => promote(place, nextFreeSlot)}
                          accessibilityRole="button"
                          accessibilityLabel={`Save ${primary} as ${SLOT_META[nextFreeSlot].label}`}
                          hitSlop={8}
                          style={{ minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" }}
                        >
                          <Icon name="star" size={16} color={tokens.color.muted} />
                        </Pressable>
                      ) : undefined
                    }
                  />
                );
              })}
            </>
          ) : null}
        </View>
      ) : null}

      {failed ? (
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, marginTop: tokens.space.xs }}>
          Couldn&apos;t load that place — set it on the map below instead.
        </Text>
      ) : null}
    </View>
  );
}
