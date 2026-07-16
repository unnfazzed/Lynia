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
  /(^|_)photo_url$/,
  /(^|_)note$/,
  /position_updated_at/,
  /(first|last)_name/,
  /(^|_)bike_reg$/,
  /vehicle_info/,
  /suspend_reason/,
  /kyc_ref/,
  /kyc_decline_reason/,
  /current_(lat|lng)/,
];

/** Every DB column name in the schema: `@map("snake")` where present, else the (camelCase) field name. */
function schemaColumnNames(src: string): Set<string> {
  const cols = new Set<string>();
  // @map("...") explicit DB names.
  for (const m of src.matchAll(/@map\("([a-z0-9_]+)"\)/g)) cols.add(m[1]!);
  // Bare scalar field lines with no @map (Prisma uses the field name as the column) — e.g. `geog`, `lat`.
  // Match `  fieldName  Type` inside model blocks; skip relation/attribute/block lines.
  for (const line of src.split("\n")) {
    const m = /^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s+[A-Za-z]/.exec(line);
    if (m && !line.includes("@map(") && !line.includes("@relation")) cols.add(m[1]!);
  }
  return cols;
}

/** Column names the manifest covers: each entry's key AND its `.column` value. */
function manifestColumns(): Set<string> {
  const s = new Set<string>();
  for (const [key, entry] of Object.entries(PII_MANIFEST)) {
    s.add(key);
    s.add(entry.column);
  }
  return s;
}

describe("PII erasure manifest — schema coverage (Class-C write-time guard)", () => {
  it("covers every PII-named column in schema.prisma (new personal-data columns fail until handled)", () => {
    const columns = [...schemaColumnNames(schema)];
    const piiColumns = columns.filter((c) => PII_NAME_PATTERNS.some((p) => p.test(c)));
    const covered = manifestColumns();
    const uncovered = piiColumns.filter((c) => !covered.has(c) && !(c in NON_PII_COLUMNS));
    // If this fails: a PII-looking column exists in the schema that erasure hasn't been told about. Add it
    // to PII_MANIFEST with the right disposition (and wire the scrub in eraseAccount), or — if it genuinely
    // isn't personal data — add it to NON_PII_COLUMNS with a reason.
    expect(uncovered).toEqual([]);
    // Sanity: the scan actually found the known PII columns (guards against the regex silently matching none).
    expect(piiColumns).toContain("geog");
    expect(piiColumns).toContain("phone");
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
