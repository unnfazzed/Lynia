/**
 * Repo-wide census: parse every mock .jsx, find every `style={{...}}` object (and object consts that
 * are clearly style maps), classify each CSS declaration with css-map's verdict, and tally.
 * Also tallies JSX element tags and whether each <span> would map to Text or View.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Babel } from "./babel-load.mjs";
import { refine, RULES } from "./css-map.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const JDIR = resolve(HERE, "../../../packages/design/explorations/journey");
const RDIR = resolve(HERE, "../../../packages/design/explorations/restaurants");
const files = [
  ...readdirSync(JDIR).filter(f => f.endsWith(".jsx")).map(f => resolve(JDIR, f)),
  ...readdirSync(RDIR).filter(f => f.endsWith(".jsx")).map(f => resolve(RDIR, f)),
];

const CSS_KEYS = new Set(Object.keys(RULES).concat([
  "boxSizing","transition","content","WebkitLineClamp","WebkitBoxOrient","borderColor","borderWidth","borderStyle",
]));

const verdict = { clean:0, transform:0, structural:0, drop:0, manual:0, unknown:0 };
const byKey = {};
const tags = {};
let spanText = 0, spanView = 0, spanAmbig = 0;
let styleObjs = 0, decls = 0;

function textOf(node) {
  // cheap source-ish text for a value node
  if (!node) return null;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "NumericLiteral") return String(node.value);
  if (node.type === "UnaryExpression" && node.argument.type === "NumericLiteral") return node.operator + node.argument.value;
  if (node.type === "TemplateLiteral") return node.quasis.map(q=>q.value.cooked).join("${}");
  if (node.type === "CallExpression") return "call()";
  if (node.type === "MemberExpression") return "member";
  if (node.type === "ConditionalExpression") return textOf(node.consequent); // classify by one branch
  if (node.type === "Identifier") return node.name;
  return null;
}

function classifyObject(obj) {
  styleObjs++;
  for (const p of obj.properties) {
    if (p.type !== "ObjectProperty" || p.computed) continue;
    const key = p.key.name || p.key.value;
    if (!CSS_KEYS.has(key)) continue;
    decls++;
    const v = refine(key, textOf(p.value));
    verdict[v] = (verdict[v]||0)+1;
    byKey[key] = byKey[key] || {};
    byKey[key][v] = (byKey[key][v]||0)+1;
  }
}

const plugin = () => ({ visitor: {
  JSXAttribute(path){
    if ((path.node.name.name) !== "style") return;
    const val = path.node.value;
    if (val && val.type === "JSXExpressionContainer") {
      let e = val.expression;
      if (e.type === "ObjectExpression") classifyObject(e);
    }
  },
  JSXOpeningElement(path){
    const n = path.node.name;
    if (n.type !== "JSXIdentifier") return;
    const tag = n.name;
    tags[tag] = (tags[tag]||0)+1;
    if (tag === "span") {
      // Heuristic: layout span (has display flex / width+height / position) → View; else Text.
      const styleAttr = path.node.attributes.find(a => a.type==="JSXAttribute" && a.name.name==="style");
      let isLayout = false, hasStyle=false;
      if (styleAttr && styleAttr.value && styleAttr.value.type==="JSXExpressionContainer" && styleAttr.value.expression.type==="ObjectExpression") {
        hasStyle=true;
        for (const p of styleAttr.value.expression.properties) {
          if (p.type!=="ObjectProperty") continue;
          const k = p.key.name||p.key.value;
          if (["display","flexDirection","alignItems","justifyContent","placeItems"].includes(k)) { isLayout=true; }
        }
      }
      if (isLayout) spanView++; else if (hasStyle) spanAmbig++; else spanText++;
    }
  }
}});

for (const f of files) {
  const src = readFileSync(f, "utf8");
  try { Babel.transform(src, { plugins:[plugin], parserOpts:{plugins:["jsx"]}, ast:false, code:false, filename:f }); }
  catch(e){ console.error("parse fail", f.split("/").pop(), e.message.slice(0,80)); }
}

const total = decls;
console.log("=== FILES:", files.length, " STYLE OBJECTS:", styleObjs, " CSS DECLARATIONS:", total, "===\n");
console.log("VERDICT DISTRIBUTION (share of all style declarations):");
for (const k of ["clean","transform","structural","drop","manual","unknown"]) {
  const n = verdict[k]||0;
  console.log(`  ${k.padEnd(11)} ${String(n).padStart(5)}  ${(100*n/total).toFixed(1)}%`);
}
const mechanical = verdict.clean + verdict.transform + verdict.drop;
console.log(`\n  MECHANICAL (clean+transform+drop) = ${mechanical}  ${(100*mechanical/total).toFixed(1)}%`);
console.log(`  NEEDS HAND / TREE  (structural+manual) = ${verdict.structural+verdict.manual}  ${(100*(verdict.structural+verdict.manual)/total).toFixed(1)}%`);

console.log("\n=== <span> disposition (Text vs View) ===");
console.log(`  → Text (no layout style): ${spanText}`);
console.log(`  → View (layout style):    ${spanView}`);
console.log(`  → styled, non-layout (default Text, verify): ${spanAmbig}`);

console.log("\n=== top style keys needing structural/manual work ===");
const hard = Object.entries(byKey)
  .map(([k,v]) => [k, (v.structural||0)+(v.manual||0), Object.values(v).reduce((a,b)=>a+b,0)])
  .filter(x => x[1]>0).sort((a,b)=>b[1]-a[1]);
for (const [k,h,t] of hard) console.log(`  ${k.padEnd(20)} ${h}/${t} hard`);
