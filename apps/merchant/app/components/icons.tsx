/**
 * The handful of glyphs the merchant screens need, drawn inline.
 *
 * The gallery composes the design-system `Icon` (packages/design/explorations/restaurants/r-parts.jsx
 * — e.g. `KitchenNav`'s [inbox, utensils, store, clock, receipt] rail and the alarm bar's volume-2 /
 * ban pair). This app ships no icon dependency, so the same named glyphs live here as plain stroked
 * paths on the shared 24×24 grid. Presentation only: every icon is `aria-hidden`, so it never changes
 * a button or link's accessible name.
 */

export type IconName =
  | "inbox"
  | "utensils"
  | "store"
  | "clock"
  | "receipt"
  | "volume-2"
  | "ban"
  | "wifi-off"
  | "banknote"
  | "wallet"
  | "triangle-alert"
  | "check"
  | "circle-check"
  | "circle-alert"
  | "chevron-up"
  | "chevron-down"
  | "plus"
  | "minus"
  | "pencil"
  | "trash-2"
  | "navigation"
  | "phone"
  | "chevron-left"
  | "locate"
  | "map-pin"
  | "package"
  | "bike"
  | "users"
  | "user"
  | "power"
  | "chevron-right"
  | "search"
  | "x"
  | "timer";

const PATHS: Record<IconName, string[]> = {
  "chevron-right": ["m9 18 6-6-6-6"],
  search: ["M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0", "m21 21-4.3-4.3"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  timer: ["M10 2h4", "m12 14 3-3", "M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0"],
  inbox: [
    "M22 12h-6l-2 3h-4l-2-3H2",
    "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z",
  ],
  utensils: ["M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2", "M7 2v20", "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"],
  store: [
    "m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7",
    "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8",
    "M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4",
    "M2 7h20",
  ],
  clock: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "M12 6v6l4 2"],
  receipt: ["M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z", "M8 7h8", "M8 11h8", "M8 15h5"],
  "volume-2": ["M11 5 6 9H2v6h4l5 4V5z", "M15.54 8.46a5 5 0 0 1 0 7.07", "M19.07 4.93a10 10 0 0 1 0 14.14"],
  ban: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "m4.9 4.9 14.2 14.2"],
  check: ["M20 6 9 17l-5-5"],
  "triangle-alert": ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  banknote: [
    "M22 8a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z",
    "M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
    "M6 12h.01",
    "M18 12h.01",
  ],
  wallet: [
    "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
    "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
  ],
  "wifi-off": [
    "M12 20h.01",
    "M8.5 16.43a5 5 0 0 1 7 0",
    "M5 12.86a10 10 0 0 1 5.17-2.69",
    "M19 12.86a10 10 0 0 0-2.01-1.52",
    "M2 8.82a15 15 0 0 1 4.18-2.64",
    "M22 8.82a15 15 0 0 0-11.29-3.76",
    "m2 2 20 20",
  ],
  // M0·2 / M3·3 / M4·2 / M4·6 / M5·2 glyphs (r-merchant.jsx:103-128, 722-735, 998-1040, 1277-1298).
  "circle-check": ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "m9 12 2 2 4-4"],
  "circle-alert": ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "M12 8v4", "M12 16h.01"],
  "chevron-up": ["m18 15-6-6-6 6"],
  "chevron-down": ["m6 9 6 6 6-6"],
  plus: ["M5 12h14", "M12 5v14"],
  minus: ["M5 12h14"],
  pencil: ["M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.63l4.36-1.33a2 2 0 0 0 .83-.5z", "m15 5 4 4"],
  "trash-2": ["M3 6h18", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2", "M10 11v6", "M14 11v6"],
  navigation: ["m3 11 19-9-9 19-2-8-8-2z"],
  // Lucide `bike`, its circles as arcs (this file draws paths only).
  bike: [
    "M22 17.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0",
    "M9 17.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0",
    "M16 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0",
    "M12 17.5V14l-3-3 4-3 2 3h2",
  ],
  // Lucide `users` and `user` (Team, L4), their circles as arcs.
  users: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  user: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0"],
  // Lucide `power` (L5: the drawn "Open for orders" pill, r-parts.jsx KitchenBar).
  power: ["M12 2v10", "M18.4 6.6a9 9 0 1 1-12.77.04"],
  "chevron-left": ["m15 18-6-6 6-6"],
  locate: ["M2 12h3", "M19 12h3", "M12 2v3", "M12 19v3", "M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0"],
  "map-pin": [
    "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
    "M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  ],
  package: [
    "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
    "M12 22V12",
    "m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7",
    "m7.5 4.27 9 5.15",
  ],
  phone: [
    "M13.83 16.57a1 1 0 0 0 1.21-.3l.36-.47A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.47.35a1 1 0 0 0-.29 1.24 14 14 0 0 0 6.39 6.38",
  ],
};

export function Icon({
  name,
  size = 18,
  color = "currentColor",
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, ...style }}
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
