// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountPage from "./page";
import { getFleet } from "../../lib/fleet-api";
import { ToastProvider } from "../../components/m/Toast";
import { merchantProfile } from "../../testing/fixtures";

const state = vi.hoisted(() => ({
  business: null as unknown,
  branches: [] as unknown[],
  invites: [] as unknown[],
  replace: vi.fn(),
  // Own bikers (OB-M1): the roster read.
  fleet: null as unknown,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace, push: vi.fn() }) }));
vi.mock("../../lib/business", () => ({ useBusiness: () => state.business, clearBusinessCache: vi.fn() }));
vi.mock("../../lib/branches", () => ({ useBranches: () => state.branches }));
vi.mock("../../lib/team-api", () => ({
  getTeam: vi.fn(async () => ({ members: [], invites: [{ id: "i1" }] })),
  leaveBusiness: vi.fn(async () => ({ ok: true })),
  listMyInvites: vi.fn(async () => ({ invites: state.invites })),
  noBusinessPath: vi.fn(async () => (state.invites.length > 0 ? "/join" : "/onboarding")),
}));
vi.mock("../../lib/fleet-api", () => ({
  getFleet: vi.fn(async () => {
    if (!state.fleet) throw new Error("Own bikers isn't live yet");
    return state.fleet;
  }),
}));
const signOut = vi.fn();
vi.mock("../../components/KitchenConnectionProvider", () => ({ useKitchenConnection: () => ({ signOut }) }));
vi.mock("../../lib/config", () => ({ supportWhatsAppUrl: (text?: string) => `https://wa.me/263770000000${text ? `?text=${encodeURIComponent(text)}` : ""}` }));
vi.mock("../../components/Kitchen", () => ({ Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.invites = [];
  state.fleet = null;
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

  it("T3 (D-77 follow-ups): a HELP group opens WhatsApp with the business named", async () => {
    state.business = merchantProfile({ name: "Sadza Republic", myRole: "owner" });
    show();
    const link = await screen.findByRole("link", { name: /Help & support/ });
    expect(screen.getByText("HELP")).toBeTruthy();
    expect(decodeURIComponent(link.getAttribute("href")!)).toBe("https://wa.me/263770000000?text=Hi LyniaGo, I need help with Sadza Republic");
  });

  it("MJ-RL15: staff invited by another business are told to leave first, and Leave takes them to Join", async () => {
    state.business = merchantProfile({ name: "Sadza Republic", myRole: "staff", hours: WEEK });
    state.branches = [];
    state.invites = [{ id: "i9", businessName: "Mama's Kitchen" }];
    show();
    expect(await screen.findByText("Mama's Kitchen invited you. Leave this team to join.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Leave this business" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    await vi.waitFor(() => expect(state.replace).toHaveBeenCalledWith("/join"));
  });

  it("MJ-RL15: an owner never reads invites (they can't leave)", async () => {
    state.business = merchantProfile({ myRole: "owner", hours: WEEK });
    state.invites = [{ id: "i9", businessName: "Mama's Kitchen" }];
    show();
    await screen.findByText("1 invite open");
    expect(screen.queryByText(/invited you/)).toBeNull();
  });
});

describe("OB-M1 · the Own bikers row (own-bikers-v1, D-117)", () => {
  const invite = (inviteState: string) => ({ id: crypto.randomUUID(), name: "Kuda", phoneMasked: "•• 0192", state: inviteState, homeBranch: "Avondale", sharedAt: "2026-10-19T10:00:00.000Z", expiresAt: "2026-10-26T10:00:00.000Z" });
  const fleet = (over: Record<string, unknown> = {}) => ({
    enabled: true,
    paused: false,
    role: "owner",
    bikers: [{}, {}, {}, {}],
    invites: [invite("signing_up"), invite("expired")],
    suggestions: [],
    ...over,
  });

  it("a fleet owner gets “Own bikers · 4 bikers · 1 invite open” instead of Preferred riders (an expired link isn't open)", async () => {
    state.business = merchantProfile({ myRole: "owner", hours: WEEK });
    state.fleet = fleet();
    show();
    const row = await screen.findByRole("link", { name: /Own bikers/ });
    expect(row.getAttribute("href")).toBe("/own-bikers");
    expect(row.textContent).toContain("4 bikers · 1 invite open");
    expect(screen.queryByRole("link", { name: /Preferred bikers/ })).toBeNull();
  });

  it("paused reads as the gold “Paused” chip; staff see a plain count", async () => {
    state.business = merchantProfile({ myRole: "owner", hours: WEEK });
    state.fleet = fleet({ paused: true });
    show();
    const paused = await screen.findByRole("link", { name: /Own bikers/ });
    expect(paused.querySelector("em")?.textContent).toBe("Paused");
    cleanup();
    state.business = merchantProfile({ myRole: "staff", hours: WEEK });
    state.fleet = fleet({ role: "staff" });
    show();
    expect((await screen.findByRole("link", { name: /Own bikers/ })).textContent).toContain("4 bikers");
    expect(screen.queryByText(/invite open/)).toBeNull();
  });

  it("when the fleet read fails the row is gone, and Preferred riders (retired) never shows", async () => {
    state.business = merchantProfile({ myRole: "owner", hours: WEEK });
    show();
    // Let the fleet read settle (it refuses: no fleet), so the row's absence isn't just the read still running.
    await vi.waitFor(() => expect(getFleet).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("link", { name: /Preferred bikers/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Own bikers/ })).toBeNull();
  });
});
