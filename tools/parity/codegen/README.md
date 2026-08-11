# mock → RN codegen + structural-snapshot guardrail

Productionized from `tools/parity/spike/`. Turns a design **mock** (a frozen JSX component in
`packages/design/explorations/**`) into a **structurally-faithful React Native presentational
component**, and enforces — in CI, as text a phone can read — that the app's committed view stays
congruent to the mock. This is how "structure correct **by construction**" is delivered for an owner
who can't do a side-by-side visual diff (CLAUDE.md → *Pixel parity*).

Not a workspace package (lives under `tools/parity`, outside the `apps/*`/`packages/*` turbo globs), so
it never enters build/typecheck/test gates — **except** the one CI-run piece, the guardrail engine
(`normalize.mjs` + `snapshot.mjs`), which the api test suite imports and which uses only `typescript`
(a workspace dep), never the Claude-run-only vendored Babel.

## The two halves

| Half | Owns | Files | Runs |
|---|---|---|---|
| **Transpiler** | STRUCTURE + STYLE (mechanical, from the mock) | `transpile.mjs`, `css-map.mjs`, `tokens.mjs`, `extract.mjs`, `emit.mjs` | Claude-run (`cli.mjs gen`) — uses vendored `@babel/standalone` |
| **Guardrail** | asserts view ≡ mock, in CI | `normalize.mjs`, `snapshot.mjs`, `adopted.mjs` | CI (`apps/api/src/parity/structure-snapshot.spec.ts`) — uses `typescript` |

The transpiler closes the census's ~3.7% "hard tail":

- content-aware `div`/`span` → `View`/`Text` (a text-bearing node → `Text`; a node with element
  children → `View` — wrong in *both* directions crashes RN);
- CSS-var tokens resolved **everywhere** by recursing the AST — inside ternaries/logical/computed
  values and JSX string attributes (`color="var(--muted)"`) — mapped to `tokens.*` from `@lynia/shared`;
- idioms: `placeItems`/`grid` → flex center; `whiteSpace:nowrap`+`textOverflow:ellipsis` →
  `numberOfLines={1}`; `transform` string → RN array; `%` `borderRadius` → px circle (from width/height)
  or a pill; `em` → px; unitless `lineHeight` → px; border/padding/margin shorthands expanded;
  `boxShadow` token → spread `tokens.shadow.*`; web-only decls (`cursor`, `display`, `boxShadow:"none"`)
  dropped;
- kit primitives remapped to the app's: `Pad` → padded `View`, `Top` → `AppBar` (Field/Card/Icon/… kept).

Data flows in as **props from a thin container** (the app screen keeps all state/logic/handlers). That
per-screen data seam is the ONLY hand-wired part; the transpiler owns the tree.

## Commands

```bash
node tools/parity/codegen/cli.mjs gen <key>       # (re)generate one adopted screen's .view.tsx
node tools/parity/codegen/cli.mjs gen <key> --stdout
node tools/parity/codegen/cli.mjs gen-all
node tools/parity/codegen/cli.mjs check           # CLI mirror of the CI guardrail
```

## The structural-snapshot guardrail (4th pixel-parity guardrail)

For each screen in `adopted.mjs`, both the **mock** component and the committed **`.view.tsx`** are
reduced to a normalized S-expression capturing element kind (`BOX`/`TEXT`/DS-name), nesting, child
order, and a few structural style axes (`row`, `ai:center`, `absolute`, `border`, `flex1`) — **not**
exact colours/px (token-conformance owns those) and **not** text/handlers. Interaction wrappers
(`Pressable`/`Touchable`/`Fragment`) are transparent, so a container adding a tap handler never
reddens it. A mismatch fails with a tree-path diff, e.g.

```
root>BOX[1]>BOX[0]: expected FIELD, got BOX
```

Screens absent from `adopted.mjs` are not visited — the guard no-ops for them (allowlist-driven, like
`screen-inventory`). Adopting a screen = wire its container to the generated view and add it to
`adopted.mjs`; it is then gated here automatically.

## Adding a screen

1. `node tools/parity/codegen/cli.mjs gen <key>` (add an `adopted.mjs` entry first: mock file +
   component, prop shape, and a small structure-neutral `bind` for the data seam).
2. Refactor the app screen to render `<…View {...data} />`, keeping all logic.
3. `node tools/parity/codegen/cli.mjs check` → green. CI enforces it thereafter.
