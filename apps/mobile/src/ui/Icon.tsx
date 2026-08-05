import { tokens } from "@lynia/shared";
// Lucide ships its entire icon set from the "lucide-react-native" barrel. Metro does NOT tree-shake
// and Expo SDK 52 keeps package `exports` resolution OFF (see metro.config.js), so a barrel import
// (`import { X } from "lucide-react-native"`) drags every glyph's bytecode into the Hermes bundle —
// the file's old "stays lean" claim was simply wrong and cost ~1MB. Import each glyph from its own
// module file instead: the CJS per-icon path resolves via Metro's `.js` sourceExt with zero reliance
// on the `exports` map, so only these 25 files (plus the shared createLucideIcon helper they all
// require) land in the bundle. The kebab-case file names match the ICONS keys below one-for-one.
// `LucideIcon` stays a type-only barrel import — types are erased at build and cost nothing; the
// element types for the deep paths come from ./lucide-icons.d.ts (the icon files sit outside the
// package's `exports` map, so `moduleResolution: "bundler"` can't type them on its own).
import ArrowRight from "lucide-react-native/dist/cjs/icons/arrow-right";
import Ban from "lucide-react-native/dist/cjs/icons/ban";
import Banknote from "lucide-react-native/dist/cjs/icons/banknote";
import Bell from "lucide-react-native/dist/cjs/icons/bell";
import Bike from "lucide-react-native/dist/cjs/icons/bike";
import Check from "lucide-react-native/dist/cjs/icons/check";
import ChevronDown from "lucide-react-native/dist/cjs/icons/chevron-down";
import ChevronRight from "lucide-react-native/dist/cjs/icons/chevron-right";
import ChevronUp from "lucide-react-native/dist/cjs/icons/chevron-up";
import CircleAlert from "lucide-react-native/dist/cjs/icons/circle-alert";
import CircleCheck from "lucide-react-native/dist/cjs/icons/circle-check";
import Clock from "lucide-react-native/dist/cjs/icons/clock";
import Copy from "lucide-react-native/dist/cjs/icons/copy";
import Flag from "lucide-react-native/dist/cjs/icons/flag";
// lucide-react-native 1.27.0 renamed the `history` glyph to `rotate-ccw-clock` and dropped the old
// path, which broke every suite importing this barrel (deps bump 02ef04c). Same glyph, new filename;
// the public `history` key below is unchanged so no call site moves.
import History from "lucide-react-native/dist/cjs/icons/rotate-ccw-clock";
import IdCard from "lucide-react-native/dist/cjs/icons/id-card";
import Inbox from "lucide-react-native/dist/cjs/icons/inbox";
import LifeBuoy from "lucide-react-native/dist/cjs/icons/life-buoy";
import MapPin from "lucide-react-native/dist/cjs/icons/map-pin";
import Minus from "lucide-react-native/dist/cjs/icons/minus";
import Navigation from "lucide-react-native/dist/cjs/icons/navigation";
import Package from "lucide-react-native/dist/cjs/icons/package";
import Pencil from "lucide-react-native/dist/cjs/icons/pencil";
import Phone from "lucide-react-native/dist/cjs/icons/phone";
import Plus from "lucide-react-native/dist/cjs/icons/plus";
import Power from "lucide-react-native/dist/cjs/icons/power";
import Receipt from "lucide-react-native/dist/cjs/icons/receipt";
import RefreshCw from "lucide-react-native/dist/cjs/icons/refresh-cw";
import Search from "lucide-react-native/dist/cjs/icons/search";
import Shield from "lucide-react-native/dist/cjs/icons/shield";
import ShieldAlert from "lucide-react-native/dist/cjs/icons/shield-alert";
import ShoppingBag from "lucide-react-native/dist/cjs/icons/shopping-bag";
import Star from "lucide-react-native/dist/cjs/icons/star";
import Store from "lucide-react-native/dist/cjs/icons/store";
import Timer from "lucide-react-native/dist/cjs/icons/timer";
import Trash from "lucide-react-native/dist/cjs/icons/trash-2";
import TriangleAlert from "lucide-react-native/dist/cjs/icons/triangle-alert";
import Utensils from "lucide-react-native/dist/cjs/icons/utensils";
import User from "lucide-react-native/dist/cjs/icons/user";
import Volume2 from "lucide-react-native/dist/cjs/icons/volume-2";
import Wallet from "lucide-react-native/dist/cjs/icons/wallet";
import WifiOff from "lucide-react-native/dist/cjs/icons/wifi-off";
import X from "lucide-react-native/dist/cjs/icons/x";
import type { LucideIcon } from "lucide-react-native";
import React from "react";
import type { StyleProp, ViewStyle } from "react-native";

/**
 * The Lynia house icon set — Lucide rounded 2px line icons (the open equivalent of Grab's in-app
 * style), mirroring packages/design/assets/lynia-icons.js. Only the glyphs the product actually uses
 * are imported, each from its own file (see the import note above) — that per-icon import, not the
 * size of this map, is what keeps the bundle lean (the design system's "self-hosted subset" rule), so
 * the set grows one deliberate glyph at a time rather than reverting to a barrel import. Icons are
 * always paired with a text label; green icons use `accentText`, icons on a green fill are white.
 */
const ICONS = {
  bike: Bike, // rider / no-offers
  inbox: Inbox, // no-orders
  "id-card": IdCard, // KYC
  banknote: Banknote, // earnings
  package: Package, // parcels / Send tile
  "wifi-off": WifiOff, // network error
  "triangle-alert": TriangleAlert, // failed / attention
  "map-pin": MapPin,
  phone: Phone,
  clock: Clock, // ETA
  "chevron-right": ChevronRight,
  "chevron-down": ChevronDown,
  "chevron-up": ChevronUp,
  star: Star,
  check: Check,
  "arrow-right": ArrowRight,
  navigation: Navigation,
  user: User,
  history: History,
  search: Search,
  x: X,
  "circle-alert": CircleAlert,
  "life-buoy": LifeBuoy, // get help with this trip
  flag: Flag, // report a problem
  "shield-alert": ShieldAlert, // SOS / emergency
  shield: Shield, // privacy notice (settings)
  "shopping-bag": ShoppingBag, // role select — "Use LyniaGo" (order food, send parcels)
  trash: Trash, // delete account (settings)
  bell: Bell, // BrandHeader notifications
  store: Store, // root tab bar — Home
  receipt: Receipt, // root tab bar — Orders
  utensils: Utensils, // Food service tile
  plus: Plus, // Pharmacy "Soon" service tile
  wallet: Wallet, // WALLET (mobile money) checkout row / pay-now screens
  "circle-check": CircleCheck, // paid/confirmed states
  copy: Copy, // manual-rail copyable rows (D-24)
  "refresh-cw": RefreshCw, // offline retry countdown
  // Kit glyphs (packages/design/assets/lynia-icons.js) that had no shipped counterpart, so screens
  // using them had to substitute: `pencil` (filled address rows / edit affordances the kit draws with
  // it, not map-pin), `ban`/`power`/`volume-2` (merchant alarm + shift chrome), `minus` (qty steppers),
  // `timer` (offer/prep countdowns).
  ban: Ban,
  minus: Minus,
  pencil: Pencil,
  power: Power,
  timer: Timer,
  "volume-2": Volume2,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  // Defaults from the icon tokens (--icon-size 20 / --icon-stroke 2).
  size = tokens.icon.size,
  color = tokens.color.ink,
  strokeWidth = tokens.icon.stroke,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  // Passthrough for transforms the kit relies on (e.g. a rotated chevron standing in for a back arrow)
  // and any positioning a call site needs on the glyph itself.
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const Glyph = ICONS[name] ?? CircleAlert;
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}
