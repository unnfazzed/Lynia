"use client";

import { COUNTRY_PICKER_ORDER, countryFlag, countryMatches, PINNED_COUNTRY_COUNT, type Country } from "@lynia/shared";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Choose a country for the sign-in number (ledger D-116, owner 2026-10-19: a business owner abroad signs
 * in on their own number). Zimbabwe, the ten countries with the most Zimbabweans, then the rest A–Z, with
 * a search on name or code. The handoff's sheet frame (scrim, grab, `.m-sheet`); Escape or the scrim
 * closes it without a change.
 */
export function CountrySheet({ selected, onSelect, onClose }: { selected: Country; onSelect: (c: Country) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const rows = useMemo(() => COUNTRY_PICKER_ORDER.filter((c) => countryMatches(c, query)), [query]);
  const searching = query.trim().length > 0;

  // Read through a ref so a parent re-render (a new `onClose` each time) doesn't re-run the focus.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="m-overlay" style={{ zIndex: 70 }}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label="Close" onClick={onClose} />
        <div className="m-sheet m-country-sheet" role="dialog" aria-modal="true" aria-labelledby="m-country-title">
          <div className="m-grab" />
          <b id="m-country-title" className="m-branches-title">
            Choose your country
          </b>
          <div className="m-in m-country-search">
            <input
              ref={searchRef}
              type="search"
              aria-label="Search country or code"
              placeholder="Search country or code"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="m-country-list" aria-label="Countries">
            {rows.length === 0 ? <li className="m-hint m-country-empty">No country matches “{query.trim()}”</li> : null}
            {rows.map((c, i) => {
              const isSelected = c.iso === selected.iso;
              return (
                <li key={c.iso} className={!searching && i === PINNED_COUNTRY_COUNT - 1 ? "m-country-endpinned" : undefined}>
                  <button type="button" aria-pressed={isSelected} className={`m-country${isSelected ? " m-on" : ""}`} onClick={() => onSelect(c)}>
                    <span className="m-country-flag" aria-hidden="true">
                      {countryFlag(c.iso)}
                    </span>
                    <span className="m-country-name">{c.name}</span>
                    <span className="m-country-dial m-num">+{c.dial}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
