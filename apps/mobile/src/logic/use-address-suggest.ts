import { useEffect, useRef, useState } from "react";
import { autocompletePlaces, placeDetails, placesEnabled, type ResolvedPlace } from "../api/places";
import { geocodeAddress } from "./geocode";

/**
 * The suggestion engine behind the Send flow's inline address row (ledger D-52; handoff
 * `send-compose-v2` README "Address card" + "Interactions"). The row IS the search field — there is no
 * search screen and no confirm-pin screen any more — so this hook turns what the customer has typed
 * into the dropdown's middle section:
 *
 *   ok       Places autocomplete rows ("14 Glenara Avenue" / "Avenues, Harare").
 *   loading  a request is out; the previous rows stay up so the list doesn't flicker per keystroke.
 *   slow     ~2.5 s without an answer: "Searching… Slow connection, hang on." + skeleton rows.
 *   empty    nothing found: "No matches. Check the spelling, or set the pin on the map."
 *   limited  no Places key, or offline: "Search is limited right now…", then device-geocoder matches.
 *
 * Every row resolves lazily (Places Details for a prediction; the geocoder's hit is already a point),
 * so picking is the only thing that costs a Details lookup. A Places search that finds nothing tries the
 * device geocoder once before saying "No matches" — a refused or restricted key otherwise reads as an
 * address that doesn't exist (the escape `AddressSearch` used to offer behind a separate button).
 */

export type SuggestStatus = "idle" | "loading" | "slow" | "ok" | "empty" | "limited";

export interface SuggestRow {
  key: string;
  title: string;
  sub: string;
  resolve: () => Promise<ResolvedPlace | null>;
}

export const SUGGEST_DEBOUNCE_MS = 300;
export const GEOCODE_DEBOUNCE_MS = 600;
export const SUGGEST_SLOW_MS = 2_500;
const MIN_QUERY = 2;

function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function geocodeRow(place: ResolvedPlace): SuggestRow {
  return { key: `geo:${place.lat},${place.lng}`, title: place.landmark, sub: "", resolve: async () => place };
}

export function useAddressSuggest(
  query: string,
  editing: boolean,
  online: boolean,
): { status: SuggestStatus; rows: SuggestRow[]; limited: boolean } {
  const limited = !placesEnabled() || !online;
  const [status, setStatus] = useState<SuggestStatus>("idle");
  const [rows, setRows] = useState<SuggestRow[]>([]);
  const seq = useRef(0);
  const token = useRef(newSessionToken());

  // A fresh billing session per editing session (Places groups autocomplete + one Details per token).
  useEffect(() => {
    if (editing) token.current = newSessionToken();
  }, [editing]);

  useEffect(() => {
    const id = ++seq.current;
    const q = query.trim();
    if (!editing || q.length < MIN_QUERY) {
      setRows([]);
      setStatus(limited ? "limited" : "idle");
      return;
    }
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    const live = (): boolean => id === seq.current;

    if (limited) {
      // The device geocoder has no as-you-type predictions: one lookup per pause in typing.
      setStatus("limited");
      const t = setTimeout(() => {
        void geocodeAddress(q).then((out) => {
          if (!live()) return;
          setRows(out.ok ? [geocodeRow(out.place)] : []);
        });
      }, GEOCODE_DEBOUNCE_MS);
      return () => clearTimeout(t);
    }

    setStatus((s) => (s === "ok" ? "loading" : s === "slow" ? "slow" : "loading"));
    const t = setTimeout(() => {
      slowTimer = setTimeout(() => {
        if (live()) setStatus("slow");
      }, SUGGEST_SLOW_MS);
      const session = token.current;
      void autocompletePlaces(q, session).then(async (preds) => {
        if (!live()) return;
        if (preds.length > 0) {
          if (slowTimer) clearTimeout(slowTimer);
          setRows(
            preds.map((p) => ({
              key: p.placeId,
              title: p.primary,
              sub: p.secondary,
              resolve: () => placeDetails(p.placeId, session, p.primary),
            })),
          );
          setStatus("ok");
          return;
        }
        const out = await geocodeAddress(q);
        if (!live()) return;
        if (slowTimer) clearTimeout(slowTimer);
        if (out.ok) {
          setRows([geocodeRow(out.place)]);
          setStatus("ok");
        } else {
          setRows([]);
          setStatus("empty");
        }
      });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      if (slowTimer) clearTimeout(slowTimer);
    };
  }, [query, editing, limited]);

  return { status, rows, limited };
}
