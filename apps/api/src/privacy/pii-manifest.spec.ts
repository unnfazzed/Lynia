import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NON_PII_COLUMNS, PII_MANIFEST } from "./pii-manifest";

/**
 * The PII erasure manifest is only a guard if it's ENFORCED. These tests are the enforcement:
 *
 *  1. schema → manifest: every column in schema.prisma whose NAME matches a personal-data pattern must be
 *     covered by the manifest (or explicitly listed as non-PII). A new `*_phone`/`*_lat`/`geog`/… column
 *     added to the schema fails this test until someone records how erasure handles it — that is the
 *     write-time guard that ends the "erase missed a sibling field" bug class (DS-01/DS15-03/07, geog).
 *
 *  2. manifest → eraseAccount: every scrub/tombstone/raw-sql/delete entry must be referenced by
 *     privacy.service.ts, so removing a scrub from eraseAccount without updating the manifest also fails.
 */

const schemaPath = join(__dirname, "..", "..", "prisma", "schema.prisma");
const privacyPath = join(__dirname, "privacy.service.ts");
const schema = readFileSync(schemaPath, "utf8");
const privacySource = readFileSync(privacyPath, "utf8");

// Column-name patterns that denote personal data. Deliberately leaf-level (not "address" the model) so
// the scan is precise. A match that is genuinely NOT PII must be recorded in NON_PII_COLUMNS with a reason.
const PII_NAME_PATTERNS: RegExp[] = [
  /(^|_)phone$/,
  /(^|_)email$/,
  /(^|_)lat$/,
  /(^|_)lng$/,
  /geog/,
  /id_number/,
  // DS18-01: any media column — a photo/proof/image reference (whether it ends in `_url` OR `_key`) is
  // user/rider-captured content that erasure must purge. Broadened from the old `photo_url`-only pattern so
  // a `*_photo_key`/`*_proof_key` object-key column can't dodge the coverage scan the way pickup_photo_key did.
  /(photo|proof|image)/,
  /(^|_)note$/,
  /(^|_)comment$/,
  /(^|_)description$/,
  /position_updated_at/,
  /(first|last)_name/,
  /(^|_)bike_reg$/,
  /vehicle_info/,
  /suspend_reason/,
  /kyc_ref/,
  /kyc_decline_reason/,
  /current_(lat|lng)/,
];

/**
 * Every DB column in the schema as a TABLE-QUALIFIED `table.column` pair. Table-qualified (DS18-02) so a
 * same-named column in two tables (e.g. `note` in orders/reports/audit_logs/commission_ledger) is tracked
 * distinctly — a bare-name scan let one manifest entry falsely "cover" a real-PII sibling in another table.
 * The DB column is `@map("snake")` where present, else the (camelCase) field name; the table is the model's
 * `@@map(...)` (or the model name when unmapped).
 */
function schemaColumns(src: string): Set<string> {
  const pairs = new Set<string>();
  // Non-greedy to the first line-start `}` — Prisma model bodies have no nested braces.
  for (const block of src.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const modelName = block[1]!;
    const body = block[2]!;
    const mapped = /@@map\("([a-z0-9_]+)"\)/.exec(body);
    const table = mapped ? mapped[1]! : modelName;
    for (const line of body.split("\n")) {
      if (line.trim().startsWith("@@")) continue; // block-level attribute (@@map/@@index/…), not a column
      // @map("...") explicit DB name for this field.
      const col = /@map\("([a-z0-9_]+)"\)/.exec(line);
      if (col) {
        pairs.add(`${table}.${col[1]}`);
        continue;
      }
      // Bare scalar field with no @map (Prisma uses the field name as the column) — e.g. `geog`, `lat`.
      const bare = /^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s+[A-Za-z]/.exec(line);
      if (bare && !line.includes("@relation")) pairs.add(`${table}.${bare[1]}`);
    }
  }
  return pairs;
}

/** `table.column` pairs the manifest covers: each entry's `column` under every table in its `tables`. */
function manifestPairs(): Set<string> {
  const s = new Set<string>();
  for (const entry of Object.values(PII_MANIFEST)) {
    for (const t of entry.tables) s.add(`${t}.${entry.column}`);
  }
  return s;
}

describe("PII erasure manifest — schema coverage (Class-C write-time guard)", () => {
  it("covers every PII-named column in schema.prisma (new personal-data columns fail until handled)", () => {
    const columns = [...schemaColumns(schema)];
    // Match the PII patterns against the bare column part (not the `table.` prefix).
    const piiColumns = columns.filter((tc) => {
      const col = tc.slice(tc.indexOf(".") + 1);
      return PII_NAME_PATTERNS.some((p) => p.test(col));
    });
    const covered = manifestPairs();
    const uncovered = piiColumns.filter((tc) => !covered.has(tc) && !(tc in NON_PII_COLUMNS));
    // If this fails: a PII-looking column exists in the schema that erasure hasn't been told about. Add it
    // to PII_MANIFEST with the right disposition (and wire the scrub in eraseAccount), or — if it genuinely
    // isn't personal data — add it to NON_PII_COLUMNS with a reason.
    expect(uncovered).toEqual([]);
    // Sanity: the scan actually found the known PII columns (guards against the regex silently matching none).
    expect(piiColumns).toContain("riders.geog");
    expect(piiColumns).toContain("profiles.phone");
    // DS18-02 regression: reports.note (user-authored) must be scanned as its OWN pair — the old bare-name
    // scan collapsed every `note` into one, letting orders.note falsely cover it.
    expect(piiColumns).toContain("reports.note");
    // DS18-01 regression: the object-KEY media column is now caught (the `_url`-only pattern missed it).
    expect(piiColumns).toContain("orders.pickup_photo_key");
  });
});

describe("PII erasure manifest — eraseAccount references every scrub (reverse guard)", () => {
  // Store/object entries and their expected token in privacy.service.ts.
  const specialTokens: Record<string, string> = {
    address_store: "address.deleteMany",
    device_token_store: "deviceToken.deleteMany",
    session_store: "session.deleteMany",
    "kyc-object": "deleteObject",
  };

  function toCamel(snake: string): string {
    return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  }

  for (const [key, entry] of Object.entries(PII_MANIFEST)) {
    if (entry.disposition === "keep") continue; // retained on purpose — nothing to reference.
    it(`eraseAccount references the "${key}" scrub`, () => {
      const special = specialTokens[key];
      if (special) {
        expect(privacySource).toContain(special);
        return;
      }
      // A scrubbed column is referenced by its Prisma field (camelCase) or raw-SQL (snake) name.
      const camel = toCamel(entry.column);
      const referenced = privacySource.includes(entry.column) || privacySource.includes(camel);
      expect(referenced, `privacy.service.ts should reference column "${entry.column}" (or ${camel})`).toBe(true);
    });
  }

  it("geog is scrubbed via raw SQL specifically (Prisma updateMany can't touch an Unsupported column)", () => {
    // The exact fix anchor: a raw UPDATE nulling geog inside the erase transaction.
    expect(privacySource).toMatch(/UPDATE riders SET geog = NULL/i);
    expect(PII_MANIFEST.geog!.disposition).toBe("raw-sql-null");
  });
});
