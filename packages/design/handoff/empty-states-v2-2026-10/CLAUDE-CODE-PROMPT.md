# Claude Code prompt — Empty states v2 (minimal)

Paste below the line into Claude Code at the repo root. Put this folder at `handoff/empty-states-v2-2026-10/` in the repo first.

---

Replace every empty state in the LyniaGo mobile app (`apps/mobile`, customer + rider) with one minimal component. The spec is `handoff/empty-states-v2-2026-10/README.md` — read it fully before editing. `Empty States Minimal v2.html` is the visual reference (HTML, do not ship it). `copy.ts` holds every string.

## Steps
1. **Read first**: README.md, copy.ts, then the files in README §4. Confirm the real line numbers and list every current empty/error/no-data render you find (grep for `EmptyState`, `IconDisc`, `InfoCard`, `EmptyArt`, `MintEmptyCard`, `NoLocationCard`, `ComingSoonCard`, `NEmpty`, `NFail`, `BrowseEmpty`, `ServiceEmpty`, `CentreState`, `TrustTrackingArt`). Show me the list before changing anything.
2. **Build the component** in `src/ui/index.tsx` (replace the existing `EmptyState` at ~:656): `EmptyState` (size L, tones `empty | info | error`) and `EmptyRow` (size S), exactly per README §1 — disc 64, halo 88 (1px), accent dot 8 with 3px white ring, Lucide 24 stroke 2, title Inter 18/600 −0.18 ls max 264, body 14/20.3 muted max 264, actions 20 below, soft pill 44 (`#E9F8EF` bg, `#006630` 14/600, pressed `#D4F2E0`), text button 44. Use existing colour tokens; add `accentWashPressed #D4F2E0` if missing. No shadows, no card.
3. **Add copy** as `src/ui/emptyCopy.ts` from copy.ts (keep the `was:` comments out of the shipped file or keep them as comments — your call; strings must be verbatim).
4. **Migrate every screen** in README §2 and §3 to `EmptyState`/`EmptyRow` with the listed icon, tone and actions. Placement: top of mark at ~30% of the free height below the header (min 48), bottom inset 72 + safe-area on tab roots. Delete the old wrappers (`MintEmptyCard`, `InfoCard`, `EmptyArt`, `NEmpty`, `NFail`, `BrowseEmpty`, `ServiceEmpty`, `CentreState` empty usage, `NoLocationCard` variants) once unused. Stop using `TrustTrackingArt` in empty states.
5. **Frame-level changes**: J4 drop the paragraph and "Why no jobs?" box, add the centred demand row; M9 drop the Earnings-card hint and use `EmptyRow` with disc for history; Job history add the new empty state and plain-text summary; S8 replace the closed strip + toggle with the single `EmptyRow` + "Remind me" action (toggles → "Reminder on"); B7 replace the compact card with the bordered `EmptyRow` + "Set"; X4b replace the banner with the 16px `wifi-off` row.
6. **Rules**: rider screens never show Retry/Refresh — use `retrying` copy. Never use `#00B14F` for text or fills other than icon/dot. Never a filled `#00812F` button inside an empty state. Removed actions listed in README §6 stay removed.
7. **Out of scope** — do not touch: rider gates G4/G14/G10, S9 modal, F4, service-soon sheet, merchant app, admin console.
8. **Verify**: typecheck + lint; render each state from README §2/§3 at 360×720 and 320×640 (titles may wrap to 2 lines, nothing clips, nothing sits under the tab bar). Report a checklist: ID → file → done.
