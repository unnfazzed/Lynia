/**
 * The RENDERED-conformance normal form, shared by both sides of the lane.
 *
 * The mock renders to a browser DOM; the app renders to a react-test-renderer tree. Those two shapes
 * can never be compared node-for-node — a `<View>` is not a `<div>`, and each renderer wraps content
 * in its own scaffolding. So both sides are reduced to the SAME normal form first:
 *
 *   node := { role: "container" | "text" | "image" | "input", text?: string, children?: node[] }
 *
 * and the assertion runs over that normal form. Everything in this module is pure (no DOM, no React),
 * so the extractor (node, in a browser page) and the jest guardrail import the exact same code — the
 * normalization can never drift between the side that WRITES the expectation and the side that CHECKS
 * it, which is the failure mode that made copy-string greps worthless.
 *
 * Rules, in one place:
 *   - text is whitespace-normalized (NBSP → space, runs → one space, trimmed) and otherwise VERBATIM.
 *     Mock copy is authority; we never case-fold, never strip punctuation, never "smart-quote" fix.
 *   - single-child container chains collapse, so benign wrapper nesting on either side (a padding div,
 *     an extra <View style={{flex:1}}>) does not churn the shape.
 *   - a container holding two or more direct text children is a GROUP (a card's title+meta, a row's
 *     label+value). Groups are what carry "structure is the look" into a cross-renderer comparison:
 *     the app may nest them differently, but it may not split them apart or interleave other copy.
 */

const ROLES = new Set(["container", "text", "image", "input"]);

/** Whitespace-normalize a rendered string. Verbatim otherwise — this is copy, not a slug. */
export function normText(s) {
  return String(s ?? "")
    .replace(/[  ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** container node helper. */
export function container(children) {
  return { role: "container", children };
}

/**
 * Prune + collapse a raw tree into the normal form:
 *   - drop empty containers and empty text nodes,
 *   - collapse a container whose only child is a container (repeatedly).
 * Returns null when nothing survives.
 */
export function collapse(node) {
  if (!node || !ROLES.has(node.role)) return null;
  if (node.role === "text") {
    const t = normText(node.text);
    return t ? { role: "text", text: t } : null;
  }
  if (node.role === "image" || node.role === "input") {
    const out = { role: node.role };
    if (node.text) {
      const t = normText(node.text);
      if (t) out.text = t;
    }
    return out;
  }
  const kids = [];
  for (const c of node.children || []) {
    const k = collapse(c);
    if (k) kids.push(k);
  }
  if (kids.length === 0) return null;
  if (kids.length === 1 && kids[0].role === "container") return kids[0];
  return { role: "container", children: kids };
}

/**
 * Depth-first flatten of every text leaf, in render order.
 *
 * `opts.imageLabels` (a Set) opts an app-side tree into counting a LABELLED IMAGE as text when its
 * label is one of the strings the mock draws. The mocks set typographic wordmarks and glyph badges as
 * text; the app ships the same content as vector art carrying that string as its accessibility label
 * (`Wordmark` → `<Svg accessibilityLabel="LyniaGo">`). Restricting it to labels the mock actually
 * draws is what keeps this from becoming a hole: a label the mock never drew is simply not collected,
 * so icon labels can neither satisfy copy nor be reported as undrawn extras.
 *
 * @returns {{text:string, path:string}[]} path is the child-index trail ("0.3.1") for diagnostics.
 */
export function flattenTexts(root, opts = {}) {
  const labels = opts.imageLabels;
  const out = [];
  const walk = (n, trail) => {
    if (!n) return;
    if (n.role === "text") {
      out.push({ text: n.text, path: trail.join(".") || "0" });
      return;
    }
    if (n.role === "image") {
      if (labels && n.text && labels.has(n.text)) out.push({ text: n.text, path: trail.join(".") || "0" });
      return;
    }
    (n.children || []).forEach((c, i) => walk(c, [...trail, i]));
  };
  walk(root, []);
  return out;
}

/**
 * Text groups: every maximal run of ≥2 ADJACENT text children of one container, expressed as indices
 * into flattenTexts(root). Order matches a depth-first walk, so both sides agree.
 *
 * Adjacency is the whole point. A card's title and meta sit next to each other; a screen heading and
 * the footer button below a form do not (a form, an image, a rail sits between them). Grouping only
 * adjacent siblings is what makes "these strings must stay together in the app" a claim about the
 * drawn structure rather than an accident of how deeply the mock nests its scaffold.
 */
export function textGroups(root) {
  const groups = [];
  let cursor = 0;
  const walk = (n) => {
    if (!n) return;
    if (n.role === "text") {
      cursor++;
      return;
    }
    const kids = n.children || [];
    // Flatten index of each direct child, computed in order.
    let idx = cursor;
    let run = [];
    for (const c of kids) {
      if (c.role === "text") {
        run.push(idx);
      } else {
        if (run.length >= 2) groups.push(run);
        run = [];
      }
      idx += countTexts(c);
    }
    if (run.length >= 2) groups.push(run);
    for (const c of kids) walk(c);
  };
  walk(root);
  return groups;
}

function countTexts(n) {
  if (!n) return 0;
  if (n.role === "text") return 1;
  return (n.children || []).reduce((a, c) => a + countTexts(c), 0);
}

/** Role census — a cheap, reviewable shape summary stored alongside the tree. */
export function roleCounts(root) {
  const counts = { container: 0, text: 0, image: 0, input: 0 };
  const walk = (n) => {
    if (!n) return;
    counts[n.role] = (counts[n.role] || 0) + 1;
    (n.children || []).forEach(walk);
  };
  walk(root);
  return counts;
}

/**
 * Compare the app's rendered text sequence against the mock's.
 *
 * @param {object} o
 * @param {{text:string,path:string}[]} o.expected  mock texts, in order
 * @param {{text:string,path:string}[]} o.actual    app texts, in order
 * @param {number[][]} [o.groups]                   expected-index groups that must stay adjacent
 * @param {{mock:string,match:string,reason:string,ref:string}[]} [o.dynamic]
 *        per-string escapes for values a fixture cannot pin (a live clock, a geolocated address).
 *        `match` is a REQUIRED regex the app string must satisfy — never a blanket skip.
 * @param {{text:string,reason:string,ref:string}[]} [o.extra]
 *        app strings the mock does not draw, each with a written reason. Undeclared extras fail:
 *        "not drawn ⇒ not rendered".
 * @param {{mock:string,reason:string,ref:string}[]} [o.undrawn]
 *        mock strings the app does not render AT ALL — a named, tracked parity defect rather than a
 *        silent hole. Each needs a reason and a `ref` into docs/DESIGN-DEVIATIONS.md (approved) or
 *        docs/KNOWN_BUGS.md (tracked, not approved). Growth is visible: it is a committed diff.
 * @returns {{ok:boolean, missing:object[], undeclared:object[], groupBreaks:object[], unusedDynamic:string[], unusedExtra:string[], unusedUndrawn:string[]}}
 */
export function conformance(o) {
  const E = o.expected || [];
  const A = o.actual || [];
  const dynamic = o.dynamic || [];
  const extra = o.extra || [];
  const undrawn = new Set((o.undrawn || []).map((u) => u.mock));

  const dynBy = new Map();
  for (const d of dynamic) dynBy.set(d.mock, d);
  const extraBy = new Map();
  for (const e of extra) extraBy.set(e.text, e);
  const usedDyn = new Set();
  const usedExtra = new Set();

  const matches = (i, text) => {
    const want = E[i].text;
    if (want === text) {
      // An exact hit still "uses" a dynamic entry declared for that string — otherwise a screen that
      // happens to render the mock's sample value would be failed for a stale allowlist entry.
      if (dynBy.has(want)) usedDyn.add(want);
      return true;
    }
    const d = dynBy.get(want);
    if (!d) return false;
    let re;
    try {
      re = new RegExp(d.match);
    } catch {
      return false;
    }
    if (!re.test(text)) return false;
    usedDyn.add(want);
    return true;
  };

  const LOOKAHEAD = 12;
  const positions = new Array(E.length).fill(-1);
  const undeclared = [];
  const staleUndrawn = new Set();
  const skipped = (k) => undrawn.has(E[k].text);
  let i = 0;
  const advance = () => {
    while (i < E.length && skipped(i)) i++;
  };
  advance();

  for (let a = 0; a < A.length; a++) {
    const t = A[a].text;
    if (undrawn.has(t)) {
      // The app now renders a string declared as undrawn — the defect is fixed; prune the entry.
      staleUndrawn.add(t);
      continue;
    }
    if (i < E.length && matches(i, t)) {
      positions[i] = a;
      i++;
      advance();
      continue;
    }
    if (extraBy.has(t)) {
      usedExtra.add(t);
      continue;
    }
    let hit = -1;
    for (let k = i + 1; k < Math.min(E.length, i + 1 + LOOKAHEAD); k++) {
      if (!skipped(k) && matches(k, t)) {
        hit = k;
        break;
      }
    }
    if (hit >= 0) {
      positions[hit] = a;
      i = hit + 1;
      advance();
      continue;
    }
    undeclared.push({ text: t, path: A[a].path, at: a });
  }

  const missing = [];
  for (let k = 0; k < E.length; k++) {
    if (positions[k] === -1 && !skipped(k)) missing.push({ text: E[k].text, path: E[k].path, at: k });
  }

  const groupBreaks = [];
  for (const g of o.groups || []) {
    const placed = g.filter((k) => positions[k] >= 0);
    for (let n = 1; n < placed.length; n++) {
      const prev = positions[placed[n - 1]];
      const cur = positions[placed[n]];
      if (cur === prev + 1) continue;
      const between = A.slice(prev + 1, cur).map((x) => x.text);
      groupBreaks.push({
        group: g.map((k) => E[k].text),
        after: E[placed[n - 1]].text,
        before: E[placed[n]].text,
        interleaved: between,
      });
    }
  }

  // Stale allowlist entries fail too: an escape that no longer applies is an unreviewed exemption
  // sitting in the ledger, and pruning it is the same explicit act as adding it (ratchet, not drift).
  const unusedDynamic = dynamic.map((d) => d.mock).filter((m) => !usedDyn.has(m));
  const unusedExtra = extra.map((e) => e.text).filter((t) => !usedExtra.has(t));
  const expectedTexts = new Set(E.map((e) => e.text));
  // An `undrawn` entry naming a string the mock no longer draws is dead weight in the ledger.
  const unusedUndrawn = [...undrawn].filter((m) => !expectedTexts.has(m)).concat([...staleUndrawn]);

  return {
    ok:
      missing.length === 0 &&
      undeclared.length === 0 &&
      groupBreaks.length === 0 &&
      unusedDynamic.length === 0 &&
      unusedExtra.length === 0 &&
      unusedUndrawn.length === 0,
    missing,
    undeclared,
    groupBreaks,
    unusedDynamic,
    unusedExtra,
    unusedUndrawn,
  };
}

/** Human-readable failure report with tree paths. */
export function formatReport(key, r) {
  const lines = [`rendered conformance FAILED for ${key}`];
  if (r.missing.length) {
    lines.push(`  ${r.missing.length} mock string(s) the app never rendered (or rendered out of order):`);
    for (const m of r.missing) lines.push(`    - mock[${m.at}] @${m.path}  ${JSON.stringify(m.text)}`);
  }
  if (r.undeclared.length) {
    lines.push(`  ${r.undeclared.length} app string(s) the mock never draws (not drawn ⇒ not rendered).`);
    lines.push(`  Fix the screen, or declare each in the expected JSON's "extra" with a reason:`);
    for (const u of r.undeclared) lines.push(`    + app[${u.at}] @${u.path}  ${JSON.stringify(u.text)}`);
  }
  if (r.groupBreaks.length) {
    lines.push(`  ${r.groupBreaks.length} mock text group(s) split apart in the app:`);
    for (const g of r.groupBreaks) {
      lines.push(`    ~ group ${JSON.stringify(g.group)}`);
      lines.push(`      ${JSON.stringify(g.after)} → ${JSON.stringify(g.before)} interleaved by ${JSON.stringify(g.interleaved)}`);
    }
  }
  if (r.unusedDynamic.length) {
    lines.push(`  stale "dynamic" entries (the mock no longer draws them): ${JSON.stringify(r.unusedDynamic)}`);
  }
  if (r.unusedExtra.length) {
    lines.push(`  stale "extra" entries (the app no longer renders them): ${JSON.stringify(r.unusedExtra)}`);
  }
  if (r.unusedUndrawn?.length) {
    lines.push(`  stale "undrawn" entries (the app draws them now, or the mock dropped them): ${JSON.stringify(r.unusedUndrawn)}`);
  }
  return lines.join("\n");
}
