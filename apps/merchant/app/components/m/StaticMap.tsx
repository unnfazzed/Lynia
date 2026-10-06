"use client";

import type { LatLng } from "@lynia/shared";
import { useEffect, useRef, useState } from "react";
import { STATIC_MAP_MAX, staticMapUrl } from "../../lib/geo";
import { GOOGLE_PLACES_KEY } from "../../lib/places";
import { Icon } from "../icons";

/**
 * The tracking screens' map band (B6/D5): one Google Static Maps image around a point (owner decision
 * D-80: Google Maps, replacing D-48's OpenStreetMap), with the pin drawn on top. The image is requested at
 * the band's measured width (up to 640px, centred beyond that) so it is never cropped: Google's logo sits
 * in its corner and must stay visible. Without a point, a key, or a loaded image it is the handoff's own
 * grey placeholder. The same browser key as address search (`NEXT_PUBLIC_GOOGLE_PLACES_KEY`), which must
 * also allow the Maps Static API.
 */
export function StaticMap({ center, height, children }: { center: LatLng | null; height: number; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.min(STATIC_MAP_MAX, Math.round(el.clientWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const src = center && GOOGLE_PLACES_KEY && width > 0 ? staticMapUrl(center, width, height, GOOGLE_PLACES_KEY) : null;
  useEffect(() => setFailed(false), [src]);

  return (
    <div ref={ref} style={{ height, flexShrink: 0, position: "relative", overflow: "hidden", background: "var(--surface)" }}>
      {src && !failed && (
        <div style={{ position: "absolute", top: 0, left: `calc(50% - ${width / 2}px)`, width, height }} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element -- a Static Maps image, not a content image */}
          <img src={src} alt="" width={width} height={height} onError={() => setFailed(true)} style={{ display: "block" }} />
          <span style={{ position: "absolute", left: width / 2 - 14, top: height / 2 - 28, color: "var(--cta-fill)" }}>
            <Icon name="map-pin" size={28} />
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
