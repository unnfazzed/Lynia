/**
 * Mock JSX + inline CSS  →  React Native presentational component (prototype).
 * Rewrites the AST in place, then lets Babel print RN-flavoured JSX. Emits a per-run report of what
 * mapped cleanly, what was value-transformed, and what was FLAGGED for a human (structural/manual).
 * Scope: enough of the real rule-set to transpile a genuine mock and measure fidelity honestly.
 */
import { Babel } from "./babel-load.mjs";

// var(--x) → tokens.<group>.<camel>  (partial but deterministic; unmapped vars are flagged)
const TOKEN = {
  "--ink":"color.ink","--muted":"color.muted","--bg":"color.bg","--surface":"color.surface",
  "--line":"color.line","--accent":"color.accent","--accent-text":"color.accentText",
  "--accent-wash":"color.accentWash","--danger":"color.danger","--on-accent":"color.onAccent",
  "--radius-input":"radius.input","--radius-card":"radius.card","--radius-pill":"radius.pill",
  "--space-xs":"space.xs","--space-sm":"space.sm","--space-md":"space.md","--space-lg":"space.lg",
  "--shadow-card":"shadow.card","--shadow-sheet":"shadow.sheet",
  "--text-label":"font.size.label","--text-body":"font.size.body","--text-caption":"font.size.caption",
};

export function transpile(src, report) {
  const R = report || { clean:0, transform:0, flagged:[] };
  const plugin = ({ types: t }) => {
    const tokenExpr = (path2) => path2.split(".").reduce((acc, k) => t.memberExpression(acc, t.identifier(k)), t.identifier("tokens"));
    const valFromVar = (raw) => { const m = /^var\((--[a-z0-9-]+)\)$/.exec(raw.trim()); if (m && TOKEN[m[1]]) return tokenExpr(TOKEN[m[1]]); return null; };
    const num = (raw) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(raw.trim()); if (m) return t.numericLiteral(parseFloat(m[1])); return null; };

    function rewriteStyleObject(obj, elementFlags) {
      const out = [];
      for (const p of obj.properties) {
        if (p.type !== "ObjectProperty" || p.computed) { out.push(p); continue; }
        const key = p.key.name || (p.key.value);
        const vnode = p.value;
        const raw = vnode.type === "StringLiteral" ? vnode.value : null;

        // key renames / drops / structural
        if (key === "display") {
          if (raw === "grid") elementFlags.grid = true;
          R.clean++; continue; // drop display; grid handled via placeItems
        }
        if (key === "placeItems") { // grid centering → flex align+justify
          const val = raw === "center" ? "center" : (raw || "center");
          out.push(t.objectProperty(t.identifier("alignItems"), t.stringLiteral(val)));
          out.push(t.objectProperty(t.identifier("justifyContent"), t.stringLiteral(val)));
          R.transform++; continue;
        }
        if (key === "whiteSpace" || key === "textOverflow") { elementFlags.numberOfLines = true; R.transform++; continue; }
        if (key === "cursor" || key === "pointerEvents") { R.clean++; continue; } // drop
        if (key === "background") {
          if (raw && /gradient|url\(/.test(raw)) { R.flagged.push(`background: ${raw.slice(0,30)}… (gradient/image → manual)`); out.push(p); continue; }
          p.key = t.identifier("backgroundColor");
        }
        // border shorthand → 3 props
        if (/^border(Top|Bottom|Left|Right)?$/.test(key) && raw && /\s/.test(raw)) {
          const m = /^(\d+(?:\.\d+)?)px\s+(solid|dashed|dotted)\s+(.+)$/.exec(raw.trim());
          if (m) {
            const side = key === "border" ? "" : key.replace("border","");
            const w = side ? `border${side}Width` : "borderWidth";
            const c = side ? `border${side}Color` : "borderColor";
            out.push(t.objectProperty(t.identifier(w), t.numericLiteral(parseFloat(m[1]))));
            if (!side) out.push(t.objectProperty(t.identifier("borderStyle"), t.stringLiteral(m[2])));
            const cv = valFromVar(m[3]) || t.stringLiteral(m[3]);
            out.push(t.objectProperty(t.identifier(c), cv));
            R.transform++; continue;
          }
        }
        // padding/margin multi-value shorthand → V/H (2-val) or 4-side
        if ((key === "padding" || key === "margin") && raw && /\s/.test(raw)) {
          const parts = raw.trim().split(/\s+/).map(x => num(x) || t.stringLiteral(x));
          const base = key;
          if (parts.length === 2) {
            out.push(t.objectProperty(t.identifier(base+"Vertical"), parts[0]));
            out.push(t.objectProperty(t.identifier(base+"Horizontal"), parts[1]));
          } else {
            const sides = ["Top","Right","Bottom","Left"];
            parts.slice(0,4).forEach((pp,i)=>out.push(t.objectProperty(t.identifier(base+sides[i]), pp)));
          }
          R.transform++; continue;
        }
        if (key === "inset" && raw === "0") {
          for (const s of ["top","right","bottom","left"]) out.push(t.objectProperty(t.identifier(s), t.numericLiteral(0)));
          R.transform++; continue;
        }
        if (key === "boxShadow") {
          const tv = valFromVar(raw||"");
          if (tv) { elementFlags.spreadShadow = tv; R.transform++; continue; }
          R.flagged.push(`boxShadow: ${String(raw).slice(0,30)}… (non-token → manual shadow*)`); out.push(p); continue;
        }
        // generic value rewrites: px→num, var→token, fontWeight num→string
        if (raw != null) {
          const nv = num(raw); const tv = valFromVar(raw);
          if (tv) { p.value = tv; R.clean++; }
          else if (nv) { p.value = nv; R.clean++; }
          else { R.clean++; }
        } else { R.clean++; }
        // fontWeight numeric → string (RN wants "700")
        if (key === "fontWeight" && p.value.type === "NumericLiteral") p.value = t.stringLiteral(String(p.value.value));
        out.push(p);
      }
      obj.properties = out;
    }

    const TAG = { div:"View", span:"Text", b:"Text", section:"View", header:"View", nav:"View", h2:"Text", a:"Text", ul:"View", li:"View", p:"Text", img:"Image" };
    return { visitor: {
      JSXElement(path) {
        const open = path.node.openingElement;
        if (open.name.type !== "JSXIdentifier") return;
        const tag = open.name.name;
        const flags = {};
        // rewrite style attr first (sets flags)
        const styleAttr = open.attributes.find(a => a.type==="JSXAttribute" && a.name.name==="style");
        if (styleAttr && styleAttr.value?.type==="JSXExpressionContainer" && styleAttr.value.expression.type==="ObjectExpression") {
          rewriteStyleObject(styleAttr.value.expression, flags);
          if (flags.spreadShadow) styleAttr.value.expression.properties.push(t.spreadElement(flags.spreadShadow));
        }
        // Content-aware View/Text rule (the #1 fidelity seam). RN forbids raw text under a View, and
        // forbids layout children under a Text. A leaf whose children are ALL text/expressions →
        // Text; anything containing a JSX element → View. Applies to div AND span (a tag map alone is
        // wrong in both directions: a text <div> and a shape <span>).
        let mapped = TAG[tag] || tag;
        if (tag === "div" || tag === "span") {
          const kids = path.node.children.filter(c =>
            !(c.type === "JSXText" && c.value.trim() === ""));
          const hasElementChild = kids.some(c => c.type === "JSXElement");
          const hasTextChild = kids.some(c => c.type === "JSXText" || c.type === "JSXExpressionContainer");
          mapped = hasElementChild ? "View" : (hasTextChild ? "Text" : "View");
        }
        if (TAG[tag] || tag === "span") {
          open.name = t.jsxIdentifier(mapped);
          if (path.node.closingElement) path.node.closingElement.name = t.jsxIdentifier(mapped);
          if (flags.numberOfLines && mapped === "Text")
            open.attributes.push(t.jsxAttribute(t.jsxIdentifier("numberOfLines"), t.jsxExpressionContainer(t.numericLiteral(1))));
          if (flags.grid) R.flagged.push(`<${tag}> used display:grid → verify flex re-nest`);
        }
      }
    }};
  };
  const out = Babel.transform(src, { plugins:[plugin], parserOpts:{plugins:["jsx"]}, retainLines:false, ast:false, code:true });
  return out.code;
}
