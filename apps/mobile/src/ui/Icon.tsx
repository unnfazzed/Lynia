import { tokens } from "@lynia/shared/tokens";
// Lucide ships its entire icon set from the "lucide-react-native" barrel. Metro does NOT tree-shake,
// so a barrel import (`import { X } from "lucide-react-native"`) drags every glyph's bytecode into
// the Hermes bundle — the file's old "stays lean" claim was simply wrong and cost ~1MB. Import each
// glyph from its own module file instead: the CJS per-icon path resolves via Metro's `.js`
// sourceExt, so only these 50 files (plus the shared createLucideIcon helper they all require) land
// in the bundle. The paths sit outside the package's `exports` map, so since Expo SDK 53 turned
// Metro's `exports` resolution on, an export prints one "not listed in the exports" warning per
// glyph and falls back to file resolution: expected noise, same files. The kebab-case file names
// match the ICONS keys below one-for-one.
// `LucideIcon` stays a type-only barrel import — types are erased at build and cost nothing; the
// element types for the deep paths come from ./lucide-icons.d.ts (the icon files sit outside the
// package's `exports` map, so `moduleResolution: "bundler"` can't type them on its own).
import ArrowRight from "lucide-react-native/dist/cjs/icons/arrow-right";
import Ban from "lucide-react-native/dist/cjs/icons/ban";
import Banknote from "lucide-react-native/dist/cjs/icons/banknote";
import Bell from "lucide-react-native/dist/cjs/icons/bell";
import BellOff from "lucide-react-native/dist/cjs/icons/bell-off";
import Bike from "lucide-react-native/dist/cjs/icons/bike";
import Check from "lucide-react-native/dist/cjs/icons/check";
import ChevronDown from "lucide-react-native/dist/cjs/icons/chevron-down";
import ChevronLeft from "lucide-react-native/dist/cjs/icons/chevron-left";
import ChevronRight from "lucide-react-native/dist/cjs/icons/chevron-right";
import ChevronUp from "lucide-react-native/dist/cjs/icons/chevron-up";
import CircleAlert from "lucide-react-native/dist/cjs/icons/circle-alert";
import CircleCheck from "lucide-react-native/dist/cjs/icons/circle-check";
import Clock from "lucide-react-native/dist/cjs/icons/clock";
import Copy from "lucide-react-native/dist/cjs/icons/copy";
import FileText from "lucide-react-native/dist/cjs/icons/file-text";
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
// lucide-react-native 1.45 (dependabot #916, 1.37 -> 1.45) consolidated trash-2 into trash. It kept a
// TYPES-only alias — dist/types/icons/trash-2.d.ts is `export { default } from './trash.js'` — but
// shipped no dist/cjs/icons/trash-2.js, so every module reaching this file failed to resolve.
import Trash from "lucide-react-native/dist/cjs/icons/trash";
import TriangleAlert from "lucide-react-native/dist/cjs/icons/triangle-alert";
import Utensils from "lucide-react-native/dist/cjs/icons/utensils";
import User from "lucide-react-native/dist/cjs/icons/user";
import Volume2 from "lucide-react-native/dist/cjs/icons/volume-2";
import Wallet from "lucide-react-native/dist/cjs/icons/wallet";
import WifiOff from "lucide-react-native/dist/cjs/icons/wifi-off";
import Camera from "lucide-react-native/dist/cjs/icons/camera";
import MessageCircle from "lucide-react-native/dist/cjs/icons/message-circle";
import Share2 from "lucide-react-native/dist/cjs/icons/share-2";
import ShieldCheck from "lucide-react-native/dist/cjs/icons/shield-check";
import Undo2 from "lucide-react-native/dist/cjs/icons/undo-2";
import X from "lucide-react-native/dist/cjs/icons/x";
import Settings from "lucide-react-native/dist/cjs/icons/settings";
import LogOut from "lucide-react-native/dist/cjs/icons/log-out";
import Globe from "lucide-react-native/dist/cjs/icons/globe";
import Lock from "lucide-react-native/dist/cjs/icons/lock";
import ArrowLeftRight from "lucide-react-native/dist/cjs/icons/arrow-left-right";
import Siren from "lucide-react-native/dist/cjs/icons/siren";
import Hourglass from "lucide-react-native/dist/cjs/icons/hourglass";
import Smartphone from "lucide-react-native/dist/cjs/icons/smartphone";
import PhoneOff from "lucide-react-native/dist/cjs/icons/phone-off";
import House from "lucide-react-native/dist/cjs/icons/house";
import ImageIcon from "lucide-react-native/dist/cjs/icons/image";
import Download from "lucide-react-native/dist/cjs/icons/download";
import Calendar from "lucide-react-native/dist/cjs/icons/calendar";
import Pill from "lucide-react-native/dist/cjs/icons/pill";
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
  "chevron-left": ChevronLeft, // Calm Mint v2 onboarding Back (D-55)
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
  "file-text": FileText, // terms & conditions (settings)
  "shopping-bag": ShoppingBag, // role select — "Use LyniaGo" (order food, send parcels)
  trash: Trash, // delete account (settings)
  bell: Bell, // BrandHeader notifications
  "bell-off": BellOff, // Notifications v1 N6 — notifications are off (D-66)
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
  // The After Send order screen (ledger D-53): Call / WhatsApp, the Verified tag, Share code / receipt /
  // trip, the pickup-photo View button and the rating Undo.
  camera: Camera,
  "message-circle": MessageCircle,
  "share-2": Share2,
  "shield-check": ShieldCheck,
  "undo-2": Undo2,
  // Rider v2 (ledger D-54): Account / Settings / Help, the role switch, gates, the problem sheet.
  "settings": Settings,
  "log-out": LogOut,
  "globe": Globe,
  "lock": Lock,
  "arrow-left-right": ArrowLeftRight,
  "siren": Siren,
  "hourglass": Hourglass,
  "smartphone": Smartphone,
  "phone-off": PhoneOff,
  "house": House,
  "image": ImageIcon,
  "download": Download,
  // Order flow v2 (ledger D-59): WHEN → Schedule, the scheduled row and the closed venue's cart bar (R5a–c).
  calendar: Calendar,
  // Order flow v2 G1/G2 (ledger D-59): the pharmacy order's glyph on the live bar and the Now card.
  pill: Pill,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  // Defaults from the icon tokens (--icon-size 20 / --icon-stroke 2).
  size = tokens.icon.size,
  color = tokens.color.ink,
  strokeWidth = tokens.icon.stroke,
  fill,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** A solid fill (filled rating stars); outline-only when omitted. */
  fill?: string;
  // Passthrough for transforms the kit relies on (e.g. a rotated chevron standing in for a back arrow)
  // and any positioning a call site needs on the glyph itself.
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const Glyph = ICONS[name] ?? CircleAlert;
  // `fill` only when given: an explicit `fill={undefined}` would override lucide's default `fill="none"`.
  return fill ? <Glyph size={size} color={color} strokeWidth={strokeWidth} fill={fill} style={style} /> : <Glyph size={size} color={color} strokeWidth={strokeWidth} style={style} />;
}
