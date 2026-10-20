// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adjustFleet, markFleetBillPaid, setFleetFee, switchFleet } from "./actions";
import { BORROWDALE, CHICKEN, DETAIL, RIDE, ROWS } from "./fixtures.test-data";
import { FleetPanel } from "./FleetPanel";

/** OB-A2 side panel and OB-A3 confirms: what each control sends, and that a refusal is shown in the API's words. */
vi.mock("./actions", () => ({ setFleetFee: vi.fn(), switchFleet: vi.fn(), markFleetBillPaid: vi.fn(), adjustFleet: vi.fn() }));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ROW = ROWS[1]!;
const panel = (detail = DETAIL, connected = true) =>
  render(<FleetPanel row={ROW} detail={detail} brand="Chicken Inn" branches={["Avondale", "Borrowdale"]} closeHref="/own-bikers" connected={connected} />);

describe("OB-A2 · the side panel", () => {
  it("the business, its status, one line, the fee, Pause and Disable, and the weekly bills", () => {
    panel();
    expect(screen.getByRole("heading", { name: "Chicken Inn" })).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    expect(screen.getByLabelText("Fee per ride")).toHaveProperty("value", "$1.50");
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disable" }).className).toContain("danger-wash");
    expect(screen.getByText("Weekly bills")).toBeTruthy();
    const rows = screen
      .getAllByRole("row")
      .slice(1)
      .map((r) =>
        within(r)
          .getAllByRole("cell")
          .map((c) => c.textContent),
      );
    expect(rows).toEqual([
      ["28 Sep–4 Oct", "23", "$34.50", "Due Fri 9 Oct", "Mark paidAdjust"],
      ["21–27 Sep", "24", "$36.00", "2 days overdue", "Mark paidAdjust"],
      ["14–20 Sep", "22", "$33.00", "Paid", ""],
    ]);
  });

  it("Save sends the new fee, saying what changed", async () => {
    vi.mocked(setFleetFee).mockResolvedValue({ ok: true });
    panel();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveProperty("disabled", true); // unchanged
    fireEvent.change(screen.getByLabelText("Fee per ride"), { target: { value: "$1.75" } });
    fireEvent.click(save);
    await vi.waitFor(() => expect(setFleetFee).toHaveBeenCalledWith(CHICKEN, 1.75, "1.50"));
    // Whole cents that floating point can't hold exactly still count.
    fireEvent.change(screen.getByLabelText("Fee per ride"), { target: { value: "1.15" } });
    expect(save).toHaveProperty("disabled", false);
    fireEvent.change(screen.getByLabelText("Fee per ride"), { target: { value: "1.155" } });
    expect(save).toHaveProperty("disabled", true);
  });

  it("Mark paid marks that bill; a refusal shows in the API's words", async () => {
    vi.mocked(markFleetBillPaid).mockResolvedValue({ ok: false, message: "This bill is already marked paid." });
    panel();
    fireEvent.click(screen.getAllByRole("button", { name: "Mark paid" })[1]!);
    await vi.waitFor(() => expect(markFleetBillPaid).toHaveBeenCalledWith(DETAIL.bills[1]!.id));
    expect(await screen.findByText("This bill is already marked paid.")).toBeTruthy();
  });

  it("Adjust needs an amount, the ride and a reason, then corrects it on the ride's branch", async () => {
    vi.mocked(adjustFleet).mockResolvedValue({ ok: true });
    panel();
    fireEvent.click(screen.getAllByRole("button", { name: "Adjust" })[0]!);
    expect(screen.getByText("Adjust · 28 Sep–4 Oct · $34.50")).toBeTruthy();
    expect(screen.getByLabelText("Which ride")).toHaveProperty("value", RIDE);
    expect(screen.getByRole("option", { name: "#B190 · Tendai · 4 Oct 10:05" })).toBeTruthy();
    const save = screen.getByRole("button", { name: "Save adjustment" });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "−1.50" } });
    expect(save).toHaveProperty("disabled", true); // no reason yet
    fireEvent.change(screen.getByLabelText("Reason (required)"), { target: { value: "Wrong fee charged on a cancelled ride" } });
    fireEvent.click(save);
    await vi.waitFor(() =>
      expect(adjustFleet).toHaveBeenCalledWith(CHICKEN, {
        merchantId: BORROWDALE,
        orderId: RIDE,
        amount: -1.5,
        reason: "Wrong fee charged on a cancelled ride",
      }),
    );
    await vi.waitFor(() => expect(screen.queryByText("Adjust · 28 Sep–4 Oct · $34.50")).toBeNull());
  });

  it("a paused fleet offers Unpause; a disabled one has no switches", () => {
    panel({ ...DETAIL, paused: true });
    expect(screen.getByRole("button", { name: "Unpause" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    cleanup();
    panel({ ...DETAIL, enabled: false });
    expect(screen.queryByRole("button", { name: "Disable" })).toBeNull();
    expect(screen.getByLabelText("Fee per ride")).toHaveProperty("disabled", true);
  });

  it("is inert offline", () => {
    panel(DETAIL, false);
    expect(screen.getByRole("button", { name: "Pause" })).toHaveProperty("disabled", true);
    for (const b of screen.getAllByRole("button", { name: "Mark paid" })) expect(b).toHaveProperty("disabled", true);
  });
});

describe("OB-A3 · Pause and Disable confirm", () => {
  it("Pause names what stops, needs a reason code, and sends it with the note", async () => {
    vi.mocked(switchFleet).mockResolvedValue({ ok: true });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Pause Chicken Inn's Own bikers?")).toBeTruthy();
    expect(within(dialog).getByText("Chicken Inn's 4 bikers stop getting jobs. Their 'Book a biker' falls back to Any biker.")).toBeTruthy();
    expect(within(dialog).getByText("Reason code")).toBeTruthy();
    expect(within(dialog).getByText("Note for the audit log")).toBeTruthy();
    expect(within(dialog).getByText("Recorded in the audit log with your name.")).toBeTruthy();
    // NON_PAYMENT says the bill is overdue while one is.
    expect(
      within(dialog)
        .getAllByRole("radio")
        .map((r) => r.parentElement?.textContent),
    ).toEqual(["NON_PAYMENT · bill overdue", "MERCHANT_REQUEST", "ABUSE_REPORT", "OTHER"]);
    const go = within(dialog).getByRole("button", { name: "Pause" });
    expect(go).toHaveProperty("disabled", true);
    fireEvent.click(within(dialog).getByRole("radio", { name: "NON_PAYMENT · bill overdue" }));
    fireEvent.change(within(dialog).getByLabelText("Note for the audit log"), { target: { value: "21–27 Sep bill 2 days overdue" } });
    fireEvent.click(go);
    await vi.waitFor(() => expect(switchFleet).toHaveBeenCalledWith(CHICKEN, "pause", "NON_PAYMENT", "21–27 Sep bill 2 days overdue"));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Disable says the bikers become public and bills stay open; a refusal keeps the dialog", async () => {
    vi.mocked(switchFleet).mockResolvedValue({ ok: false, message: "Fleet not found" });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Disable" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Disable Chicken Inn's Own bikers?")).toBeTruthy();
    expect(
      within(dialog).getByText("Chicken Inn's 4 bikers become public bikers. Their 'Book a biker' falls back to Any biker. Unpaid bills stay open."),
    ).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("radio", { name: "MERCHANT_REQUEST" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Disable" }));
    await vi.waitFor(() => expect(switchFleet).toHaveBeenCalledWith(CHICKEN, "disable", "MERCHANT_REQUEST", ""));
    expect(await within(dialog).findByText("Fleet not found")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
