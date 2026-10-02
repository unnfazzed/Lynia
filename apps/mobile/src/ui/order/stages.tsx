import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Icon } from "../Icon";
import { Notice } from "../send/kit";
import { CentredHead, CodeBig, CodeCard, GMapsRow, LabelBox, OfferCard, type OfferView, PickupPhotoRow, PriceBox, Receipt, type ReceiptView, RiderCard, type RiderView } from "./cards";
import { clock, ORDER_COPY as A, orderText, usd } from "./copy";
import { Countdown, CtaBar, CtaButton, Divider, H2, IconDisc, MiniStars, Muted, OkNote, RiderAvatar, Row, SkeletonOffer, SmBtn, Stars, StepTrack, StopLine, Tags, TABULAR, TextLink, WindowProgress } from "./kit";
import { PeekMark } from "./OrderSheet";

/**
 * The order screen's sheet content and CTA bar per stage — one small component per stage of the
 * After Send handoff (`as-screens.jsx` + `as-v2.jsx`, ledger D-53 and its v2 round). Pure views: the
 * screen resolves the stage and hands each one its view model and callbacks. Each stage puts a
 * `<PeekMark/>` after the block that must be fully visible at peek (v2 §1.3).
 */

/* ───────────────────────── finding · no riders · price raised (1 · 1b · 2 · 5 · 2.5–2.8) ───────────────────────── */

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
      <PeekMark />
      {p.raisedNote ? <OkNote text={orderText.raised(p.price)} /> : null}
      {p.noRiders ? (
        <>
          <Notice icon="clock" lead={A.noOnline} text={A.noOnlineHint} />
          {p.notify.state === "queued" ? (
            <Row gap={8} style={{ minHeight: tokens.touchTargetMin }}>
              <Icon name="circle-check" size={16} color={tokens.color.accentText} />
              <Text accessibilityLiveRegion="polite" style={{ flex: 1, fontSize: 14, lineHeight: 20, color: tokens.color.ink }}>
                {A.notifyOn}
              </Text>
            </Row>
          ) : p.notify.state === "unavailable" ? (
            <Row gap={8} align="flex-start" style={{ minHeight: tokens.touchTargetMin }}>
              <Icon name="circle-alert" size={16} color={tokens.color.muted} />
              <Muted size={14} style={{ flex: 1 }}>
                {A.notifyFail}
              </Muted>
            </Row>
          ) : (
            <TextLink label={A.notify} icon="bell" onPress={p.notify.onPress} loading={p.notify.loading} />
          )}
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

/** Finding CTA: "Cancel request", or the inline confirm (1b) — no modal. v2: busy states (2.22). */
export function FindingBar({
  confirming,
  onAsk,
  onYes,
  onKeep,
  cancelling,
  disabled,
}: {
  confirming: boolean;
  onAsk: () => void;
  onYes: () => void;
  onKeep: () => void;
  cancelling: boolean;
  /** A Choose is in flight (2.9). */
  disabled?: boolean;
}): React.ReactElement {
  return confirming ? (
    <CtaBar hint={A.cancelReqQ} row>
      <CtaButton ghost danger label={A.yesCancel} onPress={onYes} loading={cancelling} flex={1} />
      <CtaButton label={A.keepLooking} onPress={onKeep} disabled={cancelling} flex={1} />
    </CtaBar>
  ) : (
    <CtaBar>
      <CtaButton ghost label={A.cancelReq} icon="x" onPress={onAsk} disabled={disabled} />
    </CtaBar>
  );
}

/* ───────────────────────── offers (3 · 4 · 2.7 · 2.9 · 2.10) ───────────────────────── */

export function OffersSheet(p: {
  offers: OfferView[];
  bestId: string | null;
  expiresAt: string | null;
  frozen: boolean;
  onZero: () => void;
  price: number;
  was: number | null;
  onRaise: () => void;
  raising: boolean;
  raisedNote: boolean;
  choosingId: string | null;
  /** The confirming line under the card being chosen (2.9). */
  confirming: string | null;
  onChoose: (id: string) => void;
  /** Ms left in the 15 s choose grace after the window (2.10), else null. */
  graceLeftMs: number | null;
}): React.ReactElement {
  const busy = p.choosingId != null;
  const late = p.graceLeftMs != null;
  return (
    <>
      <Row style={{ justifyContent: "space-between" }}>
        <H2 style={{ flex: 1 }}>{orderText.offers(p.offers.length)}</H2>
        {late ? (
          <View style={{ height: 28, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.ink }}>
            <Icon name="timer" size={14} color={tokens.color.onAccent} />
            <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent, ...TABULAR }}>
              {A.chooseIn} {clock(p.graceLeftMs ?? 0)}
            </Text>
          </View>
        ) : (
          <Countdown expiresAt={p.expiresAt} frozen={p.frozen} onZero={p.onZero} />
        )}
      </Row>
      {late ? (
        <Notice icon="clock" text={A.timeUp} />
      ) : (
        <Row style={{ marginTop: -4 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text>
              <Text style={{ fontSize: 13, color: tokens.color.muted }}>{A.yourPriceTag} </Text>
              <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{usd(p.price)}</Text>
              {p.raisedNote && p.was != null ? <Text style={{ fontSize: 13, color: tokens.color.muted, textDecorationLine: "line-through", ...TABULAR }}> {orderText.was(p.was)}</Text> : null}
            </Text>
            <Muted size={12}>{A.cash}</Muted>
          </View>
          <SmBtn label={A.plus} onPress={p.onRaise} loading={p.raising} disabled={busy} accessibilityLabel="Raise your price by 50 cents" />
        </Row>
      )}
      {p.raisedNote && !late ? <OkNote text={orderText.raised(p.price)} style={{ marginTop: -4 }} /> : null}
      {p.offers.map((o, i) => (
        <React.Fragment key={o.id}>
          <OfferCard
            offer={o}
            best={o.id === p.bestId}
            onChoose={() => p.onChoose(o.id)}
            choosing={p.choosingId === o.id}
            disabled={busy && p.choosingId !== o.id}
            confirming={p.choosingId === o.id ? p.confirming : null}
          />
          {i === 0 ? <PeekMark /> : null}
        </React.Fragment>
      ))}
      <Muted size={12}>{A.bestWhy}</Muted>
    </>
  );
}

/* ───────────────────────── rider cancelled, order reopened (13, v2 2.20) ───────────────────────── */

export function ReopenedSheet(p: { riderFirst: string; price: number; next: number; expiresAt: string | null; windowMs: number; frozen: boolean; onZero: () => void }): React.ReactElement {
  return (
    <>
      <Row gap={12}>
        <IconDisc name="bike" size={40} />
        <View style={{ flex: 1 }}>
          <H2>{orderText.riderCx(p.riderFirst)}</H2>
          <Muted>{orderText.riderCxSub(p.price)}</Muted>
        </View>
      </Row>
      <Divider />
      <Row style={{ justifyContent: "space-between" }}>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{A.stillFinding}</Text>
        <Countdown expiresAt={p.expiresAt} frozen={p.frozen} onZero={p.onZero} />
      </Row>
      <WindowProgress expiresAt={p.expiresAt} windowMs={p.windowMs} />
      <LabelBox label={A.yourPrice} value={usd(p.price)} big note={orderText.fasterAt(p.next)} />
      <PeekMark />
    </>
  );
}

export function ReopenedBar(p: { next: number; onRaise: () => void; raising: boolean; onCancel: () => void }): React.ReactElement {
  return (
    <CtaBar>
      <CtaButton label={orderText.raiseTo(p.next)} icon="plus" onPress={p.onRaise} loading={p.raising} />
      <CtaButton ghost label={A.cancelReq} icon="x" onPress={p.onCancel} disabled={p.raising} />
    </CtaBar>
  );
}

/* ───────────────────────── tracking (6 · 7 · 9 · 19 · 2.4 · 2.12–2.15 · 2.18) and hand-off (8) ───────────────────────── */

export interface TrackVM {
  status: string;
  toPickup: boolean;
  etaMinutes: number | null;
  stopName: string;
  step: number;
  gpsPaused: boolean;
  offline: boolean;
  /** No GPS fix yet (2.12). */
  noFix: boolean;
  /** A saved copy shown on an offline cold start (2.4): the "as of" time, else null. */
  savedAt: string | null;
  rider: RiderView | null;
  riderFirst: string;
  /** The code; null while it's being issued (2.14). */
  code: string | null;
  /** The customer sees the code card at all (never a rider viewer). */
  showCode: boolean;
  photo: { url: string; sub: string } | null;
  /** The rider's number has come through. */
  hasPhone: boolean;
  /** Emergency was used on this trip (2.18). */
  sosSent: boolean;
  emergencyNumber: string;
}

export interface TrackActions {
  onCall: () => void;
  onWhatsApp: () => void;
  onShareCode: () => void;
  onMaps: () => void;
  onViewPhoto: () => void;
  onCancel: () => void;
  onEmergency: () => void;
}

function riderCard(vm: TrackVM, a: TrackActions): React.ReactElement | null {
  return vm.rider ? <RiderCard rider={vm.rider} onCall={a.onCall} onWhatsApp={a.onWhatsApp} noPhone={!vm.hasPhone} /> : null;
}

export function TrackSheet({ vm, a }: { vm: TrackVM; a: TrackActions }): React.ReactElement {
  const head = vm.savedAt ? (
    <View>
      <H2>{A.tOnWay}</H2>
      <Row gap={6} style={{ marginTop: 4 }}>
        <Icon name="wifi-off" size={14} color={tokens.color.muted} />
        <Muted>{orderText.savedAt(vm.savedAt)}</Muted>
      </Row>
    </View>
  ) : vm.noFix ? (
    <View>
      <H2>{orderText.noFix(vm.riderFirst)}</H2>
      <Muted style={{ marginTop: 2 }}>{orderText.noFixSub(vm.riderFirst)}</Muted>
      <View style={{ marginTop: 4 }}>
        <StopLine name={vm.stopName} />
      </View>
    </View>
  ) : (
    <View>
      <H2>{vm.etaMinutes != null ? (vm.toPickup ? orderText.etaPickup(vm.etaMinutes) : orderText.etaDrop(vm.etaMinutes)) : vm.toPickup ? orderText.noFix(vm.riderFirst) : A.stOnWay}</H2>
      <View style={{ marginTop: 4 }}>
        <StopLine drop={!vm.toPickup} name={vm.stopName} />
      </View>
    </View>
  );
  return (
    <>
      {vm.sosSent ? <OkNote text={A.sosSent} /> : null}
      {vm.gpsPaused && !vm.offline && !vm.savedAt ? <Notice tone="warn" icon="triangle-alert" text={A.gpsPaused} /> : null}
      {head}
      <StepTrack current={vm.step} />
      <PeekMark />
      {!vm.toPickup && vm.photo ? <PickupPhotoRow url={vm.photo.url} sub={vm.photo.sub} onView={a.onViewPhoto} /> : null}
      {riderCard(vm, a)}
      {vm.showCode ? <CodeCard code={vm.code} offline={vm.offline || vm.savedAt != null} onShare={a.onShareCode} /> : null}
      {vm.sosSent ? <TextLink label={orderText.sosAgain(vm.emergencyNumber)} icon="phone" color={tokens.color.danger} center onPress={a.onEmergency} /> : <GMapsRow onPress={a.onMaps} />}
      {vm.savedAt ? null : <TextLink label={vm.toPickup ? A.cancelFree : A.cancelOrder} icon="x" color={tokens.color.muted} center onPress={a.onCancel} />}
    </>
  );
}

export function HandoffSheet({ vm, a, screenWidth }: { vm: TrackVM; a: TrackActions; screenWidth: number }): React.ReactElement {
  return (
    <>
      {vm.sosSent ? <OkNote text={A.sosSent} /> : null}
      {vm.gpsPaused && !vm.offline ? <Notice tone="warn" icon="triangle-alert" text={A.gpsPaused} /> : null}
      <View>
        <H2>{orderText.atDrop(vm.riderFirst)}</H2>
        <View style={{ marginTop: 4 }}>
          <StopLine drop name={vm.stopName} />
        </View>
      </View>
      <StepTrack current={vm.step} />
      {vm.showCode ? vm.code ? <CodeBig code={vm.code} screenWidth={screenWidth} /> : <CodeCard code={null} offline={vm.offline} onShare={a.onShareCode} /> : null}
      <PeekMark />
      {riderCard(vm, a)}
    </>
  );
}

/* ───────────────────────── cancel (10a · 10b · 2.22 · 2.23) ───────────────────────── */

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
      {/* None pre-selected; tapping the selected chip clears it (2.23). */}
      <Tags list={CANCEL_REASONS} on={reason == null ? [] : [reason]} onToggle={(i) => onReason(i)} />
      <PeekMark />
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

/* ───────────────────────── retry (12 · 2.21) ───────────────────────── */

/**
 * State 12. `riderFirst` set = the rare rider cancel with no re-broadcast to follow (an older server):
 * the same one-tap retry, with the rider-cancelled head.
 */
export function RetrySheet({ riderFirst, lastPrice, suggested }: { riderFirst: string | null; lastPrice: number; suggested: number }): React.ReactElement {
  return (
    <>
      <CentredHead
        icon={<IconDisc name={riderFirst ? "bike" : "clock"} />}
        title={riderFirst ? orderText.riderCx(riderFirst) : orderText.noTook(lastPrice)}
        sub={riderFirst ? orderText.fasterAt(suggested) : A.noTookSub}
      />
      <LabelBox label={A.suggested} value={usd(suggested)} big note={A.sugNote} />
      <PeekMark />
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

/* ───────────────────────── delivered · rated · completed (14a · 14b · 15 · 16 · 2.24–2.27) ───────────────────────── */

function RateBlock(p: { riderFirst: string; riderPhoto: string | null; riderInitials: string; stars: number; onStars: (n: number) => void; tags: number[]; onTag: (i: number) => void }): React.ReactElement {
  const low = p.stars > 0 && p.stars <= 2;
  return (
    <>
      <Row>
        <RiderAvatar photoUrl={p.riderPhoto} initials={p.riderPhoto ? null : p.riderInitials} size={36} />
        <Text style={{ flex: 1, fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{orderText.rateQ(p.riderFirst)}</Text>
      </Row>
      <View style={{ marginTop: -6, marginBottom: -4, marginLeft: -6 }}>
        <Stars value={p.stars} onChange={p.onStars} />
      </View>
      <PeekMark />
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
        {low ? A.whatWrong : A.whatWell} <Text style={{ color: tokens.color.muted, fontWeight: tokens.font.weight.regular }}>· {A.optional}</Text>
      </Text>
      <Tags list={low ? A.tn : A.tg} on={p.tags} onToggle={p.onTag} />
    </>
  );
}

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
      <RateBlock {...p} />
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

/** "You rated Tendai ★★★★ Good" — the stars always carry their word (v2). */
function RatedLine({ name, stars }: { name: string; stars: number }): React.ReactElement {
  return (
    <Row gap={6} style={{ flexWrap: "wrap" }}>
      <Muted>{orderText.youRated(name)}</Muted>
      <MiniStars value={stars} />
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{A.rl[stars]}</Text>
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
      <PeekMark />
      <Receipt r={receipt} onShare={onShareReceipt} />
    </>
  );
}

/** 16 / 2.26 — and 2.25: not rated yet (within 7 days), the "Rate Tendai" card; a star opens 14a's tags inline. */
export function CompletedSheet(p: {
  deliveredAt: string | null;
  riderFirst: string;
  stars: number | null;
  rateLater: null | { riderPhoto: string | null; riderInitials: string; stars: number; onStars: (n: number) => void; tags: number[]; onTag: (i: number) => void };
  receipt: ReceiptView;
  onShareReceipt: () => void;
  onHelp: () => void;
}): React.ReactElement {
  const r = p.rateLater;
  return (
    <>
      <View>
        <H2>{orderText.deliveredOn(p.deliveredAt)}</H2>
        {p.stars ? <RatedLine name={p.riderFirst} stars={p.stars} /> : null}
      </View>
      {r ? (
        <View style={{ borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.input, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 6, gap: 2 }}>
          <Row>
            <RiderAvatar photoUrl={r.riderPhoto} initials={r.riderPhoto ? null : r.riderInitials} size={36} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{orderText.rateLater(p.riderFirst)}</Text>
              <Muted size={12}>{orderText.rateLaterSub}</Muted>
            </View>
          </Row>
          <View style={{ marginLeft: -6 }}>
            <Stars value={r.stars} onChange={r.onStars} />
          </View>
          {r.stars ? (
            <View style={{ gap: 10, paddingBottom: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
                {r.stars <= 2 ? A.whatWrong : A.whatWell} <Text style={{ color: tokens.color.muted, fontWeight: tokens.font.weight.regular }}>· {A.optional}</Text>
              </Text>
              <Tags list={r.stars <= 2 ? A.tn : A.tg} on={r.tags} onToggle={r.onTag} />
            </View>
          ) : null}
        </View>
      ) : null}
      <Receipt r={p.receipt} onShare={p.onShareReceipt} />
      <TextLink label={A.getHelp} icon="life-buoy" center onPress={p.onHelp} />
    </>
  );
}

export function OneButtonBar({ label, icon, onPress, loading }: { label: string; icon?: "refresh-cw" | "share-2" | "home"; onPress: () => void; loading?: boolean }): React.ReactElement {
  return (
    <CtaBar>
      <CtaButton label={label} icon={icon === "home" ? undefined : icon} onPress={onPress} loading={loading} />
    </CtaBar>
  );
}

/* ───────────────────────── not delivered (17 · 2.29) ───────────────────────── */

export function NotDeliveredSheet({ riderFirst, reason, body, rider }: { riderFirst: string; reason: string; body: string; rider: RiderView | null }): React.ReactElement {
  return (
    <>
      <Row gap={12}>
        <IconDisc name="circle-alert" tone="danger" size={40} />
        <H2 style={{ flex: 1 }}>{orderText.notDel(riderFirst)}</H2>
      </Row>
      <LabelBox label={A.notDelReason} value={reason} />
      <PeekMark />
      <Muted size={14}>{body}</Muted>
      {rider ? <RiderCard rider={rider} buttons={false} /> : null}
    </>
  );
}

export function TwoButtonBar(p: {
  primary: { label: string; icon?: "phone" | "refresh-cw"; onPress: () => void; loading?: boolean };
  secondary: { label: string; icon?: "phone" | "refresh-cw" | "pencil"; onPress: () => void; loading?: boolean; disabled?: boolean };
}): React.ReactElement {
  return (
    <CtaBar>
      <CtaButton label={p.primary.label} icon={p.primary.icon} onPress={p.primary.onPress} loading={p.primary.loading} />
      <CtaButton ghost label={p.secondary.label} icon={p.secondary.icon} onPress={p.secondary.onPress} loading={p.secondary.loading} disabled={p.secondary.disabled} />
    </CtaBar>
  );
}

/* ───────────────────────── cancelled (18a · 18b · 18c · 2.30 · 2.31) ───────────────────────── */

/** "Nothing to pay." shows on EVERY cancel, LyniaGo's included: owner decision 2026-10-02 says it on the
 *  screen and in the push alike, though 18c / 2.31 leave it out (ledger D-53, 2.34 row). */
export function CancelledSheet({ headline, reason, extra }: { headline: string; reason: string | null; extra: string | null }): React.ReactElement {
  return (
    <>
      <View style={{ alignItems: "center", gap: 8, paddingTop: 4 }}>
        <IconDisc name="ban" />
        <H2 style={{ textAlign: "center" }}>{headline}</H2>
        {reason ? (
          <Text style={{ fontSize: 14, lineHeight: 20, color: tokens.color.muted, textAlign: "center" }}>
            <Text style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{A.reasonP}:</Text> {reason}
          </Text>
        ) : null}
        {extra ? (
          <Muted size={14} style={{ textAlign: "center" }}>
            {extra}
          </Muted>
        ) : null}
      </View>
      <PeekMark />
      <Row gap={6} style={{ justifyContent: "center" }}>
        <Icon name="banknote" size={15} color={tokens.color.muted} />
        <Muted>{A.nothingOwed}</Muted>
      </Row>
    </>
  );
}

/* ───────────────────────── opening · couldn't load · not found (2.1 · 2.2 · 2.3) ───────────────────────── */

const bar = (w: number | `${number}%`, h = 10, bg: string = tokens.color.line): React.ReactElement => <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: bg }} />;

export function OpeningSheet(): React.ReactElement {
  return (
    <View accessibilityElementsHidden={false} style={{ gap: 12 }}>
      <Row style={{ justifyContent: "space-between" }}>
        {bar("60%", 16)}
        {bar(72, 28, tokens.color.surface)}
      </Row>
      {bar("38%", 10, tokens.color.surface)}
      <View style={{ borderWidth: 1, borderColor: tokens.color.line, borderRadius: tokens.radius.input, padding: 14, gap: 10 }}>
        {bar("30%", 8, tokens.color.surface)}
        {bar("45%", 22)}
        {bar("35%", 8, tokens.color.surface)}
      </View>
      <SkeletonOffer />
      <Row gap={8} style={{ justifyContent: "center" }}>
        <ActivityIndicator size="small" color={tokens.color.muted} />
        <Muted>{A.loading}</Muted>
      </Row>
    </View>
  );
}

export function LoadErrorSheet({ gone }: { gone: boolean }): React.ReactElement {
  return (
    <CentredHead icon={<IconDisc name={gone ? "package" : "wifi-off"} />} title={gone ? A.notFound : A.loadFail} sub={gone ? A.notFoundSub : A.loadFailSub} />
  );
}
