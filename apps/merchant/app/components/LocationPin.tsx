"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@lynia/shared";
import { clampZoom, MAX_ZOOM, MIN_ZOOM, panBy, tileUrl, visibleTiles } from "../lib/geo";
import { Icon } from "./icons";

/** Arrow keys move the map by this many pixels; with Shift, four times as far. */
const KEY_STEP_PX = 40;

/**
 * The sign-up's confirmed map pin (merchant web upgrade L1). The pin stays in the middle and the merchant
 * drags the map under it, the pattern Uber, Bolt and Glovo use to confirm a pickup point: on a phone a
 * fixed pin can't be lost under a thumb or dragged off-screen. OpenStreetMap tiles, drawn straight from
 * the maths in `lib/geo.ts` — no map library.
 *
 * `onMove` fires for every move the merchant makes (drag, arrow keys); the parent treats the first one
 * as "the pin is confirmed". Zooming doesn't move the point, so it doesn't count.
 */
export function LocationPin({
  value,
  onMove,
  height = 260,
  label,
}: {
  value: LatLng;
  onMove: (next: LatLng) => void;
  height?: number;
  /** The map's accessible name — it is a focusable control the arrow keys pan. */
  label: string;
}) {
  const frameRef = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(16);
  const drag = useRef<{ pointerId: number; x: number; y: number; start: LatLng } | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const measure = () => setWidth(frame.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    drag.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, start: value };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    onMove(panBy(d.start, e.clientX - d.x, e.clientY - d.y, zoom));
  }

  function endDrag(e: React.PointerEvent<HTMLButtonElement>) {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? KEY_STEP_PX * 4 : KEY_STEP_PX;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      onMove(panBy(value, move[0], move[1], zoom));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setZoom((z) => clampZoom(z + 1));
    } else if (e.key === "-") {
      e.preventDefault();
      setZoom((z) => clampZoom(z - 1));
    }
  }

  const tiles = width > 0 ? visibleTiles(value, zoom, width, height) : [];

  return (
    <div style={{ position: "relative", borderRadius: "var(--radius-input)", overflow: "hidden", border: "1.5px solid var(--line)" }}>
      {/* The pane is a real button (type="button", so it never submits the form around it): focusable,
       *  announced as a control, and the arrow keys move the map for anyone not dragging it. */}
      <button
        ref={frameRef}
        type="button"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        data-testid="location-pin-map"
        style={{
          position: "relative",
          display: "block",
          width: "100%",
          height,
          padding: 0,
          border: "none",
          background: "var(--surface)",
          overflow: "hidden",
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
          outlineOffset: -3,
        }}
      >
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element -- raw map tiles, not content images
          <img
            key={t.key}
            src={tileUrl(t)}
            alt=""
            width={256}
            height={256}
            draggable={false}
            style={{ position: "absolute", left: t.left, top: t.top, width: 256, height: 256, pointerEvents: "none" }}
          />
        ))}
        {/* The pin's tip sits exactly on the map's centre, the point that is saved. */}
        <svg
          width={36}
          height={44}
          viewBox="0 0 36 44"
          aria-hidden="true"
          style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -100%)", pointerEvents: "none" }}
        >
          <path d="M18 43C18 43 34 27.5 34 17A16 16 0 0 0 2 17C2 27.5 18 43 18 43Z" fill="var(--cta-fill)" stroke="#fff" strokeWidth={2} />
          <circle cx={18} cy={17} r={6} fill="#fff" />
        </svg>
      </button>

      <div style={{ position: "absolute", right: 8, top: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        <ZoomButton label="Zoom in" icon="plus" disabled={zoom >= MAX_ZOOM} onClick={() => setZoom((z) => clampZoom(z + 1))} />
        <ZoomButton label="Zoom out" icon="minus" disabled={zoom <= MIN_ZOOM} onClick={() => setZoom((z) => clampZoom(z - 1))} />
      </div>

      {/* OpenStreetMap's tile licence requires this credit wherever its tiles show. */}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          padding: "2px 6px",
          fontSize: 10.5,
          color: "var(--ink)",
          background: "rgba(255, 255, 255, 0.85)",
          textDecoration: "none",
        }}
      >
        © OpenStreetMap
      </a>
    </div>
  );
}

function ZoomButton({ label, icon, disabled, onClick }: { label: string; icon: "plus" | "minus"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: "var(--target-min)",
        height: "var(--target-min)",
        display: "grid",
        placeItems: "center",
        borderRadius: 12,
        border: "1px solid var(--line)",
        background: "var(--bg)",
        color: "var(--ink)",
        boxShadow: "var(--shadow-card)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
