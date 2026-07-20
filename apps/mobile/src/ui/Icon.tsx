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
import Banknote from "lucide-react-native/dist/cjs/icons/banknote";
import Bike from "lucide-react-native/dist/cjs/icons/bike";
import Check from "lucide-react-native/dist/cjs/icons/check";
import ChevronDown from "lucide-react-native/dist/cjs/icons/chevron-down";
import ChevronRight from "lucide-react-native/dist/cjs/icons/chevron-right";
import ChevronUp from "lucide-react-native/dist/cjs/icons/chevron-up";
import CircleAlert from "lucide-react-native/dist/cjs/icons/circle-alert";
import Clock from "lucide-react-native/dist/cjs/icons/clock";
import Flag from "lucide-react-native/dist/cjs/icons/flag";
import History from "lucide-react-native/dist/cjs/icons/history";
import IdCard from "lucide-react-native/dist/cjs/icons/id-card";
import Inbox from "lucide-react-native/dist/cjs/icons/inbox";
import LifeBuoy from "lucide-react-native/dist/cjs/icons/life-buoy";
import MapPin from "lucide-react-native/dist/cjs/icons/map-pin";
import Navigation from "lucide-react-native/dist/cjs/icons/navigation";
import Package from "lucide-react-native/dist/cjs/icons/package";
import Phone from "lucide-react-native/dist/cjs/icons/phone";
import Search from "lucide-react-native/dist/cjs/icons/search";
import ShieldAlert from "lucide-react-native/dist/cjs/icons/shield-alert";
import Star from "lucide-react-native/dist/cjs/icons/star";
import TriangleAlert from "lucide-react-native/dist/cjs/icons/triangle-alert";
import User from "lucide-react-native/dist/cjs/icons/user";
import WifiOff from "lucide-react-native/dist/cjs/icons/wifi-off";
import X from "lucide-react-native/dist/cjs/icons/x";
import type { LucideIcon } from "lucide-react-native";
import React from "react";

/**
 * The Lynia house icon set — Lucide rounded 2px line icons (the open equivalent of Grab's in-app
 * style), mirroring packages/design/assets/lynia-icons.js. Only the 25 glyphs the product actually
 * uses are imported, each from its own file (see the import note above) — that per-icon import, not
 * the import list itself, is what keeps the bundle lean (the design system's "self-hosted subset"
 * rule). Icons are always paired with a text label; green icons use `accentText`, icons on a green
 * fill are white.
 */
const ICONS = {
  bike: Bike, // rider / no-offers
  inbox: Inbox, // no-orders
  "id-card": IdCard, // KYC
  banknote: Banknote, // earnings
  package: Package, // parcels
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
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  // 20px default per the design system's --icon-size.
  size = 20,
  color = tokens.color.ink,
  strokeWidth = 2,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}): React.ReactElement {
  const Glyph = ICONS[name] ?? CircleAlert;
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} />;
}
