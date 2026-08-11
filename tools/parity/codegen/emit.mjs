/**
 * Full mock → RN presentational component pipeline:
 *   extract one component from a mock bundle → transpile structure+styles → apply the screen's
 *   data-seam BINDINGS → assemble a complete, import-clean, typed `.view.tsx`.
 *
 * Split of responsibility (matches docs/parity/STRUCTURE-ADOPTION-SPIKE.md §3):
 *   • transpile.mjs owns STRUCTURE + STYLE — mechanical, screen-independent, guardrail-locked.
 *   • the per-screen `bind` closure (in adopted.mjs) owns the DATA SEAM — hoisting the mock's frozen
 *     literals to props and wiring handlers. Bindings only touch leaf values / add transparent
 *     interaction wrappers; they never reshape the element tree, so structural parity stays "by
 *     construction" (the structural-snapshot guardrail is blind to the data a binding changes).
 */
import { Babel } from "./babel-load.mjs";
import { transpile } from "./transpile.mjs";
import { parse, generate } from "./extract.mjs";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const traverse = Babel.packages.traverse.default || Babel.packages.traverse;
const t = Babel.packages.types;
const parser = Babel.packages.parser;

/** Parse a JS expression snippet → its AST node. */
function expr(code) {
  return parser.parse(`(${code})`, { plugins: ["jsx"] }).program.body[0].expression;
}
/** Parse a self-closing JSX tag snippet (`<Tag a={1} />`) → the JSXOpeningElement's attributes. */
function attrsOf(tagSnippet) {
  const el = expr(tagSnippet);
  return el.openingElement.attributes;
}
/** Wrap a JSXElement node in `<Wrapper …attrs>{el}</Wrapper>`. */
function wrap(el, wrapperTag, attrsSnippet) {
  const attrs = attrsSnippet ? attrsOf(`<${wrapperTag} ${attrsSnippet} />`) : [];
  return t.jsxElement(
    t.jsxOpeningElement(t.jsxIdentifier(wrapperTag), attrs, false),
    t.jsxClosingElement(t.jsxIdentifier(wrapperTag)),
    [el],
    false,
  );
}

const bindHelpers = { t, expr, attrsOf, wrap, traverse };

/**
 * Locate a FRAGMENT node inside an already-parsed mock component AST, per an engine-agnostic locator
 * descriptor (Foundation-E). The SAME descriptor shape is interpreted on the TS AST at guardrail time
 * (normalize.mjs `locateTs`), so a region's mock sub-tree is found identically for gen and for check.
 *
 *   { el: "CoverPhoto" }  → the first JSX element with that tag (a sub-tree region, e.g. the cover).
 *   { map: "MenuRow" }    → the first `X.map(cb)` whose callback yields a <MenuRow> (the list region).
 *   { slot: "footer" }    → the `footer` attribute value of the root Screen (the pinned-bar region).
 */
function locateBabel(ast, locator) {
  let found = null;
  const bodyYields = (cb, tag) => {
    const b = cb.body;
    const isEl = (n) => n && n.type === "JSXElement" && n.openingElement.name.name === tag;
    if (isEl(b)) return true;
    if (b.type === "BlockStatement") {
      let ret = null;
      b.body.forEach((s) => { if (s.type === "ReturnStatement" && s.argument) ret = s.argument; });
      return isEl(ret);
    }
    return false;
  };
  // The terminal tag name — for a member tag (`K.FauxMap`, JSXMemberExpression) it is the `.property`,
  // matching the Foundation-F.b idiom (transpile collapses `<Ns.Name>`→`<Name>`) and the normalizer's
  // `tagName`, so `{el:"FauxMap"}` anchors the send-composer's map canvas the same on gen and check.
  const tagOf = (n) => (n.type === "JSXMemberExpression" ? n.property.name : n.name);
  if (locator.el) {
    traverse(ast, { JSXElement(path) { if (!found && tagOf(path.node.openingElement.name) === locator.el) found = path.node; } });
  } else if (locator.map) {
    traverse(ast, {
      CallExpression(path) {
        if (found) return;
        const c = path.node.callee;
        if (c.type !== "MemberExpression" || c.property.name !== "map") return;
        const cb = path.node.arguments[0];
        if (!cb || (cb.type !== "ArrowFunctionExpression" && cb.type !== "FunctionExpression")) return;
        if (bodyYields(cb, locator.map)) found = path.node;
      },
    });
  } else if (locator.slot) {
    // Foundation-F.c: a slot region anchors on the first element carrying the JSX-valued attribute,
    // not only `<Screen>` — the send-composer's submit lives in `MapSheet.footer`. `<Screen footer=…>`
    // (menu / cart / checkout) still matches identically (it is an element with the attribute).
    traverse(ast, {
      JSXOpeningElement(path) {
        if (found) return;
        const a = path.node.attributes.find((x) => x.type === "JSXAttribute" && x.name.name === locator.slot);
        if (a && a.value && a.value.type === "JSXExpressionContainer") found = a.value.expression;
      },
    });
  }
  return found;
}

/**
 * Build a standalone `function __frag__(){ return <FRAGMENT>; }` source for a REGION unit: extract the
 * screen's mock component, locate the region node, and wrap it (a bare expression like a `.map()` is
 * wrapped in a `<>{…}</>` so the fragment view has a JSX render). The transpiler + bind pipeline then
 * runs on it exactly like a whole-screen component.
 */
function fragmentSource(spec) {
  const fileSrc = readFileSync(resolve(ROOT, spec.mockFile), "utf8");
  const compSrc = extractNamed(fileSrc, spec.mockComponent);
  const ast = parse(compSrc);
  const node = locateBabel(ast, spec.locator);
  if (!node) throw new Error(`region locator ${JSON.stringify(spec.locator)} matched nothing in ${spec.mockComponent}`);
  const ret = node.type === "JSXElement" || node.type === "JSXFragment"
    ? node
    : t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), [t.jsxExpressionContainer(node)]);
  return generate(t.functionDeclaration(t.identifier("__frag__"), [], t.blockStatement([t.returnStatement(ret)])));
}

/**
 * Run the whole pipeline for one adopted-screen spec, returning:
 *   { code, report, importsUsed }  — `code` is the full .view.tsx text.
 */
export function emitView(spec) {
  const srcName = spec.isFragment ? "__frag__" : spec.component;
  const componentSrc = spec.isFragment
    ? fragmentSource(spec)
    : extractNamed(readFileSync(resolve(ROOT, spec.mockFile), "utf8"), spec.component);
  const report = { clean: 0, transform: 0, dropped: 0, unresolved: [] };
  let code = transpile(componentSrc, report);

  // Apply the per-screen bindings via a Babel pass (rename, param, hoist-drop, attr swaps, wraps).
  const ast = parse(code);
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id && path.node.id.name === srcName) {
        path.node.id.name = spec.componentName;
        if (spec.propsParam) path.node.params = [parseParam(spec.propsParam)];
        path.node.returnType = t.tsTypeAnnotation(t.tsTypeReference(t.tsQualifiedName(t.identifier("React"), t.identifier("ReactElement"))));
      }
    },
  });
  if (spec.bind) traverse(ast, spec.bind(bindHelpers));
  // Drop hoisted consts (they became props).
  if (spec.hoist?.length) {
    traverse(ast, {
      VariableDeclaration(path) {
        path.node.declarations = path.node.declarations.filter(
          (d) => !(d.id.type === "Identifier" && spec.hoist.includes(d.id.name)),
        );
        if (path.node.declarations.length === 0) path.remove();
      },
    });
  }
  let body = generate(ast.program.body.find((n) => n.type === "FunctionDeclaration"));

  code = assembleFile(spec, body);
  return { code, report };
}

/** Build a single ObjectPattern param with a TS type annotation from `{ a, b }: TypeName`. */
function parseParam(propsParam) {
  const m = /^\s*(\{[^}]*\})\s*:\s*([A-Za-z0-9_]+)\s*$/.exec(propsParam);
  const patternSrc = m ? m[1] : propsParam;
  const typeName = m ? m[2] : null;
  const parsed = parser.parse(`(${patternSrc}) => 0`, { plugins: ["jsx", "typescript"] }).program.body[0].expression.params[0];
  if (typeName) parsed.typeAnnotation = t.tsTypeAnnotation(t.tsTypeReference(t.identifier(typeName)));
  return parsed;
}

function extractNamed(fileSrc, name) {
  // Re-use extract.mjs's logic via a local import to avoid a cycle at module-eval time.
  const ast = parse(fileSrc);
  let found = null;
  const fromFn = (params, body) =>
    t.functionDeclaration(t.identifier(name), params, body.type === "BlockStatement" ? body : t.blockStatement([t.returnStatement(body)]));
  traverse(ast, {
    FunctionDeclaration(path) { if (path.node.id?.name === name) found = path.node; },
    VariableDeclarator(path) {
      if (path.node.id.type === "Identifier" && path.node.id.name === name) {
        const init = path.node.init;
        if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
          found = fromFn(init.params, init.body);
        }
      }
    },
    // The restaurant/journey bundles register many screens as member assignments —
    // `RC.cart_empty = () => (…)`, `S.help = …` — not `const`/`function` declarations. Match by the
    // assigned PROPERTY name so those screens are extractable too (the spec's `component` is the
    // property, e.g. "cart_empty").
    AssignmentExpression(path) {
      const { left, right } = path.node;
      if (left.type === "MemberExpression" && !left.computed && left.property.type === "Identifier" && left.property.name === name
        && right && (right.type === "ArrowFunctionExpression" || right.type === "FunctionExpression")) {
        found = fromFn(right.params, right.body);
      }
    },
  });
  if (!found) throw new Error(`component ${name} not found in ${name}`);
  return generate(found);
}

/** Assemble the final .view.tsx: header + imports (only what the body uses) + types + component. */
function assembleFile(spec, body) {
  const used = (name) => new RegExp(`(<${name}[\\s/>]|[^.\\w]${name}\\.)`).test(body);
  // FlatList is the RN realization of the mock's `{items.map(...)}` (normalize.mjs treats
  // FlatList ≡ map), so a data-list bind that swaps a mapped list for a virtualized one — e.g.
  // LJ.notifications — needs it importable here.
  const rnPrims = ["View", "Text", "Image", "Pressable", "FlatList"].filter((n) => new RegExp(`<${n}[\\s/>]`).test(body));
  // The app DS primitives codegen may emit. Every kit primitive the transpiler keeps by name (or
  // remaps to) must be import-able from `src/ui` — batch 2 flagged that Skeleton/Money were missing,
  // and the mock→RN foundation adds the four kit primitives (PriceMath/Banner/CoverPhoto/MenuRow).
  // `ComposeMap`/`BottomSheet` are the Foundation-F.c map/sheet realizations (`FauxMap`→`ComposeMap`,
  // `MapSheet`→`BottomSheet` via DS_RENAME); both are re-exported from `src/ui` so a map/sheet region
  // fragment imports them from the one DS specifier like every other primitive.
  const uiPrims = ["AppBar", "Screen", "Field", "Card", "Icon", "Button", "StatusPill", "EmptyState", "Stepper", "Skeleton", "Money", "PriceMath", "Banner", "CoverPhoto", "MenuRow", "EtaLine", "ShopLogo", "FoodThumb", "Heading", "Sub", "Label", "SystemState", "BrandLockup", "DoveMark", "Wordmark", "ComposeMap", "BottomSheet"].filter((n) => new RegExp(`<${n}[\\s/>]`).test(body));
  const usesTokens = /[^.\w]tokens\./.test(body) || /^tokens\./.test(body);
  const usesIconName = /IconName/.test(spec.propsType || "");
  // Region fragments type their data seam against the DS primitives' item types (e.g. the menu-rows
  // fragment's `rows: MenuRowItem[]`), so those types must be import-able from `src/ui` too. The
  // map-canvas region types its seam against `ComposeMap`'s controlled-point contract (PickedPoint /
  // ActiveSlot), re-exported from `src/ui` alongside the component.
  const uiTypes = ["MenuRowItem", "MenuCategory", "FoodThumbCategory", "BannerTone", "PickedPoint", "ActiveSlot"].filter((tn) => new RegExp(`\\b${tn}\\b`).test(spec.propsType || ""));

  const lines = [];
  const sourceLabel = spec.isFragment ? `${spec.mockComponent} :: region ${spec.region}` : spec.component;
  lines.push(`// GENERATED — do not edit by hand. Structural-parity source of truth for ${spec.key}.`);
  lines.push(`// Source mock: ${spec.mockFile} :: ${sourceLabel}`);
  lines.push(`// Regenerate:  node tools/parity/codegen/cli.mjs gen ${spec.key}`);
  lines.push(`// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.`);
  lines.push(`//`);
  lines.push(`// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as`);
  lines.push(`// props from the container (${spec.container}) — that is the ONLY hand-wired seam.`);
  lines.push(`import React from "react";`);
  if (rnPrims.length) lines.push(`import { ${rnPrims.join(", ")} } from "react-native";`);
  const typeImports = [...(usesIconName ? ["type IconName"] : []), ...uiTypes.map((tn) => `type ${tn}`)];
  if (usesTokens) {
    const ui = [...uiPrims, ...typeImports];
    lines.push(`import { tokens } from "@lynia/shared";`);
    if (ui.length) lines.push(`import { ${dedupeUi(ui).join(", ")} } from "${spec.uiImport}";`);
  } else if (uiPrims.length || typeImports.length) {
    lines.push(`import { ${dedupeUi(uiPrims.concat(typeImports)).join(", ")} } from "${spec.uiImport}";`);
  }
  lines.push("");
  if (spec.propsType) { lines.push(spec.propsType); lines.push(""); }
  lines.push("export " + body);
  lines.push("");
  return lines.join("\n");
}

function dedupeUi(arr) {
  const seen = new Set();
  return arr.filter((x) => { const k = x.replace(/^type /, ""); if (seen.has(k)) return false; seen.add(k); return true; });
}
