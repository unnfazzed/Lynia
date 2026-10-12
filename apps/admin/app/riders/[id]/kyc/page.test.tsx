// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

/** The text of the warnbar whose bold title is `title`, or null. */
const warnbar = (title: string) => screen.queryByText(title)?.closest(".warnbar")?.textContent ?? null;

describe("KYC review: where the rider is in the Didit check", () => {
  it("a held check reads as finished, with no unfinished warning", async () => {
    await open(review({ kycHeld: true, kycVendorStatus: "In Review" }));
    expect(screen.getByText(/Finished at Didit — held for a manual review \(Didit: In Review\)\./)).toBeTruthy();
    expect(warnbar("ID check not finished.")).toBeNull();
  });

  it.each(["Not Started", "In Progress", "Abandoned", "Expired", null])(
    "vendor status %s (not held) warns that the check isn't finished",
    async (vendor) => {
      await open(review({ kycHeld: false, kycVendorStatus: vendor }));
      expect(warnbar("ID check not finished.")).toContain("Approving needs a note");
    },
  );

  it("an older API that reports neither field makes no claim", async () => {
    await open(review());
    expect(warnbar("ID check not finished.")).toBeNull();
    expect(screen.queryByText("ID check:")).toBeNull();
  });

  it("approving an unfinished check requires a note in the confirm modal", async () => {
    await open(review({ kycHeld: false, kycVendorStatus: "Abandoned" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve rider" }));
    expect(screen.getByText(/This rider hasn.t finished the Didit ID check\./)).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Approve without the ID check" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: "Checked the ID in person" } });
    expect(confirm.disabled).toBe(false);
  });

  it("approving a finished check needs no note", async () => {
    await open(review({ kycHeld: true, kycVendorStatus: "In Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve rider" }));
    const buttons = screen.getAllByRole("button", { name: "Approve rider" }) as HTMLButtonElement[];
    expect(buttons.at(-1)?.disabled).toBe(false);
  });
});

describe("KYC review: evidence and verdict", () => {
  it("links to the rider's Didit session", async () => {
    await open(review({ kycRef: "sess_1" }));
    const links = screen.getAllByRole("link", { name: "Open in Didit ↗" });
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l.getAttribute("href")).toBe("https://business.didit.me/sessions/sess_1");
  });

  it("says when there's no Didit session to open", async () => {
    await open(review({ kycRef: null }));
    expect(screen.queryByRole("link", { name: "Open in Didit ↗" })).toBeNull();
    expect(screen.getByText(/\(no Didit session on record\)/)).toBeTruthy();
  });

  it("shows one overall verdict, not three per-check rows", async () => {
    await open(review());
    expect(screen.getByText("Overall verdict")).toBeTruthy();
    expect(screen.queryByText("Liveness")).toBeNull();
    expect(screen.queryByText("Document authenticity")).toBeNull();
  });
});

describe("KYC review: decided states", () => {
  it("an expired check reads as expired, not declined", async () => {
    await open(review({ status: "expired" }));
    expect(screen.getByText("Expired.")).toBeTruthy();
    expect(screen.getByText("The rider must re-verify before they can go online.")).toBeTruthy();
    expect(screen.queryByText("Declined.")).toBeNull();
    expect(screen.queryByText(/resubmit once/)).toBeNull();
  });

  it("a decline reason shows as its label, and an unknown key as itself", async () => {
    await open(review({ status: "failed", declineReason: "face_mismatch" }));
    expect(screen.getAllByText("Selfie doesn't match the ID").length).toBeGreaterThan(0);
    expect(screen.queryByText("face_mismatch")).toBeNull();
    cleanup();
    await open(review({ status: "failed", declineReason: "id_expired" }));
    expect(screen.getAllByText("ID document expired").length).toBeGreaterThan(0);
    cleanup();
    await open(review({ status: "failed", declineReason: "some_new_key" }));
    expect(screen.getAllByText("some_new_key").length).toBeGreaterThan(0);
  });

  it("the resubmission warning names the previous decline by its label", async () => {
    await open(review({ attempt: 2, kycAttempts: 1, declineReason: "liveness_failed" }));
    expect(warnbar("Resubmission — attempt 2.")).toContain("Previously declined: Liveness check failed.");
  });
});

describe("KYC review: ID-check mismatch", () => {
  it("compares the ID on file with the number the ID check read, never a typed ID", async () => {
    await open(review({ verifiedIdMismatch: true, idOnFile: true, idNumber: "11111111A11" }));
    const text = warnbar("ID check doesn't match the ID on file.") ?? "";
    expect(text).toContain("The ID check read 63123456A42");
    expect(text).toContain("on file for this account is 11111111A11");
    expect(text).not.toMatch(/typed/);
  });
});

