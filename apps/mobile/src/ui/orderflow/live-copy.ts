import { type MerchantOrderResponse, ORDER_SCHEDULE } from "@lynia/shared";
import {
  isOpenRound,
  isScheduledWaiting,
  merchantEta,
  merchantService,
  type MerchantService,
  type MerchantStage,
  readyAtMs,
  resolveMerchantStage,
  roundClock,
  serverTrackStep,
  slotDay,
} from "../../logic/merchant-order";
import type { IconName } from "../Icon";
import { clock, hhmm } from "../order/copy";
import { O, ofFmt } from "./copy";

/**
 * G1 (Home's live-order bar) and G2 (the Orders tab's Now cards) for a MERCHANT order — Order flow v2.1
 * (`of-screens-mrg.js` G1/G2, ledger D-59). The stage is the order screen's own (`resolveMerchantStage`),
 * so the bar, the card and the screen never disagree. Copy is `O.g.bar` with its sample values
 * ("Gava’s Kitchen", "12:40–12:55", "$16.50") turned into the order's own (`OG` below); the ETA is shown
 * only where the order screen would show it (BRIEF §5) — without one, the line falls back to the venue.
 */

/** `O.g.bar` as templates — each is the drawn string with the sample values swapped for `{x}`. */
export const OG = {
  /** food[1] — "Gava’s Kitchen is confirming" / "Arrives 12:40–12:55". */
  confirming: "{v} is confirming",
  /** food[3] — "Rider on the way to Gava’s Kitchen". */
  toVenue: "Rider on the way to {v}",
  /** food[4] — "On the way to you" / "Arrives in ~9 min · 12:47". */
  onWayEta: "Arrives in ~{m} min · {t}",
  /** food[5] — "Pay $16.50 · then say your code"; pharmacy[2] — "Check the seal · pay $6.80". */
  doorPay: "Pay {p} · then say your code",
  doorSeal: "Check the seal · pay {p}",
  /** shops[0] — "Avondale Fresh needs your answer" / "1 swap · answer in 2:41". */
  answer: "{v} needs your answer",
  answerSub: "{n} swap · answer in {t}",
  answerSubN: "{n} swaps · answer in {t}",
  /** sched[0] — "Scheduled · tomorrow 12:30–13:00" / "Gava’s Kitchen starts cooking at 12:05". */
  sched: "Scheduled · {d} {s}",
  schedSub: "{v} starts {making} at {t}",
  /** G2 — "Gava’s Kitchen · Arrives 12:40–12:55", "Gava’s Kitchen · Tendai M. · ~9 min". */
  line: "{v} · {x}",
  etaRange: "Arrives {a}–{b}",
  etaMin: "~{m} min",
} as const;

/** The live-order glyph per service (the bar and the card draw a white glyph on the accent disc). */
export const SVC_GLYPH: Record<MerchantService, IconName> = {
  food: "utensils",
  shops: "shopping-bag",
  pharmacy: "pill",
};

/** The slice of the generic snapshot this reads (structural; the active-orders list carries it). */
export interface MerchantLiveSnap {
  id: string;
  status: string;
  merchantName?: string | null;
  merchantPhase?: string | null;
  pickup: { point: { lat: number; lng: number } };
  dropoff: { point: { lat: number; lng: number } };
  rider?: { currentLat: number | null; currentLng: number | null } | null;
  track?: MerchantOrderResponse["track"];
}

export interface MerchantLiveView {
  svc: MerchantService;
  icon: IconName;
  stage: MerchantStage;
  /** G1 title / G2 title. */
  title: string;
  /** G1 sub: the ETA or the next action (the venue when there is neither). */
  sub: string;
  /** G2 sub: "{venue} · {ETA / rider · ~min / action}". */
  line: string;
  /** G2's four segments: how many are lit (0 Scheduled … 4 at the door). */
  lit: number;
  /** The four-step track index (−1 Scheduled, 4 done) for a bar that draws the steps. */
  step: number;
  etaMinutes: number | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const usd = (n: number): string => `$${n.toFixed(2)}`;

export function merchantLive(
  snap: MerchantLiveSnap,
  order: MerchantOrderResponse | undefined,
  riderName: string | null,
  nowMs: number,
): MerchantLiveView {
  const svc = merchantService(order?.venue);
  const S = O.svc[svc];
  const v = order?.venue?.name || snap.merchantName || "";
  const status = order?.status ?? snap.status;
  const phase = order ? order.merchantPhase : (snap.merchantPhase ?? null);
  const fix =
    snap.rider && snap.rider.currentLat != null && snap.rider.currentLng != null
      ? { lat: snap.rider.currentLat, lng: snap.rider.currentLng, at: null }
      : null;
  const res = resolveMerchantStage({
    status,
    merchantPhase: phase,
    autoAccepted: order?.autoAccepted,
    kitchenConfirmedAt: order?.kitchenConfirmedAt,
    scheduled: order ? isScheduledWaiting(order) : false,
    rxStatus: order?.prescription?.status ?? null,
    riderId: order?.riderId ?? null,
    sawRider: false,
    rider: fix,
    venue: snap.pickup.point,
    dropoff: snap.dropoff.point,
    assignedAt: null,
    handshakeStarted:
      !!order?.customerCashConfirmedAt || !!order?.riderCashConfirmedAt,
    nowMs,
  });
  const stage = res.stage;
  const eta = merchantEta({
    stage,
    noFix: res.noFix,
    nowMs,
    readyMs: order ? readyAtMs(order) : null,
    venue: snap.pickup.point,
    dropoff: snap.dropoff.point,
    rider: fix,
  });
  const range =
    eta?.kind === "range"
      ? ofFmt(OG.etaRange, {
          a: hhmm(new Date(eta.fromMs).toISOString()),
          b: hhmm(new Date(eta.toMs).toISOString()),
        })
      : null;
  const total = order ? (order.cashHandshakeAmount ?? order.total ?? 0) : 0;
  const step = order
    ? serverTrackStep(order, order.track)
    : serverTrackStep({ status, merchantPhase: phase }, snap.track ?? null);
  const at = (
    title: string,
    sub: string | null,
    line: string | null,
    lit: number,
  ): MerchantLiveView => ({
    svc,
    icon: SVC_GLYPH[svc],
    stage,
    title,
    sub: sub || v,
    line: line ? ofFmt(OG.line, { v, x: line }) : v,
    lit,
    step: stage === "scheduled" ? -1 : step,
    etaMinutes: eta?.kind === "one" ? eta.minutes : null,
  });

  // An open substitution round leads (U2 / G1 shops[0]).
  const round = order?.substitution ?? null;
  if (round && isOpenRound(round)) {
    const n =
      round.lines.filter((l) => l.action === "swap").length ||
      round.lines.length;
    const left = clock(roundClock(round, nowMs).leftMs);
    const sub = ofFmt(n === 1 ? OG.answerSub : OG.answerSubN, { n, t: left });
    return { ...at(ofFmt(OG.answer, { v }), sub, null, 1), line: sub };
  }
  switch (stage) {
    case "scheduled": {
      const s = order?.scheduledFor ?? null;
      const slot = s
        ? `${hhmm(s)}–${hhmm(new Date(Date.parse(s) + ORDER_SCHEDULE.slotMinutes * 60_000).toISOString())}`
        : "";
      const day = s
        ? slotDay(
            s,
            nowMs,
            {
              today: O.r.today.toLowerCase(),
              tomorrow: O.r.tomorrow.toLowerCase(),
            },
            DAYS,
          )
        : "";
      const sub = order?.ringsAt
        ? ofFmt(OG.schedSub, {
            v,
            making: S.making.toLowerCase(),
            t: hhmm(order.ringsAt),
          })
        : null;
      return {
        ...at(ofFmt(OG.sched, { d: day, s: slot }), sub, null, 0),
        line: sub ?? v,
      };
    }
    case "waiting":
      return at(ofFmt(O.t.waiting, { v }), null, null, 1);
    case "confirming":
      return at(ofFmt(OG.confirming, { v }), range, range, 1);
    case "rxCheck":
      return at(O.t.rxCheck, range, range, 1);
    case "rxDeclined":
      return at(O.d.rxNo, range, range, 2);
    case "itemApproval":
      return at(ofFmt(OG.answer, { v }), null, null, 1);
    case "cooking":
    case "slowRider":
    case "riderDropped":
      return at(S.makingT, range, range, 2);
    case "toVenue":
    case "collecting":
      return at(ofFmt(OG.toVenue, { v }), range, range, 2);
    case "onWay": {
      const one = eta?.kind === "one" ? eta : null;
      const sub = one
        ? ofFmt(OG.onWayEta, {
            m: one.minutes,
            t: hhmm(new Date(one.atMs).toISOString()),
          })
        : null;
      const line = one
        ? [riderName, ofFmt(OG.etaMin, { m: one.minutes })]
            .filter(Boolean)
            .join(" · ")
        : riderName;
      return at(O.t.onWay, sub, line, 3);
    }
    case "door": {
      const sub =
        svc === "pharmacy"
          ? ofFmt(OG.doorSeal, { p: usd(total) })
          : ofFmt(OG.doorPay, { p: usd(total) });
      return at(
        O.t.atDoor,
        sub,
        svc === "pharmacy" ? sub.charAt(0).toLowerCase() + sub.slice(1) : sub,
        4,
      );
    }
    default:
      return at(S.makingT, null, null, Math.min(4, step + 1));
  }
}
