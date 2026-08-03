# LC loop D report — 2026-08-03h — D-O2 (optimize mode)

Territory: `docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane D, first unchecked
**Optimization checklist** item after D-O1 — D-O2: "OTP delivery + verify success telemetry by
carrier (Econet/NetOne/Telecel) so deliverability regressions are visible (DoorDash lesson 11)."

All five Lane D audit territories (D-T1–D-T5) and all Day-0 defects are already closed, and no
unmerged `claude/lc-d*` PR existed at Phase 0, so this firing stayed in OPTIMIZE MODE and took the
next unchecked checklist item.

## How this ran

A read-only research pass first mapped the OTP send/verify/webhook code (`apps/api/src/auth/`) and
the existing `MetricsService` (`apps/api/src/observability/metrics.service.ts`) before writing any
code. Key findings that shaped the design:

- **Bird (bird.com) is the live SMS channel** (`docs/BIRD-SETUP.md`); its delivery-status webhook
  (`bird-webhook.controller.ts`) already carries the recipient's real `mcc_mnc` on every terminal
  event — GROUND TRUTH carrier data, confirmed against a live Econet test send. It was already on
  the wire and simply not being captured.
- Only a **failure** counter existed (`bird_otp_delivery_failed_total`) — with no "delivered"
  counter, a per-carrier success *rate* couldn't be computed at all, only an absolute failure count.
- Zimbabwean number portability means MSISDN-prefix carrier guessing is inherently unreliable for
  `071`/`073` (shared/ported across carriers) — only `077`/`078` (Econet), `086` (NetOne), `088`
  (Telecel) are safely unambiguous today. No prefix-mapping code existed anywhere in the repo.

## What shipped

- **`apps/api/src/auth/otp-carrier.ts`** (new): `carrierFromMccMnc` — the ground-truth mapping from
  Bird's MCC/MNC (Zimbabwe MCC 648; MNC 01 NetOne, 03 Telecel, 04 Econet, ITU E.212) — and
  `carrierFromPhone` — a best-effort MSISDN-prefix guess for send/verify time, before any delivery
  report exists, that deliberately collapses ambiguous/ported prefixes to `"other"` rather than
  guessing wrong. Both return the new closed 4-value `OtpCarrier` vocabulary
  (`"econet" | "netone" | "telecel" | "other"`, defined once in `metrics.service.ts` alongside the
  file's other fixed label vocabularies).
- **`bird-webhook.ts`**: `extractDeliveryFailure` now also returns `carrier` (from the event's own
  `mcc_mnc`); a new `extractDeliverySuccess` extracts the `sms.delivered` terminal event the same
  way — previously silently discarded as "not a failure" with no positive signal recorded at all.
- **`metrics.service.ts`**: `recordOtpVerify` and `incBirdOtpDeliveryFailed` gain a `carrier`
  parameter; two new instruments — `otp_requested_total` (send-attempt count, best-effort carrier)
  and `bird_otp_delivered_total` (confirmed-delivery count, ground-truth carrier) — the latter is
  the missing "delivered" half needed to compute `delivered / (delivered + failed)` per carrier.
- **`bird-webhook.controller.ts`**: records both the failure and the (new) success outcome, each
  tagged with its Bird-reported carrier.
- **`auth.service.ts`**: `requestOtp` counts one `otp_requested_total` after a successful send
  (best-effort carrier from the phone); `verifyOtp` tags every `recordOtpVerify` exit (`ok` /
  `grace_ok` / `invalid` / `expired` / `locked` / `error`) with the same best-effort carrier.
- **`docs/OBSERVABILITY.md`**: metric table + fixed-label-vocabulary section updated for the two new
  counters and the extended labels, plus a documented (not yet Terraform-wired) candidate PromQL
  alert for a per-carrier deliverability regression — left for the founder to apply per the LC-D
  read-only infra doctrine, since this lane's mandate is app-side metrics, not `infra/terraform/**`.

## Verification

New tests: `apps/api/src/auth/otp-carrier.spec.ts` (both derivation functions, including the
ambiguous-prefix and unmapped-mcc_mnc cases), extended `bird-webhook.spec.ts` (carrier on
extracted failures, new `extractDeliverySuccess` suite, phone-never-leaks assertions preserved),
extended `bird-webhook.controller.spec.ts` (carrier propagates through the controller; the previous
"does not count a successful delivery" test is now "counts a successful delivery by carrier instead
of as a failure", reflecting the new positive signal), and updated `auth.service.spec.ts` /
`metrics.service.spec.ts` call-site assertions for the new/changed signatures.

Full monorepo `pnpm typecheck && pnpm lint && pnpm test` green (`@lynia/api` typecheck required a
one-time local `pnpm install` + `prisma generate` + `packages/shared` build in this fresh checkout —
environment setup, not a repo defect). `pnpm depcruise` shows 0 new violations.

## Not done / scoped out

- No Terraform alert wired for the new per-carrier metrics — per the read-only infra doctrine this
  lane observes and reports on `infra/terraform/**`, it doesn't mutate it. A candidate PromQL is
  documented in `docs/OBSERVABILITY.md` for the founder to apply.
- Verify-time and send-time carrier labels remain **best-effort** (MSISDN prefix); no phone→carrier
  cache was added to make verify-time carrier ground-truth from a prior delivery webhook — that
  would add new stateful plumbing (a cache keyed by phone, populated async by the webhook, read
  synchronously by verify) disproportionate to a "(M)"-sized telemetry item. The Bird-sourced
  `bird_otp_delivered_total` / `bird_otp_delivery_failed_total` pair is the trustworthy source for an
  actual per-carrier success rate; the request/verify counters are attempt-side context only — this
  distinction is called out in `docs/OBSERVABILITY.md`.
