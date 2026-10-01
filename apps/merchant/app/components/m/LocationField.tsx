"use client";

import { useEffect, useRef, useState } from "react";
import { newSessionToken, type PlaceSuggestion, placesEnabled, resolvePlace, reverseGeocode, searchPlaces } from "../../lib/places";
import type { SignUpLocation } from "../../lib/sign-up";
import { Icon } from "../icons";

/**
 * A4's location: the result card once there is one (map pin, the address line, where it came from,
 * "Change"), and under it, always, the two ways in — "Use my current location" and "Or search street
 * or area" — as drawn.
 */
export function LocationField({
  value,
  error,
  onChange,
  searchMeta = "From your search",
  errorStyle = "plain",
}: {
  value: SignUpLocation | null;
  error?: string;
  onChange: (loc: SignUpLocation | null) => void;
  /** The result card's meta for a searched place: A4 says "From your search", C7 "From search". */
  searchMeta?: string;
  /** C7 (branches README §4): an error turns the card red and reads with an alert icon under it. */
  errorStyle?: "plain" | "card";
}) {
  const cardError = errorStyle === "card" && !!error;
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const session = useRef(newSessionToken());
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      return undefined;
    }
    let alive = true;
    const t = setTimeout(() => {
      void searchPlaces(q, session.current).then((rows) => {
        if (alive) setResults(rows);
      });
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  function locate() {
    setNote(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNote("This phone can't share its location. Search for your street instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        void reverseGeocode(point).then((place) => {
          setLocating(false);
          onChange({ point, address: place?.address ?? "", source: "gps" });
        });
      },
      () => {
        setLocating(false);
        setNote("Couldn't get your location. Search for your street instead.");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  async function pick(s: PlaceSuggestion) {
    const place = await resolvePlace(s, session.current);
    session.current = newSessionToken();
    if (!place) {
      setNote("Couldn't find that place. Try another search.");
      return;
    }
    setQuery("");
    setResults([]);
    onChange({ point: place.point, address: place.address || s.primary, source: "search" });
  }

  return (
    <div className="m-fld">
      <span className="m-label">Location</span>
      {value && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            border: `2px solid ${cardError ? "var(--danger)" : "var(--accent)"}`,
            background: cardError ? "var(--danger-wash)" : "var(--accent-wash)",
            borderRadius: 12,
            padding: "10px 14px",
          }}
        >
          <Icon name="map-pin" size={18} color={cardError ? "var(--danger-ink)" : "var(--accent-text)"} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 14.5, display: "block" }}>{value.address || "Your current location"}</b>
            <span className="m-hint">{value.source === "gps" ? "From your phone’s location" : searchMeta}</span>
          </div>
          {/* "Change" = search for a different address (proto.js A4). */}
          <button
            type="button"
            className="m-lnk"
            // Drawn 36px, below the floor (an upstream kit defect, ledger D-51): a 44px tap box whose
            // negative margin keeps the drawn card height.
            style={{ minHeight: "var(--target-min)", margin: "-4px 0", fontSize: 13 }}
            onClick={() => {
              // A refused location is cleared by "Change" (C7), so the error goes with it.
              if (cardError) onChange(null);
              if (searchRef.current) searchRef.current.focus();
              else if (!cardError) onChange(null);
            }}
          >
            Change
          </button>
        </div>
      )}
      <button type="button" className="m-gh" style={{ width: "100%" }} disabled={locating} onClick={locate}>
        <Icon name="navigation" size={16} />
        {locating ? "Finding you…" : "Use my current location"}
      </button>
      {placesEnabled() && (
        <div className="m-in">
          <Icon name="search" size={16} color="var(--muted)" />
          <input
            ref={searchRef}
            aria-label="Search street or area"
            placeholder="Or search street or area"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      {results.length > 0 && (
        <div className="m-card" style={{ padding: "0 14px", gap: 0 }}>
          {results.map((r) => (
            <button key={r.placeId} type="button" className="m-li" onClick={() => void pick(r)}>
              <Icon name="map-pin" size={16} color="var(--muted)" />
              <div className="m-t">
                <b>{r.primary}</b>
                {r.secondary && <span>{r.secondary}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
      {note && <span className="m-hint">{note}</span>}
      {error &&
        (cardError ? (
          <span className="m-c7-err" role="alert">
            <Icon name="circle-alert" size={15} />
            {error}
          </span>
        ) : (
          <span className="m-err">{error}</span>
        ))}
    </div>
  );
}
