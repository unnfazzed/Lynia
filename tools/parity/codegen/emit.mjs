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
 * Run the whole pipeline for one adopted-screen spec, returning:
 *   { code, report, importsUsed }  — `code` is the full .view.tsx text.
 */
export function emitView(spec) {
  const fileSrc = readFileSync(resolve(ROOT, spec.mockFile), "utf8");
  const componentSrc = extractNamed(fileSrc, spec.component);
  const report = { clean: 0, transform: 0, dropped: 0, unresolved: [] };
  let code = transpile(componentSrc, report);

  // Apply the per-screen bindings via a Babel pass (rename, param, hoist-drop, attr swaps, wraps).
  const ast = parse(code);
  traverse(ast, {
    FunctionDeclaration(path) {
      if (path.node.id && path.node.id.name === spec.component) {
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
  const rnPrims = ["View", "Text", "Image", "Pressable"].filter((n) => new RegExp(`<${n}[\\s/>]`).test(body));
  // The app DS primitives codegen may emit. Every kit primitive the transpiler keeps by name (or
  // remaps to) must be import-able from `src/ui` — batch 2 flagged that Skeleton/Money were missing,
  // and the mock→RN foundation adds the four kit primitives (PriceMath/Banner/CoverPhoto/MenuRow).
  const uiPrims = ["AppBar", "Screen", "Field", "Card", "Icon", "Button", "StatusPill", "EmptyState", "Stepper", "Skeleton", "Money", "PriceMath", "Banner", "CoverPhoto", "MenuRow"].filter((n) => new RegExp(`<${n}[\\s/>]`).test(body));
  const usesTokens = /[^.\w]tokens\./.test(body) || /^tokens\./.test(body);
  const usesIconName = /IconName/.test(spec.propsType || "");

  const lines = [];
  lines.push(`// GENERATED — do not edit by hand. Structural-parity source of truth for ${spec.key}.`);
  lines.push(`// Source mock: ${spec.mockFile} :: ${spec.component}`);
  lines.push(`// Regenerate:  node tools/parity/codegen/cli.mjs gen ${spec.key}`);
  lines.push(`// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.`);
  lines.push(`//`);
  lines.push(`// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as`);
  lines.push(`// props from the container (${spec.container}) — that is the ONLY hand-wired seam.`);
  lines.push(`import React from "react";`);
  if (rnPrims.length) lines.push(`import { ${rnPrims.join(", ")} } from "react-native";`);
  if (usesTokens) {
    const ui = [...uiPrims];
    if (usesIconName) ui.push("type IconName");
    lines.push(`import { tokens } from "@lynia/shared";`);
    if (ui.length) lines.push(`import { ${dedupeUi(ui).join(", ")} } from "${spec.uiImport}";`);
  } else if (uiPrims.length) {
    lines.push(`import { ${dedupeUi(uiPrims.concat(usesIconName ? ["type IconName"] : [])).join(", ")} } from "${spec.uiImport}";`);
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
