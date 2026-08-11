/**
 * Normalized component-tree serializer — the mechanism behind the structural-snapshot guardrail.
 *
 * It parses a component's JSX with the TypeScript compiler API (NOT Babel: `typescript` is a first-
 * class workspace dependency present in CI, whereas the codegen's vendored @babel/standalone is a
 * Claude-run-only download — so keeping the CI guardrail on `ts` makes it robust with zero extra
 * install). It walks the render and reduces it to a canonical S-expression that captures STRUCTURE
 * and structure only:
 *   • element kind, canonicalised across surfaces: View/div→BOX, Text/span→TEXT (content-aware —
 *     the same rule the transpiler uses), DS primitive→its name (ICON, FIELD, CARD, APPBAR, …),
 *     Pad→BOX, Top→APPBAR, svg family→SVG;
 *   • nesting + child ORDER, with `.map()` → a MAP node and ternaries → a COND node;
 *   • a small set of structural STYLE AXES that define layout shape — flexDirection:row, align/justify
 *     center (incl. CSS `placeItems`), position:absolute, border presence, flex:1 — computed the SAME
 *     way from the mock's CSS and the view's RN styles, so the two sides are comparable.
 * It deliberately DROPS text content, data values, handler props, and interaction wrappers
 * (Pressable/Touchable/Fragment are transparent — no layout box), so a benign data/handler change
 * never reddens the check. Because the app view is a mechanical function of the mock, mock and view
 * normalize to the SAME tree — that is "structural parity by construction".
 *
 * `ts` (the TypeScript module) is injected by the caller so this ESM file needs no bare-specifier
 * resolution of its own.
 */

const KIND = new Map(Object.entries({
  view: "BOX", section: "BOX", header: "BOX", nav: "BOX", ul: "BOX", li: "BOX", article: "BOX", main: "BOX", pad: "BOX", safeareaview: "BOX", scrollview: "BOX", keyboardavoidingview: "BOX",
  b: "TEXT", p: "TEXT", h1: "TEXT", h2: "TEXT", h3: "TEXT", a: "TEXT", label: "TEXT", text: "TEXT",
  icon: "ICON", field: "FIELD", card: "CARD", button: "BUTTON", statuspill: "STATUSPILL", emptystate: "EMPTYSTATE", stepper: "STEPPER", money: "MONEY", avatar: "AVATAR",
  pricemath: "PRICEMATH", banner: "BANNER", coverphoto: "COVERPHOTO", menurow: "MENUROW", skeleton: "SKELETON",
  etaline: "ETALINE", shoplogo: "SHOPLOGO", foodthumb: "FOODTHUMB",
  img: "IMAGE", image: "IMAGE",
  top: "APPBAR", appbar: "APPBAR",
  screen: "SCREEN", appscreen: "SCREEN",
  svg: "SVG", path: "SVG", circle: "SVG", rect: "SVG", g: "SVG", line: "SVG", polyline: "SVG", polygon: "SVG",
}));
const TRANSPARENT = new Set(["pressable", "touchableopacity", "touchablewithoutfeedback", "touchablehighlight", "fragment"]);
// Virtualized lists — Bucket-C equivalence. A `<FlatList data renderItem={item => <Row/>} />` renders
// the SAME element tree as the mock's `{items.map(item => <Row/>)}`: a virtualized list is a windowed
// map, structurally identical (it just mounts a sliding window of the identical per-item subtree). So
// a virtual list normalizes to a MAP node whose child is the renderItem's returned subtree — letting a
// data-list state adopt its mock WITHOUT the app reverting virtualization to a literal `.map`. This is
// the principled dual of the transpiler's content-aware seam, on the read side.
const VIRTUAL_LIST = new Set(["flatlist", "sectionlist", "virtualizedlist", "flashlist", "animated.flatlist", "animated.sectionlist"]);

// STRUCTURAL SLOTS — a primitive's JSX-VALUED ATTRIBUTE that renders as part of the layout tree, not a
// data value. The normalizer walks element CHILDREN only, so slotted content (`<Screen banner={<Banner/>}>`)
// is structurally INVISIBLE: a mock with a banner and a view WITHOUT one both reduce to the same tree,
// and the guardrail would certify the missing banner as congruent. This map lists, per canonical KIND,
// the slot props to fold INTO the node's children at the position the primitive renders them, so slotted
// content IS verified. Applied identically to the mock and the view (same nodeOf), keeping parity by
// construction — a slot present in the mock must be present, and structurally equal, in the view.
//   `position`: "leading" (rendered above the children — the kit's Screen draws `banner` before the body)
//               or "trailing" (rendered after the children).
const STRUCTURAL_SLOTS = new Map(Object.entries({
  // Screen/AppScreen scaffold: status bar → BANNER → body → FOOTER. `banner` is a leading child;
  // `footer` (the kit's pinned bottom action bar — cart "View cart" / checkout pay / menu cart bar)
  // is a trailing child, rendered after the body. Both are JSX-valued slots the normalizer would
  // otherwise not see (it walks children only), so folding them in makes the slot content VISIBLE to
  // the structural diff on both the mock and the view — a footer present in the mock must be present,
  // and structurally equal, in the view.
  SCREEN: [{ prop: "banner", position: "leading" }, { prop: "footer", position: "trailing" }],
}));

function tagName(ts, node) {
  const nameNode = node.tagName;
  if (ts.isPropertyAccessExpression(nameNode)) return nameNode.name.text; // React.Fragment
  return nameNode.text || nameNode.escapedText || String(nameNode.getText?.() ?? "");
}

/** Map an element name (+ its children, for content-aware div/span) to a canonical kind. */
function kindOf(ts, name, hasElementChild, hasTextChild) {
  const lc = name.toLowerCase();
  if (lc === "div" || lc === "span") return hasElementChild ? "BOX" : hasTextChild ? "TEXT" : "BOX";
  const k = KIND.get(lc);
  if (k) return k;
  return /^[A-Z]/.test(name) ? name.toUpperCase() : "BOX";
}

/** Read structural style axes from a `style={{…}}` object (handles both CSS and RN keys). */
function axesOf(ts, opening) {
  const attrs = opening.attributes?.properties || [];
  const styleAttr = attrs.find((a) => ts.isJsxAttribute(a) && a.name.getText() === "style");
  const init = styleAttr?.initializer;
  const expr = init && ts.isJsxExpression(init) ? init.expression : null;
  if (!expr || !ts.isObjectLiteralExpression(expr)) return [];
  const axes = [];
  let displayFlex = false, hasFlexDirection = false;
  for (const p of expr.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = p.name.getText().replace(/['"]/g, "");
    const v = p.initializer;
    const s = ts.isStringLiteral(v) ? v.text : null;
    const n = ts.isNumericLiteral(v) ? Number(v.text) : null;
    if (key === "alignItems" && s) axes.push("ai:" + s);
    else if (key === "justifyContent" && s) axes.push("jc:" + s);
    else if ((key === "placeItems" || key === "placeContent") && s) { axes.push("ai:" + s); axes.push("jc:" + s); }
    else if (key === "flexDirection") { hasFlexDirection = true; if (s === "row") axes.push("row"); }
    else if (key === "position" && s === "absolute") axes.push("absolute");
    else if (key === "flex" && n === 1) axes.push("flex1");
    else if (/^border(Top|Bottom|Left|Right)?$/.test(key) && (s || n)) axes.push("border");
    else if (/^border(Top|Bottom|Left|Right)?Width$/.test(key) && n && n > 0) axes.push("border");
    else if (key === "display" && (s === "flex" || s === "inline-flex")) displayFlex = true;
  }
  // CSS `display:flex` is row-by-default; the transpiler emits an explicit `flexDirection:"row"` for it
  // (RN defaults to column). Derive the SAME row axis from the mock's bare `display:flex` so mock and
  // view agree — without this the guardrail is blind to a mock ROW shipped as an RN COLUMN.
  if (displayFlex && !hasFlexDirection) axes.push("row");
  return [...new Set(axes)].sort();
}

function isBlankText(ts, c) {
  return ts.isJsxText(c) && c.text.trim() === "";
}

/** Read a JSX attribute's expression initializer (`prop={expr}`) → the expression node, or null. */
function attrExpr(ts, opening, attrName) {
  const attrs = opening.attributes?.properties || [];
  const a = attrs.find((x) => ts.isJsxAttribute(x) && x.name.getText() === attrName);
  const init = a?.initializer;
  return init && ts.isJsxExpression(init) ? init.expression : null;
}

/**
 * A virtualized list (`FlatList`/`SectionList`/…) → a MAP node, so it compares structurally-equal to
 * the mock's `{items.map(item => <Row/>)}`. The list's `renderItem`/`renderSectionHeader` callback IS
 * the map body: its returned JSX is the per-item subtree (`renderItem={({ item }) => <Row/>}`), exactly
 * what `.map` yields. Returns null when there is no resolvable render callback (so the caller treats the
 * element as an ordinary BOX rather than pretending it is a list).
 */
function virtualListToMap(ts, opening) {
  const fn = attrExpr(ts, opening, "renderItem") || attrExpr(ts, opening, "renderSectionHeader");
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return null;
  const nodes = jsxFrom(ts, fn.body);
  if (!nodes.length) return null;
  return { kind: "MAP", axes: [], children: nodes };
}

/** Build a normalized node from a JsxElement / JsxSelfClosingElement. */
function nodeOf(ts, el) {
  const opening = ts.isJsxSelfClosingElement(el) ? el : el.openingElement;
  const name = tagName(ts, opening);
  if (VIRTUAL_LIST.has(name.toLowerCase())) {
    const asMap = virtualListToMap(ts, opening);
    if (asMap) return asMap;
  }
  const rawChildren = ts.isJsxSelfClosingElement(el) ? [] : el.children;
  const kids = rawChildren.filter((c) => !isBlankText(ts, c));
  // A `{…}` child that yields JSX elements (a `.map()`, a ternary of elements) makes this a container,
  // not text — mirrors the transpiler's content-aware seam so `<div>{items.map(<View/>)}</div>` is a
  // BOX on both sides, never a TEXT wrapping BOXes (which would be an RN crash the guardrail must not
  // certify as congruent). A plain interpolation (`{label}`) yields nothing and keeps the node TEXT.
  const exprYieldsJsx = (c) => ts.isJsxExpression(c) && c.expression && fromExpression(ts, c.expression).length > 0;
  const hasElementChild = kids.some((c) => ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c) || ts.isJsxFragment(c) || exprYieldsJsx(c));
  const hasTextChild = kids.some((c) => ts.isJsxText(c) || (ts.isJsxExpression(c) && !exprYieldsJsx(c)));
  const children = childrenOf(ts, rawChildren);

  if (TRANSPARENT.has(name.toLowerCase())) {
    return children.length === 1 ? children[0] : { kind: "GROUP", axes: [], children, __transparent: true };
  }
  const kind = kindOf(ts, name, hasElementChild, hasTextChild);
  return { kind, axes: axesOf(ts, opening), children: withSlots(ts, kind, opening, children) };
}

/**
 * Fold this element's STRUCTURAL SLOT props (JSX-valued attributes the primitive renders as layout —
 * e.g. `Screen`'s `banner`) into its children at the declared position, so slotted content is VISIBLE
 * to the structural diff on both the mock and the view. A no-op for elements with no configured slot or
 * an unset slot, so nothing that doesn't draw a slot is affected.
 */
function withSlots(ts, kind, opening, children) {
  const slots = STRUCTURAL_SLOTS.get(kind);
  if (!slots) return children;
  let out = children;
  for (const { prop, position } of slots) {
    const slotExpr = attrExpr(ts, opening, prop);
    if (!slotExpr) continue;
    const slotNodes = fromExpression(ts, slotExpr);
    if (!slotNodes.length) continue;
    out = position === "trailing" ? [...out, ...slotNodes] : [...slotNodes, ...out];
  }
  return out;
}

function childrenOf(ts, list) {
  const out = [];
  for (const c of list) {
    if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) out.push(nodeOf(ts, c));
    else if (ts.isJsxFragment(c)) out.push(...childrenOf(ts, c.children));
    else if (ts.isJsxExpression(c) && c.expression) out.push(...fromExpression(ts, c.expression));
  }
  return out.flatMap((n) => (n && n.__transparent ? n.children : n ? [n] : []));
}

function unwrap(ts, e) {
  while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e))) e = e.expression;
  return e;
}

/** Pull JSX nodes out of an expression: `.map(...)`, ternaries, `&&`, arrays. */
function fromExpression(ts, e) {
  e = unwrap(ts, e);
  if (!e) return [];
  if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === "map") {
    const cb = e.arguments[0];
    if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
      const nodes = jsxFrom(ts, cb.body);
      return nodes.length ? [{ kind: "MAP", axes: [], children: nodes }] : [];
    }
  }
  if (ts.isConditionalExpression(e)) {
    const a = jsxFrom(ts, e.whenTrue);
    const b = jsxFrom(ts, e.whenFalse);
    return a.length || b.length ? [{ kind: "COND", axes: [], children: [...a, ...b] }] : [];
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return jsxFrom(ts, e.right);
  if (ts.isArrayLiteralExpression(e)) return e.elements.flatMap((el) => jsxFrom(ts, el));
  // The call/conditional/binary/array shapes are all handled above; if none matched (e.g. a NON-map
  // call like `fmt(x)` or an `||`/`??` binary), this expression yields no structural JSX. Returning []
  // here — instead of falling back to `jsxFrom(ts, e)` — breaks the fromExpression⇄jsxFrom cycle that
  // otherwise stack-overflows on such a node (jsxFrom routes those same kinds straight back here).
  if (ts.isCallExpression(e) || ts.isConditionalExpression(e) || ts.isBinaryExpression(e) || ts.isArrayLiteralExpression(e)) return [];
  return jsxFrom(ts, e);
}

function jsxFrom(ts, node) {
  node = unwrap(ts, node);
  if (!node) return [];
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) return [nodeOf(ts, node)];
  if (ts.isJsxFragment(node)) return childrenOf(ts, node.children);
  if (ts.isBlock(node)) { const r = returnedExpr(ts, node); return r ? jsxFrom(ts, r) : []; }
  if (node.kind === ts.SyntaxKind.NullKeyword) return [];
  if (ts.isIdentifier(node) && node.text === "undefined") return [];
  if (ts.isCallExpression(node) || ts.isConditionalExpression(node) || ts.isBinaryExpression(node) || ts.isArrayLiteralExpression(node)) return fromExpression(ts, node);
  return [];
}

function returnedExpr(ts, block) {
  let ret = null;
  block.statements.forEach((s) => { if (ts.isReturnStatement(s) && s.expression) ret = s.expression; });
  return ret;
}

function parse(ts, src) {
  return ts.createSourceFile("x.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** Return the render (returned JSX) of a function/arrow component node. */
function renderOf(ts, fn) {
  if (!fn) return null;
  if (fn.body && ts.isBlock(fn.body)) return returnedExpr(ts, fn.body);
  return fn.body || null; // concise arrow
}

/** Find a named component (function decl / const arrow-or-fn) in a source file. */
function findNamed(ts, sf, name) {
  let fn = null;
  const visit = (node) => {
    if (fn) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) { fn = node; return; }
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) { fn = d.initializer; return; }
      }
    }
    // Member-assignment screens — `RC.cart_empty = () => (…)` — matched by the assigned PROPERTY name,
    // mirroring emit.mjs's extractor so the mock and the view are found the same way.
    if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)
      && node.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const { left, right } = node.expression;
      if (ts.isPropertyAccessExpression(left) && left.name.text === name
        && (ts.isArrowFunction(right) || ts.isFunctionExpression(right))) { fn = right; return; }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return fn;
}

/** Find the FIRST function/arrow in a file whose render is JSX (for the generated view file). */
function findFirstRenderer(ts, sf) {
  let fn = null;
  const visit = (node) => {
    if (fn) return;
    if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node))) {
      const r = renderOf(ts, node);
      if (r && jsxFrom(ts, r).length) { fn = node; return; }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return fn;
}

function rootFrom(ts, render) {
  const nodes = jsxFrom(ts, render);
  if (!nodes.length) throw new Error("no JSX render found in component");
  return nodes.length === 1 ? nodes[0] : { kind: "FRAGMENT", axes: [], children: nodes };
}

/** Normalized tree of a NAMED component inside a (mock) source file. */
export function treeOfNamedComponent(ts, fileSrc, name) {
  const sf = parse(ts, fileSrc);
  const fn = findNamed(ts, sf, name);
  if (!fn) throw new Error(`component ${name} not found`);
  return rootFrom(ts, renderOf(ts, fn));
}

/** Normalized tree of the first renderer in a (generated view) source file. */
export function treeOfViewFile(ts, fileSrc) {
  const sf = parse(ts, fileSrc);
  const fn = findFirstRenderer(ts, sf);
  if (!fn) throw new Error("no component with a JSX render found in view file");
  return rootFrom(ts, renderOf(ts, fn));
}

// ── Foundation-E: region/fragment guarding for INTERACTIVE container screens ───────────────────────
//
// A whole-screen generated view (`≡ mock`) cannot host an interactive container's behaviour (menu
// tabs/ItemSheet, cart steppers, checkout live-capture) without regressing it. So such a screen adopts
// PIECE-BY-PIECE: each REGION is a generated fragment view of a named sub-tree of the mock, and the
// guardrail asserts BOTH — (a) each fragment view ≡ its mock fragment (the existing tree-diff, via
// `treeOfMockFragment`), AND (b) the container mounts the fragments in the mock's region composition
// order/nesting (`mockCompositionTree` vs `containerCompositionTree`, diffed the same way). Both halves
// are pure static parse (TS compiler API) — no rendering — so they gate CI.

/** Unwrap to the first real JSX node of a component render (skips parens/as/non-null). */
function jsxRootNode(ts, node) {
  node = unwrap(ts, node);
  if (!node) return null;
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return node;
  if (ts.isBlock(node)) { const r = returnedExpr(ts, node); return r ? jsxRootNode(ts, r) : null; }
  return null;
}

/** Does a `.map()` callback body (or a bare JSX node) yield an element of the given kit tag? */
function jsxYieldsTag(ts, body, tag) {
  const want = tag.toUpperCase();
  const nodes = ts.isBlock(body) ? (returnedExpr(ts, body) ? jsxFrom(ts, returnedExpr(ts, body)) : []) : jsxFrom(ts, body);
  return nodes.some((n) => n && n.kind === want);
}

/** Is `e` a `X.map(cb)` whose callback yields the given kit tag? (the list-region locator). */
function isMapYielding(ts, e, tag) {
  return ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === "map"
    && (() => { const cb = e.arguments[0]; return !!cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) && jsxYieldsTag(ts, cb.body, tag); })();
}

/**
 * Locate a region's mock sub-node inside a render root, per an engine-agnostic locator descriptor —
 * the TS-side twin of emit.mjs's `locateBabel`, so gen and check find the SAME sub-tree.
 *   { el }   → first descendant JSX element with that tag.
 *   { map }  → first `.map()` call yielding that tag (returns the CallExpression).
 *   { slot } → the named attribute's expression on the first Screen element.
 */
export function locateTs(ts, root, locator) {
  let found = null;
  const visit = (node) => {
    if (found || !node) return;
    if (locator.el && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
      const opening = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
      if (tagName(ts, opening) === locator.el) { found = node; return; }
    } else if (locator.map && isMapYielding(ts, node, locator.map)) {
      found = node; return;
    } else if (locator.slot && (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))) {
      const opening = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
      if (tagName(ts, opening) === "Screen") { const e = attrExpr(ts, opening, locator.slot); if (e) { found = e; return; } }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

/** Normalize an arbitrary located node (element / fragment / expression) to a structural tree. */
function normalizeLocated(ts, node) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) return nodeOf(ts, node);
  if (ts.isJsxFragment(node)) { const ch = childrenOf(ts, node.children); return ch.length === 1 ? ch[0] : { kind: "FRAGMENT", axes: [], children: ch }; }
  const nodes = fromExpression(ts, node);
  if (!nodes.length) throw new Error("region locator matched a node with no structural JSX");
  return nodes.length === 1 ? nodes[0] : { kind: "FRAGMENT", axes: [], children: nodes };
}

/** EXPECTED tree for a region: the mock component's located sub-tree, normalized to shape. */
export function treeOfMockFragment(ts, mockSrc, mockComponent, locator) {
  const sf = parse(ts, mockSrc);
  const fn = findNamed(ts, sf, mockComponent);
  if (!fn) throw new Error(`mock component ${mockComponent} not found`);
  const root = jsxRootNode(ts, renderOf(ts, fn));
  if (!root) throw new Error(`mock component ${mockComponent} has no JSX render`);
  const node = locateTs(ts, root, locator);
  if (!node) throw new Error(`region locator ${JSON.stringify(locator)} matched nothing in ${mockComponent}`);
  return normalizeLocated(ts, node);
}

// ── Composition check ──────────────────────────────────────────────────────────────────────────────
// Reduce a screen's JSX to its REGION ANCHORS: each region's located subtree (mock) or mounted fragment
// component (container) becomes a `REGION:<name>` leaf; scaffold containers (Screen/View/div/ScrollView)
// are kept ONLY when they contain a region; every other subtree (interactive glue: tabs, ItemSheet,
// overlays, the backend-gated meta line) is pruned. A single-child scaffold BOX collapses to its child,
// so incidental wrapper Views (bleed/padding) never change the region SEQUENCE — the check verifies
// region ORDER + nesting + the Screen body/footer split, not incidental wrapping. The mock and the
// container reduce by the SAME rules, so `diff` on the two reduced trees catches a missing or reordered
// region (composition drift) statically.

function scaffoldKind(name) {
  const lc = name.toLowerCase();
  if (lc === "screen" || lc === "appscreen") return "SCREEN";
  if (["div", "span", "view", "section", "header", "nav", "main", "article", "ul", "li", "pad", "safeareaview", "scrollview", "keyboardavoidingview"].includes(lc)) return "BOX";
  return null;
}

function hasAnyRegion(node) {
  if (!node) return false;
  if (String(node.kind).startsWith("REGION:")) return true;
  return (node.children || []).some(hasAnyRegion);
}

function reduceComp(ts, node, opts) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const opening = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
    const name = tagName(ts, opening);
    const rgn = opts.elementRegion(name);
    if (rgn) return [{ kind: "REGION:" + rgn, axes: [], children: [] }];
    const sk = scaffoldKind(name);
    const rawChildren = ts.isJsxSelfClosingElement(node) ? [] : node.children;
    let kids = [];
    for (const c of rawChildren) kids.push(...reduceCompChild(ts, c, opts));
    if (sk === "SCREEN") kids = [...kids, ...reduceSlot(ts, opening, "banner", opts, true), ...reduceSlot(ts, opening, "footer", opts, false)];
    if (sk) {
      if (!kids.some(hasAnyRegion)) return [];
      return sk !== "SCREEN" && kids.length === 1 ? kids : [{ kind: sk, axes: [], children: kids }];
    }
    return kids.filter(hasAnyRegion); // non-scaffold: drop the wrapper, bubble regions
  }
  return [];
}

function reduceCompChild(ts, c, opts) {
  if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) return reduceComp(ts, c, opts);
  if (ts.isJsxFragment(c)) { const out = []; for (const g of c.children) out.push(...reduceCompChild(ts, g, opts)); return out; }
  if (ts.isJsxExpression(c) && c.expression) return reduceExprComp(ts, c.expression, opts);
  return [];
}

function reduceExprComp(ts, e, opts) {
  e = unwrap(ts, e);
  if (!e) return [];
  const rgn = opts.exprRegion(e);
  if (rgn) return [{ kind: "REGION:" + rgn, axes: [], children: [] }];
  if (ts.isConditionalExpression(e)) return [...reduceExprComp(ts, e.whenTrue, opts), ...reduceExprComp(ts, e.whenFalse, opts)];
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return reduceExprComp(ts, e.right, opts);
  if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression) && e.expression.name.text === "map") {
    const cb = e.arguments[0];
    if (cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) return ts.isBlock(cb.body) ? (returnedExpr(ts, cb.body) ? reduceExprComp(ts, returnedExpr(ts, cb.body), opts) : []) : reduceExprComp(ts, cb.body, opts);
  }
  if (ts.isArrayLiteralExpression(e)) return e.elements.flatMap((el) => reduceExprComp(ts, el, opts));
  if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return reduceCompChild(ts, e, opts);
  return [];
}

function reduceSlot(ts, opening, prop, opts, leading) {
  const e = attrExpr(ts, opening, prop);
  if (!e) return [];
  const reduced = reduceExprComp(ts, e, opts).filter(hasAnyRegion);
  if (reduced.length) return reduced;
  if (opts.slotRegion && opts.slotRegion[prop]) return [{ kind: "REGION:" + opts.slotRegion[prop], axes: [], children: [] }];
  return [];
}

function optsFromRegions(regions, side) {
  const slotRegion = {};
  for (const r of regions) if (r.locator?.slot) slotRegion[r.locator.slot] = r.region;
  if (side === "mock") {
    return {
      elementRegion: (name) => regions.find((r) => r.locator?.el === name)?.region ?? null,
      exprRegion: () => null, // rebound in mockCompositionTree with the injected `ts` module
      slotRegion,
    };
  }
  return {
    // container: every region is mounted as its generated fragment component; footer sits in the slot,
    // matched by elementRegion inside it (so slotRegion is only a fallback and left empty here).
    elementRegion: (name) => regions.find((r) => r.componentName === name)?.region ?? null,
    exprRegion: () => null,
    slotRegion: {},
  };
}

/** Reduced region-anchor tree of the mock screen (EXPECTED composition). */
export function mockCompositionTree(ts, mockSrc, mockComponent, regions) {
  const sf = parse(ts, mockSrc);
  const fn = findNamed(ts, sf, mockComponent);
  if (!fn) throw new Error(`mock component ${mockComponent} not found`);
  const root = jsxRootNode(ts, renderOf(ts, fn));
  const opts = optsFromRegions(regions, "mock");
  // exprRegion needs the raw TS expr; rebuild it to take the TS node directly.
  opts.exprRegion = (e) => regions.find((r) => r.locator?.map && isMapYielding(ts, e, r.locator.map))?.region ?? null;
  const out = reduceComp(ts, root, opts);
  return out.length === 1 ? out[0] : { kind: "FRAGMENT", axes: [], children: out };
}

/** Reduced region-anchor tree of the container screen (ACTUAL composition). */
export function containerCompositionTree(ts, containerSrc, regions) {
  const sf = parse(ts, containerSrc);
  const fn = findFirstRenderer(ts, sf);
  if (!fn) throw new Error("container has no JSX render");
  const root = jsxRootNode(ts, renderOf(ts, fn));
  const opts = optsFromRegions(regions, "container");
  const out = reduceComp(ts, root, opts);
  return out.length === 1 ? out[0] : { kind: "FRAGMENT", axes: [], children: out };
}

/** Serialize a normalized node to the canonical S-expression string. */
export function sexpr(node) {
  if (!node) return "∅";
  const head = node.axes.length ? `${node.kind}[${node.axes.join(",")}]` : node.kind;
  if (!node.children.length) return head;
  return `${head}( ${node.children.map(sexpr).join(", ")} )`;
}

/** Structural diff: first divergent tree-path, phone-readable. Returns null when congruent. */
export function diff(expected, actual, path = "root") {
  if (!expected || !actual) return expected === actual ? null : `${path}: expected ${expected ? sexpr(expected) : "∅"}, got ${actual ? sexpr(actual) : "∅"}`;
  if (expected.kind !== actual.kind) return `${path}: expected ${expected.kind}, got ${actual.kind}`;
  const ea = expected.axes.join(","), aa = actual.axes.join(",");
  if (ea !== aa) return `${path} [${expected.kind}]: expected axes [${ea}], got [${aa}]`;
  if (expected.children.length !== actual.children.length) {
    return `${path} [${expected.kind}]: expected ${expected.children.length} child(ren), got ${actual.children.length}`
      + `\n    expected: ${sexpr(expected)}\n    actual:   ${sexpr(actual)}`;
  }
  for (let i = 0; i < expected.children.length; i++) {
    const d = diff(expected.children[i], actual.children[i], `${path}>${expected.kind}[${i}]`);
    if (d) return d;
  }
  return null;
}
