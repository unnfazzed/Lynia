# Admin ops console — UI kit

A static recreation of the **LyniaGo** operations console (the real app is Next.js at `apps/admin`). It is a **monitor & support** tool — there is **no manual dispatch**: a no-offer order expires and the customer re-broadcasts. Single ops-admin role, pilot-scale Harare data.

**Shared**
- `admin.css` — console styles on top of the design tokens (`../../styles.css`).
- `shell.js` — sidebar/top-tab nav, connection states, reason-code confirm modal, toast, skeleton/empty helpers, Tweaks panel.

**Pages** (each linked from the sidebar)
- `index.html` — **Overview**: 4 primary KPIs (live orders, riders online, completed today + rate, fares today), secondary funnel strip (time-to-first-offer, expiry, cancels, KYC backlog, signups, offers/broadcast), needs-attention queue, recent orders.
- `orders.html` — **Orders**: status-filtered monitor → order detail with the 8-step delivery timeline, parcel line items, people (privacy-masked customer phone), proposed→agreed fare. Edge cases: **stuck order** (no GPS 22 min → call / nudge / cancel), fare **adjust/refund** and **cancel** with required reason codes.
- `kyc.html` — **KYC review**: Didit-automated queue (pending/verified/failed) → full review screen: ID + selfie placeholders, face-match score vs the 0.85 auto-approve line, doc authenticity, liveness; approve / decline with reason codes; **resubmission (attempt 2)** path with lock warning.
- `riders.html` — **Riders**: directory → profile (trips, rating, completion, strikes, cooldown, commission, recent trips). Actions: suspend / lift / permanent ban, all reason-coded; suspended-rider state included.
- `customers.html` — **Customers**: directory → profile (masked phone, spend, cancel pattern, reports from riders). Edge case: **cancel-pattern flagged customer**; flag / clear / ban flows.
- `issues.html` — **Issues**: dispute queue → investigation (what happened, OTP-not-entered evidence callout, both statements, photo placeholder) → resolve: refund / rider strike / close-no-action, each confirmed with a reason.
- `cash.html` — **Commission**: the prepaid per-ride model — commission is **0% during the launch period** (nothing collected). Read-only overview of ride volume + fares delivered per rider and the commission that would accrue at the current rate. When the rate turns on, each ride debits a rider's pre-funded account (a low balance blocks going online); the wallet/top-ups are a later build.

**States & tweaks**
Every page renders **live / empty / loading-skeleton / offline** (banner + dimmed data + disabled actions) — switch via the Tweaks panel, which also controls density (comfortable/compact), navigation (sidebar/top tabs) and data volume (pilot/growth). All destructive actions use a **confirm modal with a required reason code** and an audit-log line.

All numbers are tabular figures; status pills follow the muted/accent/danger convention (expired · stuck = danger; active/verified = accent wash).
