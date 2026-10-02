import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ActivityIndicator, Modal, ScrollView, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { MoonSticker, SunSticker } from "../home/ServiceStickers";
import { IconDisc, RiderAvatar, SmBtn, VerifiedTag } from "../order/kit";
import { OrderHeader } from "../order/panels";
import { RIDER_COPY as R, RF, signedUsd, usd } from "./copy";

/**
 * Rider v2 shared parts (`packages/design/handoff/rider-v2/`, ledger D-54), rebuilt from `rv-kit.jsx`
 * on the app's tokens. Where After Send / Send v2 already ship a part (SmBtn, CtaButton, CtaBar,
 * IconDisc, OrderHeader, StepTrack, Notice) this module reuses it. Built at size, never hit-slopped;
 * every string comes from `./copy`.
 */

export const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

/** 12/600 uppercase label, letter-spacing .04em. */
export function RLabel({ children, color = tokens.color.muted, style }: { children: React.ReactNode; color?: string; style?: TextStyle }): React.ReactElement {
  return <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: tokens.font.weight.semibold, letterSpacing: 0.5, color, ...style }}>{children}</Text>;
}

/** The connection state, as text (never a control): green dot + "Online", or a spinner + "Reconnecting…". */
export function Conn({ online }: { online: boolean }): React.ReactElement {
  return online ? (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessible accessibilityLabel={R.online}>
      <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.color.accent }} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{R.online}</Text>
    </View>
  ) : (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessible accessibilityLabel={R.reconnecting}>
      <ActivityIndicator size={12} color={tokens.color.muted} />
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{R.reconnecting}</Text>
    </View>
  );
}

/**
 * The 8c mint top card on tab roots: 104 tall with the status bar, a one-line 22/700 greeting (18 under
 * 340dp), a sub-row (rider: Conn, then "· street" on Jobs; customer: the street only), the sun/moon
 * sticker (hidden under 340dp) and a 44px bell with the gold unread dot.
 */
export function MintTop({
  greeting,
  evening,
  unread,
  onBell,
  online,
  loc,
  customer,
  narrow,
}: {
  greeting: string;
  evening: boolean;
  unread: boolean;
  onBell: () => void;
  /** Rider side only. Omitted on the customer side. */
  online?: boolean;
  loc?: string | null;
  customer?: boolean;
  narrow: boolean;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: tokens.color.accentWash, paddingTop: insets.top, minHeight: 80 + insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 10, paddingRight: 12, paddingLeft: 16, paddingBottom: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} accessibilityRole="header" style={{ fontSize: narrow ? 18 : 22, lineHeight: 28, fontWeight: tokens.font.weight.bold, letterSpacing: -0.2, color: tokens.color.ink }}>
            {greeting}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, minHeight: 20, overflow: "hidden" }}>
            {customer ? null : <Conn online={online ?? true} />}
            {loc ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 3, flexShrink: 1, minWidth: 0 }}>
                {customer ? null : <Text style={{ fontSize: 13, color: tokens.color.muted }}>·</Text>}
                <Icon name="map-pin" size={13} color={tokens.color.accentText} />
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>
                  {loc}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {narrow ? null : (
          <View accessibilityElementsHidden importantForAccessibility="no">
            {evening ? <MoonSticker size={40} /> : <SunSticker size={40} />}
          </View>
        )}
        <Tappable
          tone="icon"
          onPress={onBell}
          accessibilityRole="button"
          accessibilityLabel={unread ? `${R.tNotif}, unread` : R.tNotif}
          style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, borderRadius: 22, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="bell" size={19} color={tokens.color.accentText} />
          {unread ? (
            <View style={{ position: "absolute", top: 10, right: 11, width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.color.highlight, borderWidth: 1.5, borderColor: tokens.color.bg }} />
          ) : null}
        </Tappable>
      </View>
    </View>
  );
}

/** Account / Settings card: 1px line, radius 16, rows clip to it. */
export function RCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }): React.ReactElement {
  return <View style={{ borderWidth: 1, borderColor: tokens.color.line, borderRadius: 16, backgroundColor: tokens.color.bg, overflow: "hidden", ...style }}>{children}</View>;
}

/** A list row: 56 min, 36px icon disc, label 15/600 + sub 12, right value (ok / warn pill), chevron. */
export function RRow({
  icon,
  label,
  sub,
  value,
  tone,
  danger,
  chev = true,
  first,
  onPress,
  children,
  accessibilityLabel,
}: {
  icon?: IconName;
  label: string;
  sub?: string | null;
  value?: string | null;
  tone?: "ok" | "warn" | null;
  danger?: boolean;
  chev?: boolean;
  first?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
  accessibilityLabel?: string;
}): React.ReactElement {
  const discBg = danger ? tokens.color.dangerWash : tone === "ok" ? tokens.color.accentWash : tokens.color.surface;
  const discFg = danger ? tokens.color.dangerInk : tone === "ok" ? tokens.color.accentText : tokens.color.muted;
  const valueNode = value ? (
    <View style={{ borderRadius: tokens.radius.pill, backgroundColor: tone === "warn" ? tokens.color.dangerWash : "transparent", paddingHorizontal: tone === "warn" ? 8 : 0, paddingVertical: tone === "warn" ? 2 : 0 }}>
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tone === "warn" ? tokens.color.dangerInk : tone === "ok" ? tokens.color.accentText : tokens.color.muted }}>{value}</Text>
    </View>
  ) : null;
  const body = (
    <View
      style={{
        minHeight: 56,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 8,
        paddingRight: 12,
        paddingLeft: 14,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: tokens.color.line,
      }}
    >
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: discBg, alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={18} color={discFg} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center", minHeight: 36 }}>
        {children && valueNode ? (
          // A row with inline controls keeps the value on the label line, so the controls get the
          // full column width instead of wrapping beside it.
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: tokens.font.weight.semibold, color: danger ? tokens.color.danger : tokens.color.ink }}>{label}</Text>
            {valueNode}
          </View>
        ) : (
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: tokens.font.weight.semibold, color: danger ? tokens.color.danger : tokens.color.ink }}>{label}</Text>
        )}
        {sub ? <Text style={{ fontSize: 12, lineHeight: 16, marginTop: 2, color: tokens.color.muted, ...TABULAR }}>{sub}</Text> : null}
        {children}
      </View>
      {!children ? valueNode : null}
      {chev && onPress ? (
        <Icon name="chevron-right" size={18} color={tokens.color.muted} />
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? [label, sub, value].filter(Boolean).join(", ")}>
      {body}
    </Tappable>
  );
}

/** Uppercase section label above a card (Settings). */
/**
 * The rider's 24-hour safety line: the Rider v2 S6 danger-wash row, lifted onto the rider Account when
 * Help & support became a straight WhatsApp link (owner 2026-10-02, ledger D-60).
 */
export function SafetyLineRow({ onPress }: { onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${R.hSafety}, ${R.hSafetyS}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, backgroundColor: tokens.color.dangerWash, borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 }}
    >
      <Icon name="siren" size={22} color={tokens.color.dangerInk} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.dangerInk }}>{R.hSafety}</Text>
        <Text style={{ fontSize: 12, color: tokens.color.dangerInk }}>{R.hSafetyS}</Text>
      </View>
      <Icon name="phone" size={18} color={tokens.color.dangerInk} />
    </Tappable>
  );
}

export function SectionLabel({ children }: { children: string }): React.ReactElement {
  return <RLabel style={{ marginTop: 6, marginHorizontal: 4, marginBottom: -4 }}>{children}</RLabel>;
}

/** Segmented control: surface track, 1px line, pill, padding 3. Selected = cta-fill + white 15/700. */
export function Seg<T extends string>({
  opts,
  value,
  onChange,
  h = 44,
  icons,
  accessibilityLabel,
}: {
  opts: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  h?: number;
  icons?: readonly IconName[];
  accessibilityLabel?: string;
}): React.ReactElement {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{ flexDirection: "row", minHeight: h, padding: 3, borderRadius: tokens.radius.pill, borderWidth: 1, borderColor: tokens.color.line, backgroundColor: tokens.color.surface }}
    >
      {opts.map((o, i) => {
        const on = o.id === value;
        return (
          <Tappable
            key={o.id}
            tone={on ? "onDark" : "row"}
            onPress={() => onChange(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={o.label}
            style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: tokens.radius.pill, backgroundColor: on ? tokens.color.cta : "transparent", paddingHorizontal: 6 }}
          >
            {icons?.[i] ? <Icon name={icons[i]!} size={17} color={on ? tokens.color.onAccent : tokens.color.muted} /> : null}
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: on ? tokens.color.onAccent : tokens.color.ink, textAlign: "center", flexShrink: 1 }}>{o.label}</Text>
          </Tappable>
        );
      })}
    </View>
  );
}

/** The Customer | Rider role toggle: Seg at 48, ShoppingBag / Bike icons. */
export type Side = "customer" | "rider";
export function RoleToggle({ side, onChange }: { side: Side; onChange: (s: Side) => void }): React.ReactElement {
  return (
    <Seg<Side>
      h={48}
      opts={[
        { id: "customer", label: R.sideCustomer },
        { id: "rider", label: R.sideRider },
      ]}
      icons={["shopping-bag", "bike"]}
      value={side}
      onChange={onChange}
    />
  );
}

/** Identity card: avatar 52, name 17/700 (+ Verified on the rider side), line 2 13 muted. Tappable. */
export function IdentityCard({
  name,
  line,
  photoUrl,
  initials,
  verified,
  star,
  onPress,
}: {
  name: string;
  line: string;
  photoUrl?: string | null;
  initials?: string | null;
  verified?: boolean;
  /** Prefix line 2 with a filled ink star (the rider's rating line). */
  star?: boolean;
  /** Omitted on both Account tabs: the card is not tappable and draws no chevron (owner 2026-10-02, D-60). */
  onPress?: () => void;
}): React.ReactElement {
  const body = (
        <View style={{ minHeight: 96, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingRight: 12, paddingLeft: 14 }}>
          <RiderAvatar photoUrl={photoUrl} initials={initials} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{name}</Text>
              {verified ? <VerifiedTag /> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
              {star ? <Icon name="star" size={13} color={tokens.color.ink} fill={tokens.color.ink} /> : null}
              <Text style={{ fontSize: 13, color: tokens.color.muted, ...TABULAR }}>{line}</Text>
            </View>
          </View>
          {onPress ? <Icon name="chevron-right" size={18} color={tokens.color.muted} /> : null}
        </View>
  );
  return (
    <RCard>
      {onPress ? (
        <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${name}, ${line}`}>
          {body}
        </Tappable>
      ) : (
        <View accessible accessibilityLabel={`${name}, ${line}`}>
          {body}
        </View>
      )}
    </RCard>
  );
}

/** The reliability card: status pill, Acceptance / Rating / Strikes tiles, the plain-words rule. */
export function Standing({
  acceptance,
  rating,
  used,
  max,
  oldestClears,
}: {
  acceptance: number | null;
  rating: number | null;
  used: number;
  max: number;
  oldestClears: Date | null;
}): React.ReactElement {
  const risk = used >= max - 1 && used > 0;
  const tile: ViewStyle = { flex: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: tokens.color.surface };
  return (
    <View style={{ borderWidth: 1, borderColor: risk ? tokens.color.danger : tokens.color.line, borderRadius: 16, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <RLabel style={{ flex: 1 }}>{R.standing}</RLabel>
        <View style={{ minHeight: 24, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, borderRadius: tokens.radius.pill, backgroundColor: risk ? tokens.color.dangerWash : tokens.color.accentWash }}>
          <Icon name={risk ? "triangle-alert" : "shield-check"} size={13} color={risk ? tokens.color.dangerInk : tokens.color.accentText} />
          <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.bold, color: risk ? tokens.color.dangerInk : tokens.color.accentText }}>{risk ? R.atRisk : R.good}</Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={tile}>
          <Text style={{ fontSize: 12, color: tokens.color.muted }}>{R.acceptance}</Text>
          <Text style={{ fontSize: 18, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{RF.acceptanceV(acceptance)}</Text>
        </View>
        <View style={tile}>
          <Text style={{ fontSize: 12, color: tokens.color.muted }}>{R.ratingK}</Text>
          <Text style={{ fontSize: 18, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{RF.ratingV(rating)}</Text>
        </View>
        <View style={{ ...tile, backgroundColor: risk ? tokens.color.dangerWash : tokens.color.surface }} accessible accessibilityLabel={`${R.strikes} ${RF.strikesV(used, max)}`}>
          <Text style={{ fontSize: 12, color: risk ? tokens.color.dangerInk : tokens.color.muted }}>{R.strikes}</Text>
          <View style={{ flexDirection: "row", gap: 4, marginTop: 7 }}>
            {Array.from({ length: max }, (_, i) => (
              <View key={i} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: i < used ? (risk ? tokens.color.danger : tokens.color.ink) : tokens.color.line }} />
            ))}
          </View>
          <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.bold, marginTop: 3, color: risk ? tokens.color.dangerInk : tokens.color.ink, ...TABULAR }}>{RF.strikesV(used, max)}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 19, color: tokens.color.ink }}>{risk ? RF.standingRisk(used, max, oldestClears) : RF.standingB(max, oldestClears)}</Text>
    </View>
  );
}

/** A 4px progress bar (line track, accent fill). */
export function Progress({ pct }: { pct: number }): React.ReactElement {
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: tokens.color.line, overflow: "hidden" }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", backgroundColor: tokens.color.accent }} />
    </View>
  );
}

/**
 * Modal bottom sheet over a 45% ink scrim: grabber, optional 56 disc, title 20/700, body 15/22 muted,
 * children, stacked buttons. Android Back and a scrim tap close it unless `locked` (the Picked sheet).
 */
export function MSheet({
  visible,
  onClose,
  locked,
  icon,
  iconTone,
  title,
  body,
  children,
  buttons,
}: {
  visible: boolean;
  onClose: () => void;
  locked?: boolean;
  icon?: IconName;
  iconTone?: "calm" | "ok" | "danger";
  title?: string;
  body?: string;
  children?: React.ReactNode;
  buttons?: React.ReactNode;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => (locked ? undefined : onClose())}>
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={R.close}
          disabled={locked}
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(20,24,27,0.45)" }}
        />
        <View style={{ maxHeight: "92%", backgroundColor: tokens.color.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 16, paddingBottom: 12 + insets.bottom }}>
          <View style={{ height: 28, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.color.line }} />
          </View>
          <ScrollView bounces={false} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            {icon ? <IconDisc name={icon} tone={iconTone} size={56} /> : null}
            {title ? <Text accessibilityRole="header" style={{ fontSize: 20, lineHeight: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{title}</Text> : null}
            {body ? <Text style={{ fontSize: 15, lineHeight: 22, color: tokens.color.muted }}>{body}</Text> : null}
            {children}
            {buttons ? <View style={{ gap: 8, marginTop: 4 }}>{buttons}</View> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Ledger / history row: 36 disc, title 14/600, meta 12 muted, amount 15/700 (credit green, debit ink). */
export function LRow({ icon, title, meta, amount, text, first }: { icon: IconName; title: string; meta: string; amount?: number; text?: string; first?: boolean }): React.ReactElement {
  const credit = amount != null && amount >= 0;
  return (
    <View
      accessible
      accessibilityLabel={`${title}, ${meta}, ${text ?? (amount != null ? signedUsd(amount) : "")}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, paddingVertical: 6, borderTopWidth: first ? 0 : 1, borderTopColor: tokens.color.line }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: credit ? tokens.color.accentWash : tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
        <Icon name={icon} size={17} color={credit ? tokens.color.accentText : tokens.color.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{title}</Text>
        <Text style={{ fontSize: 12, color: tokens.color.muted, ...TABULAR }}>{meta}</Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: text ? tokens.color.ink : credit ? tokens.color.accentText : tokens.color.ink, ...TABULAR }}>
        {text ?? (amount != null ? signedUsd(amount) : "")}
      </Text>
    </View>
  );
}

/** 44px filter chips. Selected: accent-wash + 1.5 accent-text border. */
export function Chips<T extends string>({ list, value, onChange }: { list: readonly { id: T; label: string }[]; value: T; onChange: (id: T) => void }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      {list.map((c) => {
        const on = c.id === value;
        return (
          <Tappable
            key={c.id}
            onPress={() => onChange(c.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={c.label}
            style={{
              minHeight: tokens.touchTargetMin,
              justifyContent: "center",
              paddingHorizontal: 16,
              borderRadius: tokens.radius.pill,
              backgroundColor: on ? tokens.color.accentWash : tokens.color.bg,
              borderWidth: on ? 1.5 : 1,
              borderColor: on ? tokens.color.accentText : tokens.color.line,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: on ? tokens.color.accentText : tokens.color.ink }}>{c.label}</Text>
          </Tappable>
        );
      })}
    </View>
  );
}

/** "YOURS" (accent-text) | "OWED TO KITCHEN" (ink) on a surface box, optional title. */
export function CashSplit({ yours, owed, title }: { yours: number; owed: number; title?: string }): React.ReactElement {
  return (
    <View style={{ backgroundColor: tokens.color.surface, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 6 }}>
      {title ? <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{title}</Text> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <RLabel color={tokens.color.accentText}>{R.yours}</RLabel>
          <Text style={{ fontSize: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, ...TABULAR }}>{usd(yours)}</Text>
        </View>
        <View style={{ width: 1, backgroundColor: tokens.color.line }} />
        <View style={{ flex: 1, paddingLeft: 4 }}>
          <RLabel>{R.owed}</RLabel>
          <Text style={{ fontSize: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{usd(owed)}</Text>
        </View>
      </View>
    </View>
  );
}

/** One-line cash strip: Banknote 18 accent-text + 14/600. */
export function CashLine({ text, icon = "banknote" }: { text: string; icon?: IconName }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: tokens.color.surface, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Icon name={icon} size={18} color={tokens.color.accentText} />
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{text}</Text>
    </View>
  );
}

/** The Become-a-rider card on a customer-only Account (start / in progress / review / failed). */
export type BecomeState = "none" | "progress" | "review" | "failed";
export function BecomeCard({ state, failBody, onAction }: { state: BecomeState; failBody?: string; onAction: () => void }): React.ReactElement {
  const d = {
    none: { icon: "bike" as IconName, tone: "ok", title: R.becomeT, body: R.becomeB, cta: R.startKyc },
    progress: { icon: "id-card" as IconName, tone: "ok", title: R.kycProgT, body: R.kycProgB, cta: R.continueKyc },
    review: { icon: "hourglass" as IconName, tone: "calm", title: R.kycReviewT, body: R.kycReviewB, cta: null },
    failed: { icon: "id-card" as IconName, tone: "danger", title: R.kycFailT, body: failBody ?? "", cta: R.tryKyc },
  }[state];
  const wash = state === "none" || state === "progress";
  return (
    <View
      style={{
        borderRadius: 16,
        padding: 14,
        gap: 10,
        backgroundColor: wash ? tokens.color.accentWash : tokens.color.bg,
        borderWidth: wash ? 0 : 1,
        borderColor: state === "failed" ? tokens.color.danger : tokens.color.line,
      }}
    >
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: tokens.color.bg,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: d.tone === "danger" ? 1.5 : 0,
            borderColor: tokens.color.danger,
          }}
        >
          <Icon name={d.icon} size={22} color={d.tone === "danger" ? tokens.color.danger : d.tone === "ok" ? tokens.color.accentText : tokens.color.muted} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{d.title}</Text>
          {d.body ? <Text style={{ fontSize: 13, lineHeight: 19, marginTop: 2, color: tokens.color.ink }}>{d.body}</Text> : null}
        </View>
      </View>
      {d.cta ? (
        <View style={{ flexDirection: "row" }}>
          <SmBtn kind="fill" flex={1} label={d.cta} icon="arrow-right" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

/** Top up step bar: 4 columns, 18 circle + 12 label, 3px bar. */
export function RStepBar({ step, labels }: { step: number; labels: readonly string[] }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingBottom: 8 }} accessible accessibilityLabel={`Step ${step} of ${labels.length}, ${labels[step - 1]}`}>
      {labels.map((l, i) => {
        const n = i + 1;
        const done = n < step;
        const cur = n === step;
        return (
          <View key={l} style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, minHeight: 22 }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: done || cur ? tokens.color.accentText : tokens.color.surface,
                  borderWidth: done || cur ? 0 : 1,
                  borderColor: tokens.color.line,
                }}
              >
                {done ? (
                  <Icon name="check" size={12} color={tokens.color.onAccent} strokeWidth={3} />
                ) : (
                  <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, color: cur ? tokens.color.onAccent : tokens.color.muted }}>{n}</Text>
                )}
              </View>
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, fontWeight: cur ? tokens.font.weight.bold : tokens.font.weight.semibold, color: cur ? tokens.color.ink : done ? tokens.color.accentText : tokens.color.muted }}>
                {l}
              </Text>
            </View>
            <View style={{ height: 3, borderRadius: 2, marginTop: 4, backgroundColor: done || cur ? tokens.color.accent : tokens.color.line }} />
          </View>
        );
      })}
    </View>
  );
}

/** Pushed-screen header (After Send's): Back · title · nothing on the right. */
export function PushHeader({ title, onBack }: { title: string; onBack: () => void }): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: tokens.color.bg }}>
      <OrderHeader title={title} help={false} onBack={onBack} onHelp={() => undefined} />
    </View>
  );
}

/** A centred blocking/terminal body: 72 disc, 22/700 title, 15/22 body, optional children. */
export function CentreState({ icon, tone, title, body, children, spinner }: { icon?: IconName; tone?: "calm" | "ok" | "danger"; title: string; body?: string; children?: React.ReactNode; spinner?: boolean }): React.ReactElement {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24 }}>
      {spinner ? (
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={tokens.color.accentText} />
        </View>
      ) : icon ? (
        <IconDisc name={icon} tone={tone} size={72} />
      ) : null}
      <Text accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "center" }}>{title}</Text>
      {body ? <Text style={{ fontSize: 15, lineHeight: 22, color: tokens.color.muted, textAlign: "center" }}>{body}</Text> : null}
      {children}
    </View>
  );
}

/** The danger-wash consequence box (Settings: alerts / location off). */
export function DangerBox({ text }: { text: string }): React.ReactElement {
  return (
    <View accessibilityRole="alert" style={{ marginTop: 8, backgroundColor: tokens.color.dangerWash, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 }}>
      <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: tokens.font.weight.semibold, color: tokens.color.dangerInk }}>{text}</Text>
    </View>
  );
}
