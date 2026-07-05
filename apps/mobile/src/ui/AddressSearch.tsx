import { tokens } from "@lynia/shared";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { autocompletePlaces, placeDetails, placesEnabled, type PlaceSuggestion, type ResolvedPlace } from "../api/places";
import { Icon, Label } from "./index";

/**
 * Search-first address entry (customer-journey §1·2). A search field → Google Places autocomplete
 * suggestions → tap resolves to a picked point (lat/lng + landmark + place_id), which feeds the SAME
 * flow the MapPicker produces. Pin-on-map stays the primary path below this — the search is the fast
 * path when a key is present.
 *
 * KEY-GATED: with no Places key configured this renders nothing (placesEnabled() === false), so the
 * screen shows only the MapPicker and the app runs fully unkeyed. Every network failure degrades to
 * a muted "set it on the map below" hint — it never blocks or crashes the pin path.
 */

const DEBOUNCE_MS = 300;

/** A per-search session token — groups the autocomplete calls + the one details lookup into a single
 *  billable Places session. Regenerated when a fresh search begins, discarded after a resolve. */
function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function AddressSearch(props: {
  label: string;
  placeholder?: string;
  /** Called with the resolved place when the customer taps a suggestion. Feeds the picked-point flow. */
  onResolved: (place: ResolvedPlace) => void;
}): React.ReactElement | null {
  // The single gate: no key → no search UI, only the pin-on-map picker renders.
  if (!placesEnabled()) return null;
  return <AddressSearchInner {...props} />;
}

function AddressSearchInner(props: {
  label: string;
  placeholder?: string;
  onResolved: (place: ResolvedPlace) => void;
}): React.ReactElement {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [failed, setFailed] = useState(false);

  const sessionToken = useRef<string>(newSessionToken());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic request id so a slow autocomplete response can't overwrite a newer query's results.
  const reqSeq = useRef(0);

  useEffect(() => () => { if (debounce.current) clearTimeout(debounce.current); }, []);

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
          // Collapse the search into the chosen place and start a fresh billable session.
          setQuery(place.landmark);
          setSuggestions([]);
          sessionToken.current = newSessionToken();
        })
        .finally(() => setResolving(false));
    },
    [props],
  );

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

      {failed ? (
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, marginTop: tokens.space.xs }}>
          Couldn&apos;t load that place — set it on the map below instead.
        </Text>
      ) : null}
    </View>
  );
}
