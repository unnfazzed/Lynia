import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Icon } from "../Icon";
import { RemoteImage } from "../RemoteImage";
import { Tappable } from "../Tappable";
import { ORDER_COPY as A, orderText, usd } from "./copy";
import { H2, LABEL, Muted, Plate, RatingLine, RiderAvatar, Row, SmBtn, TABULAR, VerifiedTag } from "./kit";

/**
 * The After Send order screen's cards (ledger D-53, handoff `as-kit.jsx`): offer card, rider card,
 * delivery code card + the hand-off "code big", the Google Maps row, the pickup-photo row, the price
 * box and the receipt. Pure views — every action arrives as a callback.
 */

/** What the screen knows about the rider, from the snapshot's rider card or the chosen offer. */
export interface RiderView {
  /** "Tendai M." */
  name: string;
  /** "Tendai" — the map pill and copy like "Tendai is at the drop-off". */
  firstName: string;
  initials: string;
  photoUrl: string | null;
  ratingAvg: number | null;
  trips: number;
  plate: string | null;
  verified: boolean;
}

export interface OfferView {
  id: string;
  name: string;
  initials: string;
  photoUrl: string | null;
  ratingAvg: number | null;
  trips: number;
  etaMinutes: number;
  price: number;
  /** The customer's current price — an offer above it shows the "+$x over your price" strip. */
  ask: number;
}

const cardBox = { borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.input, backgroundColor: tokens.color.bg } as const;

/**
 * Offer card: avatar · (Best match, name, rating, ETA) · price + Choose; an over-price strip below.
 * v2: names wrap (never truncate); "Your price" under a price equal to the customer's; while this card's
 * Choose is in flight a confirming line sits under it (slow variant after 5 s, 2.9).
 */
export function OfferCard({
  offer,
  best,
  onChoose,
  choosing,
  disabled,
  confirming,
}: {
  offer: OfferView;
  best: boolean;
  onChoose: () => void;
  choosing: boolean;
  disabled: boolean;
  /** The confirming line under the card while its Choose is in flight. */
  confirming?: string | null;
}): React.ReactElement {
  const diff = offer.price - offer.ask;
  const over = diff > 0.004;
  const same = Math.abs(diff) <= 0.004;
  return (
    <View style={{ ...cardBox, borderWidth: best ? 2 : 1, borderColor: best ? tokens.color.accentText : tokens.color.line, padding: best ? 11 : 12, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
        <RiderAvatar photoUrl={offer.photoUrl} initials={offer.initials} size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {best ? (
            <View style={{ alignSelf: "flex-start", backgroundColor: tokens.color.accentWash, borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 1, marginBottom: 2 }}>
              <Text style={{ fontSize: 11, lineHeight: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{A.bestMatch}</Text>
            </View>
          ) : null}
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{offer.name}</Text>
          <RatingLine text={orderText.rating(offer.ratingAvg, offer.trips)} />
          <Row gap={4}>
            <Icon name="clock" size={13} color={tokens.color.muted} />
            <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{orderText.eta(offer.etaMinutes)}</Text>
          </Row>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{usd(offer.price)}</Text>
          {same ? <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted, marginTop: -6 }}>{A.yourPriceTag}</Text> : null}
          <SmBtn
            kind="fill"
            label={A.choose}
            onPress={onChoose}
            loading={choosing}
            disabled={disabled}
            accessibilityLabel={`${A.choose} ${offer.name}, ${usd(offer.price)}`}
          />
        </View>
      </View>
      {over ? (
        <View style={{ backgroundColor: tokens.color.surface, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 }}>
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{orderText.over(diff, offer.price)}</Text>
        </View>
      ) : null}
      {confirming ? (
        <Text accessibilityLiveRegion="polite" style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted }}>
          {confirming}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Rider card: photo, name + Verified, rating · Bike plate; Call / WhatsApp, or the masked number.
 * v2: no plate → "Bike" only; not verified → no tag; no photo → initials; the name and plate wrap;
 * no number yet → Call / WhatsApp disabled with a reason line (2.13, 2.15).
 */
export function RiderCard({
  rider,
  masked,
  maskedPhone,
  buttons = true,
  onCall,
  onWhatsApp,
  noPhone,
}: {
  rider: RiderView;
  masked?: boolean;
  maskedPhone?: string;
  buttons?: boolean;
  onCall?: () => void;
  onWhatsApp?: () => void;
  /** The rider's number hasn't come through yet. */
  noPhone?: boolean;
}): React.ReactElement {
  const noop = (): void => undefined;
  return (
    <View style={{ ...cardBox, padding: 12, gap: 10 }}>
      <Row gap={12}>
        <RiderAvatar photoUrl={rider.photoUrl} initials={rider.photoUrl ? null : rider.initials} size={48} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, flexShrink: 1 }}>{rider.name}</Text>
            {rider.verified ? <VerifiedTag /> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", columnGap: 10, rowGap: 4, flexWrap: "wrap" }}>
            <RatingLine text={orderText.rating(rider.ratingAvg, rider.trips)} />
            <Plate plate={rider.plate} />
          </View>
          {masked && maskedPhone ? <Text style={{ fontSize: 13, color: tokens.color.muted, ...TABULAR }}>{maskedPhone}</Text> : null}
        </View>
      </Row>
      {buttons && !masked ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SmBtn flex={1} label={A.call} icon="phone" onPress={onCall ?? noop} disabled={noPhone || !onCall} accessibilityLabel={`${A.call} ${rider.firstName}`} />
          <SmBtn flex={1} label={A.whatsapp} icon="message-circle" onPress={onWhatsApp ?? noop} disabled={noPhone || !onWhatsApp} accessibilityLabel={`${A.whatsapp} ${rider.firstName}`} />
        </View>
      ) : null}
      {buttons && !masked && noPhone ? <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted, marginTop: -2 }}>{orderText.noPhone(rider.firstName)}</Text> : null}
    </View>
  );
}

/**
 * The six-digit code as 3+3 groups ("418 290"): two text runs with a gap, never a space in the value —
 * copy, share and the spoken label all use "418290". `maxScale` caps the system font scale.
 */
function CodeDigits({ code, size, gap, maxScale }: { code: string; size: number; gap: number; maxScale: number }): React.ReactElement {
  const half = Math.ceil(code.length / 2);
  const style = { fontSize: size, lineHeight: Math.round(size * 1.15), fontWeight: tokens.font.weight.extrabold, letterSpacing: size * 0.04, color: tokens.color.ink, ...TABULAR };
  return (
    <View style={{ flexDirection: "row", gap }} accessible accessibilityLabel={`${A.code}, ${code.split("").join(" ")}`}>
      <Text maxFontSizeMultiplier={maxScale} style={style}>
        {code.slice(0, half)}
      </Text>
      <Text maxFontSizeMultiplier={maxScale} style={style}>
        {code.slice(half)}
      </Text>
    </View>
  );
}

/** 2.14 — the code being issued: six grey bars in two groups. */
function SkelDigits({ h = 28 }: { h?: number }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 10 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[0, 1].map((g) => (
        <View key={g} style={{ flexDirection: "row", gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ width: Math.round(h * 0.62), height: h, borderRadius: 6, backgroundColor: tokens.color.bg, opacity: 0.8 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Delivery code card (6, 7, 9, 19, 2.4): "DELIVERY CODE" over 28/800 digits in 3+3, the white "Share
 * code" on the same row — measured: when the digits and the button overflow the row (a large font
 * scale), Share code drops under the digits at full width. `code` null = being issued (2.14).
 */
export function CodeCard({ code, offline, onShare }: { code: string | null; offline: boolean; onShare: () => void }): React.ReactElement {
  const [rowW, setRowW] = React.useState(0);
  const [digitsW, setDigitsW] = React.useState(0);
  const [btnW, setBtnW] = React.useState(0);
  // Label column + gap 8 + button must fit the row; the label is narrower than the digits.
  const stack = rowW > 0 && digitsW > 0 && btnW > 0 && digitsW + 8 + btnW > rowW;
  const share = <SmBtn kind="white" label={A.shareCode} icon="share-2" onPress={onShare} disabled={!code} flex={stack ? 1 : undefined} />;
  return (
    <View style={{ backgroundColor: tokens.color.accentWash, borderRadius: tokens.radius.input, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} onLayout={(e) => setRowW(e.nativeEvent.layout.width)}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ ...LABEL, color: tokens.color.accentText }}>{A.code}</Text>
          <View style={{ alignSelf: "flex-start" }} onLayout={(e) => setDigitsW(e.nativeEvent.layout.width)}>
            {code ? <CodeDigits code={code} size={28} gap={10} maxScale={1.15} /> : <SkelDigits />}
          </View>
        </View>
        {stack ? null : <View onLayout={(e) => setBtnW(e.nativeEvent.layout.width)}>{share}</View>}
      </View>
      {stack ? <View style={{ flexDirection: "row" }}>{share}</View> : null}
      <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.ink }}>{!code ? A.codeIssuing : offline ? `${A.codeOffline} ${A.codeHelp}` : A.codeHelp}</Text>
    </View>
  );
}

/**
 * Hand-off (state 8): one white panel with a 2px accent-text border, the code at 56/800 in 3+3 (48 and
 * a 16 gap under 340dp) — the biggest thing on the sheet; it ignores the system font scale.
 */
export function CodeBig({ code, screenWidth }: { code: string; screenWidth: number }): React.ReactElement {
  const sm = screenWidth < 340;
  return (
    <View style={{ backgroundColor: tokens.color.accentWash, borderRadius: 16, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 16, alignItems: "center", gap: 10 }}>
      <Text style={{ ...LABEL, color: tokens.color.accentText }}>{A.code}</Text>
      <View style={{ alignSelf: "stretch", backgroundColor: tokens.color.bg, borderWidth: 2, borderColor: tokens.color.accentText, borderRadius: 12, paddingVertical: 8, alignItems: "center" }}>
        <CodeDigits code={code} size={sm ? 48 : 56} gap={sm ? 16 : 20} maxScale={1} />
      </View>
      <Text style={{ fontSize: 14, lineHeight: 20, textAlign: "center", color: tokens.color.ink }}>{A.codeHand}</Text>
    </View>
  );
}

/** "Follow route in Google Maps" — a 56px row with the Navigation disc and a chevron. */
export function GMapsRow({ onPress }: { onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={A.gmaps}
      style={{ ...cardBox, minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6, paddingLeft: 12, paddingRight: 10 }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
        <Icon name="navigation" size={16} color={tokens.color.accentText} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{A.gmaps}</Text>
        <Muted size={12}>{A.gmapsSub}</Muted>
      </View>
      <Icon name="chevron-right" size={18} color={tokens.color.muted} />
    </Tappable>
  );
}

/** Pickup photo row (state 7 onwards): 52px thumbnail, "Pickup photo" / "Taken by … at 09:12", View. */
export function PickupPhotoRow({ url, sub, onView }: { url: string; sub: string; onView: () => void }): React.ReactElement {
  return (
    <View style={{ ...cardBox, padding: 8, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <RemoteImage
        source={{ uri: url }}
        cachePolicy="memory"
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: tokens.color.surface }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{A.photo}</Text>
        <Muted size={12}>{sub}</Muted>
      </View>
      <SmBtn label={A.view} icon="camera" onPress={onView} accessibilityLabel={`${A.view} ${A.photo}`} />
    </View>
  );
}

/** The finding price box: YOUR PRICE · $3.36 (· was $x) · Cash to your rider, and "+ $0.50". */
export function PriceBox({ price, was, onRaise, raising }: { price: number; was: number | null; onRaise?: () => void; raising?: boolean }): React.ReactElement {
  return (
    <View style={{ ...cardBox, paddingVertical: 10, paddingLeft: 14, paddingRight: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={LABEL}>{A.yourPrice}</Text>
        <Row gap={8} align="baseline">
          <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{usd(price)}</Text>
          {was != null ? <Text style={{ fontSize: 13, color: tokens.color.muted, textDecorationLine: "line-through", ...TABULAR }}>{orderText.was(was)}</Text> : null}
        </Row>
        <Row gap={5}>
          <Icon name="banknote" size={14} color={tokens.color.muted} />
          <Muted size={12}>{A.cash}</Muted>
        </Row>
      </View>
      {onRaise ? <SmBtn label={A.plus} onPress={onRaise} loading={raising} accessibilityLabel="Raise your price by 50 cents" /> : null}
    </View>
  );
}

/** The surface box with a label over a big value (retry's SUGGESTED PRICE, not-delivered's REASON). */
export function LabelBox({ label, value, big, note }: { label: string; value: string; big?: boolean; note?: string }): React.ReactElement {
  return (
    <View style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.input, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text style={LABEL}>{label}</Text>
        <Text style={big ? { fontSize: 28, lineHeight: 34, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR } : { fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, marginTop: 2 }}>{value}</Text>
      </View>
      {note ? <Muted size={12} style={{ textAlign: "right", maxWidth: 120 }}>{note}</Muted> : null}
    </View>
  );
}

function KV({ k, v, strong, icon }: { k: string; v: string; strong?: boolean; icon?: boolean }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: tokens.color.line }}>
      <Text style={{ fontSize: 13, color: tokens.color.muted }}>{k}</Text>
      <View style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
        {icon ? <Icon name="banknote" size={15} color={tokens.color.accentText} /> : null}
        <Text style={{ flexShrink: 1, textAlign: "right", fontSize: strong ? 17 : 13, fontWeight: strong ? tokens.font.weight.bold : tokens.font.weight.semibold, color: tokens.color.ink, ...TABULAR }}>{v}</Text>
      </View>
    </View>
  );
}

export interface ReceiptView {
  ref: string;
  pickup: string;
  pickupAt: string;
  dropoff: string;
  dropoffAt: string;
  /** One line per item ("Documents envelope × 1"). */
  items: string[];
  rider: string | null;
  riderPhone: string | null;
  price: number;
}

/**
 * Receipt: header + Ref, the two stops with times, Items · Rider · Rider phone · Agreed price · Paid cash.
 * v2 (2.27): one item per line, right-aligned; addresses wrap; a missing pickup time reads "Not recorded".
 */
export function Receipt({ r, onShare }: { r: ReceiptView; onShare: () => void }): React.ReactElement {
  const stop = (drop: boolean, name: string, t: string): React.ReactElement => (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 3 }}>
      <View style={{ height: 18, justifyContent: "center" }}>
        {drop ? (
          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: tokens.color.danger }} />
        ) : (
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.color.accent }} />
        )}
      </View>
      <Text style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{name}</Text>
      <Text style={{ fontSize: t ? 13 : 12, lineHeight: 18, color: tokens.color.muted, ...TABULAR }}>{t || A.noTime}</Text>
    </View>
  );
  return (
    <View style={{ ...cardBox, paddingTop: 10, paddingHorizontal: 14, paddingBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: 6 }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{A.receipt}</Text>
        <Text style={{ fontSize: 12, color: tokens.color.muted }}>{r.ref}</Text>
      </View>
      <View style={{ paddingBottom: 6 }}>
        {stop(false, r.pickup, r.pickupAt)}
        {stop(true, r.dropoff, r.dropoffAt)}
      </View>
      {r.items.length ? (
        <View style={{ flexDirection: "row", gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: tokens.color.line }}>
          <Text style={{ fontSize: 13, color: tokens.color.muted }}>{A.items}</Text>
          <View style={{ flex: 1 }}>
            {r.items.map((t, i) => (
              <Text key={i} style={{ textAlign: "right", fontSize: 13, lineHeight: 20, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
                {t}
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      {r.rider ? <KV k={A.rider} v={r.rider} /> : null}
      {r.riderPhone ? <KV k={A.riderPhone} v={r.riderPhone} /> : null}
      <KV k={A.price} v={usd(r.price)} strong />
      <KV k="" v={A.paidCash} icon />
      <Muted size={12} style={{ marginTop: 2, marginBottom: 10 }}>
        {A.masked}
      </Muted>
      <View style={{ flexDirection: "row" }}>
        <SmBtn flex={1} label={A.shareReceipt} icon="share-2" onPress={onShare} />
      </View>
    </View>
  );
}

/** The centred headline block of the retry / cancelled sheets: disc, 18/700 line, 14 muted sub-line. */
export function CentredHead({ icon, title, sub }: { icon: React.ReactElement; title: string; sub: React.ReactNode }): React.ReactElement {
  return (
    <View style={{ alignItems: "center", gap: 8, paddingTop: 4 }}>
      {icon}
      <H2 style={{ textAlign: "center" }}>{title}</H2>
      {typeof sub === "string" ? <Muted size={14} style={{ textAlign: "center" }}>{sub}</Muted> : sub}
    </View>
  );
}
