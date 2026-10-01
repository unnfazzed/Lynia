// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantBranchResponse, MerchantProfileResponse } from "@lynia/shared";
import { BranchSheet } from "./BranchSheet";
import { ToastProvider } from "../m/Toast";
import { switchBranch } from "../../lib/branches-api";

const { enterBranch, connection } = vi.hoisted(() => ({ enterBranch: vi.fn(), connection: { actionsDisabled: false } }));
vi.mock("../../lib/branches-api", () => ({ switchBranch: vi.fn() }));
vi.mock("./use-enter-branch", () => ({ useEnterBranch: () => enterBranch }));
vi.mock("../KitchenConnectionProvider", () => ({ useKitchenConnection: () => connection }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  connection.actionsDisabled = false;
});

const business = (over: Partial<MerchantProfileResponse> = {}) =>
  ({ id: "m1", name: "Sadza Republic", myRole: "owner", businessType: "restaurant", pilotEnabled: true, ...over }) as MerchantProfileResponse;
const branches: MerchantBranchResponse[] = [
  { id: "m1", name: "Sadza Republic", landmark: "5th Street, Mbare", role: "owner", active: true, pilotEnabled: true },
  { id: "m2", name: "Sadza Republic · Avondale", landmark: "Fife Ave, Avondale", role: "owner", active: false, pilotEnabled: false },
];

function open(b = business(), onClose = vi.fn()) {
  render(
    <ToastProvider>
      <BranchSheet business={b} branches={branches} onClose={onClose} />
    </ToastProvider>,
  );
  return onClose;
}

describe("C6 · Branches (ledger D-51)", () => {
  it("lists the branches: the current one checked, a not-live one with its pill, and Add a branch", () => {
    open();
    expect(screen.getByText("Your branches")).toBeTruthy();
    expect(screen.getByText("5th Street, Mbare")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sadza Republic, 5th Street, Mbare, current branch" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByText("Not live yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add a branch" }).getAttribute("href")).toBe("/branches/new");
  });

  it("a shop branch ops haven't switched on is 'Not live yet', like a restaurant's (D-58)", () => {
    open(business({ businessType: "shop" }));
    expect(screen.queryAllByText("Not live yet").length).toBeGreaterThan(0);
  });

  it("tapping another branch switches to it and enters it with the drawn toast", async () => {
    const next = business({ id: "m2", name: "Sadza Republic · Avondale", pilotEnabled: false });
    vi.mocked(switchBranch).mockResolvedValue(next);
    const onClose = open();
    fireEvent.click(screen.getByRole("button", { name: "Sadza Republic · Avondale, Fife Ave, Avondale, not live yet" }));
    await vi.waitFor(() => expect(enterBranch).toHaveBeenCalledWith(next, "Now at Sadza Republic · Avondale"));
    expect(switchBranch).toHaveBeenCalledWith("m2");
    expect(onClose).toHaveBeenCalled();
  });

  it("tapping the current branch just closes", () => {
    const onClose = open();
    fireEvent.click(screen.getByRole("button", { name: "Sadza Republic, 5th Street, Mbare, current branch" }));
    expect(onClose).toHaveBeenCalled();
    expect(switchBranch).not.toHaveBeenCalled();
  });

  it("offline: the red bar, and rows and Add disabled", () => {
    connection.actionsDisabled = true;
    open();
    expect(screen.getByRole("alert").textContent).toContain("No connection, retrying");
    expect((screen.getByRole("button", { name: "Sadza Republic · Avondale, Fife Ave, Avondale, not live yet" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Add a branch" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("staff don't get Add a branch", () => {
    open(business({ myRole: "staff" }));
    expect(screen.queryByText("Add a branch")).toBeNull();
  });
});
