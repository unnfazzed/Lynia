import { normalizeNationalId } from "@lynia/shared";

/**
 * First Run v2 Personal details (D2–D6, ledger D-80): the Zimbabwe national ID as the handoff validates
 * and shows it. The format is `63-123456A78` — two digits, a dash, six or seven digits, a check letter,
 * two digits (README D5: `^\d{2}-\d{6,7}[A-Z]\d{2}$`, after normalising spaces and case).
 *
 * The server stores the canonical form without punctuation (`normalizeNationalId`, @lynia/shared), so
 * what is SENT is that; what is SHOWN is the dashed form.
 */
export const NATIONAL_ID_RE = /^\d{2}-\d{6,7}[A-Z]\d{2}$/;

/**
 * Normalise what was typed: drop spaces and dashes, upper-case, and put the one dash back after the two
 * district digits when the rest has the right shape ("63 123456 a 78" → "63-123456A78"). Anything that
 * doesn't fit is returned compacted, so validation fails on it.
 */
export function formatNationalId(raw: string): string {
  const compact = normalizeNationalId(raw);
  const m = /^(\d{2})(\d{6,7}[A-Z]\d{2})$/.exec(compact);
  return m ? `${m[1]}-${m[2]}` : compact;
}

/** Empty is valid (the ID is optional); otherwise it must match the format once normalised. */
export function nationalIdValid(raw: string): boolean {
  const v = formatNationalId(raw);
  return v === "" || NATIONAL_ID_RE.test(v);
}

/**
 * D6: a verified ID shown read-only — every letter and digit but the last three masked, the dash kept
 * ("63-482913K07" → "••-••••••K07").
 */
export function maskNationalIdDashed(raw: string | null | undefined): string {
  const v = formatNationalId(raw ?? "");
  const keep = 3;
  let seen = 0;
  const total = v.replace(/-/g, "").length;
  return v
    .split("")
    .map((ch) => {
      if (ch === "-") return ch;
      seen += 1;
      return seen > total - keep ? ch : "•";
    })
    .join("");
}
