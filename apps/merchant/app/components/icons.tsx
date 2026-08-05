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
  | "phone";

const PATHS: Record<IconName, string[]> = {
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
