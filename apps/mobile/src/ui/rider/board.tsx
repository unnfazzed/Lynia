import { tokens } from "@lynia/shared/tokens";
import { FirstRunToast } from "../firstrun/toast";
import React, { useEffect, useMemo, useRef } from "react";
import { type AccessibilityActionEvent, ActivityIndicator, ScrollView, Text, View, type ViewStyle } from "react-native";
import MapView, { Circle, type LatLng, Marker, Polyline, type Region } from "react-native-maps";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { CtaBar, CtaButton, IconDisc, SmBtn } from "../order/kit";
import { useTabBarSpace } from "../shell/TabShell";
import { Dot, Sq } from "../send/kit";
import { km, RIDER_COPY as R, RF, usd } from "./copy";
import { RLabel, TABULAR } from "./kit";

/**
 * Rider v2 Jobs-board parts (`packages/design/handoff/rider-v2/design/rv-board.jsx`, ledger D-54):
 * the PARCEL / FOOD tag, a stop line, the board JobCard (and its offer variant), the board map with
 * job pins + busy zones + "You", the route strip, the Gate blocking state and the ink toast.
 */

const HARARE: Region = { latitude: -17.8292, longitude: 31.0522, latitudeDelta: 0.06, longitudeDelta: 0.06 };
type Pt = { lat: number; lng: number };
const ll = (p: Pt): LatLng => ({ latitude: p.lat, longitude: p.lng });

/** 20px tag, radius 6, 11/700, .04em: PARCEL accent-wash / accent-text; FOOD surface + line / ink. */
export type JobKind = "parcel" | "food" | "shop" | "pharmacy";

/**
 * The job tag: PARCEL (accent wash) · FOOD (surface + line) as Rider v2 draws them; SHOP and PHARMACY on
 * their service tiles (Order flow v2 RD1a/RD1b, ledger D-59: #DDD5FF / #C5E9DF, ink text, no border).
 * SHOP also tags a business's booking on the board (owner 2026-10-01), so it wears the drawn shop tile.
 */
export function JTag({ food, kind }: { food?: boolean; kind?: JobKind }): React.ReactElement {
  const k: JobKind = kind ?? (food ? "food" : "parcel");
  const bg = k === "food" ? tokens.color.surface : k === "shop" ? tokens.color.tileShops : k === "pharmacy" ? tokens.color.tilePharmacy : tokens.color.accentWash;
  const fg = k === "parcel" ? tokens.color.accentText : tokens.color.ink;
  const label = k === "food" ? R.food : k === "shop" ? R.shop : k === "pharmacy" ? R.pharmacy : R.parcel;
  return (
    <View
      style={{
        height: 20,
        justifyContent: "center",
        paddingHorizontal: 7,
        borderRadius: 6,
        backgroundColor: bg,
        borderWidth: k === "food" ? 1 : 0,
        borderColor: tokens.color.line,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, letterSpacing: 0.44, color: fg }}>{label}</Text>
    </View>
  );
}

export function StopLine({ drop, name, size = 14 }: { drop?: boolean; name: string; size?: number }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 }}>
      {drop ? <Sq size={10} /> : <Dot size={10} />}
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: size, lineHeight: 20, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
        {name}
      </Text>
    </View>
  );
}

export interface BoardJob {
  id: string;
  pickup: Pt & { landmark: string };
  dropoff: Pt & { landmark: string };
  toPickupKm: number | null;
  tripKm: number | null;
  item: string;
  asking: number;
  /** Which board tag the card wears; parcel when absent. */
  kind?: JobKind;
}

/** The board card: tag · "0.8 km to pickup" · fare + "asking"; stops; meta; one "Make an offer". */
export const BoardJobCard = React.memo(function BoardJobCard({
  job,
  selected,
  onSelect,
  onOffer,
  offer,
  onWithdraw,
}: {
  job: BoardJob;
  selected?: boolean;
  onSelect?: () => void;
  onOffer?: () => void;
  /** Offer variant: the rider's own fare, a waiting spinner and Withdraw. */
  offer?: { fare: number };
  onWithdraw?: () => void;
}): React.ReactElement {
  // BD-L1: the card is one accessible element, so its buttons ride along as named actions (a screen reader
  // can't reach a button nested in a grouped card), and "selected" is announced, not shown by colour alone.
  const offerLabel = job.kind === "food" ? R.accept : R.makeOffer;
  const actions = [...(!offer && onOffer ? [{ name: "offer", label: offerLabel }] : []), ...(offer && onWithdraw ? [{ name: "withdraw", label: R.withdraw }] : [])];
  const a11y = {
    accessible: true,
    accessibilityState: { selected: !!selected },
    accessibilityActions: actions,
    onAccessibilityAction: (e: AccessibilityActionEvent): void => {
      if (e.nativeEvent.actionName === "offer") onOffer?.();
      else if (e.nativeEvent.actionName === "withdraw") onWithdraw?.();
      else if (e.nativeEvent.actionName === "activate") onSelect?.();
    },
    accessibilityLabel: `${job.kind === "food" ? R.food : job.kind === "shop" ? R.shop : job.kind === "pharmacy" ? R.pharmacy : R.parcel}, ${job.pickup.landmark} to ${job.dropoff.landmark}, ${usd(offer ? offer.fare : job.asking)}`,
  };
  const style: ViewStyle = {
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? tokens.color.accentText : tokens.color.line,
    borderRadius: 12,
    padding: selected ? 11 : 12,
    gap: 8,
    backgroundColor: tokens.color.bg,
  };
  const content = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <JTag kind={job.kind} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, ...TABULAR }} numberOfLines={1}>
          {job.toPickupKm != null ? `${km(job.toPickupKm)} ` : ""}
          {job.toPickupKm != null ? <Text style={{ color: tokens.color.muted, fontWeight: tokens.font.weight.regular }}>{R.toPickup}</Text> : null}
        </Text>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 20, lineHeight: 24, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{usd(offer ? offer.fare : job.asking)}</Text>
          <Text style={{ fontSize: 11, lineHeight: 14, color: tokens.color.muted }}>{offer ? R.offerSent.toLowerCase() : job.kind === "food" ? R.foodFare.toLowerCase() : R.asking}</Text>
        </View>
      </View>
      <View style={{ gap: 4 }}>
        <StopLine name={job.pickup.landmark} />
        <StopLine drop name={job.dropoff.landmark} />
      </View>
      <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted, ...TABULAR }} numberOfLines={1}>
        {job.tripKm != null ? `${km(job.tripKm)} ${R.trip} · ${job.item}` : job.item}
      </Text>
      {offer ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <ActivityIndicator size={14} color={tokens.color.accentText} />
            <Text style={{ flex: 1, fontSize: 13, color: tokens.color.ink }}>{R.waitingCustomer}</Text>
          </View>
          {onWithdraw ? <SmBtn label={R.withdraw} icon="x" onPress={onWithdraw} /> : null}
        </View>
      ) : onOffer ? (
        <View style={{ flexDirection: "row" }}>
          <SmBtn kind="fill" flex={1} label={offerLabel} onPress={onOffer} />
        </View>
      ) : null}

    </>
  );
  // The offer variant isn't selectable: a plain view, so it neither dims on touch nor reads as disabled
  // while its Withdraw is live.
  return onSelect ? (
    <Tappable onPress={onSelect} {...a11y} style={style}>
      {content}
    </Tappable>
  ) : (
    <View {...a11y} style={style}>
      {content}
    </View>
  );
});

/** A job pin: 20px accent dot (24 + accent-text ring when selected) + a fare pill (ink when selected). */
function JobPin({ fare, selected }: { fare: number; selected: boolean }): React.ReactElement {
  const s = selected ? 24 : 20;
  return (
    <View style={{ alignItems: "center", gap: 3, padding: 4 }}>
      <View
        style={{
          width: s + (selected ? 6 : 0),
          height: s + (selected ? 6 : 0),
          borderRadius: (s + 6) / 2,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? tokens.color.accentText : "transparent",
        }}
      >
        <View style={{ width: s, height: s, borderRadius: s / 2, backgroundColor: tokens.color.accent, borderWidth: 3, borderColor: tokens.color.bg, ...tokens.shadow.card }} />
      </View>
      <View style={{ backgroundColor: selected ? tokens.color.ink : tokens.color.bg, borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 2, ...tokens.shadow.card }}>
        <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.bold, color: selected ? tokens.color.onAccent : tokens.color.ink, ...TABULAR }}>{usd(fare)}</Text>
      </View>
    </View>
  );
}

/** The rider's own position: 34px ink disc + white bike + "You" pill. */
export function YouMarkerView({ label = R.you }: { label?: string }): React.ReactElement {
  return (
    <View style={{ alignItems: "center", gap: 3, padding: 4 }}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.ink, borderWidth: 3, borderColor: tokens.color.bg, alignItems: "center", justifyContent: "center", ...tokens.shadow.menu }}>
        <Icon name="bike" size={17} color={tokens.color.onAccent} />
      </View>
      <View style={{ backgroundColor: tokens.color.ink, borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent }}>{label}</Text>
      </View>
    </View>
  );
}

export interface DemandZoneView {
  lat: number;
  lng: number;
  radiusM: number;
  busiest: boolean;
}

/** The board map: busy zones (dashed accent circle, 16% fill), job pins in sync with the cards, "You". */
export const BoardMap = React.memo(function BoardMap({
  jobs,
  selectedId,
  onSelect,
  you,
  zones,
  padBottom,
}: {
  jobs: readonly BoardJob[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  you: Pt | null;
  zones: readonly DemandZoneView[];
  padBottom: number;
}): React.ReactElement {
  const mapRef = useRef<MapView>(null);
  const fitKey = `${jobs.map((j) => j.id).join(",")}|${you ? `${you.lat.toFixed(3)},${you.lng.toFixed(3)}` : ""}|${Math.round(padBottom)}`;
  useEffect(() => {
    const pts: LatLng[] = jobs.map((j) => ll(j.pickup));
    if (you) pts.push(ll(you));
    if (pts.length === 0) return;
    if (pts.length === 1) {
      mapRef.current?.animateToRegion({ ...pts[0]!, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 250);
      return;
    }
    mapRef.current?.fitToCoordinates(pts, { edgePadding: { top: 48, right: 48, bottom: padBottom + 24, left: 48 }, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fitKey is the deliberate trigger.
  }, [fitKey]);
  const zoneFill = useMemo(() => `${tokens.color.accent}29`, []);
  return (
    <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={you ? { latitude: you.lat, longitude: you.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 } : HARARE} toolbarEnabled={false} showsCompass={false}>
        {zones.map((z, i) => (
          <Circle key={`z${i}`} center={ll(z)} radius={z.radiusM} fillColor={zoneFill} strokeColor={tokens.color.accent} strokeWidth={1.5} lineDashPattern={[6, 4]} />
        ))}
        {zones
          .filter((z) => z.busiest)
          .map((z, i) => (
            <Marker key={`zl${i}`} coordinate={ll(z)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
              <View style={{ backgroundColor: tokens.color.accentText, borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent }}>{R.busy}</Text>
              </View>
            </Marker>
          ))}
        {jobs.map((j) => (
          <Marker
            key={`${j.id}-${j.id === selectedId ? "s" : "n"}`}
            coordinate={ll(j.pickup)}
            anchor={{ x: 0.5, y: 0.2 }}
            tracksViewChanges={false}
            zIndex={j.id === selectedId ? 5 : 4}
            onPress={() => onSelect(j.id)}
          >
            <JobPin fare={j.asking} selected={j.id === selectedId} />
          </Marker>
        ))}
        {you ? (
          <Marker coordinate={ll(you)} anchor={{ x: 0.5, y: 0.3 }} tracksViewChanges={false} zIndex={6}>
            <YouMarkerView />
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
});

/** The offer screen's route strip: 64×56 mini map, both stops 13/600, "0.8 km to pickup · 3.1 km trip". No Edit. */
export function RRoute({ job }: { job: BoardJob }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center", borderWidth: 1, borderColor: tokens.color.line, borderRadius: 12, padding: 6 }}>
      <View style={{ width: 64, height: 56, borderRadius: 8, overflow: "hidden" }} pointerEvents="none">
        <MapView
          style={{ flex: 1 }}
          liteMode
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          initialRegion={{
            latitude: (job.pickup.lat + job.dropoff.lat) / 2,
            longitude: (job.pickup.lng + job.dropoff.lng) / 2,
            latitudeDelta: Math.max(0.01, Math.abs(job.pickup.lat - job.dropoff.lat) * 1.8),
            longitudeDelta: Math.max(0.01, Math.abs(job.pickup.lng - job.dropoff.lng) * 1.8),
          }}
        >
          <Polyline coordinates={[ll(job.pickup), ll(job.dropoff)]} strokeColor={tokens.color.accent} strokeWidth={3} />
        </MapView>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <StopLine name={job.pickup.landmark} size={13} />
        <StopLine drop name={job.dropoff.landmark} size={13} />
        {job.toPickupKm != null && job.tripKm != null ? (
          <Text style={{ fontSize: 12, color: tokens.color.muted, ...TABULAR }}>{RF.pickupTrip(job.toPickupKm, job.tripKm)}</Text>
        ) : null}
      </View>
    </View>
  );
}

/** The ink toast: icon + 13/18 white text, optional 44px action (accent-wash / accent-text). */
export function RToast({ text, icon = "circle-alert", action, actionIcon = "undo-2", onAction }: { text: string; icon?: IconName; action?: string; actionIcon?: IconName; onAction?: () => void }): React.ReactElement {
  // Owner 2026-10-06 (D-82): the app-wide bottom toast's look.
  return <FirstRunToast text={text} icon={icon} action={action} actionIcon={actionIcon} onAction={onAction} assertive />;
}

export interface GateAction {
  label: string;
  icon?: IconName;
  onPress: () => void;
  loading?: boolean;
}

/**
 * The blocking state (G1–G14): a 72px disc, 22/700 title, 15/22 body, an optional facts box (label 13 +
 * value 15/700, right-aligned; danger = danger-wash + danger-ink), then a CTA bar with the primary, the
 * ghost and the "⇄ Order food and send parcels" bridge. On the Jobs tab the CTA bar is the tab bar v1 dock
 * (CTA → 12 → floating bar → 12 + inset); with no CTA the body clears the bar's reserve itself.
 */
export function Gate({
  icon,
  tone,
  title,
  body,
  facts,
  factsDanger,
  primary,
  ghost,
  bridge,
}: {
  icon: IconName;
  tone: "calm" | "ok" | "danger";
  title: string;
  body: string;
  facts?: readonly [string, string][] | null;
  factsDanger?: boolean;
  primary?: GateAction | null;
  ghost?: GateAction | null;
  bridge?: (() => void) | null;
}): React.ReactElement {
  const hasBar = !!(primary || ghost || bridge);
  const tabSpace = useTabBarSpace();
  return (
    <View style={{ flex: 1 }}>
      {/* Scrollable body: under the mint top card, above up to three CTAs and the tab bar reserve, a 320×640
          phone (or a large font scale) has no room for disc + title + body + facts — a plain centred View
          clipped them with no way to scroll. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24, paddingTop: 16, paddingBottom: hasBar ? 16 : tabSpace + 16 }}
        showsVerticalScrollIndicator={false}
      >
        <IconDisc name={icon} tone={tone} size={72} />
        <Text accessibilityRole="header" style={{ fontSize: 22, lineHeight: 28, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, textAlign: "center" }}>
          {title}
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 22, color: tokens.color.muted, textAlign: "center" }}>{body}</Text>
        {facts && facts.length ? (
          <View style={{ alignSelf: "stretch", backgroundColor: factsDanger ? tokens.color.dangerWash : tokens.color.surface, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 14 }}>
            {facts.map(([k, v], i) => (
              <View key={k} style={{ flexDirection: "row", alignItems: "baseline", gap: 12, paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: tokens.color.line }}>
                <Text style={{ fontSize: 13, color: factsDanger ? tokens.color.dangerInk : tokens.color.muted }}>{k}</Text>
                <Text style={{ flex: 1, textAlign: "right", fontSize: 15, fontWeight: tokens.font.weight.bold, color: factsDanger ? tokens.color.dangerInk : tokens.color.ink, ...TABULAR }}>{v}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
      {hasBar ? (
        <CtaBar dock={tabSpace}>
          {primary ? <CtaButton label={primary.label} icon={primary.icon} onPress={primary.onPress} loading={primary.loading} /> : null}
          {ghost ? <CtaButton ghost label={ghost.label} icon={ghost.icon} onPress={ghost.onPress} loading={ghost.loading} /> : null}
          {bridge ? <CtaButton ghost label={R.customerBridge} icon="arrow-left-right" onPress={bridge} /> : null}
        </CtaBar>
      ) : null}
    </View>
  );
}

export { RLabel };
