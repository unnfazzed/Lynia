# UI kit vs shipped app — DesignSync recheck (2026-08-05, session 2)

**Trigger:** re-run the journey audit from `docs/UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md` against the
**live hosted** LyniaGo Design System project via `DesignSync`, to close that document's own stated
caveat ("the hosted claude.ai Design project could not be opened from this session... re-run this audit
from an interactive session to close that gap"). Scope: only report deltas **new since that document was
last written** — not a full re-audit.

---

## Verdict

**No new deltas.** Every ✅ / ⚠ / ❌ verdict in `UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md` stands unchanged.

1. **DesignSync is still not reachable from this non-interactive session** (confirmed by a live call,
   below) — the prior audit's caveat is not closed by tool access. It **is** closed empirically: the user
   exported the hosted project by hand (`Lynia_Design_System.zip`), and every screen file in that export
   is **byte-identical** to what's committed in `packages/design/` on `main`. §1.
2. Every commit to `apps/mobile`, `apps/admin`, `apps/merchant`, or `packages/design` since the prior
   document's content was last edited was reviewed. Exactly one landed, and it is a verified
   no-behavior-change refactor with zero kit-parity impact. §2.
3. No open PRs are in flight against this repo — nothing merged is missing from this check. §2.4.

---

## 1. DesignSync pull vs `packages/design/` on `main`

### 1.1 Live tool call

```
DesignSync.list_projects → error:
"DesignSync needs design-system authorization, but /design-login requires an interactive
terminal and is not available in this environment."
```

Same limitation the original audit hit. This session cannot authenticate to claude.ai's design-system
API headlessly — that's an environment constraint, not something either audit got wrong.

### 1.2 Substitute: user-provided export of the hosted project

The user exported the hosted **LyniaGo Design System** project by hand and attached it as
`Lynia_Design_System.zip` (bundle root: `design_handoff_lyniago/`). This is a curated **handoff bundle**
of 6 files — not a full-tree mirror of `packages/design/` (which has ~190 files: `components/`,
`tokens/`, `ui_kits/`, `guidelines/`, `handoff/`, etc.). Byte-for-byte comparison of every file in the
bundle that has a direct committed counterpart:

| Bundle file | Committed counterpart | MD5 match |
|---|---|---|
| `All Screens Gallery.html` | `packages/design/explorations/journey/All Screens Gallery.html` | ✅ identical (`8e9c6238…`) |
| `Customer Journey Map.html` | `packages/design/explorations/journey/LyniaGo Customer Journey Map.html` | ✅ identical (`316623d3…`) |
| `Rider Journey Map.html` | `packages/design/explorations/journey/LyniaGo Rider Journey Map.html` | ✅ identical (`1ed9180c…`) |
| `Home Explorations.html` | `packages/design/explorations/restaurants/Home Explorations.html` | ✅ identical (`6dfd13eb…`) |
| `README.md`, `index.html` | — (handoff-bundle scaffolding: spec summary + navigation index, no 1:1 tracked file) | not applicable |

**Zero files differ.** `All Screens Gallery.html` — the file the audit and this recheck both treat as
the single source of truth for the LJ/RC/RJ/RJM/RR registries — is exactly what's committed.

### 1.3 What this does and doesn't confirm

- **Confirmed:** the hosted project has not drifted from `packages/design/` for the screen-gallery files
  the journey audit is built on. Nothing in the live project outdates §5 of the original audit.
- **Not confirmed:** parity for the rest of `packages/design/` (component source, tokens, guidelines,
  admin/mobile ui_kits) — the handoff bundle doesn't include those paths, so this recheck can't speak to
  them. `git log` shows `packages/design/` has had exactly one merge since 2026-08-01 (`8f8c8e9a`,
  2026-08-03, PR #541) and nothing since — i.e., nothing changed in the committed copy either, so there's
  no un-synced local edit for a fuller export to conflict with. Closing this residual gap fully still
  needs either an interactive `/design-login` session or a complete project export.

---

## 2. Shipped-code delta scan since the prior audit was last written

The prior document's content was last edited in commit `749664c3` ("feat(restaurants): remind me when
they open", 2026-08-05 11:14:10 UTC — the Tranche 3 write-up). Every commit reachable from `HEAD` but not
from `749664c3`, touching `apps/mobile`, `apps/admin`, `apps/merchant`, or `packages/design`:

| Commit | What it is | Kit-parity impact |
|---|---|---|
| `f865ada6`, `11deea05` | `release-please` version/changelog bumps (`apps/mobile/package.json`, `CHANGELOG.md`, `app.config.ts` version string) | None — no UI/behavior change |
| `3e40106a` (in PR #608, merge `8af9faa8`) | `fix(mobile): keep the remind-me control behind the ui/api boundary` | See 2.1 |

No commits touched `apps/admin`, `apps/merchant`, or `packages/design` in this window.

### 2.1 `3e40106a` — verified

CI's `depcruise` step caught an architecture-boundary violation the local typecheck/lint/test gate
doesn't run: `mobile-ui-no-api` forbids `src/ui/*` from importing `src/api/*` directly, and
`RemindWhenOpen.tsx` (introduced by the same PR) did. The fix moves the `useQuery`/`useMutation` round
trip into `src/query/use-restaurants.ts` as `useReopenReminder`, leaving `RemindWhenOpen` presentational
(props in, `onToggle` out) — the screen (`app/food/[id].tsx`) now owns the toast and haptic.

Read both versions of `RemindWhenOpen.tsx` side by side: **no visual, copy, or flow change.** Same
icon/label/pressed-state, same accessibility label, same disabled styling.

One incidental, off-topic-for-this-audit nuance: `accessibilityState` changed from
`{ selected: isSet, busy: m.isPending || q.isLoading }` to `{ selected: isSet, busy: isPending }` — the
Pressable's actual `disabled` prop still correctly covers the initial-load state (via the `disabled` prop
threaded from the parent's `reminder.isLoading`), so the control still can't be pressed while loading,
but a screen reader no longer announces "busy" during that brief initial fetch, only during the mutation.
Not a kit-fidelity delta (nothing in the kit specifies ARIA busy timing) — noted for completeness since
it is a genuine post-audit code change, not because it belongs on the fix list below.

**Conclusion: this commit does not move any screen's verdict.** §5.3's Tranche 3 entry
("✅ shipped in Tranche 3") in the original document still holds exactly as written.

### 2.2 No other shipped changes

`apps/admin` and `apps/merchant` are untouched since the audit — §5.5's "✅ complete and ahead of the
kit" / "✅ queue, menu, hours, shop, statement, login" verdicts stand as written.

---

## 3. Screen-by-screen status — carried forward unchanged

No new deltas were found, so the full per-screen tables are not reproduced here — they are unchanged in
`docs/UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md` §5. Condensed status, for a self-contained read:

| Registry | States | Status |
|---|---|---|
| `LJ` — Customer · parcel | 57 | Near-complete; one presentation-only gap (`addr_search` as a dedicated routed screen) — unchanged, see §4 |
| `RC` — Customer · food | 46 | Strongest-adopted area; one cheap copy/action gap (`closed_interrupt`) — unchanged, see §4 |
| `RJ` + `RJM` + `RR` — Rider | 69 + 12 + 19 | Complete; the one apparent gap (food jobs on the merged board) is a correctly-dormant feature flag, not a defect — confirmed, no change |
| Admin (kit's 7 pages) | — | ✅ complete and ahead of the kit (`sos/`, `merchants/` beyond the kit) — confirmed, no change |
| Merchant | — | ✅ queue, menu, hours, shop, statement, login — confirmed, no change |
| Foundations (color/spacing/radius/type/targets) | — | ✅ full, token-for-token parity — confirmed, no change (zero commits to `packages/design/` or `packages/shared/src/design-tokens.ts` in this window) |

---

## 4. Prioritized fix list — carried forward unchanged

These are the same open items from the original document's §6 "Next tranche" list. Nothing in this
recheck adds to, removes from, or reorders them — listed here only so this document is self-contained.

| # | Fix | Effort | Note |
|---|---|---|---|
| 1 | Surface the kit's in-search **"Use my current location"** and **"Set the pin on the map"** rows inside the search list itself | S | Both capabilities already exist as map controls; this is presentation, not new capability |
| 2 | Build `addr_search` as a dedicated routed screen with an autofocused field | M | The one-screen composer already covers the behavior (row tap focuses search) — presentation gap only |
| 3 | Extend the "remind me when they open" pattern to `list_empty` ("nothing open right now") | S | Blocked on deciding which kitchen the reminder targets when none is selected |
| 4 | `closed_interrupt` — offer the kit's explicit **"Keep my cart for tomorrow"** action | XS | Cart is already preserved; only the copy/action affordance is missing |

No P0/P1 items remain — every capability-level gap the original audit found (address search
provisioning, `addr_map_confirm`, the Maps route hand-off) shipped in Tranches 1–2. What's left is
presentation-level, per the original document's own framing.

---

## 5. Methodology

- `DesignSync.list_projects` called live — confirmed the interactive-auth error.
- Extracted the user-provided `Lynia_Design_System.zip`; `md5sum` compared each file against its
  committed counterpart.
- `git log --follow -- docs/UI-KIT-VS-SHIPPED-AUDIT-2026-08-05.md` to find the document's last content
  commit (`749664c3`).
- `git log 749664c3..HEAD -- apps/mobile apps/admin apps/merchant packages/design docs/KNOWN_BUGS.md` to
  enumerate every commit since, then `git show` on each to classify impact.
- `git log --since=2026-08-01 -- packages/design` to confirm the design package itself hasn't moved.
- `mcp__github__list_pull_requests` (state: open) → zero open PRs; nothing merged is missing from this
  check.
