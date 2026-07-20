#!/usr/bin/env node
// contract-snapshot.mjs — backwards-compatibility gate for the shared API wire
// contracts (roadmap item 4.2).
//
// WHY THIS EXISTS
// The zod schemas in packages/shared/src/contracts.ts ARE the wire contract between
// the NestJS API and the Expo / Next clients. `pnpm typecheck` only proves the code
// in THIS repo agrees with itself — it says nothing about the app binaries already on
// people's phones. Mobile OTA + Play/App-Store review lag means an OLD installed client
// keeps talking to the NEW API for weeks. So a BACKWARDS-INCOMPATIBLE contract change
// (a field removed, a type narrowed/retyped, an enum value dropped, an optional field
// made required, a schema made strict) can silently break deployed clients even though
// CI is green. This gate makes such a change a DELIBERATE act: it must carry the
// `contract-change` PR label (which the workflow surfaces as CONTRACT_CHANGE_OK=1).
//
// HOW IT WORKS
// Each shared zod schema is serialised to a stable JSON Schema with zod v4's built-in
// `z.toJSONSchema()` (no new dependency — it ships inside the `zod` package the repo
// already uses). The serialised set is canonicalised (keys + required/enum arrays sorted)
// and committed to packages/shared/contract-snapshot.json. `--check` re-serialises the
// live contracts and diffs them against that committed baseline, classifying every change
// as ADDITIVE (a new optional field, a widened bound, a new enum value — always allowed)
// or BREAKING (removed/retyped field, narrowed bound, dropped enum value, optional→required,
// object made strict).
//
//   node scripts/contract-snapshot.mjs --write    # (re)generate the committed baseline
//   node scripts/contract-snapshot.mjs --check     # fail (exit 1) on a BREAKING diff
//
// The deliberate-breaking-change workflow: add the `contract-change` label AND run
// `pnpm contract:snapshot` to re-baseline (commit the regenerated snapshot in the same PR).
// Re-baselining removes the diff, so both the PR gate and the post-merge main run stay green;
// the label is the human acknowledgement CI records during the window before re-baselining.
// An ACCIDENTAL breaking change (no label, no re-baseline) is caught red.
//
// Exit codes: 0 = OK (no diff / additive-only / bypassed via label). 1 = BREAKING diff and
// not bypassed. 2 = usage / environment error (e.g. the shared package hasn't been built).

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(scriptDir);
const sharedRoot = join(repoRoot, "packages", "shared");
const distContracts = join(sharedRoot, "dist", "contracts.js");
const snapshotPath = join(sharedRoot, "contract-snapshot.json");

// zod resolved from the shared package itself, so we serialise with the EXACT zod version
// the contracts were authored against (z.toJSONSchema output is version-stable within a major).
const requireFromShared = createRequire(join(sharedRoot, "package.json"));

// Fixed serialisation options — pinned so the snapshot is reproducible run-to-run:
//  • io: "input"    — the shape a client SENDS / the server accepts (the contracts here carry
//                     no transforms/defaults, so input and output are identical anyway).
//  • reused:"inline" — inline shared sub-objects (e.g. LatLng inside Waypoint) instead of $ref,
//                     so each contract is a self-contained, human-reviewable tree.
const TO_JSON_SCHEMA_OPTS = { io: "input", reused: "inline" };

const inCI = process.env.GITHUB_ACTIONS === "true";
const bypass = /^(1|true|yes)$/i.test(process.env.CONTRACT_CHANGE_OK ?? "");

function ghError(msg) {
  console.error(inCI ? `::error::${msg}` : `ERROR: ${msg}`);
}
function ghWarn(msg) {
  console.error(inCI ? `::warning::${msg}` : `WARNING: ${msg}`);
}

// ── canonicalisation ────────────────────────────────────────────────────────
// Sort object keys recursively and sort the order-insensitive `required` / `enum`
// arrays, so re-declaring or re-ordering fields in contracts.ts doesn't churn the
// committed file and never registers as a semantic diff.
function canonicalize(node) {
  if (Array.isArray(node)) return node.map(canonicalize);
  if (node && typeof node === "object") {
    const out = {};
    for (const key of Object.keys(node).sort()) {
      let v = canonicalize(node[key]);
      if ((key === "required" || key === "enum") && Array.isArray(v)) {
        v = [...v].sort();
      }
      out[key] = v;
    }
    return out;
  }
  return node;
}

// Build { schemaName: canonicalJsonSchema } for every exported zod schema in contracts.ts.
function buildSchemas() {
  if (!existsSync(distContracts)) {
    ghError(
      `${distContracts} not found — build the shared package first: ` +
        `pnpm --filter @lynia/shared build`,
    );
    process.exit(2);
  }
  const { z } = requireFromShared("zod");
  const contracts = requireFromShared(distContracts);
  const out = {};
  for (const name of Object.keys(contracts)) {
    const val = contracts[name];
    // A zod schema instance: has .parse and the v4 internal marker ._zod.
    if (!val || typeof val !== "object" || typeof val.parse !== "function" || !val._zod) continue;
    let js;
    try {
      js = z.toJSONSchema(val, TO_JSON_SCHEMA_OPTS);
    } catch (err) {
      // Fail closed: an un-serialisable contract is a signal, never a silent skip.
      ghError(`could not serialise contract ${name}: ${err?.message ?? err}`);
      process.exit(2);
    }
    delete js.$schema; // identical on every schema — noise in the committed file.
    out[name] = canonicalize(js);
  }
  // Sort the top-level map so the committed file has a stable schema order.
  const sorted = {};
  for (const name of Object.keys(out).sort()) sorted[name] = out[name];
  return sorted;
}

// ── diff engine ─────────────────────────────────────────────────────────────
// Each entry: { kind: "BREAKING" | "ADDITIVE", msg }.
const changes = [];
const breaking = (msg) => changes.push({ kind: "BREAKING", msg });
const additive = (msg) => changes.push({ kind: "ADDITIVE", msg });

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// A nullable schema is emitted as { anyOf: [ <inner>, { type: "null" } ] } (or a `type`
// array containing "null"). Split it into { inner, nullable } so the null option is compared
// as its own axis (adding null = additive, removing null = breaking) and the inner shape
// diffs normally.
function unwrapNullable(node) {
  if (node && Array.isArray(node.anyOf) && node.anyOf.length === 2) {
    const nullIdx = node.anyOf.findIndex((m) => m && m.type === "null");
    if (nullIdx !== -1) {
      return { inner: node.anyOf[1 - nullIdx], nullable: true };
    }
  }
  if (node && Array.isArray(node.type) && node.type.includes("null")) {
    const rest = node.type.filter((t) => t !== "null");
    return { inner: { ...node, type: rest.length === 1 ? rest[0] : rest }, nullable: true };
  }
  return { inner: node ?? {}, nullable: false };
}

// The single primitive `type` of a node (arrays/`null` already stripped by unwrapNullable).
function baseType(node) {
  const t = node?.type;
  return Array.isArray(t) ? undefined : t; // a still-array type is a shape we don't model → undefined
}

// Compare one numeric/length/count bound. dir: "high" (min-like — raising tightens),
// "low" (max-like — lowering tightens), "exact" (any change tightens).
function cmpBound(oldN, newN, key, dir, path) {
  const o = oldN[key];
  const n = newN[key];
  if (o === n) return;
  if (o === undefined && n !== undefined) {
    breaking(`${path}: \`${key}\` constraint added (${n}) — old clients may now be rejected`);
    return;
  }
  if (o !== undefined && n === undefined) {
    additive(`${path}: \`${key}\` constraint removed (${o})`);
    return;
  }
  if (dir === "high") {
    if (n > o) breaking(`${path}: \`${key}\` raised ${o} → ${n} (narrowed)`);
    else additive(`${path}: \`${key}\` lowered ${o} → ${n} (widened)`);
  } else if (dir === "low") {
    if (n < o) breaking(`${path}: \`${key}\` lowered ${o} → ${n} (narrowed)`);
    else additive(`${path}: \`${key}\` raised ${o} → ${n} (widened)`);
  } else {
    breaking(`${path}: \`${key}\` changed ${o} → ${n}`);
  }
}

function diffObject(oldN, newN, path) {
  const oldProps = oldN.properties ?? {};
  const newProps = newN.properties ?? {};
  const oldReq = new Set(oldN.required ?? []);
  const newReq = new Set(newN.required ?? []);

  for (const k of Object.keys(oldProps)) {
    const at = `${path}.${k}`;
    if (!(k in newProps)) {
      breaking(`${at}: field removed`);
      continue;
    }
    const wasReq = oldReq.has(k);
    const isReq = newReq.has(k);
    if (!wasReq && isReq) breaking(`${at}: optional field became required`);
    if (wasReq && !isReq) additive(`${at}: required field became optional`);
    diffNode(oldProps[k], newProps[k], at);
  }
  for (const k of Object.keys(newProps)) {
    if (k in oldProps) continue;
    const at = `${path}.${k}`;
    if (newReq.has(k)) breaking(`${at}: new required field added`);
    else additive(`${at}: new optional field added`);
  }

  // additionalProperties:false is `.strict()` — extra keys are rejected. Tightening an
  // open object to strict can reject payloads old clients still send; relaxing is safe.
  const oldStrict = oldN.additionalProperties === false;
  const newStrict = newN.additionalProperties === false;
  if (!oldStrict && newStrict) breaking(`${path}: became strict (unknown properties now rejected)`);
  if (oldStrict && !newStrict) additive(`${path}: relaxed (unknown properties now allowed)`);
}

function diffScalar(oldN, newN, path) {
  // enum membership.
  if (oldN.enum || newN.enum) {
    if (oldN.enum && !newN.enum) {
      additive(`${path}: enum constraint removed (any value now accepted)`);
    } else if (!oldN.enum && newN.enum) {
      breaking(`${path}: enum constraint added (values restricted to [${newN.enum.join(", ")}])`);
    } else {
      const o = new Set(oldN.enum);
      const n = new Set(newN.enum);
      for (const v of o) if (!n.has(v)) breaking(`${path}: enum value removed: ${JSON.stringify(v)}`);
      for (const v of n) if (!o.has(v)) additive(`${path}: enum value added: ${JSON.stringify(v)}`);
    }
  }
  // const (z.literal).
  if (oldN.const !== undefined || newN.const !== undefined) {
    if (oldN.const !== newN.const) {
      if (oldN.const === undefined) breaking(`${path}: const added (${JSON.stringify(newN.const)})`);
      else if (newN.const === undefined) additive(`${path}: const removed`);
      else breaking(`${path}: const changed ${JSON.stringify(oldN.const)} → ${JSON.stringify(newN.const)}`);
    }
  }
  // numeric / length / count bounds.
  cmpBound(oldN, newN, "minimum", "high", path);
  cmpBound(oldN, newN, "exclusiveMinimum", "high", path);
  cmpBound(oldN, newN, "minLength", "high", path);
  cmpBound(oldN, newN, "minItems", "high", path);
  cmpBound(oldN, newN, "maximum", "low", path);
  cmpBound(oldN, newN, "exclusiveMaximum", "low", path);
  cmpBound(oldN, newN, "maxLength", "low", path);
  cmpBound(oldN, newN, "maxItems", "low", path);
  // exact-match constraints — any change can reject a previously-valid value.
  cmpBound(oldN, newN, "multipleOf", "exact", path);
  cmpBound(oldN, newN, "pattern", "exact", path);
  cmpBound(oldN, newN, "format", "exact", path);
}

function diffNode(oldRaw, newRaw, path) {
  const o = unwrapNullable(oldRaw);
  const n = unwrapNullable(newRaw);
  if (o.nullable && !n.nullable) breaking(`${path}: no longer accepts null`);
  if (!o.nullable && n.nullable) additive(`${path}: now also accepts null`);

  const oldN = o.inner;
  const newN = n.inner;
  const ot = baseType(oldN);
  const nt = baseType(newN);

  // Shapes we don't structurally model (e.g. a non-nullable anyOf union) — compare verbatim.
  if (ot === undefined || nt === undefined) {
    if (!deepEqual(oldN, newN)) breaking(`${path}: shape changed`);
    return;
  }
  if (ot !== nt) {
    if (ot === "number" && nt === "integer") breaking(`${path}: type narrowed number → integer`);
    else if (ot === "integer" && nt === "number") additive(`${path}: type widened integer → number`);
    else breaking(`${path}: type changed ${ot} → ${nt}`);
    return;
  }
  if (ot === "object") diffObject(oldN, newN, path);
  else if (ot === "array") {
    cmpBound(oldN, newN, "minItems", "high", path);
    cmpBound(oldN, newN, "maxItems", "low", path);
    diffNode(oldN.items ?? {}, newN.items ?? {}, `${path}[]`);
  } else diffScalar(oldN, newN, path);
}

function diffSnapshots(oldSchemas, newSchemas) {
  const names = new Set([...Object.keys(oldSchemas), ...Object.keys(newSchemas)]);
  for (const name of [...names].sort()) {
    const oldS = oldSchemas[name];
    const newS = newSchemas[name];
    if (oldS && !newS) breaking(`${name}: contract removed`);
    else if (!oldS && newS) additive(`${name}: new contract added`);
    else diffNode(oldS, newS, name);
  }
}

// ── modes ─────────────────────────────────────────────────────────────────
function writeMode() {
  const schemas = buildSchemas();
  const doc = {
    $comment:
      "GENERATED by scripts/contract-snapshot.mjs — do NOT edit by hand. Baseline of the shared " +
      "API wire contracts (packages/shared/src/contracts.ts) for the back-compat CI gate (roadmap " +
      "4.2). Regenerate with `pnpm contract:snapshot`. A BREAKING change to this file needs the " +
      "`contract-change` PR label.",
    generator: "zod v4 z.toJSONSchema (io=input, reused=inline)",
    schemaCount: Object.keys(schemas).length,
    schemas,
  };
  writeFileSync(snapshotPath, JSON.stringify(doc, null, 2) + "\n");
  console.log(`Wrote ${snapshotPath} (${doc.schemaCount} contracts).`);
}

function checkMode() {
  if (!existsSync(snapshotPath)) {
    ghError(`${snapshotPath} not found — generate it first: pnpm contract:snapshot`);
    process.exit(2);
  }
  let committed;
  try {
    committed = JSON.parse(readFileSync(snapshotPath, "utf8"));
  } catch (err) {
    ghError(`${snapshotPath} is not valid JSON: ${err?.message ?? err}`);
    process.exit(2);
  }
  const oldSchemas = committed.schemas ?? {};
  const newSchemas = buildSchemas();

  diffSnapshots(oldSchemas, newSchemas);

  const breaks = changes.filter((c) => c.kind === "BREAKING");
  const adds = changes.filter((c) => c.kind === "ADDITIVE");

  for (const c of adds) console.log(`  additive: ${c.msg}`);

  if (breaks.length === 0) {
    if (adds.length === 0) {
      console.log(`✓ contracts match the committed snapshot (${Object.keys(newSchemas).length} contracts).`);
    } else {
      console.log(
        `✓ only additive (backwards-compatible) contract changes — OK. ` +
          `Run \`pnpm contract:snapshot\` to refresh the committed baseline.`,
      );
    }
    process.exit(0);
  }

  console.error("");
  console.error("Backwards-INCOMPATIBLE contract changes vs the committed snapshot:");
  for (const c of breaks) console.error(`  ✗ ${c.msg}`);
  console.error("");

  if (bypass) {
    ghWarn(
      `${breaks.length} breaking contract change(s) detected but BYPASSED via the ` +
        `\`contract-change\` label (CONTRACT_CHANGE_OK=1). Deployed old clients may break — ` +
        `confirm this is intended and run \`pnpm contract:snapshot\` to re-baseline.`,
    );
    process.exit(0);
  }

  ghError(
    `${breaks.length} backwards-incompatible contract change(s). Old installed mobile/web clients ` +
      `keep calling the API for weeks after deploy, so this must be deliberate. If intended: add ` +
      `the \`contract-change\` label to the PR AND run \`pnpm contract:snapshot\` to re-baseline. ` +
      `If not: keep the change additive (new field OPTIONAL, widen — never remove/retype/narrow).`,
  );
  process.exit(1);
}

// ── entry ─────────────────────────────────────────────────────────────────
const mode = process.argv[2];
if (mode === "--write") writeMode();
else if (mode === "--check") checkMode();
else {
  console.error("usage: node scripts/contract-snapshot.mjs (--write | --check)");
  process.exit(2);
}
