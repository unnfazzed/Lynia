import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * GUARDRAIL for load-balancer request-log sampling across every backend service in
 * `infra/terraform/**` (lb.tf, admin.tf, merchant.tf, staging.tf).
 *
 * Why this is worth a spec, and why it lives in CI rather than in a comment:
 *
 * `sample_rate` looks like a pure cost dial, so it is exactly the kind of value a cost-reduction pass
 * turns down without reading `armor.tf`. It is not only a cost dial. Cloud Armor's OWASP rulesets run
 * in PREVIEW while `armor_waf_preview` is true (its whole purpose, per that variable's own
 * description: "observe false positives against real traffic first"). A rule in preview blocks
 * nothing — it writes a would-have-matched entry into the LOAD BALANCER request log and nowhere else.
 * So while the WAF is in preview, sample_rate IS the WAF's evidence rate:
 *
 *     armor_waf_preview = true          armor_waf_preview = false
 *     ─────────────────────────         ─────────────────────────
 *     WAF logs, never blocks            WAF returns 403
 *     evidence lives ONLY in            evidence is the 403 itself
 *     the LB request log                 + the app's own telemetry
 *     ⇒ sample_rate MUST be 1.0         ⇒ sample_rate is free to drop
 *
 * At 0.1 with preview on you would tune the rulesets against a tenth of the false positives and then
 * enforce on the other nine tenths blind — the failure lands on real users as 403s, months after the
 * commit that caused it, with nothing in the diff to point at. That is a silent, delayed, hard-to-
 * attribute failure, which is precisely the class worth spending a test on.
 *
 * The three assertions below are the invariant, the DRY rule that keeps it enforceable, and the
 * escape hatch that would otherwise defeat it.
 *
 * Same idiom as `maps-tfvars.spec.ts` (Terraform config guarded from the Vitest suite) and
 * `design-tokens.drift.spec.ts` (regex-parsed source of truth, repo-root-relative reads).
 */
const REPO_ROOT = resolve(__dirname, "../../../..");
const TF_DIR = resolve(REPO_ROOT, "infra/terraform");

const tfFiles = (): string[] =>
  readdirSync(TF_DIR)
    .filter((f) => f.endsWith(".tf"))
    .sort();

const read = (file: string) => readFileSync(resolve(TF_DIR, file), "utf8");

/**
 * Extract a `variable "<name>" { ... }` block's `default` value as raw source text.
 *
 * Brace-counting rather than a single regex: variable blocks contain nested `validation { ... }`
 * blocks, so a lazy `\{([\s\S]*?)\}` stops at the wrong brace and silently reads the wrong default.
 * Returns null when the variable or its default is absent — callers assert on that explicitly rather
 * than treating "missing" as "fine".
 */
function variableDefault(source: string, name: string): string | null {
  const open = source.search(new RegExp(`variable\\s+"${name}"\\s*\\{`));
  if (open === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = source.indexOf("{", open); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end === -1) return null;

  const body = source.slice(open, end);
  // Only a top-level `default =`; a `default` inside a nested block would be a different key.
  const m = /\n\s{2}default\s*=\s*(.+)/.exec(body);
  return m ? m[1]!.trim() : null;
}

/** Every `sample_rate = <value>` assignment in the module, tagged with the file it came from. */
function sampleRateAssignments(): { file: string; value: string }[] {
  const out: { file: string; value: string }[] = [];
  for (const file of tfFiles()) {
    const re = /sample_rate\s*=\s*(.+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(read(file)))) out.push({ file, value: m[1]!.trim() });
  }
  return out;
}

/** Every `log_config { ... }` block in the module, tagged with its file. */
function logConfigBlocks(): { file: string; body: string }[] {
  const out: { file: string; body: string }[] = [];
  for (const file of tfFiles()) {
    const re = /log_config\s*\{([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(read(file)))) out.push({ file, body: m[1]! });
  }
  return out;
}

describe("LB request-log sampling", () => {
  const variables = read("variables.tf");

  it("declares lb_log_sample_rate with a validation block", () => {
    const def = variableDefault(variables, "lb_log_sample_rate");
    expect(def, "variables.tf must declare a lb_log_sample_rate variable").not.toBeNull();
    expect(
      /variable\s+"lb_log_sample_rate"[\s\S]*?validation\s*\{/.test(variables),
      "lb_log_sample_rate needs a validation block — a 0.0 rate keeps logging ENABLED while recording nothing, which reads as 'logs are on' in the console and produces no data",
    ).toBe(true);
  });

  it("keeps the sample rate at 1.0 while the Cloud Armor WAF is in preview", () => {
    const wafPreview = variableDefault(variables, "armor_waf_preview");
    const sampleRate = variableDefault(variables, "lb_log_sample_rate");
    expect(wafPreview, "armor_waf_preview must exist — it gates this invariant").not.toBeNull();

    if (wafPreview === "true") {
      expect(
        Number(sampleRate),
        "armor_waf_preview is true, so the OWASP rulesets only LOG their matches into the LB request log. Sampling below 1.0 tunes the WAF on a fraction of its false positives and enforces blind on the rest. Flip armor_waf_preview to false first, then lower lb_log_sample_rate.",
      ).toBe(1);
    }
  });

  it("routes every backend's sample_rate through the variable, never a literal", () => {
    const literals = sampleRateAssignments().filter((a) => a.value !== "var.lb_log_sample_rate");
    expect(
      literals,
      `sample_rate must be var.lb_log_sample_rate everywhere so the WAF-preview invariant above is enforceable. Hardcoded in: ${literals
        .map((l) => `${l.file} (= ${l.value})`)
        .join(", ")}`,
    ).toEqual([]);
  });

  it("covers every log_config block in the module", () => {
    // Catches a NEW backend service (a fifth tier) that copy-pastes `sample_rate = 1.0`, or one that
    // omits sample_rate entirely and silently inherits the API default rather than the variable.
    const uncovered = logConfigBlocks().filter((b) => !b.body.includes("var.lb_log_sample_rate"));
    expect(
      uncovered.map((b) => b.file),
      "every log_config block must set sample_rate = var.lb_log_sample_rate",
    ).toEqual([]);

    // Guards the guard: if the regexes above ever stop matching, the three assertions pass vacuously.
    expect(logConfigBlocks().length).toBeGreaterThanOrEqual(4);
  });
});
