import { ISSUE_TYPE_LABELS, REPORT_REASON_LABELS } from "@lynia/shared";
import {
  ISSUE_TYPE_OPTIONS,
  REPORT_REASON_OPTIONS,
  canSubmitIssue,
  canSubmitReport,
  telUri,
} from "../safety";

describe("issue/report option lists", () => {
  it("covers every shared issue-type label, value → label", () => {
    expect(ISSUE_TYPE_OPTIONS).toHaveLength(Object.keys(ISSUE_TYPE_LABELS).length);
    for (const o of ISSUE_TYPE_OPTIONS) {
      expect(ISSUE_TYPE_LABELS[o.value]).toBe(o.label);
    }
  });

  it("covers every shared report reason", () => {
    expect(REPORT_REASON_OPTIONS).toHaveLength(Object.keys(REPORT_REASON_LABELS).length);
    for (const o of REPORT_REASON_OPTIONS) {
      expect(REPORT_REASON_LABELS[o.value]).toBe(o.label);
    }
  });
});

describe("canSubmitIssue", () => {
  it("needs a type and a non-empty description", () => {
    expect(canSubmitIssue(null, "the parcel was damaged")).toBe(false);
    expect(canSubmitIssue("damaged", "")).toBe(false);
    expect(canSubmitIssue("damaged", "   ")).toBe(false);
    expect(canSubmitIssue("damaged", "the parcel was damaged")).toBe(true);
  });
});

describe("canSubmitReport", () => {
  it("needs a reason; the note is optional but bounded", () => {
    expect(canSubmitReport(null, "")).toBe(false);
    expect(canSubmitReport("rude", "")).toBe(true);
    expect(canSubmitReport("rude", "they were hostile")).toBe(true);
    expect(canSubmitReport("rude", "x".repeat(501))).toBe(false);
  });
});

describe("telUri", () => {
  it("strips formatting to a dial-safe tel: URI, keeping a leading +", () => {
    expect(telUri("999")).toBe("tel:999");
    expect(telUri("+263 (0)242 123 456")).toBe("tel:+2630242123456");
    expect(telUri("0242-123-456")).toBe("tel:0242123456");
  });

  it("returns null for empty or non-numeric input", () => {
    expect(telUri(null)).toBeNull();
    expect(telUri(undefined)).toBeNull();
    expect(telUri("")).toBeNull();
    expect(telUri("n/a")).toBeNull();
  });
});
