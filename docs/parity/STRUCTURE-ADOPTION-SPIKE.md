# Structure-Adoption Spike — how to adopt the mocks' STRUCTURE across 275 screens, by construction

**Status:** research + prototype spike. No app runtime touched. Prototype code lives in
`tools/parity/spike/` (outside every build/typecheck/test gate, same as the rest of `tools/parity`).
**Question it answers:** the owner codes from a phone and cannot do a side-by-side visual comparison,
so per-screen hand-alignment (Phases 3–6) has no human backstop. What method adopts the mocks'
*structure* reliably — so the 220 customer+rider states and 55 web states can be committed to it?

**Bottom line:**

| Surface | Method | Verdict |
|---|---|---|
| Mobile (220 screens: 122 customer + 98 rider) | **mock→RN codegen** | ✅ recommended. RSD is **not viable** in this stack — reasons below. |
| Web (55 screens: 48 merchant + 7 admin) | **direct-DOM adoption** (lift the mock tree into Next) | ✅ low risk; the mock and the app are the same substrate. |

The single load-bearing finding: **the mock is a tree, and the tree is the thing the token/pixel
guardrails cannot see.** Both recommended methods make the app tree a *mechanical function* of the
mock tree, and a new **structural-snapshot guardrail** (§4) asserts the two trees stay congruent in
CI. That is what "structural correctness by construction" means here.

---

## 0. What the surfaces actually are (measured, not assumed)

Mock source of truth: `packages/design/explorations/journey/*.jsx` (+ `explorations/restaurants/*.jsx`).
Every mock is a React component built from **design-system primitives + DOM elements + inline style
objects using CSS-var tokens** (`var(--ink)`, `var(--radius-input)`, …), frozen (no state/logic),
rendered in-browser by the existing parity harness.

Element + style census across all 20 mock files (`tools/parity/spike/census.mjs`):

- **11,070 style declarations** in **3,098 style objects**.
- DOM elements: `div` ×1953, `span` ×722, `b` ×31, svg family ×~45, `button` ×9, a handful of
  `section/header/nav/h2/a/ul/li/img`, one `iframe` (the stubbed map embed).

The apps:
- **Mobile** = React Native / Expo (`apps/mobile`): `View`/`Text`/`StyleSheet`, RN token object
  (`tokens.color.ink`), **no DOM, no CSS, no CSS custom properties**. This is the hard translation.
- **Web** = Next.js (`apps/admin`, `apps/merchant`): React/DOM/CSS. The design tokens are already
  ported into `apps/admin/app/globals.css` `:root` and **guardrail-enforced** to equal the design
  source (`apps/api/src/design-tokens.drift.spec.ts`). Same substrate as the mock.

The parity harness already renders the RN app screens on web via **react-native-web** (esbuild alias
`react-native`→`react-native-web`) — so "RN authored code runs in a browser for comparison" is an
existing, working capability. Hold that thought for the RSD verdict.

---

## 1. MOBILE — feasibility verdict: codegen, not RSD

### 1a. Why react-strict-dom (RSD) is NOT viable here

I evaluated RSD against the real stack (`apps/mobile/package.json`): **React 18.3.1, react-native
0.76.9, Expo SDK 52**, `babel-preset-expo`, and a Metro config that already carries custom
`resolveRequest` logic with `unstable_enablePackageExports` **off**.

RSD fails on four independent grounds, any one of which is disqualifying, and the deepest one is
architectural (version-independent):

1. **The mocks are not RSD-shaped, and never will be without a hand rewrite.** RSD authors UI as
   `<html.div style={styles.x}>` with **static** styles from `css.create({...})` (a StyleX model).
   Our mocks are plain `<div style={{…}}>` with **dynamic inline** style objects — colours and sizes
   computed inline (`background: value ? color : "var(--bg)"`, `borderRadius: role==="pickup" ? "50%"
   : 3`). StyleX's compiler wants statically-analysable styles; dynamic values go through a
   constrained function API. Adopting RSD therefore means **hand-rewriting all 275 mocks into RSD
   syntax AND rewriting every app screen into RSD** — which turns the mock (the source of truth) into
   something re-authored by hand. That is *precisely* the hand-alignment failure mode the owner is
   escaping. RSD does not let the app be a function of the mock; it makes both hand-authored twins.

2. **RSD solves a problem we don't have.** RSD's value is "write once, run on RN and web." Our
   source of truth is the **mock (DOM)**, not an RSD component; and the parity harness *already* runs
   the RN app on web via react-native-web. We need mock→app, which RSD does not provide.

3. **Version / React 19.** RSD's maturing line leans on React 19 for its web runtime; the app is
   pinned to React 18.3.1 (Expo 52's supported React). Chasing RSD's happy path risks a React-major
   bump on a shipping Expo binary.

4. **Toolchain graft.** RSD requires StyleX's Babel plugin + Metro wiring, and StyleX generally
   wants package-exports resolution — which this Metro config deliberately keeps **off** and patches
   per-package. Adding it is real risk on a working release pipeline for zero structural benefit.

**Verdict: do not adopt RSD.** It is still maturing, it is incompatible with this Expo/React pin
without upgrade risk, and — the real dealbreaker — it cannot ingest the existing mocks, so it buys a
permanent dual-authoring burden instead of a one-time transform.

### 1b. Codegen — prototype + fidelity evidence

Prototype (`tools/parity/spike/transpile.mjs`, a Babel plugin over the vendored `@babel/standalone`)
transpiles a mock's JSX + inline CSS into an RN presentational component:
`div`→`View`, `span`/text→`Text`, DS primitive→RN DS primitive, inline CSS→RN style with a
deterministic property mapper (`css-map.mjs`), CSS-var→`tokens.*` lookup.

**Repo-wide mappability (census over all 11,070 declarations):**

| Verdict | Count | Share | What it means |
|---|---:|---:|---|
| clean | 8,143 | 73.6% | 1:1 to an RN key (camelCase / px-strip / token lookup) |
| transform | 1,767 | 16.0% | deterministic value/shorthand rewrite (border/padding shorthands, `boxShadow`→`tokens.shadow.*`, `inset:0`, em/lineHeight) |
| drop | 718 | 6.5% | no-op on native (`display:flex`, `cursor`, `pointerEvents`) — safely removed |
| structural | 383 | 3.5% | needs a prop/tree idiom, not a style key |
| manual | 29 | 0.3% | RN can't express the value shape |
| unknown | 30 | 0.3% | unclassified (long tail) |

**≈96% of style declarations map mechanically.** The 3.7% "hard" tail is concentrated in **a few
known idioms**, not scattered chaos:

- `display:grid` + `placeItems:center` (158 + 153) → a flex `View` with `alignItems`/`justifyContent`
  — one recognizable pattern the codegen already rewrites.
- `whiteSpace:nowrap` + `textOverflow:ellipsis` (39 + 27) → `numberOfLines={1}` on the `Text` — an
  element-prop transform the codegen already emits.
- `transform` string→array (19) is the only genuinely fiddly one (`%`-translate is unsupported on RN
  and needs a hand call).

**Running it on a real mock** (`AddrRows` from `screens-shipped.jsx`, via `spike/run-demo.mjs`)
produced a **structurally exact** RN tree — same nesting, same element count, same order — with
**26 declarations mapped clean, 5 value-transformed, 0 unresolved flags** after the content-aware
pass. The generated component is readable RN (`<View>`/`<Text>` with `tokens.color.*`, expanded
`borderWidth/Style/Color`, `paddingVertical/Horizontal`, `numberOfLines={1}` on the ellipsized row).

**The three honest seams the prototype exposed** (these are the real cost, name them):

1. **`div`/`span` → `View`/`Text` is content-dependent, not tag-dependent — the #1 seam.** RN
   crashes on raw text under a `View` and on layout children under a `Text`. A naive tag map is wrong
   in *both* directions: a text-bearing `<div>` must become `<Text>`, and a shape `<span>` (a 12×12
   dot with a border, no children) must become `<View>`. The fix is a **content-aware rule** (all
   children are text/expressions → `Text`; any element child → `View`); the prototype implements it
   and it resolves the demo cleanly. This rule is reliable but is the part that most needs the
   structural-snapshot guardrail watching it.
2. **Dynamic style values bypass a value-level rewriter.** `var(--x)` sitting inside a ternary
   (`value ? color : "var(--bg)"`) is not a top-level string, so a naive pass leaves the raw
   `var()` string in place (invalid on RN). The codegen must recurse into `ConditionalExpression`/
   computed values and resolve tokens there — tractable, but it is where a lazy implementation
   silently ships a broken colour.
3. **Unit/again-idioms:** `letterSpacing:".05em"` (em→px), `lineHeight` unitless→`fontSize`-relative
   number, `borderRadius:"50%"` (RN's `%` radius support is partial). Small, bounded, listed.

The **data-binding seam** is the other real cost: the mock is frozen literals; the app screen is
deeply stateful (`apps/mobile/app/send.tsx` is ~870 lines of hooks/queries/effects). Codegen
produces the **presentational shell** — the tree and its styles — and each screen keeps a thin
**container** that owns data/state and passes it in as props. Codegen never touches business logic;
it owns the *structure*, which is exactly the thing under review. Where a screen already has a good
container (Phase 2 wired 47 of them), the codegen output replaces the presentational JSX only.

---

## 2. WEB (admin + merchant) — feasibility + effort

**Low risk. The mock and the app are the same substrate (React/DOM/CSS), so "translation" is close to
identity.**

- **Merchant tablet (RM, 48 screens):** the mock (`explorations/restaurants/r-merchant.jsx`) is the
  *same* journey-style JSX — `div`/`span` + inline style objects with `var(--…)` tokens (664
  div/span/inline-style hits in that one file). In Next this renders **verbatim**: `div`=`div`,
  `span`=`span`, inline styles are valid DOM, and CSS custom properties resolve natively because the
  tokens are already in `globals.css` and guardrail-frozen. There is **no primitive translation and
  no StyleSheet**. Adoption = lift the mock's presentational subtree into a Next presentational
  component and swap the frozen literals for props/server data.
- **Admin console (7 screens):** the mock is a separate **class-based HTML kit**
  (`ui_kits/admin/*.html`: `.shell`, `.data`, `.card`), and the admin app **already ports** those
  classes + tokens into components (`DataTable`, `FilterNav`, `StatusPill`) and `globals.css`. Here
  adoption = assert the app's DOM/class structure matches the kit's, and reconcile any drift.

**Effort per web screen** is dominated by the **data-binding seam** (swap literals → props / server
fetch) and, for merchant, reconciling the mock's **inline styles** with the app's preference for
**CSS classes**. Both are mechanical. No toolchain risk, no runtime translation. Estimate: a
merchant screen is a few hours (mostly wiring data + splitting presentational vs container); admin is
a structural diff-and-fix against the kit.

---

## 3. Recommended end-to-end architecture for the 275-state sweep

Differs by surface, because the surfaces differ:

**Mobile (220 screens) — codegen → presentational component + container:**
1. Promote the spike transpiler to a real tool (`tools/parity/codegen/`), hardening the three seams
   in §1b: content-aware `View`/`Text`, recursive token resolution into dynamic values, the em/%/
   lineHeight unit rules. Keep the `boxShadow`→`tokens.shadow.*`, shorthand-expansion, `grid`→flex,
   `nowrap/ellipsis`→`numberOfLines` transforms it already has.
2. For each screen, codegen emits `…/<screen>.view.tsx` — a **pure presentational** RN component
   whose props are the data the mock hard-codes. Regenerating is idempotent, so a mock re-export
   re-emits the shell; hand-fixes live only in the container.
3. Each screen's existing route file becomes the **container**: it owns hooks/queries/state (all the
   `send.tsx` logic) and renders `<ScreenView {...data} />`. Phase-2's 47 wired screens already have
   containers + fixtures — reuse them.
4. Render the generated view through the **existing parity harness** (react-native-web) beside the
   mock; the structural-snapshot guardrail (§4) gates it.

**Web (55 screens) — direct-DOM adoption:**
1. Lift the mock's presentational subtree into a Next presentational component (merchant: verbatim
   div/span/inline-style; admin: match the kit's class structure).
2. Wire data via props / server components; keep the container/presentational split so the same
   structural-snapshot guardrail can compare trees.
3. No codegen strictly required — but the *same* Babel-tree extractor from the mobile codegen feeds
   the guardrail, so both surfaces share one tree-comparison mechanism.

**Shared seam contract:** every screen, both surfaces, is `container(data) → <View/DOM presentational
tree>`; the presentational tree is a mechanical function of the mock; CI compares trees.

---

## 4. The missing guardrail — structural-snapshot

Token-conformance proves *values* match; the screenshot lane proves *pixels* match to a human eye.
Neither asserts the **component tree** matches — which is what silently drifts when a screen is
hand-tweaked. Proposed CI check (blocking), sketched concretely:

**What is compared.** For each aligned screen, serialize *both* trees to a **normalized structural
S-expression** and assert equality:
- **Mock tree:** walk the mock's JSX AST (the codegen already parses it) → normalized nodes.
- **App tree:** render the app screen through the parity harness and read `ReactTestRenderer`'s JSON
  (or the harness DOM), mapping back to canonical node kinds.

**Normalization (so it tests STRUCTURE, not noise):**
- Element kind canonicalized across surfaces: `div`/`View`→`BOX`, `span`+text/`Text`→`TEXT`, DS
  primitive→its name (`Button`, `Icon`, `Field`, `StatusPill`), svg→`SVG`.
- Keep only **structural style axes** that define the look — `flexDirection`, `position`,
  presence-of-border, presence-of-shadow, `alignItems`/`justifyContent` — **not** exact px (the token
  + pixel guards own those). This keeps the check about *shape*, orthogonal to the value guards.
- Drop pure text content and data values; keep element **order** and **nesting depth**.

**Shape of the artifact:** a stored `…/<screen>.tree.json` snapshot per screen, e.g.
`BOX[row]( TEXT, BOX[col]( TEXT, TEXT[ellipsis] ), Icon )`.

**How it fails, loudly and legibly:** a structural diff — "mock has `Icon` as 3rd child of the row;
app tree is missing it," or "app wraps the two labels in an extra `BOX` the mock doesn't draw," or
"mock `TEXT` became an app `BOX` (text rendered in a layout node)." The failure names the **path**
in the tree, so it is actionable from a phone with no image. Because the codegen makes the app tree a
function of the mock tree, a green snapshot is *structural parity by construction*; a red one means a
hand-edit diverged from the mock and must be reconciled (or logged in `docs/DESIGN-DEVIATIONS.md`).

**Where it plugs in:** a new `apps/api/src/parity/structure-snapshot.spec.ts` alongside the existing
`screen-inventory.spec.ts`, sharing the parity registry. It joins the three current guardrails
(token-conformance, screen-inventory, reverse-drift freeze) as the fourth — the one that watches the
tree.

---

## 5. Honest effort / risk estimate + dealbreakers

**Effort (order-of-magnitude, not a commitment):**
- Codegen hardening (the three seams + svg/DS mapping table): a few days to a robust tool. The
  mapping surface is *known and bounded* — this doc enumerates it from real data (11,070 decls).
- Per-screen mobile: codegen emits the shell in seconds; human cost is the **container/data seam**
  and reconciling any pre-existing hand-written screen with the generated tree. Screens with a
  Phase-2 container (47) are cheapest; net-new states are a container + fixture each.
- Per-screen web: hours each, dominated by data wiring + inline-vs-class reconciliation. No tooling
  risk.
- Structural-snapshot guardrail: 1–2 days (tree extractor is shared with the codegen parser;
  RN-side reads test-renderer JSON the jest suites already produce).

**Risks / caveats (stated plainly):**
- **The `View`/`Text` seam is the one to watch.** It is content-dependent and the place a sloppy
  codegen ships a runtime crash or a mis-nested tree. The structural-snapshot guardrail is the
  backstop — build it *with* the codegen, not after.
- **Dynamic style values** (tokens inside ternaries/computed expressions) must be resolved by
  recursing the AST; a value-level-only rewriter leaves invalid `var()` strings on RN. Bounded but
  must be done.
- **Codegen owns structure, not logic.** It does not remove the need for containers; the ~870-line
  stateful screens keep their logic. The win is that *structure* stops being hand-judged.
- **The map/`iframe`/photo slots and native maps** are already handled as honest stubs by the parity
  lane and are out of scope for tree adoption.

**Dealbreakers found:** none for codegen or direct-DOM. **One clear dealbreaker for RSD** (§1a): it
cannot ingest the existing mocks without hand-rewriting both the mocks and the app, which defeats the
"mock is the source of truth" premise and re-introduces the un-backstopped hand-alignment the owner
is trying to eliminate — on top of React-19/StyleX/Metro toolchain risk on a shipping binary.

**Recommendation:** commit the 220-screen mobile sweep to **mock→RN codegen** and the 55-screen web
sweep to **direct-DOM adoption**, with a **shared structural-snapshot guardrail** as the fourth CI
gate. That combination is what delivers "structural correctness by construction" for an owner who
cannot eyeball a diff.

---

## Appendix — prototype files (experimental; not wired into any build)

- `tools/parity/spike/babel-load.mjs` — loads the vendored `@babel/standalone` for Node.
- `tools/parity/spike/css-map.mjs` — the CSS-property → RN mapping ruleset + value-refinement.
- `tools/parity/spike/census.mjs` — the repo-wide classifier (the 11,070-declaration table above).
- `tools/parity/spike/transpile.mjs` — the mock-JSX → RN Babel-plugin transpiler.
- `tools/parity/spike/run-demo.mjs` — runs the transpiler on a real mock and prints the RN output +
  per-screen fidelity report.

Reproduce: `cd tools/parity/spike && node census.mjs && node run-demo.mjs`.
