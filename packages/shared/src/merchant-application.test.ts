import { describe, expect, it } from "vitest";
import {
  MERCHANT_APPLICATION_STATUSES,
  MERCHANT_APPLICATION_STATUS_LABELS,
  MERCHANT_REJECT_REASONS,
  MERCHANT_REJECT_REASON_LABELS,
  merchantApplicationSla,
} from "./merchant-application";

describe("merchant application (admin console v2 §5)", () => {
  it("every status and reject reason has a label", () => {
    for (const s of MERCHANT_APPLICATION_STATUSES) expect(MERCHANT_APPLICATION_STATUS_LABELS[s]).toBeTruthy();
    for (const r of MERCHANT_REJECT_REASONS) expect(MERCHANT_REJECT_REASON_LABELS[r]).toBeTruthy();
  });

  it("the SLA turns amber at 24h and red at 48h", () => {
    const h = 60 * 60 * 1000;
    expect(merchantApplicationSla(23 * h)).toBe("ok");
    expect(merchantApplicationSla(24 * h)).toBe("amber");
    expect(merchantApplicationSla(47.9 * h)).toBe("amber");
    expect(merchantApplicationSla(48 * h)).toBe("red");
  });
});
