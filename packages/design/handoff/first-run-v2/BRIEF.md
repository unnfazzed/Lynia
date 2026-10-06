# First Run v2 — decisions (final)

1. **Explain before the Android dialog, never after.** The OS dialog opens only from our primary button.
2. **Customers are asked in context.** Location when Home needs an address (PC1 sheet over Home, the same from H6 and H5). Notifications right after the first order (PC8). No first-run priming.
3. **PC1 is a sheet, not the H6 card's expanded state.** It is the same surface from H6 and H5, and Home stays visible behind it.
4. **Riders: one flow per install, after R3 and before Go online.** P1 → P3 → P9 → P13. Every "Not now" continues; skipped steps come back as J8/G8 on the board.
5. **P8 is a toast, not a frame.** It saves the rider a tap.
6. **We never request "Allow all the time".** During a job, a `location` foreground service shows a persistent notification (P3 draws it).
7. **No Retry buttons.** The app re-reads the permission on return from Settings. "I've turned it on" is allowed.
8. **U1 is white with a green panel.** White text on `#00B14F` fails AA (2.9:1). The splash stays green.
9. **U1 always has a way to get help** (WhatsApp), and U2 swaps the CTA for WhatsApp when there's no store link.
10. **D3 shows "Saved" inline on the button**, where the eye already is. No toast.
11. **D6:** a verified rider's ID is read-only, masked except the last 3 characters.
12. **Plate changes are instant** and show "Checking" until ops confirm. The rider keeps riding.
13. **Rider photo and plate are optional.** No nagging anywhere else. **The licence is dropped from all copy.**
14. **One shell for all ID-check outcomes.** Exit `x` only; no "Send a parcel" / "Order food" secondaries.
15. **Each decline reason gets its own advice** (blurry ≠ face ≠ document ≠ other).
16. **G1: R1 is the first rider screen.** The "Earn with your bike" interstitial is removed.
17. **Times:** automated check = "about 2 min" to do and "usually under a minute" to check; a person = "usually a few hours". In-app notification only (no SMS).
18. **Rider splash: two steps.** At 320×640 the card sits 16dp above the nav bar and the wordmark centres in the remaining space.

## Open questions
- Confirm `#F4D9D5` (danger-hero sun) and `#FFF6D6` ("Checking" pill) as tokens, or swap in the nearest existing ones.
- Backend: `recommendedVersion` (U4), `whatsNew` (U1), `kyc.declineReason`, `plate_status`, free-job pushes at 1 and 0.
- Customer notification re-ask cap (3 orders) is a proposal; confirm it.
