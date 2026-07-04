# LyniaGo — Customer ⇄ Rider Interface Audit

**Scope:** Only the **seams** — the moments where the customer journey and the rider journey are two sides of the *same* event and must stay in lockstep. Not a re-audit of either side alone; this walks each shared transition and checks that what one app does, the other app reflects.
**Sources:** `LyniaGo Customer Journey Map` (34 screens) + `LyniaGo Rider Journey Map` (41 screens), and their two audits.
**Date:** 4 Jul 2026 · **Reviewer:** Design systems

> ✅ **RESOLVED 4 Jul 2026** — all seams below have been closed on both maps. See the **Resolution log** at the end of this document for the product decisions and what changed.

**Why this matters:** every one of these is a live two-party handshake settled off-platform. When the two maps disagree about a shared state, one party sits on a screen that will never update — and there's no Lynia-mediated payment or dispute layer to paper over it.

---

## Severity legend
**P0** launch-blocker · **P1** high · **P2** medium · **P3** later.
**Symmetry verdict:** ✅ mirrored · ⚠️ partial / ambiguous · ❌ one side has no matching state.

---

## Seam scorecard

| # | Shared moment | Customer state | Rider state | Symmetry | Sev |
|---|---|---|---|---|---|
| S1 | Auction clock | 90s window, visible countdown | `offer_sent` "bid pending", **no clock** | ⚠️ | P1 |
| S2 | Counter-offer | `auction_counter` accept/decline | `offer_compose` (one offer), **no "countered back" screen** | ❌ | **P0** |
| S3 | The pick / race | `select_race` (rider taken) | **no mirror** for a pick that evaporates | ❌ | P2 |
| S4 | Rider bail | `rider_cancelled` from `track_code` only | `job_bail` from `job_assigned` only | ⚠️ | **P0** |
| S5 | Customer cancels live job | cancel only from `track_code` | **no "customer cancelled" state at all** | ❌ | **P0** |
| S6 | Undelivered | `undelivered`, no reason shown | `undelivered`, reason + "3 tries" recorded | ⚠️ | P1 |
| S7 | Hand-off code | issues code; **no re-issue** | `handoff_wrong` assumes "customer re-issues" | ❌ | P1 |
| S8 | Connection loss | `track_paused` = *customer's* socket | `job_offline` = *rider's* socket | ❌ | P1 |
| S9 | Progress timeline | "7-step timeline" | 7 job stages incl. item-verify | ⚠️ | P2 |
| S10 | Ratings / feedback | rates rider 1–5 | reliability score they can't see; can't rate back | ⚠️ | P2 |
| S11 | Contact reveal | can call **rider only** | gets **both** numbers | ⚠️ | P3 |
| S12 | Role switch / first-run | `register` then prime perms | prime perms then KYC | ⚠️ | P3 |

**Headline:** four seams are genuinely broken, not just thin — **S2, S4, S5** are P0 and **S7, S8** are P1. In every one, a normal delivery can leave one party stranded on a screen the other party's action can't reach. The bright spot: the *terminal* handshake (code-match → both see "delivered") is clean.

---

## The broken seams

### S2 · Counter-offer loop — the two maps model different games — **P0**
- **Customer** `auction_counter`: "compare your ask vs their offer, **accept or decline**. Declining **keeps them in the list**."
- **Rider** side: `offer_compose` says **"one offer per order"** → `offer_sent` → `picked` / `not_chosen`. There is **no rider screen** for "your counter was declined but you're still bidding," and none for "the customer countered *you* back."
- **Two concrete contradictions:**
  1. **"Keeps them in the list" is undefined on the rider side.** If the customer declines a rider's counter, does the rider's bid revert to the *original asking price*, stay live at the *countered price*, or drop? The rider has one offer and no screen that says which. The customer thinks the rider is "still in the list"; the rider's app never told them at what price — or that anything happened.
  2. **No customer→rider counter-back.** The customer map has no "counter back" action and the rider map has no "you were countered" screen, yet both audits (F-07 / R-06) leave the round-count open. Right now the *product* is "customer accepts or declines," but the word "auction" + "keeps them in the list" implies negotiation the rider app can't participate in.
- **Fix:** decide round-count (recommend **one counter, then accept/decline — no back-and-forth**), then either (a) drop "keeps them in the list" language and treat a declined counter as `not_chosen` for that rider, or (b) build the rider's "still bidding at $X" state explicitly. Whichever — **both maps must state the same price semantics.**

### S4 · Rider bail — the entry points don't line up, and post-pickup is a black hole — **P0**
- **Customer:** `track_code → rider_cancelled` is the **only** bail edge — reachable **only before the ride starts** (assigned).
- **Rider:** `job_assigned → job_bail` is the **only** bail edge — also **before pickup**.
- **The mismatch:** the customer's `track_active` (live, en route, parcel possibly collected) has **no edge to `rider_cancelled`** — its only exits are `undelivered` and `track_paused`. So a rider who bails **after** the job goes live has **nowhere to land the customer**. And on the rider side, `job_pickup / job_collect / job_dropoff` have **no bail exit** either — once riding, the rider map offers only "deliver" or "undelivered," never "cancel."
- Both audits flag *after-pickup bail* as an open question (F-01 follow-up, R-01, rider Q3). The interface finding is sharper: **the two maps agree bail exists only pre-pickup, which is exactly the case that's least damaging.** The damaging one — bail with the parcel already on the bike — is undrawn on *both* sides, so neither app can represent it.
- **Fix:** add a post-pickup bail path on the rider map (`job_collect/_dropoff → job_bail` variant) **and** a matching customer landing (`track_active → rider_cancelled`), with copy that differs pre- vs post-pickup (post-pickup = "your parcel is with a rider who cancelled; it's settled between you off-platform").

### S5 · Customer cancels a live job — the rider never finds out — **P0**
- **Customer** decision (F-03, resolved): "the customer can **cancel anytime**, current design kept." But the customer **map** only draws `track_code → cancel` — i.e. **before the ride is live**. The "cancel after pickup" the decision green-lit isn't on the customer map either.
- **Rider** side: there is **no customer-cancellation state anywhere** in the rider journey. Not in Act 4, not as an edge, not as an overlay. If a customer cancels while the rider is en route (or holding the parcel), the rider's app has **no screen to show it** — they'd keep navigating to a drop-off for an order that no longer exists.
- **This is the most one-sided seam in the product:** a resolved, allowed customer action with **zero** rider-side representation.
- **Fix:** (1) extend the customer map so `track_active → cancel` exists (honoring the "cancel anytime" decision); (2) add a rider-side "customer cancelled this job" terminal — pre-pickup returns rider to board; post-pickup tells the rider the parcel is now theirs, settled off-platform (mirrors the risk model).

### S7 · Hand-off code — the rider's recovery depends on a customer screen that doesn't exist — **P1**
- **Rider** `handoff_wrong`: "inline error with attempts remaining; locks after 5. **Customer can re-issue a fresh code.**"
- **Customer** `track_code`: "**Share** the hand-off code with the recipient." There is **no re-issue control and no re-issue state** anywhere on the customer map.
- So the rider's designed recovery path **routes through a customer capability that isn't built.** After a 5-attempt lockout, the rider is told to wait for a re-issue the customer has no button to send. (Customer F-05 and rider R-03 each flag their half; the interface point is that they're **the same missing feature seen from both ends** — build it once, on the customer's `track_active`, and surface "code re-sent" on the rider's locked screen.)
- Note the third party: the **recipient** holds the code and is on **neither** map. The whole seam assumes an out-of-band customer→recipient hand-off; worth stating explicitly so the re-issue design accounts for "recipient never got it" vs "recipient typo."

### S8 · Connection loss — each app only models *its own* socket — **P1**
- **Customer** `track_paused`: "*Connection dropped* — reconnecting" — this is the **customer's** phone losing signal.
- **Rider** `job_offline`: "socket drops while on a job… job saved locally, syncs on reconnect" — this is the **rider's** phone losing signal.
- **Neither app models the other's outage.** When the **rider** goes dark mid-job, the **customer** keeps seeing a live (now stale) rider position with no "your rider is temporarily offline" state — indistinguishable from a rider standing still. Rider audit R-04 explicitly says "the customer's tracking should reflect it"; the customer map has no such reflection.
- Entry points are also asymmetric: rider `job_offline` only from `job_pickup`; customer `track_paused` only from `track_active`. Connection can drop at collect/dropoff/handoff too.
- **Fix:** add a customer-facing "rider connection lost — last seen 2 min ago" muted state fed by the rider's `job_offline`, and an escalation after N minutes on **both** sides (this is the F-04 / R-04 pair — design them together so the thresholds match).

---

## The ambiguous seams

### S1 · The 90-second clock is invisible to the rider — **P1**
The customer runs a **visible 90s auction countdown** (`auction_finding`/`auction_live`, and `auction_expired` when it lapses). The rider's `offer_sent` says only "bid pending" with **no clock and no expiry** — rider audit R-07 notes `not_chosen` may or may not cover expiry. So the rider can't tell a live bid from a dead one, and doesn't know how long the customer has to decide. **Fix:** show the same countdown on `offer_sent`, and make "auction expired, nobody picked" a distinct rider state, not an implicit `not_chosen`.

### S3 · The pick has no rider-side race mirror — **P2**
Customer has `select_race` ("the rider you chose was just taken by another customer"). The rider has **no mirror** for the inverse — "the job you were picked for was cancelled/withdrawn before you confirmed" (rider R-08, customer F-12 are the two halves). Because a rider can hold **multiple** pending bids (`offer_sent`: "board stays open"), the collision space is real. **Fix:** a rider "that job's gone" state parallel to the customer's `select_race`.

### S6 · Undelivered records a reason the customer never sees — **P1**
Both sides terminate at `undelivered`, good. But: the **rider** records a **reason** (unreachable / refused / **wrong address**) after **"3 tries"**; the **customer's** `undelivered` shows neither the reason nor any "attempting delivery, 2 tries left" progression, and its copy only lists "unreachable / refused" — **"wrong address" is missing customer-side**, which matters because a wrong address is the *customer's own* input. **Fix:** surface the rider-recorded reason on the customer's terminal state (at minimum wrong-address, since it's actionable for the sender), and consider showing the delivery-attempt countdown so the terminal state isn't a surprise.

### S9 · "7-step timeline" vs 7 rider stages — reconcile which the customer sees — **P2**
The customer's `track_active` advertises a "**7-step timeline**." The rider moves through 7 job screens — but one of them, `job_verify` ("tick each item at pickup"), is an **internal rider action**. If the customer's 7 steps are literally the rider's 7 stages, the customer sees "verifying items" (fine); if they're a different 7, the two step-models drift. **Fix:** define the customer timeline as an explicit projection of the rider stage machine so they can't diverge as either side changes.

### S10 · Feedback is one-directional — **P2**
Customer `delivered_rate` rates the rider 1–5. The rider's **reliability score** (cited in the `job_bail` warning) is driven by outcomes the rider **can never see** (R-06/R-13), and the rider has **no way to rate or report the customer** (R-11) — e.g. a no-show at pickup or refusal to pay the agreed cash. The feedback loop only runs customer→rider. **Fix:** give the rider a reciprocal rate/report at `job_delivered` and a visible reliability surface, so the score that gates their account isn't a black box.

---

## Minor seams (note, don't block)

- **S11 · Contact asymmetry.** Rider gets **both** phone numbers at `job_assigned`; customer can call **only the rider** (customer A3-2). Intentional-looking, but the sender can't reach the recipient at drop-off and vice-versa. Confirm this is deliberate.
- **S12 · First-run divergence.** Customer does `register` (name + national ID, stored-not-verified) **then** primes permissions; rider primes permissions **then** does KYC (which re-collects name + ID, verified). For a **customer-first user who later becomes a rider**, permissions are primed twice and identity is entered twice. Confirm the role-switch path de-dupes both.

---

## What's clean (for the record)
- **Role fork:** customer `role_select` "Earn as a rider → exits to Rider map" ⇄ rider `role_select` "Continue as a rider." Mirrored.
- **Terminal delivery handshake:** recipient's code → rider enters it (`job_handoff → job_delivered`) → customer sees `delivered_rate`. Single source of truth, both sides advance together.
- **Re-broadcast price:** both sides agree a bail re-broadcasts **at the same price** (`rider_cancelled` / `job_bail`). The *entry points* are wrong (S4) but the *price rule* matches.

---

## Recommended order of work
1. **S5** customer-cancel → rider terminal *(most one-sided; a resolved, allowed action with no rider screen).*
2. **S4** post-pickup bail on both maps *(same gap from both ends).*
3. **S2** lock the counter-offer round-count + price semantics, then align both maps' copy.
4. **S7 + S8** as pairs — build the customer re-issue + the customer-facing "rider offline," since each fixes a rider screen that currently points at nothing.
5. **S1, S6, S9, S10** ambiguities — cheap alignments once the P0s are settled.

> **One-line takeaway:** the happy path mirrors cleanly and the delivery handshake is solid, but **five failure seams (S2, S4, S5, S7, S8) are modelled on only one side** — each one can strand the other party with no screen to land on. Fix them in pairs, map-to-map, not app-by-app.

---

# ✅ Resolution log — 4 Jul 2026

All twelve seams closed in one pass, in pairs (both maps edited together). Product decisions made:

**D1 · Counter loop is ONE round, no counter-back (S2).** The rider accepts or counters once; the customer accepts or declines. **Declining keeps the rider's offer in the list at their countered price** until the window closes — so no rider-side "declined" state is needed; the bid simply stays live. Both maps + both screens now say this in the same words.

**D2 · Rider bail is pre-pickup only (S4).** Once the parcel is collected, in-app cancel is disabled — the rider finishes or marks it undeliverable, with **"Couldn't complete (breakdown)"** added as a recorded reason. Customer side gains the matching edge (`track_active → rider_cancelled`, labelled pre-pickup) and `undelivered` covers the post-pickup case on both maps.

**D3 · Customer can cancel any time, and the rider now sees it (S5).** New rider terminal **`job_cancelled` (4·b5)**: pre-pickup → simply free, back to board; post-pickup → parcel is on the bike, hand-back arranged directly with the sender (off-platform, customer's risk), never dents the reliability score. Customer map gains `track_active → cancel` ("cancel any time") and the cancel sheet warns about the post-pickup case.

**D4 · Code re-issue built once, referenced from both ends (S7).** *(Correction: the customer's `track_code` screen already had a "Re-issue delivery code" button — the audit's "doesn't exist" was overstated; the gap was the rider-side affordance and the map annotations.)* The rider's lockout screen now has **"Ask customer to re-send the code"**, which pings the sender's existing re-issue button; both annotations point at each other.

**D5 · `track_paused` now covers EITHER side's outage (S8).** Customer copy: "your rider's connection (or yours) dropped… if it stays quiet past a couple of minutes we'll let you know, and you can always call your rider." Rider `job_offline` notes the customer sees the same muted pause and that it can hit any job stage; both escalate at ~2 min.

**D6 · The 90s clock is now visible to the rider (S1).** `offer_sent` shows a live "window closes in 0:47" countdown, and a new rider state **`bid_expired` (3·b2)** distinguishes "window closed, nobody picked" from "customer picked someone else" (`not_chosen`).

**D7 · Pick-evaporates race routes to `job_cancelled` (S3).** A cancel between `picked` and confirm lands the rider on the same "customer cancelled" notice — noted on `picked` — never a dead screen.

**D8 · Undelivered reason flows to the customer (S6).** The rider's recorded reason (now labelled "shown to the customer") appears on the customer's terminal screen: "Reason recorded by your rider: recipient unreachable · 3 attempts." Wrong-address and breakdown are in both reason lists.

**D9 · Timeline is one status machine (S9).** Customer `track_active` annotation now states the 7-step timeline is a direct projection of the rider's job stages — the two views can't drift.

**D10 · Feedback is two-way (S10).** Rider `job_delivered` gains an optional **"Rate the sender"** star row ("a no-show or cash problem here protects other riders"). The reliability-dashboard gap flag stays open as the P2 backlog item it was.

**D11 · Contact asymmetry kept deliberately (S11).** Rider holds both numbers (needs them to do the job); customer–recipient contact stays backlog (A3-2). No change.

**D12 · Role-switch de-dupes identity (S12).** `kyc_form` is pre-filled from the account registration for customer-first users; permissions prime once per device. Annotated on the rider map.

**New screens:** rider `job_cancelled` (4·b5), rider `bid_expired` (3·b2) — rider map is now 43 screens.
**New edges:** customer `track_active→cancel`, `track_active→rider_cancelled`; rider `offer_sent→bid_expired`, `bid_expired→board`, `job_collect→job_cancelled`.
**Still open (unchanged backlog):** SOS/report surfaces (F-13/R-16), reliability-score maths (R-01/R-13), order-level support (X-1).
