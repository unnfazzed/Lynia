import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Icon } from "../Icon";
import { Notice } from "../send/kit";
import { CentredHead, CodeBig, CodeCard, GMapsRow, LabelBox, OfferCard, type OfferView, PickupPhotoRow, PriceBox, Receipt, type ReceiptView, RiderCard, type RiderView, SuccessNote } from "./cards";
import { ORDER_COPY as A, orderText, usd } from "./copy";
import { Countdown, CtaBar, CtaButton, Divider, H2, IconDisc, MiniStars, Muted, RiderAvatar, Row, SkeletonOffer, SmBtn, Stars, StepTrack, StopLine, Tags, TABULAR, TextLink, WindowProgress } from "./kit";

/**
 * The order screen's sheet content and CTA bar per stage — one small component per stage of the
 * After Send handoff (`as-screens.jsx`, ledger D-53). Pure views: the screen resolves the stage and
 * hands each one its view model and callbacks.
 */

/* ───────────────────────── finding · no riders · price raised (1 · 1b · 2 · 5) ───────────────────────── */

export function FindingSheet(p: {
  noRiders: boolean;
  expiresAt: string | null;
  windowMs: number;
  frozen: boolean;
  onZero: () => void;
  ridersNearby: number | null;
  price: number;
  was: number | null;
  raisedNote: boolean;
  onRaise: () => void;
  raising: boolean;
  notify: { onPress: () => void; loading: boolean; state: "idle" | "queued" | "unavailable" };
}): React.ReactElement {
  return (
    <>
      <Row align="flex-start" style={{ justifyContent: "space-between" }}>
        <H2 style={{ flex: 1 }}>{A.finding}</H2>
        <Countdown expiresAt={p.expiresAt} frozen={p.frozen} onZero={p.onZero} />
      </Row>
      <WindowProgress expiresAt={p.expiresAt} windowMs={p.windowMs} />
      <Row gap={6}>
        <Icon name="bike" size={16} color={tokens.color.muted} />
        <Muted>{p.noRiders || !p.ridersNearby ? A.seen0 : orderText.seen(p.ridersNearby)}</Muted>
      </Row>
      <PriceBox price={p.price} was={p.raisedNote ? p.was : null} onRaise={p.noRiders ? undefined : p.onRaise} raising={p.raising} />
      {p.raisedNote ? <SuccessNote text={orderText.raised(p.price)} /> : null}
      {p.noRiders ? (
        <>
          <Notice icon="clock" lead={A.noOnline} text={A.noOnlineHint} />
          {p.notify.state === "idle" ? <TextLink label={A.notify} icon="bell" onPress={p.notify.onPress} loading={p.notify.loading} /> : null}
        </>
      ) : (
        <>
          <Muted>{A.offersHere}</Muted>
          <SkeletonOffer />
        </>
      )}
    </>
  );
}

/** Finding CTA: "Cancel request", or the inline confirm (1b) — no modal. */
export function FindingBar({ confirming, onAsk, onYes, onKeep, cancelling }: { confirming: boolean; onAsk: () => void; onYes: () => void; onKeep: () => void; cancelling: boolean }): React.ReactElement {
  return confirming ? (
    <CtaBar hint={A.cancelReqQ} row>
      <CtaButton ghost danger label={A.yesCancel} onPress={onYes} loading={cancelling} flex={1} />
      <CtaButton label={A.keepLooking} onPress={onKeep} disabled={cancelling} flex={1} />
    </CtaBar>
  ) : (
    <CtaBar>
      <CtaButton ghost label={A.cancelReq} icon="x" onPress={onAsk} />
    </CtaBar>
  );
}

/* ───────────────────────── offers (3 · 4) ───────────────────────── */

export function OffersSheet(p: {
  offers: OfferView[];
  bestId: string | null;
  expiresAt: string | null;
  frozen: boolean;
  onZero: () => void;
  price: number;
  onRaise: () => void;
  raising: boolean;
  raisedNote: boolean;
  choosingId: string | null;
  onChoose: (id: string) => void;
}): React.ReactElement {
  return (
    <>
      <Row style={{ justifyContent: "space-between" }}>
        <H2 style={{ flex: 1 }}>{orderText.offers(p.offers.length)}</H2>
        <Countdown expiresAt={p.expiresAt} frozen={p.frozen} onZero={p.onZero} />
      </Row>
      <Row style={{ marginTop: -4 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text>
            <Text style={{ fontSize: 13, color: tokens.color.muted }}>Your price </Text>
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{usd(p.price)}</Text>
          </Text>
          <Muted size={12}>{A.cash}</Muted>
        </View>
        <SmBtn label={A.plus} onPress={p.onRaise} loading={p.raising} accessibilityLabel="Raise your price by 50 cents" />
      </Row>
      {p.raisedNote ? <SuccessNote text={orderText.raised(p.price)} /> : null}
      {p.offers.map((o) => (
        <OfferCard key={o.id} offer={o} best={o.id === p.bestId} onChoose={() => p.onChoose(o.id)} choosing={p.choosingId === o.id} disabled={p.choosingId != null} />
      ))}
      <Muted size={12}>{A.bestWhy}</Muted>
    </>
  );
}

/* ───────────────────────── tracking (6 · 7 · 9 · 19) and hand-off (8) ───────────────────────── */

export interface TrackVM {
  status: string;
  toPickup: boolean;
  etaMinutes: number | null;
  stopName: string;
  step: number;
  gpsPaused: boolean;
  offline: boolean;
  rider: RiderView | null;
  code: string | null;
  photo: { url: string; sub: string } | null;
  canCall: boolean;
  canWhatsApp: boolean;
}

export interface TrackActions {
  onCall: () => void;
  onWhatsApp: () => void;
  onShareCode: () => void;
  onMaps: () => void;
  onViewPhoto: () => void;
  onCancel: () => void;
}

function riderCard(vm: TrackVM, a: TrackActions): React.ReactElement | null {
  return vm.rider ? <RiderCard rider={vm.rider} onCall={vm.canCall ? a.onCall : undefined} onWhatsApp={vm.canWhatsApp ? a.onWhatsApp : undefined} /> : null;
}

export function TrackSheet({ vm, a, screenWidth }: { vm: TrackVM; a: TrackActions; screenWidth: number }): React.ReactElement {
  const headline = vm.etaMinutes != null ? (vm.toPickup ? orderText.etaPickup(vm.etaMinutes) : orderText.etaDrop(vm.etaMinutes)) : vm.toPickup ? A.stMatched : A.stOnWay;
  return (
    <>
      {vm.gpsPaused && !vm.offline ? <Notice tone="warn" icon="triangle-alert" text={A.gpsPaused} /> : null}
      <View>
        <H2>{headline}</H2>
        <View style={{ marginTop: 4 }}>
          <StopLine drop={!vm.toPickup} name={vm.stopName} />
        </View>
      </View>
      <StepTrack current={vm.step} />
      {!vm.toPickup && vm.photo ? <PickupPhotoRow url={vm.photo.url} sub={vm.photo.sub} onView={a.onViewPhoto} /> : null}
      {riderCard(vm, a)}
      {vm.code ? <CodeCard code={vm.code} offline={vm.offline} onShare={a.onShareCode} screenWidth={screenWidth} /> : null}
      <GMapsRow onPress={a.onMaps} />
      <TextLink label={vm.toPickup ? A.cancelFree : A.cancelOrder} icon="x" color={tokens.color.muted} center onPress={a.onCancel} />
    </>
  );
}

export function HandoffSheet({ vm, a, riderFirst, screenWidth }: { vm: TrackVM; a: TrackActions; riderFirst: string; screenWidth: number }): React.ReactElement {
  return (
    <>
      {vm.gpsPaused && !vm.offline ? <Notice tone="warn" icon="triangle-alert" text={A.gpsPaused} /> : null}
      <View>
        <H2>{orderText.atDrop(riderFirst)}</H2>
        <View style={{ marginTop: 4 }}>
          <StopLine drop name={vm.stopName} />
        </View>
      </View>
      <StepTrack current={vm.step} />
      {vm.code ? <CodeBig code={vm.code} screenWidth={screenWidth} /> : null}
      {riderCard(vm, a)}
    </>
  );
}

/* ───────────────────────── cancel (10a · 10b) ───────────────────────── */

const CANCEL_REASONS = [A.r1, A.r2, A.r3, A.r4] as const;

export function CancelSheet({ afterPickup, riderFirst, reason, onReason }: { afterPickup: boolean; riderFirst: string; reason: number | null; onReason: (i: number) => void }): React.ReactElement {
  return (
    <>
      <H2>{A.cancelQ}</H2>
      {afterPickup ? (
        <Notice tone="warn" icon="triangle-alert" text={orderText.cancelWarn(riderFirst)} />
      ) : (
        <Row gap={8}>
          <Icon name="circle-check" size={18} color={tokens.color.accentText} />
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: tokens.color.ink }}>{orderText.cancelFreeBody(riderFirst)}</Text>
        </Row>
      )}
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{A.reason}</Text>
      <Tags list={CANCEL_REASONS} on={reason == null ? [] : [reason]} onToggle={(i) => onReason(i)} />
    </>
  );
}

export function cancelReasonText(i: number | null): string | undefined {
  return i == null ? undefined : CANCEL_REASONS[i];
}

export function CancelBar({ afterPickup, onKeep, onCancel, cancelling }: { afterPickup: boolean; onKeep: () => void; onCancel: () => void; cancelling: boolean }): React.ReactElement {
  return (
    <CtaBar>
      <CtaButton label={A.keep} onPress={onKeep} disabled={cancelling} />
      <CtaButton ghost danger label={afterPickup ? A.cancelAnyway : A.cancelYes} onPress={onCancel} loading={cancelling} />
    </CtaBar>
  );
}

/* ───────────────────────── retry (12 · 13) ───────────────────────── */

export function RetrySheet({ riderCancelled, lastPrice, suggested }: { riderCancelled: boolean; lastPrice: number; suggested: number }): React.ReactElement {
  return (
    <>
      <CentredHead
        icon={<IconDisc name={riderCancelled ? "bike" : "clock"} />}
        title={riderCancelled ? A.riderCx : orderText.noTook(lastPrice)}
        sub={riderCancelled ? A.riderCxSub : A.noTookSub}
      />
      <LabelBox label={A.suggested} value={usd(suggested)} big note={A.sugNote} />
      <Row gap={6} style={{ justifyContent: "center" }}>
        <Icon name="check" size={15} color={tokens.color.accentText} />
        <Muted>{A.kept}</Muted>
      </Row>
    </>
  );
}

export function RetryBar({ suggested, onSend, onEdit, sending }: { suggested: number; onSend: () => void; onEdit: () => void; sending: boolean }): React.ReactElement {
  return (
    <CtaBar>
      <CtaButton label={orderText.sendAgainAt(suggested)} icon="refresh-cw" onPress={onSend} loading={sending} />
      <CtaButton ghost label={A.editOrder} icon="pencil" onPress={onEdit} disabled={sending} />
    </CtaBar>
  );
}

/* ───────────────────────── delivered · rated · completed (14a · 14b · 15 · 16) ───────────────────────── */

export function RateSheet(p: {
  deliveredSub: string;
  riderFirst: string;
  riderPhoto: string | null;
  riderInitials: string;
  stars: number;
  onStars: (n: number) => void;
  tags: number[];
  onTag: (i: number) => void;
  receipt: ReceiptView;
  onShareReceipt: () => void;
}): React.ReactElement {
  const low = p.stars > 0 && p.stars <= 2;
  return (
    <>
      <Row gap={12}>
        <IconDisc name="circle-check" tone="ok" size={40} />
        <View style={{ flex: 1 }}>
          <H2>{A.delivered}</H2>
          <Muted>{p.deliveredSub}</Muted>
        </View>
      </Row>
      <Divider />
      <Row>
        <RiderAvatar photoUrl={p.riderPhoto} initials={p.riderPhoto ? null : p.riderInitials} size={36} />
        <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{orderText.rateQ(p.riderFirst)}</Text>
      </Row>
      <View style={{ marginTop: -6, marginBottom: -4, marginLeft: -6 }}>
        <Stars value={p.stars} onChange={p.onStars} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
        {low ? A.whatWrong : A.whatWell} <Text style={{ color: tokens.color.muted, fontWeight: tokens.font.weight.regular }}>· {A.optional}</Text>
      </Text>
      <Tags list={low ? A.tn : A.tg} on={p.tags} onToggle={p.onTag} />
      <Receipt r={p.receipt} onShare={p.onShareReceipt} />
    </>
  );
}

export function RateBar({ onSkip, onSubmit, canSubmit }: { onSkip: () => void; onSubmit: () => void; canSubmit: boolean }): React.ReactElement {
  return (
    <CtaBar row>
      <CtaButton ghost label={A.skip} onPress={onSkip} flex={1} />
      <CtaButton label={A.submit} onPress={onSubmit} disabled={!canSubmit} flex={2} />
    </CtaBar>
  );
}

function RatedLine({ name, stars }: { name: string; stars: number }): React.ReactElement {
  return (
    <Row gap={6}>
      <Muted>{orderText.youRated(name)}</Muted>
      <MiniStars value={stars} />
    </Row>
  );
}

/** State 15 (and Skip): "Parcel delivered" with the rated line, then the receipt. */
export function RatedSheet({ riderFirst, stars, receipt, onShareReceipt }: { riderFirst: string; stars: number | null; receipt: ReceiptView; onShareReceipt: () => void }): React.ReactElement {
  return (
    <>
      <Row gap={12}>
        <IconDisc name="circle-check" tone="ok" size={40} />
        <View style={{ flex: 1 }}>
          <H2>{A.delivered}</H2>
          {stars ? <RatedLine name={riderFirst} stars={stars} /> : null}
        </View>
      </Row>
      <Receipt r={receipt} onShare={onShareReceipt} />
    </>
  );
}

export function CompletedSheet(p: { deliveredAt: string | null; riderFirst: string; stars: number | null; receipt: ReceiptView; onShareReceipt: () => void; onHelp: () => void }): React.ReactElement {
  return (
    <>
      <View>
        <H2>{orderText.deliveredOn(p.deliveredAt)}</H2>
        {p.stars ? <RatedLine name={p.riderFirst} stars={p.stars} /> : null}
      </View>
      <Receipt r={p.receipt} onShare={p.onShareReceipt} />
      <TextLink label={A.getHelp} icon="life-buoy" center onPress={p.onHelp} />
    </>
  );
}

export function OneButtonBar({ label, icon, onPress, loading }: { label: string; icon?: "refresh-cw" | "share-2"; onPress: () => void; loading?: boolean }): React.ReactElement {
  return (
    <CtaBar>
      <CtaButton label={label} icon={icon} onPress={onPress} loading={loading} />
    </CtaBar>
  );
}

/* ───────────────────────── not delivered (17) ───────────────────────── */

export function NotDeliveredSheet({ riderFirst, reason, rider }: { riderFirst: string; reason: string; rider: RiderView | null }): React.ReactElement {
  return (
    <>
      <Row gap={12}>
        <IconDisc name="circle-alert" tone="danger" size={40} />
        <H2 style={{ flex: 1 }}>{orderText.notDel(riderFirst)}</H2>
      </Row>
      <LabelBox label={A.notDelReason} value={reason} />
      <Muted size={14}>{orderText.notDelBody(riderFirst)}</Muted>
      {rider ? <RiderCard rider={rider} buttons={false} /> : null}
    </>
  );
}

export function TwoButtonBar(p: {
  primary: { label: string; icon?: "phone" | "refresh-cw"; onPress: () => void; loading?: boolean };
  secondary: { label: string; icon?: "phone" | "refresh-cw" | "pencil"; onPress: () => void; loading?: boolean };
}): React.ReactElement {
  return (
    <CtaBar>
      <CtaButton label={p.primary.label} icon={p.primary.icon} onPress={p.primary.onPress} loading={p.primary.loading} />
      <CtaButton ghost label={p.secondary.label} icon={p.secondary.icon} onPress={p.secondary.onPress} loading={p.secondary.loading} />
    </CtaBar>
  );
}

/* ───────────────────────── cancelled (18a · 18b · 18c) ───────────────────────── */

export function CancelledSheet({ headline, reason, nothingOwed }: { headline: string; reason: string | null; nothingOwed: boolean }): React.ReactElement {
  return (
    <>
      <CentredHead
        icon={<IconDisc name="ban" />}
        title={headline}
        sub={
          reason ? (
            <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.color.muted, textAlign: "center" }}>
              <Text style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{A.reasonP}:</Text> {reason}
            </Text>
          ) : null
        }
      />
      {nothingOwed ? (
        <Row gap={6} style={{ justifyContent: "center" }}>
          <Icon name="banknote" size={15} color={tokens.color.muted} />
          <Muted>{A.nothingOwed}</Muted>
        </Row>
      ) : null}
    </>
  );
}
