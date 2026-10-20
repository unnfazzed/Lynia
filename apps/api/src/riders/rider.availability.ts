/**
 * Going online and staying reachable: the online switch and the heartbeat. A part of RiderService (R-6):
 * `this.svc` is the service itself.
 */
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { isInServiceArea } from "@lynia/shared";
import { baseBroadcastRadiusM } from "../common/broadcast-policy";
import { penaltiesSuspended } from "../common/penalties";
import { onlineRefusalReason, REFUSAL_MESSAGE } from "./online-gate";
import { domainEvents } from "../common/domain-events";
import type { RiderHost } from "./rider.host";

export class RiderAvailability {
  constructor(private readonly svc: RiderHost) {}
  async setOnline(
    profileId: string,
    online: boolean,
    location?: { lat: number; lng: number },
  ): Promise<{ online: boolean }> {
    const rider = await this.svc.prisma.rider.findUnique({
      where: { profileId },
      // isOnline + lastHeartbeatAt: admin console v2 §3's online/offline events (a real flip only) and the
      // funnel's first-online step (no heartbeat ever stamped ⇒ this is the rider's first time online).
      select: { kycStatus: true, accountStatus: true, onHold: true, cooldownUntil: true, isOnline: true, lastHeartbeatAt: true },
    });
    if (!rider) throw new ForbiddenException("Not a biker");
    // Full online-gate (Q2): kyc + account standing + reliability on_hold + cooldown. No wallet minimum
    // (owner 2026-10-12) — the commission check is per job (common/commission-cover.ts).
    // Only enforced when going ONLINE — a rider can always go offline. The refusal carries a structured
    // `reason` so the app renders the correct blocked state instead of a generic 403.
    if (online) {
      const reason = onlineRefusalReason(rider);
      if (reason) throw new ForbiddenException({ reason, message: REFUSAL_MESSAGE[reason] });
      // Service area: refuse going online outside it so a rider can't take jobs we can't route; the same
      // isInServiceArea the customer order-create gate uses (all of Zimbabwe, D-99).
      // E2E 2026-10-05 FS-7 (owner: "Refuse online without GPS"): going ONLINE requires a position. A
      // missing one used to skip this check, so a rider whose GPS timed out showed "Online" from anywhere
      // and never got a job. Going offline never needs coordinates (this whole block is online-only).
      if (!location) {
        throw new ForbiddenException({ reason: "location_required", message: REFUSAL_MESSAGE.location_required });
      }
      if (!isInServiceArea(location)) {
        throw new ForbiddenException({ reason: "out_of_area", message: REFUSAL_MESSAGE.out_of_area });
      }
    }
    if (online) {
      // CAS the go-online write on the standing we just gated on (mirrors the admin CAS fixes). The
      // findUnique above takes no row lock, so an admin suspend/ban or an auto reliability hold can
      // commit between the gate read and this write — a blind `update` would flip the rider back to
      // isOnline:true over that fresh decision, re-adding a suspended/held rider to the live-supply
      // plane. Guarding on accountStatus:active + onHold:false makes the two serialize: 0 rows ⇒ the
      // standing changed under us ⇒ refuse, re-deriving the precise reason so the app shows the right
      // blocked state instead of silently going online. The CAS also re-asserts KYC (verified) and the
      // cooldown, the gate's other two standing facts: a KYC lapse or an admin un-verify landing between
      // the gate read and this write must not put an unverified rider back on the board.
      // KB-HEARTBEAT-MARGIN: stamp the go-online heartbeat with DB now() (not JS new Date()) so every
      // heartbeat writer shares ONE clock domain — recordFix / touchRiderHeartbeat already write now(),
      // and the offer-selection liveness gate (matching.service) judges freshness against these stamps.
      // Mixing app-server Date.now() here with DB now() elsewhere ate into that gate's margin under
      // clock skew. Raw CAS keeps the standing guard (active + not on_hold) exactly as the prior
      // updateMany: $executeRaw returns the affected-row count, so 0 ⇒ an admin suspend/ban or an auto
      // reliability hold committed between the gate read and this write ⇒ refuse and re-derive the reason.
      const claimed = await this.svc.prisma.$executeRaw`
        UPDATE riders
        SET is_online = true,
            last_heartbeat_at = now(),
            updated_at = now()
        WHERE profile_id = ${profileId}::uuid
          AND account_status = 'active'
          AND (on_hold = false OR ${penaltiesSuspended()}::boolean)
          AND kyc_status = 'verified'
          AND (cooldown_until IS NULL OR cooldown_until <= now() OR ${penaltiesSuspended()}::boolean)`;
      if (claimed === 0) {
        const now = await this.svc.prisma.rider.findUnique({
          where: { profileId },
          select: { kycStatus: true, accountStatus: true, onHold: true, cooldownUntil: true },
        });
        const reason = now ? onlineRefusalReason(now) : null;
        if (reason) throw new ForbiddenException({ reason, message: REFUSAL_MESSAGE[reason] });
        throw new ConflictException("Your account status just changed — refresh and try again.");
      }
    } else {
      await this.svc.prisma.rider.update({
        where: { profileId },
        data: { isOnline: false },
      });
    }
    // Admin console v2 §3: supply hours. Only a real flip records (a repeat toggle is a no-op), best-effort and
    // un-awaited (no transaction here; the toggle above is already committed). The first go-online ever also
    // records the funnel's first_online step: no heartbeat had been stamped before this one.
    if (online !== rider.isOnline) {
      void domainEvents.record(this.svc.prisma, {
        type: online ? "rider.online" : "rider.offline",
        actorId: profileId,
        actorRole: "rider",
        subjectType: "rider",
        subjectId: profileId,
        ...(online ? {} : { data: { reason: "manual" } }),
      });
    }
    if (online && rider.lastHeartbeatAt == null) void domainEvents.riderStep(this.svc.prisma, profileId, "first_online");
    // Going offline explicitly: drop the rider from the geo index right away (the socket may stay
    // connected, so we can't rely on the disconnect flush). Best-effort — PG's is_online is the
    // authority for nearbyRiders; this just stops a now-offline rider lingering in GEOSEARCH results.
    if (!online) await this.svc.tracking.evictFromGeo(profileId);
    // Persist the go-online position so an IDLE online rider (not currently delivering) is actually in
    // the nearby-rider index. The tracking gateway's fix path only writes geo/geog for the ASSIGNED rider
    // on an active order, so without this an online-but-not-delivering rider has no recorded position and
    // nearbyRiders/countNearbyForPickup return false-empty — silently suppressing the customer broadcast.
    // Best-effort: recordFix already swallows Redis errors internally, but guard the PG write too so a DB
    // hiccup can never fail the online-toggle itself.
    if (online && location) {
      try {
        await this.svc.tracking.recordFix(profileId, location.lat, location.lng);
      } catch (err) {
        this.svc.logger.warn(`recordFix on go-online failed for ${profileId}: ${(err as Error).message}`);
      }
    }
    // 2·b1: a rider just came online with a position — ping any customers who were waiting for supply
    // near here ("notify me" on the no-riders state) and clear them from the list. Fire-and-forget and
    // fully best-effort (no Redis → empty drain), so it can never affect the go-online response.
    if (online && location) void this.svc.drainNotifyWaiters(location.lat, location.lng);
    if (online) void this.svc.noteOnlineWithoutPushToken(profileId);
    return { online };
  }

  /**
   * Lightweight presence beat (wave-2 W3). The mobile app beats every 20s while online, and that beat
   * used to replay the FULL setOnline mutation — standing-gate read + commission read + CAS write +
   * waitlist GEOSEARCH per rider per beat — the dominant per-rider server cost at scale. This path
   * refreshes only what a beat MEANS (liveness + position), with the sensitive invariants kept
   * deliberately conservative:
   *
   *  - ONE guarded UPDATE refreshes `last_heartbeat_at` only while the rider is STILL online AND in
   *    good standing (`active` + not on-hold + KYC verified + no live cooldown) — the same predicate
   *    setOnline's go-online CAS enforces.
   *    Every mid-shift demotion path (admin suspend/ban, reliability hold, KYC lapse, cancel-limit
   *    cooldown) already forces `is_online = false` + supply eviction at write time, so a demoted
   *    rider matches 0 rows on the next beat and gets the SAME precise 403 refusal the old
   *    setOnline-beat produced — re-derived below exactly like setOnline's CAS-miss path.
   *  - `drainNotifyWaiters` still runs unconditionally on every real go-ONLINE transition (setOnline).
   *    On beats it runs only when the O(1) `hasNotifyWaiters` probe says the list is non-empty, so the
   *    common empty-waitlist case stops paying a GEOSEARCH every 20s while a queued customer is still
   *    pinged within one beat (≤20s) by an already-online rider nearby — the same outcome as before.
   *  - No commission re-read: the prepaid floor gates the go-ONLINE transition, and at CAS-miss time
   *    the refusal re-derivation below still loads it (exact parity with setOnline's miss path).
   */
  async heartbeat(profileId: string, location?: { lat: number; lng: number }): Promise<{ online: boolean }> {
    const claimed = await this.svc.prisma.$executeRaw`
      UPDATE riders
      SET last_heartbeat_at = now(),
          updated_at = now()
      WHERE profile_id = ${profileId}::uuid
        AND is_online = true
        AND account_status = 'active'
        AND (on_hold = false OR ${penaltiesSuspended()}::boolean)
        AND kyc_status = 'verified'
        AND (cooldown_until IS NULL OR cooldown_until <= now() OR ${penaltiesSuspended()}::boolean)`;
    if (claimed === 0) {
      // Not beating: offline (toggled off elsewhere / forced by a demotion) or standing changed.
      // Re-derive the precise refusal exactly like setOnline's CAS-miss path so the app renders the
      // right blocked state; with clean standing but is_online=false, fall through to the generic 403
      // the client maps to "You were taken offline. Tap Go online to retry."
      const now = await this.svc.prisma.rider.findUnique({
        where: { profileId },
        select: { kycStatus: true, accountStatus: true, onHold: true, cooldownUntil: true },
      });
      if (!now) throw new ForbiddenException("Not a biker");
      const reason = onlineRefusalReason(now);
      if (reason) throw new ForbiddenException({ reason, message: REFUSAL_MESSAGE[reason] });
      throw new ForbiddenException("You're offline — go online to keep receiving jobs.");
    }
    // Same position persistence as setOnline's go-online write: keeps an IDLE online rider present in
    // the nearby-rider index (recordFix throttles its own PG writes; Redis errors are swallowed inside).
    if (location) {
      try {
        await this.svc.tracking.recordFix(profileId, location.lat, location.lng);
      } catch (err) {
        this.svc.logger.warn(`recordFix on heartbeat failed for ${profileId}: ${(err as Error).message}`);
      }
      // Beat-drain behind the O(1) probe (see doc above). Fire-and-forget and fully best-effort, like
      // setOnline's own drain — a probe/drain failure can never fail the beat.
      void this.svc.tracking
        .hasNotifyWaiters()
        .then((any) => (any ? this.svc.drainNotifyWaiters(location.lat, location.lng) : undefined))
        .catch(() => {});
    }
    return { online: true };
  }

  /**
   * 2·b1: drain the "notify me" waiting list near a newly-online rider and push those customers. Fully
   * best-effort — swallows everything (no Redis, a geo miss, a push outage) so it can never disturb the
   * setOnline that spawned it. Separated out (not inlined) so the fire-and-forget has its own try/catch.
   */
  async drainNotifyWaiters(lat: number, lng: number): Promise<void> {
    try {
      // F-18 (at-least-once): CLAIM nearby waiters under a short per-waiter lock (dedups concurrent
      // instances AND a burst of riders coming online together → one ping, not N), push, then CLEAR only
      // the ones actually delivered. A waiter is never removed until a push lands, so a no-token /
      // transient-FCM failure — or a crash mid-push — leaves them queued for the next nearby rider
      // instead of being silently dropped. Undelivered claims self-release when the lock TTL lapses; the
      // notify-list TTL bounds the total wait. All best-effort — never affects the rider going online.
      // Drain radius = the BASE broadcast radius (not the widened one): "a rider's online near you"
      // means this rider would have received the customer's initial broadcast (policy BROADCAST).
      const claimed = await this.svc.tracking.claimNotifyWaitersNear(lat, lng, baseBroadcastRadiusM());
      if (claimed.length === 0) return;
      // KB-NOTIFY-ORDERID: claimed carries each waiter's still-open order (if any); notifyRidersAvailable
      // uses it to pick honest live-request copy + route the tap there, and returns the delivered profile
      // ids so only those are cleared from the list (undelivered stay queued — F-18 at-least-once).
      const delivered = await this.svc.notifications.notifyRidersAvailable(claimed);
      const toClear = claimed.filter((w) => delivered.has(w.profileId)).map((w) => w.profileId);
      if (toClear.length > 0) await this.svc.tracking.clearNotifyWaiters(toClear);
    } catch {
      /* best-effort: a notify-drain failure never affects the rider going online */
    }
  }

  /** A biker who just went online with no registered push token will never hear a job ping: counted
   *  (`rider_online_without_push_token_total`) and logged. Best-effort; never affects going online. */
  async noteOnlineWithoutPushToken(profileId: string): Promise<void> {
    try {
      if ((await this.svc.prisma.deviceToken.count({ where: { profileId } })) > 0) return;
      this.svc.metrics?.incRiderOnlineWithoutPushToken();
      this.svc.logger.warn(`Biker ${profileId} went online with no push token — no job pings will reach them`);
    } catch {
      /* best-effort */
    }
  }
}
