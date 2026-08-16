/**
 * Mock JSX + inline CSS  →  React Native presentational JSX (productionized from tools/parity/spike).
 *
 * Rewrites the mock component's AST in place, then lets Babel print RN-flavoured JSX. The goal is
 * ZERO unresolved declarations on a real screen — the "hard tail" the census enumerated is closed
 * here:
 *
 *   • Content-aware `div`/`span` → `View`/`Text` (the #1 seam — content-dependent, not tag-dependent;
 *     RN crashes on raw text under a View and on layout children under a Text).
 *   • DS-primitive remap: mock kit names → the app's `@lynia/shared`/`src/ui` primitives
 *     (`Pad`→padded `View`, `Top`→`AppBar`, keep `Field`/`Card`/`Icon`/`Button`/…).
 *   • CSS-var tokens resolved EVERYWHERE by recursing the whole AST — not just top-level style
 *     values, but inside ternaries/logical/computed expressions AND JSX string attributes
 *     (`color="var(--muted)"`), so a `value ? c : "var(--bg)"` branch never ships a raw `var()`.
 *   • Idioms: `placeItems/grid` → flex center; `whiteSpace:nowrap`+`textOverflow:ellipsis` →
 *     `numberOfLines={1}`; `transform` string → RN transform array; `%` borderRadius → px (circle
 *     from width/height) or a computed pill; `em` → px (× fontSize); unitless `lineHeight` → px;
 *     border/padding/margin shorthands expanded; `boxShadow` token → spread `tokens.shadow.*`;
 *     web-only decls (`cursor`, `display`, `boxShadow:"none"`, `pointerEvents`) dropped.
 *
 * Output is deterministic (stable property order: source order, then expansions in a fixed order) so
 * it is snapshot-diffable. A companion report tallies clean/transform/dropped and — the honest metric
 * — the list of UNRESOLVED tokens/values (anything that would still read `var(...)` on RN).
 */
import { Babel } from "./babel-load.mjs";
import { TOKEN, SPREAD_TOKENS } from "./tokens.mjs";

// Mock kit / DOM element  →  RN primitive. `div`/`span` are decided by CONTENT (see below), so they
// are intentionally absent here. Pad/Top are handled specially (base style / AppBar). Everything the
// app's src/ui already exports (Field, Card, Icon, Button, StatusPill, EmptyState, Stepper…) passes
// through unchanged.
const TAG = {
  b: "Text", p: "Text", h2: "Text", h1: "Text", h3: "Text", a: "Text", label: "Text",
  section: "View", header: "View", nav: "View", ul: "View", li: "View", article: "View", main: "View",
  img: "Image",
};
// DS/kit primitives that must be renamed to their app-side equivalent. The auth cluster's brand kit
// (`Dove`/`Lockup` from the mock's LyniaSupport) maps to the app's `DoveMark`/`BrandLockup`; the
// normalizer (normalize.mjs KIND) folds each old→new name pair to the SAME canonical kind so mock and
// view stay congruent by construction.
//
// Foundation-F.c — MAP/SHEET remaps. The map-anchored screens (send-composer, tracking, food
// track_way, rider board) root in the mock's kit map/sheet placeholders: `K.FauxMap`/`K.HarareMap` are
// stylised map stand-ins, `K.MapSheet` the two-snap bottom sheet over the full-bleed map. The app
// realizes the map as `ComposeMap` (customer compose) / `LiveMap` (tracking) and the sheet as
// `BottomSheet`. Fold the mock tag → the app component here (transpiler) AND fold both to ONE canonical
// KIND in normalize.mjs (`fauxmap`/`hararemap`/`composemap`→MAP, `mapsheet`/`bottomsheet`→SHEET), the
// Lockup→BrandLockup precedent — so a fragment rooted at (or containing) the map/sheet stays congruent
// by construction. `FauxMap`/`HarareMap` both fold to `ComposeMap`: a region can override per-screen via
// its bind (e.g. tracking wiring `LiveMap`) but the default realization is the compose map.
//
// Foundation-F.d — `RTracker`→`Stepper`. The food-order tracking mocks (r-customer-b.jsx) draw the
// step timeline as the kit `RTracker`; the app realizes it as `Stepper` (the kit's RTracker returns
// `<DSR.Stepper/>` when the DS is present). Fold the tag here AND to ONE canonical STEPPER in
// normalize.mjs (`rtracker`→STEPPER) — so a `tracker` region rooted at the mock's RTracker resolves to
// the app's real Stepper primitive and stays congruent by construction.
const DS_RENAME = { Top: "AppBar", Lockup: "BrandLockup", Dove: "DoveMark", FauxMap: "ComposeMap", HarareMap: "ComposeMap", MapSheet: "BottomSheet", RTracker: "Stepper" };
// `Pad` is a screen-edge-padding <div> in the kit; reproduce that as a padded View.
const PAD_BASE = () => [
  ["padding", tokenMember("space.screen")],
  ["minHeight", { __str: "100%" }],
];

let T; // babel types, set per-run

function tokenMember(path) {
  return { __token: path };
}

/** Build a real babel member expression `tokens.a.b.c` from a dotted path. */
function tokenExpr(path) {
  return path.split(".").reduce((acc, k) => T.memberExpression(acc, T.identifier(k)), T.identifier("tokens"));
}

/** If `raw` is exactly `var(--x)` and mapped, return {token} marker; if mapped-but-spread, {spread}. */
function varToken(raw) {
  const m = /^\s*var\((--[a-z0-9-]+)\)\s*$/.exec(String(raw));
  if (!m) return null;
  const path = TOKEN[m[1]];
  if (!path) return { unresolved: m[1] };
  return SPREAD_TOKENS.has(path) ? { spread: path } : { token: path };
}

// Allow leading-dot decimals (".05em", ".5px") — CSS writes them and the mocks do too.
const PX = /^(-?\d*\.?\d+)px$/;
const EM = /^(-?\d*\.?\d+)em$/;
const NUM = /^-?\d*\.?\d+$/;
const PCT = /^(-?\d*\.?\d+)%$/;

/** Circle radius from a known square/rect box: `w===h` → w/2, else min/2, else a pill (999). */
function circleRadius(width, height) {
  if (width != null && height != null && width === height) return width / 2;
  if (width != null && height != null) return Math.round(Math.min(width, height) / 2);
  return 999;
}

/** Replace any `"<pct>%"` StringLiteral inside a value node (e.g. a ternary branch) with a px circle. */
function resolvePctRadius(node, width, height, t) {
  if (!node || typeof node !== "object") return;
  if (node.type === "StringLiteral" && PCT.test(node.value) && parseFloat(PCT.exec(node.value)[1]) >= 50) {
    node.type = "NumericLiteral";
    node.value = circleRadius(width, height);
    delete node.extra;
    return;
  }
  for (const key of ["consequent", "alternate", "left", "right", "test", "expression", "argument"]) {
    if (node[key]) resolvePctRadius(node[key], width, height, t);
  }
}

function numOf(raw) {
  const m = PX.exec(String(raw).trim());
  return m ? parseFloat(m[1]) : null;
}

/** Remove a style property (by name) from an inline style ObjectExpression, if present. */
function dropStyleKey(styleObj, key) {
  if (!styleObj || styleObj.type !== "ObjectExpression") return;
  styleObj.properties = styleObj.properties.filter(
    (p) => !(p.type === "ObjectProperty" && !p.computed && (p.key.name || p.key.value) === key),
  );
}

/** Does a JSX expression (a `{…}` child) contain any literal JSX element? `{items.map(n => <View/>)}`,
 * `{cond ? <X/> : null}`, `{[<A/>, <B/>]}` → yes; `{label}`, `{n.title}`, `{fmt(t)}` → no. Used to
 * decide whether a `div`/`span` is a container (View) or text (Text) — see the content-aware seam. */
function exprYieldsElement(node) {
  let found = false;
  const walk = (n) => {
    if (found || !n || typeof n !== "object") return;
    if (n.type === "JSXElement" || n.type === "JSXFragment") { found = true; return; }
    for (const k of Object.keys(n)) {
      if (k === "type" || k === "loc" || k === "start" || k === "end" || k === "extra" || k === "leadingComments" || k === "trailingComments") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v.type === "string") walk(v);
    }
  };
  walk(node);
  return found;
}

export function transpile(src, report) {
  const R = report || { clean: 0, transform: 0, dropped: 0, unresolved: [] };

  const plugin = ({ types: t }) => {
    T = t;

    // ── style object rewrite ────────────────────────────────────────────────────────────────────
    function rewriteStyleObject(obj, flags) {
      // Context scan: geometry the unit idioms need (em → px needs fontSize; % radius → px needs
      // width/height; unitless lineHeight → px needs fontSize).
      let fontSize = null, width = null, height = null, hasFlexDirection = false;
      for (const p of obj.properties) {
        if (p.type !== "ObjectProperty" || p.computed) continue;
        const k = p.key.name || p.key.value;
        const v = p.value;
        if (k === "fontSize" && v.type === "NumericLiteral") fontSize = v.value;
        if (k === "width" && v.type === "NumericLiteral") width = v.value;
        if (k === "height" && v.type === "NumericLiteral") height = v.value;
        if (k === "flexDirection") hasFlexDirection = true;
      }

      const out = [];
      const push = (key, node) => out.push(t.objectProperty(t.identifier(key), node));
      const mk = (marker) => {
        if (marker && marker.__token) return tokenExpr(marker.__token);
        if (marker && marker.__str != null) return t.stringLiteral(marker.__str);
        if (marker && marker.__num != null) return t.numericLiteral(marker.__num);
        return marker;
      };

      for (const p of obj.properties) {
        if (p.type !== "ObjectProperty" || p.computed) { out.push(p); continue; }
        const key = p.key.name || p.key.value;
        const vnode = p.value;
        const raw = vnode.type === "StringLiteral" ? vnode.value
          : vnode.type === "NumericLiteral" ? String(vnode.value)
          : vnode.type === "UnaryExpression" && vnode.argument.type === "NumericLiteral" ? vnode.operator + vnode.argument.value
          : null;

        // ── drops (web-only / no-op on native) ──
        // `display:flex` is CSS row-by-default, but RN Views default to COLUMN — so dropping it bare
        // silently turns every mock flex ROW into a vertical stack. Record it (unless the object sets
        // its own flexDirection) and emit `flexDirection:"row"` after the loop. `display:grid` stays a
        // centering idiom via placeItems and is not a row.
        if (key === "display") { if (raw === "grid") flags.grid = true; else if (raw === "flex" || raw === "inline-flex") flags.displayFlex = true; R.dropped++; continue; }
        if (key === "cursor" || key === "pointerEvents" || key === "boxSizing" || key === "transition" || key === "content" || key === "WebkitLineClamp" || key === "WebkitBoxOrient" || key === "outline") { R.dropped++; continue; }
        if (key === "boxShadow" && (raw === "none" || raw === "0")) { R.dropped++; continue; }

        // ── structural flags ──
        if (key === "placeItems" || key === "placeContent") {
          const val = raw === "center" ? "center" : (raw || "center");
          push("alignItems", t.stringLiteral(val));
          push("justifyContent", t.stringLiteral(val));
          R.transform++; continue;
        }
        if (key === "whiteSpace" || key === "textOverflow") { flags.numberOfLines = true; R.transform++; continue; }

        // ── background → backgroundColor (colour only; gradient/image is unresolved) ──
        if (key === "background") {
          if (raw && /gradient|url\(/.test(raw)) { R.unresolved.push(`background: ${raw.slice(0, 34)}… (gradient/image)`); out.push(p); continue; }
          p.key = t.identifier("backgroundColor");
          // fall through to generic value handling below
        }

        // ── boxShadow token → spread tokens.shadow.* ──
        if (key === "boxShadow") {
          const vt = varToken(raw || "");
          if (vt && vt.spread) { flags.spreadShadow = vt.spread; R.transform++; continue; }
          if (vt && vt.token) { flags.spreadShadow = vt.token; R.transform++; continue; }
          // ── CONDITIONAL boxShadow with spread tokens: `sel ? 'none' : 'var(--shadow-card)'` → an RN
          // shadow spread per branch — `...(sel ? {} : tokens.shadow.card)`. The StringLiteral resolver
          // only substitutes NON-spread tokens and the token path above only spreads a STATIC token, so a
          // conditional shadow otherwise survived as a raw `var(--shadow-card)` residual (the role_select
          // wall). Lower each branch: `none`/`0`→ no shadow (`{}`), a `var(--shadow-*)` → its `tokens.shadow.*`
          // object; a bare `{}` on the no-shadow branch keeps the RN style object shape valid. The result
          // is spread into the style after the loop (flags.spreadShadowExpr), like the static token spread.
          if (vnode.type === "ConditionalExpression") {
            const branch = (b) => {
              if (b.type === "StringLiteral") {
                if (b.value === "none" || b.value === "0") return t.objectExpression([]);
                const bt = varToken(b.value);
                if (bt && (bt.spread || bt.token)) return tokenExpr(bt.spread || bt.token);
              }
              return null;
            };
            const cons = branch(vnode.consequent);
            const alt = branch(vnode.alternate);
            if (cons && alt) {
              flags.spreadShadowExpr = t.conditionalExpression(vnode.test, cons, alt);
              R.transform++; continue;
            }
          }
          R.unresolved.push(`boxShadow: ${String(raw).slice(0, 34)}… (non-token shadow)`); out.push(p); continue;
        }

        // ── border shorthand as a TEMPLATE LITERAL: `1.5px solid ${colorExpr}` → borderWidth/Style/Color
        // ── The static handler below only lowers a plain-STRING border; a border whose colour is dynamic
        // (`border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--line)'}``) is a TemplateLiteral, so
        // it survived as an invalid `border` RN style prop (the role_select / delivered_rate-chip wall).
        // Lower it the same way — the width/style come from the leading static quasi, the colour is the
        // sole interpolated expression; its `var()` branches are resolved in place by the StringLiteral
        // visitor (it recurses every ternary branch), so `borderColor` ends up a clean token/ternary.
        if (/^border(Top|Bottom|Left|Right)?$/.test(key) && vnode.type === "TemplateLiteral"
            && vnode.expressions.length === 1 && vnode.quasis.length === 2) {
          const lead = vnode.quasis[0].value.cooked ?? vnode.quasis[0].value.raw;
          const tail = (vnode.quasis[1].value.cooked ?? vnode.quasis[1].value.raw).trim();
          const m = /^(\d+(?:\.\d+)?)px\s+(solid|dashed|dotted)\s+$/.exec(lead);
          if (m && tail === "") {
            const side = key === "border" ? "" : key.replace("border", "");
            push(side ? `border${side}Width` : "borderWidth", t.numericLiteral(parseFloat(m[1])));
            if (!side) push("borderStyle", t.stringLiteral(m[2]));
            push(side ? `border${side}Color` : "borderColor", vnode.expressions[0]);
            R.transform++; continue;
          }
        }

        // ── border shorthand "1px solid <color>" → borderWidth/Style/Color ──
        if (/^border(Top|Bottom|Left|Right)?$/.test(key) && raw && /\s/.test(raw)) {
          const m = /^(\d+(?:\.\d+)?)px\s+(solid|dashed|dotted)\s+(.+)$/.exec(raw.trim());
          if (m) {
            const side = key === "border" ? "" : key.replace("border", "");
            push(side ? `border${side}Width` : "borderWidth", t.numericLiteral(parseFloat(m[1])));
            if (!side) push("borderStyle", t.stringLiteral(m[2]));
            const vt = varToken(m[3]);
            push(side ? `border${side}Color` : "borderColor",
              vt && vt.token ? tokenExpr(vt.token) : t.stringLiteral(m[3].trim()));
            if (vt && vt.unresolved) R.unresolved.push(`${key} colour ${vt.unresolved}`);
            R.transform++; continue;
          }
        }

        // ── padding / margin shorthand (1–4 values) → sided props ──
        if ((key === "padding" || key === "margin") && raw && /\s/.test(raw.replace(/var\([^)]*\)/g, "x"))) {
          const parts = raw.trim().split(/\s+/).map((x) => {
            const n = numOf(x); if (n != null) return t.numericLiteral(n);
            const nn = NUM.test(x) ? parseFloat(x) : null; if (nn != null) return t.numericLiteral(nn);
            const vt = varToken(x); if (vt && vt.token) return tokenExpr(vt.token);
            return t.stringLiteral(x);
          });
          const base = key;
          const sides = ["Top", "Right", "Bottom", "Left"];
          let four;
          if (parts.length === 1) four = [parts[0], parts[0], parts[0], parts[0]];
          else if (parts.length === 2) four = [parts[0], parts[1], parts[0], parts[1]];
          else if (parts.length === 3) four = [parts[0], parts[1], parts[2], parts[1]];
          else four = parts.slice(0, 4);
          four.forEach((pp, i) => push(base + sides[i], pp));
          R.transform++; continue;
        }

        if (key === "inset" && (raw === "0" || raw === "0px")) {
          for (const s of ["top", "right", "bottom", "left"]) push(s, t.numericLiteral(0));
          R.transform++; continue;
        }

        // ── transform string → RN transform array ──
        if (key === "transform" && raw) {
          const arr = transformArray(raw, t);
          if (arr) { push("transform", arr); R.transform++; continue; }
          R.unresolved.push(`transform: ${raw.slice(0, 34)}…`); out.push(p); continue;
        }

        // ── borderRadius "50%" / percentage → px (circle from width/height) or pill ──
        if (key === "borderRadius" && raw && PCT.test(raw)) {
          const pct = parseFloat(PCT.exec(raw)[1]);
          if (pct >= 50) { push("borderRadius", t.numericLiteral(circleRadius(width, height))); R.transform++; continue; }
          out.push(p); continue;
        }
        // borderRadius inside a ternary/computed value — recurse and resolve any "%" branch to px.
        if (key === "borderRadius" && vnode.type !== "StringLiteral" && vnode.type !== "NumericLiteral") {
          resolvePctRadius(vnode, width, height, t);
          out.push(p); R.transform++; continue;
        }

        // ── em → px (letterSpacing etc.), unitless lineHeight → px ──
        if (raw && EM.test(raw)) {
          const em = parseFloat(EM.exec(raw)[1]);
          const base = fontSize != null ? fontSize : 16;
          push(key, t.numericLiteral(round2(em * base)));
          R.transform++; continue;
        }
        if (key === "lineHeight" && vnode.type === "NumericLiteral" && !Number.isInteger(vnode.value * 1) && fontSize != null) {
          // unitless multiplier (e.g. 1.45) → px relative to fontSize
          push("lineHeight", t.numericLiteral(Math.round(vnode.value * fontSize)));
          R.transform++; continue;
        }
        if (key === "lineHeight" && vnode.type === "NumericLiteral" && vnode.value <= 3 && fontSize != null) {
          push("lineHeight", t.numericLiteral(Math.round(vnode.value * fontSize)));
          R.transform++; continue;
        }

        // ── generic value rewrite: var→token, px→number ──
        if (raw != null) {
          const vt = varToken(raw);
          if (vt && vt.token) { p.value = tokenExpr(vt.token); R.clean++; }
          else if (vt && vt.unresolved) { R.unresolved.push(`${key}: ${vt.unresolved}`); R.clean++; }
          else { const n = numOf(raw); if (n != null) { p.value = t.numericLiteral(n); R.clean++; } else R.clean++; }
        } else { R.clean++; }
        // fontWeight numeric → string (RN wants "700")
        if (key === "fontWeight" && p.value.type === "NumericLiteral") p.value = t.stringLiteral(String(p.value.value));
        out.push(p);
      }
      // CSS `display:flex` implies `flex-direction:row`; RN defaults to column, so make the row
      // explicit (only when the mock didn't already pin a direction). Mirrored in normalize.mjs so the
      // guardrail models the same row axis on both sides.
      if (flags.displayFlex && !hasFlexDirection) out.push(t.objectProperty(t.identifier("flexDirection"), t.stringLiteral("row")));
      obj.properties = out;
    }

    return {
      visitor: {
        // Render-helper shell wrapper → <Screen>. The rider-one-app.jsx family returns
        // `S(<div>…</div>, { tab, footer, banner })`, where `S` mounts the DS AppScreen/SHELL around the
        // body. Lower it to `<Screen scroll banner={…} footer={…}>{body}</Screen>` so the generated view
        // renders the app's real scaffold (Screen → SCREEN in the normalizer, matching the mock's folded
        // SHELL), dropping the tab/bg/dark chrome the live app supplies elsewhere.
        //
        // `scroll` is unconditional because the shell it stands for IS scrolling: the kit's AppScreen
        // body is `{ flex: 1, minHeight: 0, overflowY: "auto" }`, so a mock screen taller than the phone
        // scrolls rather than clipping. It is a plain prop, so the normalizer's tree is unchanged and
        // the structural guardrail is unaffected.
        //
        // CAVEAT for whoever adopts the next `S()`-rooted screen: a ScrollView must not wrap a
        // FlatList/VirtualizedList — both scrollers break. Only the rider-one-app family renders through
        // `S()`, and RJM.account (its one adopted screen) has no list, so nothing is nested today. A
        // future S()-rooted mock whose body is a long feed (the shape `LJ.notifications` transpiles to a
        // FlatList for) needs this made conditional rather than inherited.
        //
        // Only the OUTER wrapper matches:
        // a plain-identifier callee whose FIRST arg is JSX (never a `.map`/member call, never `nop()`).
        // The replacement is a JSXElement, so it is not re-matched — no infinite loop — and Babel then
        // descends into the body to transpile it normally.
        CallExpression(path) {
          const node = path.node;
          if (node.callee.type !== "JSXIdentifier" && node.callee.type !== "Identifier") return;
          const body = node.arguments[0];
          if (!body || (body.type !== "JSXElement" && body.type !== "JSXFragment")) return;
          const opts = node.arguments[1];
          const attrs = [t.jsxAttribute(t.jsxIdentifier("scroll"), null)];
          if (opts && opts.type === "ObjectExpression") {
            for (const prop of opts.properties) {
              if (prop.type !== "ObjectProperty" || prop.computed) continue;
              const k = prop.key.name || prop.key.value;
              if (k === "banner" || k === "footer") {
                const val = prop.value.type === "JSXExpressionContainer" ? prop.value : t.jsxExpressionContainer(prop.value);
                attrs.push(t.jsxAttribute(t.jsxIdentifier(k), val));
              }
            }
          }
          path.replaceWith(t.jsxElement(
            t.jsxOpeningElement(t.jsxIdentifier("Screen"), attrs, false),
            t.jsxClosingElement(t.jsxIdentifier("Screen")),
            [body],
            false,
          ));
          R.transform++;
        },

        // JSX string attribute holding a token: color="var(--muted)" → color={tokens.color.muted}
        JSXAttribute(path) {
          // `className` is web-only — RN primitives have no such prop, so carrying it through is a hard
          // typecheck error (e.g. the mock's `className="lynia-tabular"` phone number). Drop it. (The
          // tabular-nums it conveys is not expressible from a CSS class here; a container can re-add
          // `fontVariant:["tabular-nums"]` via the data seam if the number needs it.)
          if (path.node.name.name === "className") { path.remove(); return; }
          const val = path.node.value;
          if (val && val.type === "StringLiteral") {
            const vt = varToken(val.value);
            if (vt && vt.token) path.node.value = t.jsxExpressionContainer(tokenExpr(vt.token));
            else if (vt && vt.unresolved) R.unresolved.push(`attr ${path.node.name.name}: ${vt.unresolved}`);
          }
        },
        JSXElement(path) {
          const open = path.node.openingElement;
          // ── W1: kit-composite MEMBER tags (`K.OfferCard`, `K.SortChips`, `PB.Dove` — `K`/`PB`/`P.DSR`
          // are the mock bundles' `window.LyniaKit`/`RParts` namespaces). The transpiler reads
          // `open.name.name`, which is `undefined` for a JSXMemberExpression, so a member tag was left
          // VERBATIM and a generated view emitted an unresolved `<K.OfferCard>` against an undefined `K`
          // (the auction/composer clusters' W1 wall). Collapse `<Ns.Name>` to `<Name>` so the DS remap +
          // passthrough below resolves it exactly like a bare tag (`PB.Dove` → `Dove` → DoveMark via
          // DS_RENAME). `React.*` (Fragment/StrictMode) is skipped — it is a real React member the app
          // imports, not a kit namespace, and the normalizer keeps `React.Fragment` transparent. The
          // normalize side already reads the terminal `.name.text` off a PropertyAccessExpression, so this
          // makes the emit side symmetric — mock and view classify a member tag the same way.
          if (open.name.type === "JSXMemberExpression") {
            const ns = open.name.object;
            const terminal = open.name.property;
            if (!(ns.type === "JSXIdentifier" && ns.name === "React") && terminal.type === "JSXIdentifier") {
              open.name = t.jsxIdentifier(terminal.name);
              if (path.node.closingElement && path.node.closingElement.name.type === "JSXMemberExpression") {
                path.node.closingElement.name = t.jsxIdentifier(terminal.name);
              }
              R.transform++;
            }
          }
          if (open.name.type !== "JSXIdentifier") return;
          const tag = open.name.name;
          const flags = {};

          // rewrite the inline style object first (sets flags: numberOfLines, grid, spreadShadow)
          const styleAttr = open.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "style");
          const hasObjStyle = styleAttr && styleAttr.value?.type === "JSXExpressionContainer" && styleAttr.value.expression.type === "ObjectExpression";
          if (hasObjStyle) rewriteStyleObject(styleAttr.value.expression, flags);

          // Pad → padded View: prepend the kit's screen-edge padding so overrides still win.
          if (tag === "Pad") {
            open.name = t.jsxIdentifier("View");
            if (path.node.closingElement) path.node.closingElement.name = t.jsxIdentifier("View");
            const styleObj = hasObjStyle ? styleAttr.value.expression : null;
            // Inline overrides win — so drop any base key the inline style already sets (no dup keys).
            const inlineKeys = new Set((styleObj?.properties || [])
              .filter((pp) => pp.type === "ObjectProperty" && !pp.computed)
              .map((pp) => pp.key.name || pp.key.value));
            const baseProps = PAD_BASE()
              .filter(([k]) => !inlineKeys.has(k))
              .map(([k, v]) => t.objectProperty(t.identifier(k), v.__token ? tokenExpr(v.__token) : v.__str != null ? t.stringLiteral(v.__str) : t.numericLiteral(v.__num)));
            if (styleObj) styleObj.properties = [...baseProps, ...styleObj.properties];
            else open.attributes.push(t.jsxAttribute(t.jsxIdentifier("style"), t.jsxExpressionContainer(t.objectExpression(baseProps))));
            if (styleObj) dropStyleKey(styleObj, "textAlign"); // Pad → View: textAlign is TextStyle-only
            R.transform++;
            return;
          }

          // DS rename (Top → AppBar). `onBack={false}` in the kit means "no back arrow" — drop it so
          // AppBar renders title-only; a container passes its own onBack when the screen needs one.
          if (DS_RENAME[tag]) {
            const mapped = DS_RENAME[tag];
            open.name = t.jsxIdentifier(mapped);
            if (path.node.closingElement) path.node.closingElement.name = t.jsxIdentifier(mapped);
            open.attributes = open.attributes.filter((a) => !(a.type === "JSXAttribute" && a.name.name === "onBack" && a.value?.type === "JSXExpressionContainer" && a.value.expression.type === "BooleanLiteral" && a.value.expression.value === false));
            R.transform++;
            return;
          }

          // Content-aware View/Text for div & span (the #1 fidelity seam).
          if (tag === "div" || tag === "span") {
            const kids = path.node.children.filter((c) => !(c.type === "JSXText" && c.value.trim() === ""));
            // An expression child that YIELDS elements (`{items.map(n => <View/>)}`, `{cond ? <X/> : y}`)
            // makes this a container, not text — otherwise it becomes a `<Text>` wrapping `<View>`s,
            // which crashes RN. Only a text/interpolation expression (`{label}`) keeps it Text. Mirrored
            // in normalize.mjs so mock and view classify the same node the same way.
            const hasElementChild = kids.some((c) => c.type === "JSXElement" || (c.type === "JSXExpressionContainer" && exprYieldsElement(c.expression)));
            const hasTextChild = kids.some((c) => c.type === "JSXText" || (c.type === "JSXExpressionContainer" && !exprYieldsElement(c.expression)));
            const mapped = hasElementChild ? "View" : hasTextChild ? "Text" : "View";
            open.name = t.jsxIdentifier(mapped);
            if (path.node.closingElement) path.node.closingElement.name = t.jsxIdentifier(mapped);
            // `textAlign` is a web centring idiom the mocks put on flex CONTAINERS (to centre their text
            // children); on an RN View it is a no-op AND a TextStyle-only key that reddens typecheck. Drop
            // it when the node becomes a View (it stays on Text). Structurally invisible either way — the
            // normalizer never reads textAlign — so mock↔view congruence is unaffected.
            if (mapped !== "Text" && hasObjStyle) dropStyleKey(styleAttr.value.expression, "textAlign");
            if (flags.numberOfLines && mapped === "Text")
              open.attributes.push(t.jsxAttribute(t.jsxIdentifier("numberOfLines"), t.jsxExpressionContainer(t.numericLiteral(1))));
            // ── MIXED element+text siblings under a container → wrap each bare-text run in <Text> ──
            // A div/span that becomes a View (it has an element child) but ALSO carries a bare text
            // sibling (the register 'Verified' badge: `<span absolute><Icon/> Verified</span>`, or a
            // `{label}` text interpolation) would leave raw text directly under a View — invalid on RN (a
            // View may not host a bare string). Wrap each non-blank text run / text-interpolation in a
            // `<Text>`, leaving the element children in place, so the icon+label row renders legally. When
            // the node is a Text (no element child) RN hosts the text natively, so this fires only for the
            // View/container case. General idiom (not register-specific): any mixed element+text container.
            if (mapped === "View" && hasElementChild && hasTextChild) {
              path.node.children = path.node.children.map((c) => {
                const bareText = c.type === "JSXText" && c.value.trim() !== "";
                const textExpr = c.type === "JSXExpressionContainer" && !exprYieldsElement(c.expression);
                if (!bareText && !textExpr) return c;
                return t.jsxElement(
                  t.jsxOpeningElement(t.jsxIdentifier("Text"), [], false),
                  t.jsxClosingElement(t.jsxIdentifier("Text")),
                  [c],
                  false,
                );
              });
              R.transform++;
            }
            if (flags.spreadShadow && hasObjStyle) styleAttr.value.expression.properties.push(t.spreadElement(tokenExpr(flags.spreadShadow)));
            if (flags.spreadShadowExpr && hasObjStyle) styleAttr.value.expression.properties.push(t.spreadElement(flags.spreadShadowExpr));
            if (flags.grid) flags.__gridNoted = true;
            return;
          }

          // Other mapped DOM tags (b/p/h2/section/…) + DS primitives kept as-is.
          if (TAG[tag]) {
            const mapped = TAG[tag];
            open.name = t.jsxIdentifier(mapped);
            if (path.node.closingElement) path.node.closingElement.name = t.jsxIdentifier(mapped);
            if (mapped !== "Text" && hasObjStyle) dropStyleKey(styleAttr.value.expression, "textAlign");
            if (flags.numberOfLines && mapped === "Text")
              open.attributes.push(t.jsxAttribute(t.jsxIdentifier("numberOfLines"), t.jsxExpressionContainer(t.numericLiteral(1))));
          }
          if (flags.spreadShadow && hasObjStyle) styleAttr.value.expression.properties.push(t.spreadElement(tokenExpr(flags.spreadShadow)));
          if (flags.spreadShadowExpr && hasObjStyle) styleAttr.value.expression.properties.push(t.spreadElement(flags.spreadShadowExpr));
        },

        // ── recursive var() resolution EVERYWHERE — ternary/logical branches, consts, etc. ──
        StringLiteral(path) {
          // skip JSX attribute string values (handled by JSXAttribute above → JSXExpressionContainer)
          if (path.parent.type === "JSXAttribute") return;
          const vt = varToken(path.node.value);
          if (vt && vt.token) path.replaceWith(tokenExpr(vt.token));
          else if (vt && vt.unresolved) R.unresolved.push(`value ${vt.unresolved}`);
        },
      },
    };
  };

  const out = Babel.transform(src, {
    plugins: [plugin],
    parserOpts: { plugins: ["jsx"] },
    retainLines: false,
    compact: false,
    ast: false,
    code: true,
  });
  // Honest residual check: anything RN can't consume that slipped through — a raw `var(...)` token,
  // an `em` length, or a `%` border-radius. (Percentage width/height ARE valid on RN, so only
  // borderRadius percentages count.)
  const residual = [
    ...(out.code.match(/var\(--[a-z0-9-]+\)/g) || []),
    ...(out.code.match(/["'][-\d.]+em["']/g) || []),
    ...(out.code.match(/borderRadius:\s*["'][-\d.]+%["']/g) || []),
  ];
  R.residualVar = residual;
  return out.code;
}

function round2(n) { return Math.round(n * 100) / 100; }

/** "rotate(180deg) translateX(4px)" → [{ rotate: "180deg" }, { translateX: 4 }]. */
function transformArray(raw, t) {
  const parts = [...String(raw).matchAll(/([a-zA-Z]+)\(([^)]*)\)/g)];
  if (!parts.length) return null;
  const els = [];
  for (const [, fn, argRaw] of parts) {
    const arg = argRaw.trim();
    if (PCT.test(arg)) return null; // %-translate unsupported on RN → caller flags manual
    let node;
    const px = PX.exec(arg);
    const deg = /^(-?\d+(?:\.\d+)?)deg$/.exec(arg);
    if (px) node = t.numericLiteral(parseFloat(px[1]));
    else if (deg) node = t.stringLiteral(deg[0]);
    else if (NUM.test(arg)) node = t.numericLiteral(parseFloat(arg));
    else node = t.stringLiteral(arg);
    els.push(t.objectExpression([t.objectProperty(t.identifier(fn), node)]));
  }
  return t.arrayExpression(els);
}
