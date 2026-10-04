// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountPage from "./page";
import { ToastProvider } from "../../components/m/Toast";
import { merchantProfile } from "../../testing/fixtures";

const state = vi.hoisted(() => ({ business: null as unknown, branches: [] as unknown[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("../../lib/business", () => ({ useBusiness: () => state.business, clearBusinessCache: vi.fn() }));
vi.mock("../../lib/branches", () => ({ useBranches: () => state.branches }));
vi.mock("../../lib/team-api", () => ({
  getTeam: vi.fn(async () => ({ members: [], invites: [{ id: "i1" }] })),
  leaveBusiness: vi.fn(),
}));
vi.mock("../../lib/riders-api", () => ({ listRiders: vi.fn(async () => ({ riders: [{}, {}, {}, {}], cap: 20 })) }));
const signOut = vi.fn();
vi.mock("../../components/KitchenConnectionProvider", () => ({ useKitchenConnection: () => ({ signOut }) }));
vi.mock("../../components/Kitchen", () => ({ Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ALL_DAY = { open: "08:00", close: "22:00" };
const WEEK = { mon: ALL_DAY, tue: ALL_DAY, wed: ALL_DAY, thu: ALL_DAY, fri: ALL_DAY, sat: ALL_DAY, sun: ALL_DAY };

function show() {
  render(
    <ToastProvider>
      <AccountPage />
    </ToastProvider>,
  );
}

describe("T3 · Account (Merchant v2, D-77)", () => {
  it("an owner gets the two grouped cards, each row with its current value, and the worded Team badge", async () => {
    state.business = merchantProfile({ name: "Sadza Republic", myName: "Farai Chari", myRole: "owner", hours: WEEK, autoAccept: false });
    state.branches = [{}, {}];
    show();
    expect(screen.getByText("Sadza Republic")).toBeTruthy();
    expect(screen.getByText("Farai · Owner · 2 branches")).toBeTruthy();
    expect(screen.getByText("YOUR SHOP FRONT")).toBeTruthy();
    expect(screen.getByText("ORDERS & PEOPLE")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Profile & photos/ }).getAttribute("href")).toBe("/shop");
    expect(screen.getByRole("link", { name: /Opening hours/ }).textContent).toContain("08:00–22:00");
    expect(screen.getByRole("link", { name: /Taking orders/ }).textContent).toContain("Auto-accept off");
    expect((await screen.findByText("1 invite open")).closest("a")?.getAttribute("href")).toBe("/team");
    expect((await screen.findByText("4")).closest("a")?.getAttribute("href")).toBe("/riders");
  });

  it("staff see neither the shop front nor Team; Sign out is the red pill behind the confirm sheet", async () => {
    state.business = merchantProfile({ myRole: "staff", hours: WEEK });
    state.branches = [];
    show();
    expect(screen.queryByText("YOUR SHOP FRONT")).toBeNull();
    expect(screen.queryByRole("link", { name: /Team/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Leave this business" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Sign out" }).at(-1)!);
    expect(signOut).toHaveBeenCalled();
  });
});
