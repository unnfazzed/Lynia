import { tokens } from "@lynia/shared";
import React from "react";
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, type DimensionValue, Pressable, Text, TextInput, type TextInputProps, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { captureException, isSentryEnabled, nativeCrash } from "../telemetry/sentry";
import { Icon, type IconName } from "./Icon";
import { isTestBuild } from "./test-build";

export { Icon, type IconName } from "./Icon";
export { BrandLockup, DoveMark, Wordmark } from "./Brand";
export { fontFamilies, interFamily } from "./fonts";
export { OfflineBanner, type ConnectivityState } from "./OfflineBanner";
export { AppBar } from "./shell/AppBar";
export { AppScreen } from "./shell/AppScreen";
export { BrandHeader } from "./shell/BrandHeader";
export { getServiceTiles, ServiceTiles, SERVICES, type ServiceTile } from "./shell/ServiceTiles";
export { APP_TABS, RIDER_TABS, TabBar, type AppTab } from "./shell/TabBar";
export { LiveOrderCard } from "./home/LiveOrderCard";
export { RestaurantCard } from "./home/RestaurantCard";

export { CodeInput } from "./CodeInput";
export { Money } from "./Money";
export { SystemState } from "./SystemState";

// Mock-faithful DS primitives (codegen targets) — the transpiler emits these by the exact kit name,
// so they mirror the design kit's `r-parts.jsx` primitives verbatim (structure/style/tokens).
export { Banner, type BannerTone } from "./Banner";
export { CoverPhoto } from "./CoverPhoto";
export { PriceMath } from "./PriceMath";
export { MenuRow, type MenuRowItem, type MenuCategory } from "./MenuRow";
export { EtaLine } from "./EtaLine";
export { ShopLogo } from "./ShopLogo";
export { FoodThumb, type FoodThumbCategory } from "./FoodThumb";
// NOTE: the Foundation-F.c map/sheet realizations (ComposeMap / BottomSheet / MapPicker) are
// deliberately NOT re-exported from this barrel. They import Icon/Button/Label back FROM the barrel,
// so re-exporting them here forms a `no-circular` dependency-cruiser violation. Generated map/sheet
// region fragments import them from their own modules instead (see tools/parity/codegen/emit.mjs).

export { isTestBuild } from "./test-build";
export { haptic, hapticPattern, setHapticsEnabled, type HapticKind } from "./haptics";
export { Avatar } from "./Avatar";
export { RiderMini } from "./RiderMini";
export { Celebrate } from "./Celebrate";
export { ToastProvider, useToast, useActionError, useActionErrorEffect, pushToast, TOAST_DURATION_MS, type ToastTone } from "./Toast";

/**
 * LR20 exit test, reachable only from the test-build banner's long-press. A release build needs SOME
 * way to force a crash on a handset — that is the whole verification for crash telemetry, and the app
 * otherwise (correctly) has no button that breaks it. Long-press is deliberate: invisible to a normal
 * tester, impossible to hit by accident, and gone entirely from a store build because the banner it
 * hangs off returns null there.
 *
 * Offers BOTH crash shapes because they prove different halves: a JS throw verifies source-map upload
 * (named frames instead of Hermes bytecode), a native crash verifies the R8 mapping upload (real
 * zw.co.lynia.* frames instead of `a.b.c(SourceFile:1)`). Passing one and not the other is a real and
 * easy-to-miss outcome, so the tester should fire both.
 */
function promptCrashTest(): void {
  const armed = isSentryEnabled();
  Alert.alert(
    "Crash telemetry test",
    armed
      ? "Sentry is ACTIVE in this build. The app will crash on purpose; reopen it and confirm the event in the lynia-mobile dashboard."
      : "Sentry is NOT active in this build (no DSN was inlined at build time). A crash here would report NOTHING — check EXPO_PUBLIC_SENTRY_DSN before testing.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "JS error",
        style: "destructive",
        // Reported, not thrown: this is the path a caught render error takes (app/_layout.tsx's
        // ErrorBoundary), so it verifies the reporting seam without killing the process.
        onPress: () => {
          captureException(new Error("LR20 crash-telemetry test — JS error (deliberate)"));
          Alert.alert("Sent", armed ? "JS error reported. Check Sentry." : "Nothing was sent — Sentry is inert.");
        },
      },
      { text: "Native crash", style: "destructive", onPress: () => nativeCrash() },
    ],
  );
}

/**
 * A gold attention bar shown only on the QA test build (isTestBuild). It tells a tester the app is a
 * bypass build talking to the LIVE API — so test data and provenance in bug-report screenshots are
 * never mistaken for production. Renders nothing in a real release, so it can't leak.
 */
export function TestBuildBanner(): React.ReactElement | null {
  if (!isTestBuild()) return null;
  return (
    <Pressable
      accessibilityRole="alert"
      accessibilityHint="Long-press to run the crash-telemetry test"
      onLongPress={promptCrashTest}
      style={{ backgroundColor: tokens.color.highlight, paddingVertical: 6, paddingHorizontal: tokens.space.screen, alignItems: "center" }}
    >
      <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.ink }}>TEST BUILD — live API</Text>
    </Pressable>
  );
}

export function Screen({ children, banner, footer }: { children: React.ReactNode; banner?: React.ReactNode; footer?: React.ReactNode }): React.ReactElement {
  return (
    // Page surface is white (`bg`), per the kit's `--surface-page: var(--bg)` and its `AppScreen`
    // default. Grey (`surface`) is reserved for sunken/sheet elements that sit ON the page, not the
    // page itself — so a white card reads against the page on its shadow, the way the kit intends.
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <TestBuildBanner />
      {/* Banner slot — the kit's `Screen`/`AppScreen` draws its `banner` full-bleed ABOVE the body
          (status bar → banner → scrolling body → footer). Rendered outside the 16px edge padding so
          an offline/stale strip spans the whole width exactly as the mock's tinted band does. Optional
          and unset for every screen that doesn't draw one, so existing call sites are unaffected. */}
      {banner}
      {/* 16px edge padding — designs must work at 320px wide (space.screen, not xl). */}
      <View style={{ flex: 1, padding: tokens.space.screen }}>{children}</View>
      {/* Footer slot — the kit's `Screen`/`AppScreen` pins its `footer` BELOW the scrolling body
          (…body → footer → tab bar). The kit's footer chrome is a hairline top border on the bg
          surface with 8/16/12 padding — the cart "View cart" bar, the checkout pay bar, the menu
          cart bar. Rendered outside the body's edge padding so the border spans full width. Optional
          and unset for every screen that doesn't draw one, so existing call sites are unaffected. */}
      {footer != null ? (
        <View style={{ paddingTop: 8, paddingHorizontal: tokens.space.screen, paddingBottom: 12, backgroundColor: tokens.color.bg, borderTopWidth: 1, borderTopColor: tokens.color.line }}>{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}

export function Heading({ children }: { children: React.ReactNode }): React.ReactElement {
  // Bold with the kit's -0.02em tracking (= -0.48 at 24px) and its tight leading (1.15 → 27.6) —
  // matches `components/typography/Heading.jsx`. Only 400/600/700 ship, no 800.
  return (
    <Text style={{ fontSize: tokens.font.size.h1, fontWeight: tokens.font.weight.bold, letterSpacing: -0.48, lineHeight: Math.round(tokens.font.size.h1 * tokens.leading.tight), color: tokens.color.ink, marginBottom: tokens.space.sm }}>
      {children}
    </Text>
  );
}

export function Sub({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, marginBottom: tokens.space.lg }}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }): React.ReactElement {
  return <Text style={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted, marginBottom: 4 }}>{children}</Text>;
}

export function Field(props: {
  // Optional: repeatable rows (the compose item list) carry a single shared heading instead of a
  // label per row.
  label?: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "number-pad" | "phone-pad" | "decimal-pad";
  maxLength?: number;
  // Autofill hints: `autoComplete` (cross-platform, Android autofill) + `textContentType` (iOS). Set
  // them on the phone (tel) and OTP (one-time-code) fields so the keyboard/SMS autofill offers the
  // right value.
  autoComplete?: TextInputProps["autoComplete"];
  textContentType?: TextInputProps["textContentType"];
  // Inline validation (design Field slots): `error` draws a danger border + a specific caption right
  // under the field (announced to screen readers); `hint` is a muted helper line, suppressed while an
  // error shows. Honest and specific — never a placeholder-as-error.
  error?: string;
  hint?: string;
  // Read-only display (e.g. the register screen's already-verified phone): renders the same field
  // chrome but the input can't be focused or edited.
  editable?: boolean;
}): React.ReactElement {
  const hasError = props.error != null && props.error !== "";
  // Focus draws the accent border the kit's Field specifies (`:focus { border-color: --accent-700 }`);
  // an error border always wins over it.
  const [focused, setFocused] = React.useState(false);
  const borderColor = hasError ? tokens.color.danger : focused ? tokens.color.accentPressed : tokens.color.line;
  return (
    <View style={{ marginBottom: tokens.space.md }}>
      {props.label ? <Label>{props.label}</Label> : null}
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={tokens.color.muted}
        keyboardType={props.keyboardType ?? "default"}
        maxLength={props.maxLength}
        autoComplete={props.autoComplete}
        textContentType={props.textContentType}
        editable={props.editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // The visible Label is a sibling Text with no programmatic link, so name the input for
        // screen readers from the label (falls back to the placeholder for label-less rows).
        accessibilityLabel={props.label ?? props.placeholder}
        style={{
          borderWidth: 1,
          borderColor,
          borderRadius: tokens.radius.input,
          padding: tokens.space.md,
          fontSize: tokens.font.size.bodyLg,
          color: tokens.color.ink,
          backgroundColor: tokens.color.bg,
        }}
      />
      {hasError ? (
        <Text accessibilityLiveRegion="assertive" style={{ marginTop: 4, fontSize: tokens.font.size.caption, color: tokens.color.danger }}>
          {props.error}
        </Text>
      ) : props.hint ? (
        <Text style={{ marginTop: 4, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 16 }}>{props.hint}</Text>
      ) : null}
    </View>
  );
}

export function Button(props: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  // ALR-09: "queued" is distinct from `true` — the mutation is PAUSED (offline, `networkMode:"online"`),
  // not actually in flight, so it gets its own honest label instead of a spinner that would otherwise
  // spin indefinitely with no indication anything is waiting on a connection. See query/client.ts's
  // `pendingOrQueued`.
  loading?: boolean | "queued";
  variant?: "primary" | "ghost";
  // Destructive actions. The mocks draw them as the SAME button with the danger colour swapped in
  // (screens-shipped.jsx `DeleteFinal`: a primary filled `--danger`; `DeleteAccount`: a ghost whose
  // label is `--danger-ink`) — so this is a tone on the one primitive, not a second button.
  tone?: "accent" | "danger";
}): React.ReactElement {
  const primary = (props.variant ?? "primary") === "primary";
  const danger = props.tone === "danger";
  const textColor = primary ? tokens.color.onAccent : danger ? tokens.color.dangerInk : tokens.color.accentText;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled || !!props.loading}
      style={({ pressed }) => ({
        // Grab shape language: full-pill buttons. Primary fill is `cta` (#00812F) — tuned for
        // white-on-green sunlight legibility — and presses to the darker `ctaPressed`; the brand
        // `accent` green stays reserved for non-text fills. Ghost is the outline pill with green text.
        // Ghost press feedback is the mint wash — `surface` is invisible against a Screen background.
        backgroundColor: primary
          ? danger
            ? pressed
              ? tokens.color.dangerInk
              : tokens.color.danger
            : pressed
              ? tokens.color.ctaPressed
              : tokens.color.cta
          : pressed
            ? danger
              ? tokens.color.dangerWash
              : tokens.color.accentWash
            : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: tokens.color.line,
        opacity: props.disabled ? 0.5 : 1,
        borderRadius: tokens.radius.button,
        // Kit Button padding is 14×22 — the horizontal 22 was missing, so intrinsic-width buttons sat
        // too tight (full-width buttons stretch regardless, so this only corrects the inline ones).
        paddingVertical: 14,
        paddingHorizontal: 22,
        marginTop: tokens.space.sm,
        alignItems: "center",
        justifyContent: "center",
        minHeight: primary ? tokens.touchTargetPrimary : tokens.touchTargetMin, // primary CTA 52px, secondary ≥44px
      })}
    >
      {props.loading === "queued" ? (
        <Text style={{ color: textColor, fontWeight: tokens.font.weight.semibold, fontSize: tokens.font.size.body }}>Waiting to reconnect…</Text>
      ) : props.loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={{ color: textColor, fontWeight: tokens.font.weight.semibold, fontSize: tokens.font.size.bodyLg }}>{props.label}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style, accent }: { children: React.ReactNode; style?: ViewStyle; accent?: boolean }): React.ReactElement {
  return (
    <View
      style={[
        {
          // Grab card look: white fill floating on a soft ambient shadow, no visible hairline. The
          // border stays in the box model but transparent so an emphasis card can still pass an
          // accent `borderColor` (active job, delivery code) without a layout shift.
          backgroundColor: tokens.color.bg,
          // The kit's emphasis card (`Card accent`) is a 1.5px accent border, not 1px. `accent` bakes
          // that in so call sites stop hand-rolling `borderColor: accent` at the wrong 1px weight; an
          // explicit `borderColor`/`borderWidth` in `style` still wins (it merges after this).
          borderWidth: accent ? 1.5 : 1,
          borderColor: accent ? tokens.color.accent : "transparent",
          borderRadius: tokens.radius.card,
          padding: tokens.space.lg,
          marginBottom: tokens.space.md,
          ...tokens.shadow.card,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/**
 * A pill label. Default (neutral) tone renders an order status in the accent colour. The
 * online/offline/reconnecting tones + optional leading dot back the rider's persistent connection
 * chip (DESIGN.md — reuse StatusPill, don't invent a chip), so an offline/paused state reads at a
 * glance without a new component. `success` backs a POSITIVE order OUTCOME (delivered/completed) —
 * a NEGATIVE outcome (cancelled/undelivered) reuses `offline` rather than a new red tone, matching
 * the rider terminal screens (terminals.tsx), which already render those as a calm muted pill and
 * put any red accent on the surrounding icon/headline instead.
 */
export type PillTone = "neutral" | "online" | "offline" | "reconnecting" | "success" | "highlight";
// Mirrors packages/design/components/core/StatusPill.jsx: text is the legible text-green (never the
// bright fill green), the dot is the fill green, and only the online/success tones sit on the mint wash.
const PILL_TONE: Record<PillTone, { text: string; bg: string; dot: string }> = {
  neutral: { text: tokens.color.accentText, bg: tokens.color.surface, dot: tokens.color.accent },
  online: { text: tokens.color.accentText, bg: tokens.color.accentWash, dot: tokens.color.accent },
  offline: { text: tokens.color.muted, bg: tokens.color.surface, dot: tokens.color.muted },
  // A dropped/paused connection is a transient state, not an error — muted, never danger-red.
  reconnecting: { text: tokens.color.muted, bg: tokens.color.surface, dot: tokens.color.muted },
  // D2/R5·6: "money moved but not yet confirmed" (PAID, waiting for the restaurant) is deliberately
  // NOT the same "good" green as success — a distinct gold/highlight tone, first consumer here.
  highlight: { text: tokens.color.highlightInk, bg: tokens.color.highlightWash, dot: tokens.color.highlight },
  // A delivered/completed order is a clear win — the same calm "good" mint-wash treatment as online.
  success: { text: tokens.color.accentText, bg: tokens.color.accentWash, dot: tokens.color.success },
};

// Human, view-neutral labels for the order-status pill. The bare enum ("en route pickup",
// "open for offers") is jargon and — worse — sat next to the Stepper's plain-English label for the
// SAME status ("Heading to pickup") on the order/job/history screens. Keep these as clean status
// nouns (not the Stepper's per-view instructions, so a completed pill in history reads "Completed",
// not "Rate your rider"). Unknown values (e.g. a pre-humanized "Verified") fall through untouched.
const STATUS_PILL_LABELS: Record<string, string> = {
  requested: "Getting ready",
  open_for_offers: "Finding riders",
  assigned: "Rider assigned",
  confirmed: "Confirmed",
  en_route_pickup: "Heading to pickup",
  picked_up: "Parcel collected",
  en_route_dropoff: "On the way to drop-off",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
  undelivered: "Not delivered",
};

/** Plain-language label for an order status pill; passes non-status strings through unchanged. */
export function statusPillLabel(status: string): string {
  return STATUS_PILL_LABELS[status] ?? status.replace(/_/g, " ");
}

// Order-status → pill tone (JOURNEY-BUGS: every status used to render the same neutral grey, so a
// cancelled order looked exactly as "fine" as a delivered one at a glance). A positive outcome gets
// the mint-wash `success` treatment; a negative-or-inactive terminal (cancelled/undelivered/expired)
// reuses `offline` — same muted, non-blaming pill the rider terminal screens already ship. Every
// in-progress status stays neutral — a live order isn't "good" or "bad" yet, so there's nothing to signal.
const ORDER_STATUS_TONE: Record<string, PillTone> = {
  delivered: "success",
  completed: "success",
  cancelled: "offline",
  undelivered: "offline",
  expired: "offline",
};

/** Tone for an order-status pill; any other status (in-progress, or an unrecognised value) is neutral. */
export function orderStatusTone(status: string): PillTone {
  return ORDER_STATUS_TONE[status] ?? "neutral";
}

export function StatusPill({
  status,
  tone = "neutral",
  dot = false,
}: {
  status: string;
  tone?: PillTone;
  dot?: boolean;
}): React.ReactElement {
  const t = PILL_TONE[tone];
  return (
    <View
      accessibilityRole="text"
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        backgroundColor: t.bg,
        borderWidth: 1,
        borderColor: tokens.color.line,
        borderRadius: tokens.radius.pill,
        paddingHorizontal: tokens.space.md,
        paddingVertical: 4,
      }}
    >
      {dot ? (
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.dot, marginRight: 6 }} />
      ) : null}
      <Text style={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.semibold, color: t.text }}>{statusPillLabel(status)}</Text>
    </View>
  );
}

// Fares, ETAs and ratings render with tabular numerals (design tokens: font.tabularNumerals) —
// spread into any money/numeric Text style so digit columns align.
export const tabular = { fontVariant: ["tabular-nums"] as const };

// `ErrorText` (a persistent red line under the button) is DELETED — owner instruction 2026-08-12:
// "error cards must just display once and go — which is when an action is attempted and there is an
// error." Every former call site now raises the same curated copy through `useActionError` /
// `useActionErrorEffect` (src/ui/Toast.tsx), which speaks once for 4s and clears itself. Inline
// validation is unaffected: `Field`'s own `error` prop still draws a persistent caption under the
// offending input, because that message must stay readable while the user fixes the field.

// ── §5c journey stepper ───────────────────────────────────────────────────────
// One timeline seen from two sides (CONCEPT §5c): the customer and rider labels are paired so a step
// reads as the same event from either screen. Rendered from the order's append-only `events` + current
// status — no new data needed. Steps before the current one are done (✓ + time), the current one is
// "now" (accent ring + live), later ones are muted.
const STEP_ORDER = [
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
  "delivered",
  "completed",
] as const;

// Plan §5 B4 / RIDER-ONE-APP-PLAN.md "2 · One active job": one shared Stepper, per-type step
// lists. A food order rides the SAME assigned→…→completed status edges as a parcel once it
// reaches the rider (order-lifecycle.service.ts: "the food order rides the same edges as a
// parcel from here on, orderType: both") — only the rider-facing copy differs, ported verbatim
// from the design mock's `FOOD_STEPS` (explorations/journey/rider-one-app.jsx). The customer side
// stays parcel-only here: a customer's food order tracks through its own D3 tracker, never this
// component. Unwired today — `OrderSnapshot` carries no `orderType` yet (Lane D5's job, alongside
// the rest of the live food active-job screen), so `JobDetailsCard` always passes `jobType:
// "parcel"` — the same dark-not-blocked shape as B2's `JobCard` `jobType` prop.
type JobType = "parcel" | "food";
const STEP_LABELS: Record<"customer" | "rider", Partial<Record<JobType, Record<string, string>>>> = {
  customer: {
    parcel: {
      assigned: "Ride accepted",
      confirmed: "Items & note confirmed",
      en_route_pickup: "Rider on the way to pickup",
      picked_up: "Items collected",
      en_route_dropoff: "On the way to drop-off",
      delivered: "Delivered",
      // A `completed` order has already been rated (or the rating window lapsed) — the RatingCard
      // itself lives on the `delivered` card. Telling a finished trip to "Rate your rider" contradicts
      // the "Delivered & completed. Thank you!" card right below it on the same screen.
      completed: "Trip complete",
    },
    // D-03: "the tracker grammar is Express's, re-labelled" — same seven dots, food-voiced copy.
    // Positional sibling to STEP_LABELS.rider.food below (D3, Lane D's own customer tracker).
    food: {
      assigned: "Rider secured",
      confirmed: "Rider at the restaurant",
      en_route_pickup: "Picking up your order",
      picked_up: "Picked up",
      en_route_dropoff: "On the way",
      delivered: "Delivered",
      completed: "Trip complete",
    },
  },
  rider: {
    // Kit `PARCEL_STEPS` (rider-one-app.jsx:181), positional per the status order — the kit's string
    // wins (2026-08-05 visual-audit §9). `picked_up`/`delivered` already matched; the other five align.
    parcel: {
      assigned: "Job accepted",
      confirmed: "Items & note confirmed",
      en_route_pickup: "At pickup",
      picked_up: "Parcel collected",
      en_route_dropoff: "On the way",
      delivered: "Delivered",
      completed: "Fare in hand",
    },
    food: {
      assigned: "Job accepted",
      confirmed: "At the restaurant",
      en_route_pickup: "Food collected",
      picked_up: "On the way",
      en_route_dropoff: "Delivered",
      delivered: "Cash returned",
      completed: "Job closed",
    },
  },
};

/**
 * The customer's FOOD timeline — the kit's `RESTAURANT_STEPS`. It opens with two steps the parcel
 * lifecycle has no `OrderStatus` for: the entire kitchen half (accept → pay → cook) runs while the
 * order is still `requested`, which isn't in STEP_ORDER at all. Rendering the parcel model here left
 * `currentIdx` at -1 for that whole phase, so all seven nodes drew grey with none active — the
 * customer's most anxious stretch ("did the kitchen take it? did my payment land?") showed no
 * progress whatsoever. The kitchen half is carried by `merchantPhase` (the sub-state OrderStatus has
 * no room for — contracts.ts `MerchantPhase`), so the two leading steps resolve from it and the rest
 * from the shared dispatch edges.
 */
const FOOD_CUSTOMER_STEPS = [
  { key: "placed", label: "Order placed" },
  { key: "accepted", label: "Restaurant accepted" },
  { key: "assigned", label: "Rider secured" },
  { key: "confirmed", label: "Rider at the restaurant" },
  { key: "picked_up", label: "Picked up" },
  { key: "en_route_dropoff", label: "On the way" },
  { key: "delivered", label: "Delivered" },
] as const;

/**
 * Current index into `FOOD_CUSTOMER_STEPS` from the two-part food state (dispatch `status` +
 * kitchen `merchantPhase`). Exported so the food screens and tests can assert the mapping directly.
 */
export function foodCustomerStepIndex(status: string, merchantPhase?: string | null): number {
  if (status === "delivered" || status === "completed") return 6;
  if (status === "en_route_dropoff") return 5;
  if (status === "picked_up") return 4;
  // The kit collapses "heading to the restaurant" and "at the restaurant" into one step.
  if (status === "confirmed" || status === "en_route_pickup") return 3;
  if (status === "assigned") return 2;
  // Still with the kitchen. `preparing`/`ready_for_pickup` mean they accepted — and, on the wallet
  // rail, that the money landed. Anything earlier (awaiting_accept / item approval / payment) is
  // still just "placed".
  if (merchantPhase === "preparing" || merchantPhase === "ready_for_pickup") return 1;
  return 0;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function Stepper(props: {
  events: { status: string; createdAt: string }[];
  currentStatus: string;
  view: "customer" | "rider";
  jobType?: JobType;
  /** Food only: the kitchen sub-state that drives the two pre-dispatch steps (see FOOD_CUSTOMER_STEPS). */
  merchantPhase?: string | null;
}): React.ReactElement {
  // The customer's food tracker walks the kit's seven RESTAURANT_STEPS; every other view keeps the
  // shared dispatch-status model exactly as before.
  const foodCustomer = props.view === "customer" && props.jobType === "food";
  const labels = STEP_LABELS[props.view][props.jobType ?? "parcel"] ?? STEP_LABELS[props.view].parcel!;
  const stepKeys: readonly string[] = foodCustomer ? FOOD_CUSTOMER_STEPS.map((s) => s.key) : STEP_ORDER;
  const labelAt = (key: string, i: number): string => (foodCustomer ? FOOD_CUSTOMER_STEPS[i]!.label : (labels[key] ?? key));
  const currentIdx = foodCustomer
    ? foodCustomerStepIndex(props.currentStatus, props.merchantPhase)
    : STEP_ORDER.indexOf(props.currentStatus as (typeof STEP_ORDER)[number]);
  // First timestamp seen per status (events are append-only, ascending).
  const times: Record<string, string> = {};
  for (const e of props.events) if (!(e.status in times)) times[e.status] = e.createdAt;

  return (
    <View>
      {stepKeys.map((s, i) => {
        const state = currentIdx < 0 ? "todo" : i < currentIdx ? "done" : i === currentIdx ? "now" : "todo";
        const last = i === stepKeys.length - 1;
        const onTrack = state !== "todo";
        const ts = times[s];
        return (
          <View key={s} style={{ flexDirection: "row" }}>
            <View style={{ alignItems: "center", width: 26 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  borderWidth: 2,
                  borderColor: onTrack ? tokens.color.accent : tokens.color.line,
                  // Done node = mint wash + green mark (matches the DS timeline treatment); the bright
                  // accent fill carried a white glyph at ~2.9:1 — keep white only off the CTA green.
                  backgroundColor: state === "done" ? tokens.color.accentWash : tokens.color.bg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: state === "done" || state === "now" ? tokens.color.accentText : tokens.color.muted,
                  }}
                >
                  {state === "done" ? "✓" : String(i + 1)}
                </Text>
              </View>
              {!last ? (
                <View style={{ flex: 1, width: 2, minHeight: 16, backgroundColor: i < currentIdx ? tokens.color.accent : tokens.color.line }} />
              ) : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : tokens.space.md, paddingLeft: tokens.space.sm }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: state === "todo" ? "600" : "700",
                  color: state === "now" ? tokens.color.accentText : state === "todo" ? tokens.color.muted : tokens.color.ink,
                }}
              >
                {labelAt(s, i)}
              </Text>
              {ts && onTrack ? (
                <Text style={{ fontSize: 11, color: tokens.color.muted, marginTop: 1 }}>
                  {fmtTime(ts)}
                  {state === "now" ? " · live" : ""}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
// A dead-end becomes an action (DESIGN.md): warm illustration + heading + one primary action passed as
// children. Used for no-offers / no-orders and similar calm, recoverable states.
export function EmptyState(props: {
  icon: IconName;
  title: string;
  message: string;
  children?: React.ReactNode;
  /** "accent" (default, warm mint — most gates/empties) or "danger" (dangerWash/dangerInk — a real
   *  money block like the top-up gate, distinct from the merely-inconvenient states below it). */
  tone?: "accent" | "danger";
}): React.ReactElement {
  const danger = props.tone === "danger";
  return (
    <View style={{ alignItems: "center", paddingVertical: tokens.space.xl }}>
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          // Mint-wash tile + text-green icon (DS EmptyState tone) — warm, not greyed-out. The danger
          // tone (dangerWash/dangerInk) is reserved for a genuine money block, e.g. the top-up gate.
          backgroundColor: danger ? tokens.color.dangerWash : tokens.color.accentWash,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: tokens.space.md,
        }}
      >
        <Icon name={props.icon} size={36} color={danger ? tokens.color.dangerInk : tokens.color.accentText} strokeWidth={tokens.icon.stroke} />
      </View>
      <Text style={{ fontSize: tokens.font.size.title, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "center" }}>{props.title}</Text>
      {/* Kit EmptyState message is caption (12) at the body leading (1.45 → ~17), not body 14. */}
      <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, textAlign: "center", lineHeight: Math.round(tokens.font.size.caption * tokens.leading.body), marginTop: 6, maxWidth: 260 }}>
        {props.message}
      </Text>
      {props.children ? <View style={{ alignSelf: "stretch", marginTop: tokens.space.md }}>{props.children}</View> : null}
    </View>
  );
}

// ── Skeleton loaders ──────────────────────────────────────────────────────────
// DESIGN.md (data-light): list/board/stepper screens show content-shaped skeletons while loading,
// not a bare spinner, so the layout doesn't jump when data lands. A calm opacity pulse, native-driven
// so it stays cheap on constrained devices.

// Reduce-motion, live-updating — a pulsing loop must stop the moment the OS setting flips on.
function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!cancelled) setReduceMotion(on);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
  return reduceMotion;
}

export function Skeleton({
  width = "100%",
  height = 14,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}): React.ReactElement {
  const reduceMotion = useReduceMotion();
  const pulse = React.useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    // Reduce-motion: no pulse — hold a static mid opacity so the placeholder still reads as loading.
    if (reduceMotion) {
      pulse.setValue(0.65);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: tokens.color.line, opacity: pulse }, style]} />;
}

/** A Card-shaped placeholder mirroring a list/board row. */
export function SkeletonCard(): React.ReactElement {
  return (
    <Card>
      <Skeleton width="55%" height={16} />
      <Skeleton width="80%" height={12} style={{ marginTop: tokens.space.sm }} />
      <Skeleton width="35%" height={12} style={{ marginTop: tokens.space.sm }} />
    </Card>
  );
}

/** N skeleton cards — the default loading state for list/board/stepper screens. */
export function SkeletonList({ count = 3 }: { count?: number }): React.ReactElement {
  return (
    <View accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

/** A row-shaped placeholder mirroring a list row that has a right-aligned value (e.g. trip history). */
export function SkeletonRow(): React.ReactElement {
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, paddingRight: tokens.space.sm }}>
          <Skeleton width="70%" height={14} />
          <Skeleton width="90%" height={12} style={{ marginTop: tokens.space.sm }} />
        </View>
        <Skeleton width={48} height={16} />
      </View>
    </Card>
  );
}

/** N skeleton rows — loading state for row-with-value lists (mirrors the row layout, no reflow). */
export function SkeletonRows({ count = 4 }: { count?: number }): React.ReactElement {
  return (
    <View accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}
