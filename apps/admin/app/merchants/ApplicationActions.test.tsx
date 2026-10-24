// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationActionButton, LicenceButtons, LogCallButton } from "./ApplicationActions";
import { logMerchantCall, moveMerchantApplication, recordMerchantLicence, verifyMerchantLicence } from "./actions";

vi.mock("./actions", () => ({
  moveMerchantApplication: vi.fn(),
  logMerchantCall: vi.fn(),
  recordMerchantLicence: vi.fn(),
  verifyMerchantLicence: vi.fn(),
}));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("merchant application actions (admin console v2 §5)", () => {
  it("reject offers the merchant-readable reasons and sends the code", async () => {
    vi.mocked(moveMerchantApplication).mockResolvedValue({ ok: true });
    render(<ApplicationActionButton merchantId="m-1" name="Sadza Republic" action="reject" connected />);
    fireEvent.click(screen.getByRole("button", { name: "Reject…" }));
    expect(screen.getByText("The owner is sent the reason you pick, in these words. You can reopen it later.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Your business is outside the area LyniaGo covers for now." }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await vi.waitFor(() => expect(moveMerchantApplication).toHaveBeenCalledWith("m-1", "reject", "outside_area", ""));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the API's refusal in the modal and keeps it open", async () => {
    vi.mocked(moveMerchantApplication).mockResolvedValue({ ok: false, message: "Not every check passes yet: Ops call." });
    render(<ApplicationActionButton merchantId="m-1" name="Sadza Republic" action="approve" connected />);
    fireEvent.click(screen.getByRole("button", { name: "Approve…" }));
    fireEvent.click(screen.getByRole("radio", { name: "Every check passed" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await vi.waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Not every check passes yet: Ops call."));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("suspend says what it leaves running: orders in progress carry on, scheduled ones that haven't started are cancelled", () => {
    render(<ApplicationActionButton merchantId="m-1" name="Sadza Republic" action="suspend" connected app={{ orders: { open: 3, scheduled: 1 } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Suspend…" }));
    expect(
      screen.getByText(
        "Customers stop seeing it and it takes no new orders. 3 orders in progress carry on. 1 scheduled order hasn't started: each is cancelled when its time comes, and the customer is told.",
      ),
    ).toBeTruthy();
  });

  it("go live warns when the business's customer section is switched off", () => {
    render(<ApplicationActionButton merchantId="m-1" name="Dube Pharmacy" action="go_live" connected app={{ section: { name: "Pharmacy", enabled: false } }} />);
    fireEvent.click(screen.getByRole("button", { name: "Go live…" }));
    expect(screen.getByText("Customers can find it and order once Pharmacy is switched on. It's off now, so customers can't see it yet.")).toBeTruthy();
  });

  it("is inert offline", () => {
    render(<ApplicationActionButton merchantId="m-1" name="Sadza Republic" action="go_live" connected={false} />);
    expect((screen.getByRole("button", { name: "Go live…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("log call sends the outcome", async () => {
    vi.mocked(logMerchantCall).mockResolvedValue({ ok: true });
    render(<LogCallButton merchantId="m-1" name="Sadza Republic" connected />);
    fireEvent.click(screen.getByRole("button", { name: "Log call…" }));
    fireEvent.click(screen.getByRole("radio", { name: "Spoke to the business" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Tendai, the owner" } });
    fireEvent.click(screen.getByRole("button", { name: "Log call" }));
    await vi.waitFor(() => expect(logMerchantCall).toHaveBeenCalledWith("m-1", "reached", "Tendai, the owner"));
  });

  it("records a licence (number + pharmacist required), then offers Mark verified", async () => {
    vi.mocked(recordMerchantLicence).mockResolvedValue({ ok: true });
    vi.mocked(verifyMerchantLicence).mockResolvedValue({ ok: true });
    const { rerender } = render(<LicenceButtons merchantId="m-1" name="Avenues Pharmacy" connected recorded={false} verified={false} />);
    expect(screen.queryByRole("button", { name: "Mark verified…" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Record licence…" }));
    const save = screen.getByRole("button", { name: "Save licence" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Licence number/), { target: { value: "PCZ 01234" } });
    fireEvent.change(screen.getByLabelText(/Pharmacist on the licence/), { target: { value: "R. Dube" } });
    expect(save.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(/Where the copy is/), { target: { value: "WhatsApp photo" } });
    fireEvent.click(save);
    await vi.waitFor(() =>
      expect(recordMerchantLicence).toHaveBeenCalledWith("m-1", { licenceNumber: "PCZ 01234", pharmacistName: "R. Dube", reference: "WhatsApp photo" }, ""),
    );

    rerender(<LicenceButtons merchantId="m-1" name="Avenues Pharmacy" connected recorded verified={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark verified…" }));
    fireEvent.click(screen.getByRole("radio", { name: "Licence seen — number and pharmacist match" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark verified" }));
    await vi.waitFor(() => expect(verifyMerchantLicence).toHaveBeenCalledWith("m-1", "Licence seen — number and pharmacist match", ""));
  });
});
