import { describe, expect, it } from "vitest";
import { MarkUndeliveredRequest } from "./contracts";

describe("MarkUndeliveredRequest (UNDELIVERED-NOTE-01)", () => {
  it("carries only the reason — no free-text note the API would silently throw away", () => {
    expect(Object.keys(MarkUndeliveredRequest.shape)).toEqual(["reason"]);
  });

  it("strips a note a stale client still sends, instead of 400ing the rider out of a terminal hand-off", () => {
    expect(MarkUndeliveredRequest.parse({ reason: "refused", note: "left it at the gate" })).toEqual({ reason: "refused" });
  });

  it("still requires one of the four reasons", () => {
    expect(MarkUndeliveredRequest.safeParse({}).success).toBe(false);
    expect(MarkUndeliveredRequest.safeParse({ reason: "lost" }).success).toBe(false);
  });
});
