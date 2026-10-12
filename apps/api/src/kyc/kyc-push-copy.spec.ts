import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bikerWording } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { KYC_PUSH_COPY } from "./kyc-push-copy";

const HANDOFF = resolve(__dirname, "../../../../packages/design/handoff");

describe("KYC push copy (First Run v2 KY, verbatim)", () => {
  const copy = readFileSync(resolve(HANDOFF, "first-run-v2/copy.ts"), "utf8");
  /** The handoff string under `key`, read out of the copy file. */
  const ky = (key: string): string => {
    const m = copy.match(new RegExp(`\\b${key}:'([^']*)'`));
    if (!m) throw new Error(`KY.${key} not in the handoff`);
    return m[1]!;
  };

  it("locked is KY.lockedA + lockedB / lockedBody", () => {
    expect(KYC_PUSH_COPY.locked).toEqual({
      title: bikerWording(`${ky("lockedA")} ${ky("lockedB")}`),
      body: bikerWording(ky("lockedBody")),
    });
  });

  it("expired is KY.expA + expB / the second sentence of expBody", () => {
    expect(KYC_PUSH_COPY.expired.title).toBe(bikerWording(`${ky("expA")} ${ky("expB")}`));
    expect(ky("expBody").endsWith(KYC_PUSH_COPY.expired.body)).toBe(true);
    expect(KYC_PUSH_COPY.expired.body).toBe("Re-verify to keep riding.");
  });

  it("reset is KY.unfA / unfBody", () => {
    expect(KYC_PUSH_COPY.reset).toEqual({ title: bikerWording(ky("unfA")), body: bikerWording(ky("unfBody")) });
  });
});
