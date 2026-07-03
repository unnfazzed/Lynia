# Admin ops console — UI kit

A static recreation of the **Lynia** operations console (the real app is Next.js). It is a **monitor & support** tool — there is **no manual dispatch** in the normal flow (no-offers is handled by expire + customer re-broadcast).

**File**
- `index.html` — self-contained; uses the design tokens directly (the real admin uses inline styles from `@lynia/shared` tokens, not the React primitives).

**Tabs**
- **Dashboard** — four KPI panels (live orders, riders online, offers per broadcast, expiry rate) + a recent-orders table. Metrics track the pilot funnel (§8).
- **Riders** — KYC review queue with `pending / verified / failed / all` filters and Approve/Decline actions on pending riders. (In production, KYC is automated via Didit; admin is the manual backstop.)
- **Orders** — full order table with status, rider and fare.

All numbers use tabular figures; status uses the muted/accent/danger convention (expired = danger, active/success = accent).
