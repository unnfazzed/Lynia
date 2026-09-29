// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OwnerTransferButton } from "./OwnerTransferButton";
import { transferMerchantOwner } from "./actions";

vi.mock("./actions", () => ({ transferMerchantOwner: vi.fn() }));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fill(phone: string, note: string) {
  fireEvent.click(screen.getByRole("radio", { name: "The owner lost their number — ID checked" }));
  fireEvent.change(screen.getByLabelText("New owner's phone — required"), { target: { value: phone } });
  fireEvent.change(screen.getByLabelText("Note — required"), { target: { value: note } });
}

describe("OwnerTransferButton (merchant web upgrade L4)", () => {
  it("needs a reason, the new owner's phone and a note, then hands the business over", async () => {
    vi.mocked(transferMerchantOwner).mockResolvedValue({ ok: true });
    render(<OwnerTransferButton merchantId="m-1" name="Siyaso Spares" connected />);

    fireEvent.click(screen.getByRole("button", { name: "Hand over…" }));
    expect(screen.getByText("Hand Siyaso Spares to someone else?")).toBeTruthy();
    const confirm = screen.getByRole("button", { name: "Hand over" });
    expect(confirm).toHaveProperty("disabled", true);

    fill("0773000003", "Visited the shop, saw Chipo's national ID");
    fireEvent.click(confirm);

    await vi.waitFor(() =>
      expect(transferMerchantOwner).toHaveBeenCalledWith("m-1", "0773000003", "The owner lost their number — ID checked", "Visited the shop, saw Chipo's national ID"),
    );
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the dialog open and shows the API's refusal in its own words", async () => {
    vi.mocked(transferMerchantOwner).mockResolvedValue({ ok: false, message: "That number works at another business. They must leave it first." });
    render(<OwnerTransferButton merchantId="m-1" name="Siyaso Spares" connected />);
    fireEvent.click(screen.getByRole("button", { name: "Hand over…" }));
    fill("0773000003", "Called both of them");
    fireEvent.click(screen.getByRole("button", { name: "Hand over" }));
    expect(await screen.findByText("That number works at another business. They must leave it first.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("is inert while the console is offline", () => {
    render(<OwnerTransferButton merchantId="m-1" name="Siyaso Spares" connected={false} />);
    expect(screen.getByRole("button", { name: "Hand over…" })).toHaveProperty("disabled", true);
  });
});
