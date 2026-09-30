// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantProfileResponse } from "@lynia/shared";
import OrderingPage from "./page";
import { ToastProvider } from "../../components/m/Toast";
import { getMerchantProfile, updateOrderSettings } from "../../lib/menu-api";

vi.mock("../../lib/menu-api", () => ({ getMerchantProfile: vi.fn(), updateOrderSettings: vi.fn() }));
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock("../../components/KitchenConnectionProvider", () => ({
  useKitchenConnection: () => ({ actionsDisabled: false, signOut }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../../lib/business", () => ({ primeBusiness: vi.fn() }));
vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const profile = (over: Partial<MerchantProfileResponse> = {}) =>
  ({ id: "m1", name: "Mama's Kitchen", myRole: "owner", autoAccept: false, showPhoneToCustomers: false, ...over }) as MerchantProfileResponse;

function open() {
  render(
    <ToastProvider>
      <OrderingPage />
    </ToastProvider>,
  );
}

describe("Taking orders (auto-accept, owner only)", () => {
  it("turns auto-accept on and says so", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile());
    vi.mocked(updateOrderSettings).mockResolvedValue(profile({ autoAccept: true }));
    open();
    fireEvent.click(await screen.findByRole("switch", { name: "Accept orders automatically" }));
    await vi.waitFor(() => expect(updateOrderSettings).toHaveBeenCalledWith({ autoAccept: true }));
    expect(await screen.findByText("Saved")).toBeTruthy();
  });

  it("shows the number switch in its saved state", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ showPhoneToCustomers: true }));
    open();
    const sw = await screen.findByRole("switch", { name: "Show our number to customers" });
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });

  it("staff see one plain line and no switches", async () => {
    vi.mocked(getMerchantProfile).mockResolvedValue(profile({ myRole: "staff" }));
    open();
    expect(await screen.findByText("Only the owner changes how you take orders.")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
