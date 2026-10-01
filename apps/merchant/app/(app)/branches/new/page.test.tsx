// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantProfileResponse } from "@lynia/shared";
import AddBranchPage from "./page";
import { ToastProvider } from "../../../components/m/Toast";
import { ApiError, getMyAccount } from "../../../lib/api-client";
import { createBranch } from "../../../lib/branches-api";
import { listCategories, listDishes } from "../../../lib/menu-api";
import type { SignUpLocation } from "../../../lib/sign-up";

const { enterBranch, connection, current, replace } = vi.hoisted(() => ({
  enterBranch: vi.fn(),
  connection: { actionsDisabled: false },
  current: { business: null as MerchantProfileResponse | null },
  replace: vi.fn(),
}));
vi.mock("../../../lib/branches-api", () => ({ createBranch: vi.fn() }));
vi.mock("../../../lib/menu-api", () => ({ listCategories: vi.fn(), listDishes: vi.fn() }));
vi.mock("../../../lib/api-client", async (orig) => ({ ...(await orig<typeof import("../../../lib/api-client")>()), getMyAccount: vi.fn() }));
vi.mock("../../../lib/business", () => ({ useBusiness: () => current.business }));
vi.mock("../../../lib/config", () => ({ supportWhatsAppUrl: () => "https://wa.me/263000" }));
vi.mock("../../../components/branches/use-enter-branch", () => ({ useEnterBranch: () => enterBranch }));
vi.mock("../../../components/KitchenConnectionProvider", () => ({ useKitchenConnection: () => connection }));
vi.mock("../../../components/Kitchen", () => ({ Kitchen: ({ children }: { children: React.ReactNode }) => <div className="m-app">{children}</div> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
// The location block is A4's (its own behaviour is the onboarding page's): stand in with one tap.
const AVONDALE: SignUpLocation = { point: { lat: -17.8, lng: 31.04 }, address: "Fife Ave, Avondale", source: "gps" };
const FAR: SignUpLocation = { point: { lat: -20.15, lng: 28.58 }, address: "Bulawayo", source: "search" };
vi.mock("../../../components/m/LocationField", () => ({
  LocationField: ({ error, onChange }: { error?: string; onChange: (l: SignUpLocation | null) => void }) => (
    <div>
      <button type="button" onClick={() => onChange(AVONDALE)}>
        Use my current location
      </button>
      <button type="button" onClick={() => onChange(FAR)}>
        Pick far away
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  ),
}));

const owner = { id: "m1", name: "Sadza Republic", myRole: "owner", businessType: "restaurant", pilotEnabled: true } as MerchantProfileResponse;

beforeEach(() => {
  current.business = owner;
  vi.mocked(getMyAccount).mockResolvedValue({ firstName: "Mai", lastName: "Moyo", phone: "+263771234567" });
  vi.mocked(listDishes).mockResolvedValue(Array.from({ length: 12 }, () => ({})) as never);
  vi.mocked(listCategories).mockResolvedValue(Array.from({ length: 3 }, () => ({})) as never);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  connection.actionsDisabled = false;
});

function open() {
  render(
    <ToastProvider>
      <AddBranchPage />
    </ToastProvider>,
  );
}
const primary = () => screen.getByRole("button", { name: /Create branch|Creating branch/ }) as HTMLButtonElement;
const nameField = () => screen.getByLabelText("Branch name");

describe("C7 · Add a branch (ledger D-51)", () => {
  it("starts empty with the drawn hint, copy on, live counts, and the primary disabled", async () => {
    open();
    expect((nameField() as HTMLInputElement).value).toBe("");
    expect(screen.getByText("How customers will see it, like Mama’s Kitchen · Avondale")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Copy my menu" }).getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByText("12 dishes in 3 categories")).toBeTruthy();
    expect(primary().disabled).toBe(true);
  });

  it("a shop copies its items", () => {
    current.business = { ...owner, businessType: "shop" };
    open();
    expect(screen.getByText("Copy my items")).toBeTruthy();
  });

  it("enables with a name and a location, creates, and enters the new branch with the drawn toast", async () => {
    const created = { ...owner, id: "m2", name: "Sadza Republic · Avondale", pilotEnabled: false };
    vi.mocked(createBranch).mockResolvedValue(created);
    open();
    fireEvent.change(nameField(), { target: { value: "Sadza Republic · Avondale" } });
    fireEvent.click(screen.getByText("Use my current location"));
    await vi.waitFor(() => expect(primary().disabled).toBe(false));
    fireEvent.click(screen.getByRole("switch", { name: "Copy my menu" }));
    fireEvent.click(primary());
    await vi.waitFor(() => expect(enterBranch).toHaveBeenCalledWith(created, "Sadza Republic · Avondale is ready"));
    expect(createBranch).toHaveBeenCalledWith({
      name: "Sadza Republic · Avondale",
      location: { point: AVONDALE.point, address: "Fife Ave, Avondale", contactPhone: "+263771234567" },
      copyMenu: false,
    });
  });

  it("a taken name shows inline in place of the hint and clears as the name changes", async () => {
    vi.mocked(createBranch).mockRejectedValue(new ApiError(409, "server words", "branch_name_taken"));
    open();
    fireEvent.change(nameField(), { target: { value: "Sadza Republic" } });
    fireEvent.click(screen.getByText("Use my current location"));
    await vi.waitFor(() => expect(primary().disabled).toBe(false));
    fireEvent.click(primary());
    expect(await screen.findByText("You already have a branch with that name. Add the area, like “Mama’s Kitchen · Avondale”.")).toBeTruthy();
    expect(screen.queryByText("How customers will see it, like Mama’s Kitchen · Avondale")).toBeNull();
    fireEvent.change(nameField(), { target: { value: "Sadza Republic · CBD" } });
    expect(screen.getByText("How customers will see it, like Mama’s Kitchen · Avondale")).toBeTruthy();
  });

  it("a place outside the area is refused on the location, before any request", async () => {
    open();
    fireEvent.change(nameField(), { target: { value: "Far branch" } });
    fireEvent.click(screen.getByText("Pick far away"));
    await vi.waitFor(() => expect(primary().disabled).toBe(false));
    fireEvent.click(primary());
    expect((await screen.findByRole("alert")).textContent).toBe("That address is outside the area LyniaGo covers for now.");
    expect(createBranch).not.toHaveBeenCalled();
  });

  it("the branch limit is a banner with Open WhatsApp, and the primary stays disabled", async () => {
    vi.mocked(createBranch).mockRejectedValue(new ApiError(409, "server words", "branch_limit"));
    open();
    fireEvent.change(nameField(), { target: { value: "Branch 21" } });
    fireEvent.click(screen.getByText("Use my current location"));
    await vi.waitFor(() => expect(primary().disabled).toBe(false));
    fireEvent.click(primary());
    expect(await screen.findByText(/You can have up to 20 branches/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open WhatsApp" }).getAttribute("href")).toBe("https://wa.me/263000");
    expect(primary().disabled).toBe(true);
  });

  it("offline: the red bar under the AppBar, and the primary disabled", async () => {
    connection.actionsDisabled = true;
    open();
    fireEvent.change(nameField(), { target: { value: "B" } });
    fireEvent.click(screen.getByText("Use my current location"));
    expect(screen.getByText("No connection, retrying…")).toBeTruthy();
    expect(primary().disabled).toBe(true);
  });

  it("staff are sent back to Account", () => {
    current.business = { ...owner, myRole: "staff" };
    open();
    expect(replace).toHaveBeenCalledWith("/account");
  });
});
