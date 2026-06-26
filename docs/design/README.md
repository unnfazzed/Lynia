# Lynia — design mockups

Plan-driven screen mockups built from [`docs/DESIGN.md`](../DESIGN.md) + `docs/CONCEPT.md` (§5c/§5d/§6).
Clean-utility direction, warm accent, light + sunlight-contrast, Manrope, tabular fares. Frames are 340px
(Android-first). Faithful build references — **not pixel-final**. Edit the `.html`, re-render with the
command below.

## Full two-sided journey (added pre-Phase-3, covers every flow)

| Board | PNG | HTML | Flows |
|-------|-----|------|-------|
| 1 · Auth + customer | `lynia-flows-1-auth-customer.png` | `lynia-flows-1-auth-customer.html` | splash · phone · OTP verify · role routing · map-home/send · offers (best-match) · 7-step tracking · delivered+rate · no-offers · no-riders · cancellable |
| 2 · Rider | `lynia-flows-2-rider.png` | `lynia-flows-2-rider.html` | become/KYC · online board · offer compose · active-job stepper (rider view) · delivery OTP · delivered/free · no-orders · not-verified gate · cooldown/offline |
| 3 · Cross-cutting + earnings | `lynia-flows-3-crosscutting.png` | `lynia-flows-3-crosscutting.html` | history · profile/settings · rider rating profile · notifications · support · earnings ledger (payment-agnostic) · customer trip receipt |

Shared tokens live in `flows.css` (mirrors `packages/shared/src/design-tokens.ts`).

### Earlier customer-only prototype
`lynia-screens.html` / `lynia-screens-preview.png` — the original `/design-html` output (customer side
only). Superseded by the three boards above, kept for history.

## Re-rendering

Headless Chrome (pre-installed; no Playwright package needed). Tune `--window-size` height to the board:

```bash
CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
cd docs/design
"$CHROME" --headless=new --no-sandbox --hide-scrollbars --force-device-scale-factor=2 \
  --virtual-time-budget=4000 --default-background-color=00000000 \
  --window-size=1900,2640 --screenshot=lynia-flows-1-auth-customer.png \
  file://$PWD/lynia-flows-1-auth-customer.html
```

## Next (post-Phase-3, per DESIGN.md DT13)

These are the spec. When a device build exists, regen against the live app, then run the visual
`/design-review` (DT7) + `/qa`.
