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
  img: "IMAGE", image: "IMAGE",
  top: "APPBAR", appbar: "APPBAR",
  screen: "SCREEN", appscreen: "SCREEN",
  svg: "SVG", path: "SVG", circle: "SVG", rect: "SVG", g: "SVG", line: "SVG", polyline: "SVG", polygon: "SVG",
}));
const TRANSPARENT = new Set(["pressable", "touchableopacity", "touchablewithoutfeedback", "touchablehighlight", "fragment"]);

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

/** Build a normalized node from a JsxElement / JsxSelfClosingElement. */
function nodeOf(ts, el) {
  const opening = ts.isJsxSelfClosingElement(el) ? el : el.openingElement;
  const name = tagName(ts, opening);
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
  return { kind: kindOf(ts, name, hasElementChild, hasTextChild), axes: axesOf(ts, opening), children };
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
