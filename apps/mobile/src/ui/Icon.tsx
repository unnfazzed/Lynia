import { tokens } from "@lynia/shared";
import {
  ArrowRight,
  Banknote,
  Bike,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleAlert,
  Clock,
  History,
  IdCard,
  Inbox,
  type LucideIcon,
  MapPin,
  Navigation,
  Package,
  Phone,
  Search,
  Star,
  TriangleAlert,
  User,
  WifiOff,
  X,
} from "lucide-react-native";
import React from "react";

/**
 * The Lynia house icon set — Lucide rounded 2px line icons (the open equivalent of Grab's in-app
 * style), mirroring packages/design/assets/lynia-icons.js. Only the icons the product actually uses
 * are imported, so the bundle stays lean (the design system's "self-hosted subset" rule). Icons are
 * always paired with a text label; green icons use `accentText`, icons on a green fill are white.
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
