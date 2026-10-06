/** First Run v2 D5/D6 (ledger D-82): the national ID's format, normalisation and masking. */
import { NATIONAL_ID_RE, formatNationalId, maskNationalIdDashed, nationalIdValid } from "../national-id";

describe("national ID", () => {
  it("normalises spaces, dashes and case into the dashed form", () => {
    expect(formatNationalId("63 123456 a 78")).toBe("63-123456A78");
    expect(formatNationalId("63123456A78")).toBe("63-123456A78");
    expect(formatNationalId("63-1234567-b-01")).toBe("63-1234567B01");
  });

  it("validates against the handoff's regex once normalised; empty is fine (optional)", () => {
    expect(NATIONAL_ID_RE.source).toBe("^\\d{2}-\\d{6,7}[A-Z]\\d{2}$");
    for (const ok of ["", "63-123456A78", "63 1234567 b 01"]) expect(nationalIdValid(ok)).toBe(true);
    for (const bad of ["63 4829", "AB-123456A78", "63-12345A78", "63-12345678A78", "63-123456AA8"]) expect(nationalIdValid(bad)).toBe(false);
  });

  it("D6 masks all but the last three, keeping the dash", () => {
    expect(maskNationalIdDashed("63482913K07")).toBe("••-••••••K07");
    expect(maskNationalIdDashed("63-4829137K07")).toBe("••-•••••••K07");
  });
});
