// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderSettingsCard } from "./OrderSettingsCard";
import { setMerchantOrderSettings } from "./actions";

vi.mock("./actions", () => ({ setMerchantOrderSettings: vi.fn() }));
vi.mock("../actions/audit", () => ({ submitAdminAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OrderSettingsCard (auto-accept)", () => {
  it("turns auto-accept on for the restaurant, with the reason on the audit", async () => {
    vi.mocked(setMerchantOrderSettings).mockResolvedValue({ ok: true });
    render(<OrderSettingsCard merchantId="m-1" name="Mama's Kitchen" autoAccept={false} showPhoneToCustomers={false} connected />);
    fireEvent.click(screen.getAllByRole("button", { name: "Turn on…" })[0]!);
    fireEvent.click(screen.getByRole("radio", { name: "The restaurant takes orders by phone" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await vi.waitFor(() =>
      expect(setMerchantOrderSettings).toHaveBeenCalledWith("m-1", { autoAccept: true }, "The restaurant takes orders by phone", ""),
    );
  });

  it("turns the phone number off", async () => {
    vi.mocked(setMerchantOrderSettings).mockResolvedValue({ ok: true });
    render(<OrderSettingsCard merchantId="m-1" name="Mama's Kitchen" autoAccept={false} showPhoneToCustomers connected />);
    fireEvent.click(screen.getByRole("button", { name: "Turn off…" }));
    fireEvent.click(screen.getByRole("radio", { name: "The restaurant asked to hide its number" }));
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await vi.waitFor(() =>
      expect(setMerchantOrderSettings).toHaveBeenCalledWith("m-1", { showPhoneToCustomers: false }, "The restaurant asked to hide its number", ""),
    );
  });

  it("is inert while the console is offline", () => {
    render(<OrderSettingsCard merchantId="m-1" name="Mama's Kitchen" autoAccept={false} showPhoneToCustomers={false} connected={false} />);
    for (const b of screen.getAllByRole("button", { name: "Turn on…" })) expect(b).toHaveProperty("disabled", true);
  });
});
