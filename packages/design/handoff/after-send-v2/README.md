# Handoff: LyniaGo "After Send" v2 — corrections + missing states

v1 (`../after-send-2026-10/`) stays the base. This folder replaces it: every v1 state is here, plus every 2.x state. BRIEF.md decisions unchanged. Same tokens, components and type scale — no new tokens.

## Files
- `After Send v2 (standalone).html` — open this. Offline. Prototype player, every state at 360×720, key states at 320×640, font scale 1.3, decisions, gallery map, copy per state.
- `After Send v2.html` — unbundled source (needs the DS root at `../../`). `?frames=13,2.20` shows only those; add `&w=320` for 320×640, `&fs=1` for the 1.3 font-scale frames.
- `as-kit.jsx` — shared parts + **the `A` copy object** (v2 additions in one block at the end; changed v1 strings edited in place).
- `as-screens.jsx` — v1 stage functions with v2 variant props. `as-v2.jsx` — new screens + component boards. `sc2-kit.jsx` — unchanged.

Labels in the HTML: **CHANGED** = redrawn vs v1, **NEW** = state v1 never drew.

---

## Changelog vs v1, per state

### Corrections (Part 1)
| State | Change |
|---|---|
| Code card (6, 7, 9, 19, 2.4) | 4 → **6 digits**, shown 3+3 ("418 290") at 28/800, tracking .04em (was 30/800 .2em). Share code stays on the same row — it fits at 320 and 360 dp at scale 1.0. When the row overflows (font scale > 1, measured with onLayout) Share code moves under the digits, full width. Card code caps at font scale ×1.15. |
| 8 Hand-off | Four 64×80 boxes → **one white panel**, 2 px `--accent-text` border, "418 290" at 56/800 (48 under 340 dp), 20 px group gap (16). Fits 300 / 260 dp. Big code ignores font scale (×1.0 cap) — it's already 2.5× the next-largest text. |
| Copy | `shareMsg` ends "…at hand-off: 418290". `deliveredSub` = "Handed over at 09:31 with code 418290." Code is grouped visually only; copied / shared / spoken value has no space. |
| Grabber (every sheet + panels) | Row 16 → **28 px**, bar stays 36×4. Tap/drag hit area **120×44** = row + 16 px above the sheet edge. Tap toggles peek ↔ full. TalkBack "Show more" / "Show less". Sheet content starts 12 px lower. Shown in **1.2**. |
| Peek heights | Now content-measured: peek = first block's bottom + 16 dp, floors per stage in the table below, map never under 96 dp. |

**Peek floors (sheet height at peek, dp)**

| Stage | Must be fully visible | 360×720 | 320×640 | 320×640 @1.3 |
|---|---|---|---|---|
| Finding, cancelled | headline + countdown + price | 424 | 372 | 372 |
| Offers | first offer card | 540 | 473 | 495 |
| Matched / picked up / paused / offline | ETA line + steps | 450 | 394 | 417 |
| Hand-off | code panel | 534 | 467 | 484 |
| Retry | reason + price | 476 | 417 | 417 |
| Delivered (rate) | stars row | 553 | 484 | 507 |
| Not delivered | headline + reason | 502 | 439 | 473 |

### v1 states changed
- **1, 1b, 2, 5** — only the 28 px grabber row.
- **3 Offers** — sample ranking now puts Farai (new rider, same as your price) first, as the app does. Price shows "Your price" under it when an offer equals the customer's price. Long names wrap (no truncation).
- **4 Select race** — Farai taken; toast "Farai was just taken by another customer. Pick another rider."; Tendai becomes Best match.
- **6, 7, 9, 19** — 6-digit code card. Address line wraps instead of ellipsis.
- **8** — new big code (above).
- **10a / 10b** — **no reason pre-selected** (2.23). Tapping a selected chip clears it.
- **11 Get help** — Share my trip subline "Send trip details to someone you trust" (no live link exists).
- **13 Rider cancelled** — redrawn (2.20). The server has already reopened the order at the same price, so it's a finding state: "Tendai had to cancel." / "We're already asking other riders at $3.36." + countdown + "Riders may reply faster at $3.86." CTAs: **Raise to $3.86** (PATCH, same as +$0.50) / Cancel request. If the window then closes → 12. Map shows finding rings, not dimmed.
- **14a / 14b** — code 418290 in the sub-line.
- **15, 16** — rated line adds the word: "You rated Tendai ★★★★ Good" (no icon-only rating).
- **18b** — now only for a rider cancel *after* pickup; before pickup is 13.
- **Header (all)** — title ellipsises if it would collide with Back / Help at large font scale; Back and Help never shrink.
- **Step track** — labels may wrap to two lines at font scale > 1.

### New states (Part 2)
| Id | State | What it shows |
|---|---|---|
| 2.1 | Opening an order | Back, no title, map without pins, sheet skeleton, "Opening your order…". No CTA. |
| 2.2 | Couldn't load | WifiOff, "Couldn't open your order" / "Check your data connection and try again." · **Try again** / Back to home |
| 2.3 | Not found / not yours | Package, "We can't find this order" / "It may be on another account, or the link is old." · Back to home |
| 2.4 | Offline cold start, saved copy | Ink banner "Reconnecting… Showing your order as of 09:24." Last-known stage title, "Last update 09:24", no rider marker, no ETA. Code card works. · Try again |
| 2.5 | + $0.50 in flight | Spinner before the label in the button; price unchanged until success. |
| 2.6 | + $0.50 failed | Toast "Couldn't update the price. Try again." + Try again; price stays $3.36. |
| 2.7 | Raised with offers showing | Green note directly under the price row, above the list (4 s, then collapses). Over-price strips recompute ("+$0.14 over your price…"). |
| 2.8a | Notify me confirmed | Check + "We'll tell you when a rider's online." Plain text, not tappable. |
| 2.8b | Reminders unavailable | "Reminders aren't working right now. We'll keep looking until the timer ends." Nothing tappable. |
| 2.9a/b | Choose in flight | Spinner in that card's Choose; other Choose, + $0.50 and Cancel request disabled. Line under the card "Confirming with Farai…"; after 5 s "Still confirming with Farai. This can take a few seconds on slow data." |
| 2.10 | Timer hit 0 | Offers already on screen stay choosable **15 s** — ink pill "Choose in 0:12", notice "Time's up for new offers. You can still choose from these." Server rejects offers after 0:00. No offers → straight to 12. |
| 2.11 | Offer card variants | photo · initials · new rider + same price · very long name (wraps) · new rider ranked first. |
| 2.12 | Matched, no GPS fix | "Tendai is heading to pickup" / "Live location and ETA show once Tendai's phone sends it." No marker. → 6 on first fix; → 9 after 60 s. |
| 2.13 | Rider card variants (320) | no plate ("Bike" only) · not verified (no tag) · no photo (initials) · long name + plate wrap · 2.15. |
| 2.14 | Code being issued | Six grey bars, Share code disabled, "Getting your code…". No Re-issue. |
| 2.15 | Number not available | Call / WhatsApp disabled + "Call and WhatsApp work once Tendai's number comes through." |
| 2.16 | Pickup photo viewer | Full-screen `--ink`; "✕ Close" pill, title "Pickup photo"; pinch to zoom; "Taken by Tendai at 09:12 · Eastgate Mall, CBD". Back = Close. |
| 2.17a/b | Report a problem | Panel over the trip: "What happened?" Wrong item · Damaged · Rider behaviour · Payment · Other (one), "Tell us more · Optional", **Send to our team** (disabled until a type is picked). Then "Thanks — our team will look into it" / "We'll call you if we need more details. Your trip keeps running." · Close |
| 2.18 | Back from emergency call | Green note at top of the sheet for the rest of the trip: "Our safety team has been told. They'll call you shortly." "Call 999 again" replaces the Google Maps row. |
| 2.19 | Share my trip | Android share sheet with text `A.shareTripMsg` (below). |
| 2.21a/b | Send again (12) in flight / failed | Spinner on primary, Edit order disabled; toast "Couldn't send. Check your data and try again." + Try again. |
| 2.22a/b/c | Cancel in flight / failed | Spinner on Cancel order (10a) or Yes, cancel (1b), the other button disabled; toast "Couldn't cancel. Your order is still active." + Try again, panel stays open. |
| 2.24 | Rating didn't save | After the 10 s undo window: back to the rate form with stars + tags kept, toast "Couldn't save your rating. Try again." |
| 2.25 | Trip complete, not rated | Card "Rate Tendai" / "Tap a star. You can rate for 7 days." + five 44 px stars; a tap opens 14a's tags inline. Gone after 7 days. |
| 2.26 | Trip complete, rated | = 16 with the "Good" word. |
| 2.27 | Receipt variants | several items (one per line, right-aligned) · long address wraps · pickup time "Not recorded". |
| 2.28 | Send again (16/17/18) | **Confirmed**: opens Send step 2 with the v2 banner "Copied from your order on 30 Sep. Check it, then send." No one-tap there. 12 stays one-tap. Not drawn (Send v2 screen). |
| 2.29a–c | Not delivered reasons | reason · "1 try" / "N tries", body per reason (`nb1`–`nb4`). |
| 2.30 | Cancelled by you, no reason | Reason line dropped; "Nothing to pay." stays. |
| 2.31a/b | Cancelled by LyniaGo | specific: "Reason: The rider reported the pickup was closed." + generic line; generic: just "We had to stop this order. Call us if you have questions." |
| 2.32 | Font scale 1.3 @ 320×640 | 3, 6, 8, 14a, 17. Text wraps, buttons grow, chips wrap as whole chips, code capped. |
| 2.33 | Home live-order bar | 60 px card: icon disc + one line + chevron. Finding · Choose · On the way (to pickup / to drop-off) · Arriving (shows the code) · Delivered, not rated. |
| 2.34 | Push notifications | See copy. **Push never contains the delivery code** (lock screens). |

### Share texts (final)
- Share code: `Your LyniaGo parcel is on its way with Tendai (bike ABH 4721). Give the rider this code at hand-off: 418290`
- Share my trip: `I'm sending a parcel with LyniaGo from Eastgate Mall, CBD to 14 Glenara Ave, Avenues. My rider is Tendai M. (bike ABH 4721). Order ref 8F3A-91C2.` If no plate: drop " (bike …)".

### Push copy (title / body)
| Event | Title | Body |
|---|---|---|
| 1 offer | New offer: $3.00 | Tendai M. can pick up in 6 min. Choose before the timer ends. |
| 2+ offers | 3 offers for your parcel | Choose a rider before the timer ends. |
| Matched | Tendai is on the way to pickup | Arriving in about 6 min. Open to see your delivery code. |
| Picked up | Tendai has your parcel | On the way to 14 Glenara Ave. About 12 min. |
| Arriving | Tendai is at the drop-off | Have your delivery code ready. |
| Delivered | Parcel delivered | Handed over at 09:31. Tap to rate Tendai. |
| Not delivered | Tendai couldn't deliver your parcel | Recipient didn't answer. Call Tendai to sort it out. |
| Rider cancelled (reopened) | Your rider cancelled | We're asking other riders at $3.36. |
| LyniaGo cancelled | Your order was cancelled | Open to see why. Nothing to pay. |
| Window closed | No rider took $3.36 | Send again at $3.86 in one tap. |

---

## Part 3 — All Screens Gallery
Delete the old LJ order screens. Register every id from the HTML (phones and boards). Old → new:

| Old id | v2 state |
|---|---|
| auction_finding | 1 |
| auction_live | 3 |
| auction_counter | 3 (over-price strip) |
| no_riders | 2 |
| select_race | 4 |
| auction_expired | 12 |
| rider_cancelled | 13 |
| track_active | 6 · 7 |
| track_code | 8 |
| track_paused | 9 |
| track_dark | 19 |
| cancel | 10a · 10b |
| cancelled | 18a · 18b · 18c |
| undelivered | 17 |
| delivered_rate | 14a |
| rate_undo | 15 |
| completed | 16 / 2.26 |

## Still to confirm
- "Emergency? Call 999" and support hours with ops (carried from v1).
- 15 s grace after the timer (2.10) and the 7-day rating window (2.25) need server support.
- Safety-team alert on emergency (2.18) needs a backend event.
