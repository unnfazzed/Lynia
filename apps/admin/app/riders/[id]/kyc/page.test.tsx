// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import KycReviewPage from "./page";
import { adminFetchResult } from "../../../lib/api";
import type { KycReview } from "../../../lib/adminTypes";

vi.mock("../../../lib/api", () => ({ adminFetchResult: vi.fn() }));
vi.mock("../../actions", () => ({ decideKyc: vi.fn() }));
vi.mock("../../../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** A pending review of a rider with no national ID on file, whose ID check verified 63123456A42 (D-75). */
function review(over: Partial<KycReview> = {}): KycReview {
  return {
    id: "r-1",
    name: "Tendai Moyo",
    phone: "+263•••••0001",
    idNumber: null,
    photoUrl: null,
    bike: "ABZ 1234",
    status: "pending",
    kycRef: "sess_1",
    kycAttempts: 0,
    attempt: 1,
    locked: false,
    declineReason: null,
    submittedAt: "2026-10-03T10:00:00.000Z",
    duplicateIdFlag: false,
    duplicateIdAccounts: [],
    verifiedIdMismatch: null,
    idOnFile: false,
    verifiedIdNumber: "63123456A42",
    verifiedIdInUse: false,
    ...over,
  };
}

async function open(r: KycReview) {
  vi.mocked(adminFetchResult).mockResolvedValue({ data: r });
  render(await KycReviewPage({ params: Promise.resolve({ id: r.id }) }));
}

/** The "No national ID on file" notice's full text, or null when the page doesn't show it. */
const notice = () => screen.queryByText("No national ID on file.")?.closest(".warnbar")?.textContent ?? null;

describe("KYC review: no national ID on file (D-75)", () => {
  it("says approving makes the number the ID check verified the account's national ID", async () => {
    await open(review());
    expect(notice()).toContain("Approving makes the number the ID check verified, 63123456A42, this account's national ID.");
  });

  it("says approving will be refused when that number is already on another live account", async () => {
    await open(review({ verifiedIdInUse: true }));
    expect(notice()).toContain("The ID check verified 63123456A42, but it's already on another live account, so approving will be refused.");
    expect(notice()).not.toContain("Approving makes");
  });

  it("with no ID-check number to adopt (manual review), says approving leaves the rider without one and is flagged", async () => {
    await open(review({ verifiedIdNumber: null }));
    expect(notice()).toContain("approving verifies this rider without a national ID");
    expect(notice()).toContain("flagged in the audit log for follow-up");
  });

  it("shows no notice when the account has a national ID on file", async () => {
    await open(review({ idOnFile: true, idNumber: "63123456A42" }));
    expect(notice()).toBeNull();
  });

  it("shows no notice from an older API that doesn't report it", async () => {
    await open(review({ idOnFile: undefined, verifiedIdNumber: undefined, verifiedIdInUse: undefined }));
    expect(notice()).toBeNull();
  });

  it("shows no notice once the review is decided (nothing left to approve)", async () => {
    await open(review({ status: "verified" }));
    expect(notice()).toBeNull();
  });

  it("the duplicate-ID warning names the ID-check number when none is on file", async () => {
    await open(
      review({
        verifiedIdInUse: true,
        duplicateIdAccounts: [
          { id: "p-2", name: "Other Rider", phone: "+263•••••0999", role: "rider", kycStatus: "verified", accountStatus: "active" },
        ],
      }),
    );
    const duplicate = screen.getByText("Duplicate ID — needs review.").closest(".warnbar")?.textContent ?? "";
    expect(duplicate).toContain("This national ID (63123456A42) is also on 1 other account");
  });
});
