// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoLiveButton } from "./GoLiveButton";
import { setMerchantPilot } from "./actions";

vi.mock("./actions", () => ({ setMerchantPilot: vi.fn() }));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function confirmWith(reason: string, confirmLabel: string) {
  fireEvent.click(screen.getByRole("radio", { name: reason }));
  fireEvent.click(screen.getByRole("button", { name: confirmLabel }));
}

describe("GoLiveButton (merchant web upgrade L1)", () => {
  it("a dormant restaurant offers Go live, which switches it on", async () => {
    vi.mocked(setMerchantPilot).mockResolvedValue({ ok: true });
    render(<GoLiveButton merchantId="m-1" name="Mai Tino's Kitchen" live={false} connected />);

    fireEvent.click(screen.getByRole("button", { name: "Go live…" }));
    expect(screen.getByText("Switch Mai Tino's Kitchen on?")).toBeTruthy();
    confirmWith("Ops call done — every go-live check passed", "Go live");

    await vi.waitFor(() => expect(setMerchantPilot).toHaveBeenCalledWith("m-1", true, "Ops call done — every go-live check passed", ""));
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a live restaurant offers Switch off, which switches it off", async () => {
    vi.mocked(setMerchantPilot).mockResolvedValue({ ok: true });
    render(<GoLiveButton merchantId="m-1" name="Mai Tino's Kitchen" live connected />);

    fireEvent.click(screen.getByRole("button", { name: "Switch off…" }));
    confirmWith("The owner asked to pause", "Switch off");

    await vi.waitFor(() => expect(setMerchantPilot).toHaveBeenCalledWith("m-1", false, "The owner asked to pause", ""));
  });

  it("keeps the dialog open and shows the API's refusal in its own words", async () => {
    vi.mocked(setMerchantPilot).mockResolvedValue({ ok: false, message: "This restaurant has no pickup pin yet." });
    render(<GoLiveButton merchantId="m-1" name="Mai Tino's Kitchen" live={false} connected />);

    fireEvent.click(screen.getByRole("button", { name: "Go live…" }));
    confirmWith("Ops call done — every go-live check passed", "Go live");

    expect(await screen.findByText("This restaurant has no pickup pin yet.")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("is inert while the console is offline", () => {
    render(<GoLiveButton merchantId="m-1" name="Mai Tino's Kitchen" live={false} connected={false} />);
    expect(screen.getByRole("button", { name: "Go live…" })).toHaveProperty("disabled", true);
  });
});
