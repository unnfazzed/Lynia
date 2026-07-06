# 2026 trust, safety & recovery — engineering + design plan

**Branch:** `claude/missing-designs-impl-673rc3`
**Source of truth:** `packages/design/ui_kits/mobile/safety-flows.html`,
`packages/design/HANDOFF.md` → "2026 trust, safety & recovery", the journey renderers in
`packages/design/explorations/journey/{screens-safety,rider-screens-safety}.jsx`, and the
Claude Code handoff prompt.

## Context

The eleven trust/safety/recovery screens were shipped in app code (PR #98) **before** they were
designed. The design is now finalised (product decision **Q3 resolved, 5 Jul 2026**) and this change
reconciles the app against it. An audit of `apps/mobile` shows the bulk is already wired — SOS control,
report/block, order-level help, KYC ID-photo loop, rider-went-dark escalation, the reason-keyed
online-gate. The remaining work is closing the specific deltas the final design introduces.

## Final design decisions being propagated

- Emergency number **999** (already a constant).
- Lynia staffed safety line **+263 77 883 1938** — now a **final client-side constant** (was
  env-sourced, falling back to the emergency number).
- Every contact-support action is a **`tel:` call** (not a `mailto:`/WhatsApp dead end).
- The SOS numbers are client-side constants and **must render even when the log POST fails** (offline).

## Gaps to close

| # | Gap | File(s) |
|---|-----|---------|
| 1 | SOS **safety line** has no client fallback — only renders if the POST returns it. Must render offline. | `shared/policy.ts`, `mobile/src/ui/safety.tsx`, `api/sos/sos.service.ts` |
| 2 | Terminal/gate "Contact support" is a `mailto:` button, not a **`tel:` support call row**. | `mobile/src/ui/safety.tsx` (new `SupportCallRow`), `mobile/app/rider/index.tsx` |
| 3 | `out_of_area` is **not in the `OnlineGateReason` union** (handoff: "add out_of_area + banned"; banned already present). | `mobile/src/logic/gates.ts`, `mobile/app/rider/index.tsx` |
| 4 | Customer sign-in OTP: **30s** throttle (design: 60s), no formatted countdown, **no expired/locked recovery** state. | `mobile/app/verify.tsx`, new `mobile/src/logic/otp.ts` |

## Changes

1. **`packages/shared/src/policy.ts`** — add `SOS_POLICY.safetyLine = "+263 77 883 1938"` (final
   constant; `safetyLineEnv` kept as a per-deploy override). Update the Q3 doc comment to "resolved".
2. **`apps/api/src/sos/sos.service.ts`** — `safetyLine` falls back to `SOS_POLICY.safetyLine` (the
   constant) instead of the emergency number, so server and client agree.
3. **`apps/mobile/src/ui/safety.tsx`** —
   - `SosControl`: default `safetyLine` to `SOS_POLICY.safetyLine` so the second call row renders
     offline / on POST failure.
   - Add exported **`SupportCallRow`** — a calm `tel:` call row (label · "Lynia support" · number ·
     accent phone circle), built on `telUri` + `SOS_POLICY.safetyLine`.
4. **`apps/mobile/src/logic/gates.ts`** — add `out_of_area` to `OnlineGateReason`, its copy in
   `ONLINE_GATE_COPY`, and message sniffing in `onlineGateReason` (reusing the corridor tokens).
5. **`apps/mobile/app/rider/index.tsx`** — render the `out_of_area` gate (icon + "Refresh status");
   replace the `mailto:` "Contact support" button with `SupportCallRow` on the banned / suspended /
   on-hold gate states and the KYC attempt-lock state.
6. **`apps/mobile/src/logic/otp.ts`** (new) — `RESEND_COOLDOWN_S = 60`, `formatCountdown(s)` (`m:ss`),
   and `isOtpExpiredOrLocked(err)` (401 + expired/too-many/never-requested).
7. **`apps/mobile/app/verify.tsx`** — 60s throttle, `m:ss` countdown, and the expired/locked recovery
   state: an info card + a primary **"Send a fresh code"** (a resend resets attempts server-side) that
   clears the stale code, instead of a dead-end error.
8. **Tests** — extend `gates.test.tsx` (out_of_area), new `otp.test.ts`, extend `safety.test.tsx`
   (safety-line constant → dial-safe `tel:`).

## Out of scope (surfaced, not silently implemented — app-logic tickets)

Per the handoff, these behaviour changes the design implies are follow-ups, not part of this
propagation: enforce both contact phones on submit (P0); bounded request timeouts + error states on
every async action; select-offer 409 rollback copy; delivery-OTP 401/403 lockout + re-issue;
one-round-per-rider board hiding; phone-reveal gated to the active window. Token CSS ↔
`design-tokens.ts` are in sync (no token deltas), so no token/primitive value changes are needed.

## Definition of done

`pnpm typecheck`, `pnpm lint`, `pnpm test` pass; SOS numbers render offline; every dead-end state has a
real `tel:` exit; the OTP screen never strands the user.
