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

/** Offer card: avatar · (Best match, name, rating, ETA) · price + Choose; an over-price strip below. */
export function OfferCard({
  offer,
  best,
  onChoose,
  choosing,
  disabled,
}: {
  offer: OfferView;
  best: boolean;
  onChoose: () => void;
  choosing: boolean;
  disabled: boolean;
}): React.ReactElement {
  const over = offer.price - offer.ask > 0.004;
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
          <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
            {offer.name}
          </Text>
          <RatingLine text={orderText.rating(offer.ratingAvg, offer.trips)} />
          <Row gap={4}>
            <Icon name="clock" size={13} color={tokens.color.muted} />
            <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.muted }}>{orderText.eta(offer.etaMinutes)}</Text>
          </Row>
        </View>
        <View style={{ alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <Text style={{ fontSize: 20, lineHeight: 26, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{usd(offer.price)}</Text>
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
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{orderText.over(offer.price - offer.ask, offer.price)}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Rider card: photo, name + Verified, rating · Bike plate; Call / WhatsApp, or the masked number. */
export function RiderCard({
  rider,
  masked,
  maskedPhone,
  buttons = true,
  onCall,
  onWhatsApp,
}: {
  rider: RiderView;
  masked?: boolean;
  maskedPhone?: string;
  buttons?: boolean;
  onCall?: () => void;
  onWhatsApp?: () => void;
}): React.ReactElement {
  return (
    <View style={{ ...cardBox, padding: 12, gap: 10 }}>
      <Row gap={12}>
        <RiderAvatar photoUrl={rider.photoUrl} initials={rider.photoUrl ? null : rider.initials} size={48} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{rider.name}</Text>
            {rider.verified ? <VerifiedTag /> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <RatingLine text={orderText.rating(rider.ratingAvg, rider.trips)} />
            {rider.plate ? <Plate plate={rider.plate} /> : null}
          </View>
          {masked && maskedPhone ? <Text style={{ fontSize: 13, color: tokens.color.muted, ...TABULAR }}>{maskedPhone}</Text> : null}
        </View>
      </Row>
      {buttons && !masked && (onCall || onWhatsApp) ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {onCall ? <SmBtn flex={1} label={A.call} icon="phone" onPress={onCall} accessibilityLabel={`${A.call} ${rider.firstName}`} /> : null}
          {onWhatsApp ? <SmBtn flex={1} label={A.whatsapp} icon="message-circle" onPress={onWhatsApp} accessibilityLabel={`${A.whatsapp} ${rider.firstName}`} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** Delivery code card (states 6, 7, 9, 19): label + 30/800 digits, white "Share code", the help line. */
export function CodeCard({ code, offline, onShare, screenWidth }: { code: string; offline: boolean; onShare: () => void; screenWidth: number }): React.ReactElement {
  // The drawn 30/800 digits fit the handoff's four-digit code; real codes are six (D-53 §4), so the size
  // comes down until they fit beside "Share code" — never truncated. ~0.82em per digit incl. the .2em
  // tracking; sheet padding 32, card padding 26, gap 8, the Share code button ~132.
  const avail = screenWidth - 32 - 26 - 8 - 132;
  const size = Math.max(20, Math.min(30, Math.floor(avail / (Math.max(1, code.length) * 0.82))));
  return (
    <View style={{ backgroundColor: tokens.color.accentWash, borderRadius: tokens.radius.input, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, gap: 6 }}>
      <Row gap={8}>
        <View style={{ flex: 1, minWidth: 0 }} accessible accessibilityLabel={`${A.code}, ${code.split("").join(" ")}`}>
          <Text style={{ ...LABEL, color: tokens.color.accentText }}>{A.code}</Text>
          <Text style={{ fontSize: size, lineHeight: 36, fontWeight: tokens.font.weight.extrabold, letterSpacing: Math.round(size * 0.2), color: tokens.color.ink, ...TABULAR }}>
            {code}
          </Text>
        </View>
        <SmBtn kind="white" label={A.shareCode} icon="share-2" onPress={onShare} />
      </Row>
      <Text style={{ fontSize: 13, lineHeight: 18, color: tokens.color.ink }}>{offline ? `${A.codeOffline} ${A.codeHelp}` : A.codeHelp}</Text>
    </View>
  );
}

/**
 * Hand-off (state 8): the code in boxes, then the hand-off line. The handoff draws four 64×80 boxes
 * (54×70 under 340px); real codes are six digits, so each box shrinks to fit the sheet (ledger D-53 §4)
 * — never wider than the drawn 64, never a scrolling row.
 */
export function CodeBig({ code, screenWidth }: { code: string; screenWidth: number }): React.ReactElement {
  const n = Math.max(1, code.length);
  const drawn = screenWidth < 340 ? 54 : 64;
  // Sheet padding 16+16, card padding 14+14, 8px gaps.
  const bw = Math.min(drawn, Math.floor((screenWidth - 32 - 28 - 8 * (n - 1)) / n));
  const font = Math.min(screenWidth < 340 ? 40 : 48, Math.round(bw * 0.75));
  return (
    <View style={{ backgroundColor: tokens.color.accentWash, borderRadius: 16, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 16, alignItems: "center", gap: 10 }}>
      <Text style={{ ...LABEL, color: tokens.color.accentText }}>{A.code}</Text>
      <View style={{ flexDirection: "row", gap: 8 }} accessible accessibilityLabel={`${A.code}, ${code.split("").join(" ")}`}>
        {code.split("").map((d, i) => (
          <View
            key={i}
            style={{ width: bw, height: bw + 16, borderRadius: 12, backgroundColor: tokens.color.bg, borderWidth: 2, borderColor: tokens.color.accentText, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: font, fontWeight: tokens.font.weight.extrabold, color: tokens.color.ink, ...TABULAR }}>{d}</Text>
          </View>
        ))}
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

/** The success note under the price box (state 5): wash, CircleCheck + 13/600 accent-text. */
export function SuccessNote({ text }: { text: string }): React.ReactElement {
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: tokens.color.accentWash, borderRadius: tokens.radius.input, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Icon name="circle-check" size={18} color={tokens.color.accentText} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{text}</Text>
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
  items: string;
  rider: string | null;
  riderPhone: string | null;
  price: number;
}

/** Receipt: header + Ref, the two stops with times, Items · Rider · Rider phone · Agreed price · Paid cash. */
export function Receipt({ r, onShare }: { r: ReceiptView; onShare: () => void }): React.ReactElement {
  const stop = (drop: boolean, name: string, t: string): React.ReactElement => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 3 }}>
      {drop ? (
        <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: tokens.color.danger }} />
      ) : (
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tokens.color.accent }} />
      )}
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
        {name}
      </Text>
      {t ? <Text style={{ fontSize: 13, color: tokens.color.muted, ...TABULAR }}>{t}</Text> : null}
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
      {r.items ? <KV k={A.items} v={r.items} /> : null}
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
