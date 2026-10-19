// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FleetBikerRow, FleetInviteLinkResponse, FleetInviteRow, OwnerFleetResponse } from "@lynia/shared";
import OwnBikersPage from "./page";
import { ToastProvider } from "../../components/m/Toast";
import { ApiError } from "../../lib/api-client";
import {
  createFleetInvite,
  dismissFleetSuggestions,
  getFleet,
  getFleetBills,
  getFleetInviteLink,
  removeFleetBiker,
  revokeFleetInvite,
} from "../../lib/fleet-api";
import { merchantProfile } from "../../testing/fixtures";

const nav = vi.hoisted(() => {
  const replace = vi.fn();
  // Stable across renders, as the real router and connection are.
  return { replace, router: { replace, push: () => {} }, signOut: () => {}, offline: false, business: null as unknown };
});
vi.mock("next/navigation", () => ({ useRouter: () => nav.router }));
vi.mock("../../lib/business", () => ({ useBusiness: () => nav.business }));
vi.mock("../../lib/fleet-api", () => ({
  getFleet: vi.fn(),
  getFleetBills: vi.fn(),
  createFleetInvite: vi.fn(),
  getFleetInviteLink: vi.fn(),
  revokeFleetInvite: vi.fn(async () => ({ ok: true })),
  removeFleetBiker: vi.fn(async () => ({ ok: true })),
  dismissFleetSuggestions: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../../components/KitchenConnectionProvider", () => ({ useKitchenConnection: () => ({ signOut: nav.signOut, actionsDisabled: nav.offline }) }));
vi.mock("../../components/Kitchen", () => ({ Kitchen: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

// Relative to the real clock: a frozen Date would stop testing-library's waits from ever timing out.
const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

function biker(over: Partial<FleetBikerRow> = {}): FleetBikerRow {
  return {
    riderId: crypto.randomUUID(),
    name: "Farai K.",
    phone: "+263 77 410 2290",
    homeBranch: "Avondale",
    state: "online",
    joinedAt: ago(48 * H),
    cashHeld: null,
    cancelsThisWeek: 0,
    ...over,
  };
}
function invite(over: Partial<FleetInviteRow> = {}): FleetInviteRow {
  return {
    id: crypto.randomUUID(),
    name: "Kuda",
    phoneMasked: "•• 0192",
    state: "signing_up",
    homeBranch: "Avondale",
    sharedAt: ago(48 * H),
    expiresAt: new Date(NOW + 5 * 24 * H).toISOString(),
    ...over,
  };
}
function fleet(over: Partial<OwnerFleetResponse> = {}): OwnerFleetResponse {
  return { enabled: true, paused: false, role: "owner", bikers: [], invites: [], suggestions: [], ...over };
}
function link(over: Partial<FleetInviteLinkResponse> = {}): FleetInviteLinkResponse {
  return { invite: invite({ sharedAt: new Date(NOW).toISOString() }), link: "https://lyniago.com/j/K7Q2M9", phone: "263775550192", alreadyInvited: false, ...over };
}

const TENDAI = biker({ name: "Tendai M.", state: "on_a_job", cashHeld: "14.00" });
const FARAI = biker({ name: "Farai K." });
const NYASHA = biker({ name: "Nyasha T.", homeBranch: "Borrowdale" });
const BLESSING = biker({ name: "Blessing N.", homeBranch: "Borrowdale", state: "offline", cancelsThisWeek: 2 });

function show() {
  render(
    <ToastProvider>
      <OwnBikersPage />
    </ToastProvider>,
  );
}

beforeEach(() => {
  nav.business = merchantProfile({ name: "Chicken Inn Avondale", myRole: "owner" });
  vi.mocked(getFleetBills).mockResolvedValue({ thisWeek: { rides: 23, total: "34.50" }, bills: [] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  nav.offline = false;
});

describe("OB-M2 · the owner's roster", () => {
  it("this week, the bikers on a job › online › offline with their chips, the invites, and the Invite bar", async () => {
    vi.mocked(getFleet).mockResolvedValue(
      fleet({
        bikers: [BLESSING, NYASHA, TENDAI, FARAI],
        invites: [invite({ name: "Simba", state: "expired" }), invite({ name: "Rufaro", state: "waiting_id_check", sharedAt: ago(5 * H) }), invite()],
      }),
    );
    show();
    expect(await screen.findByText("23 rides · $34.50")).toBeTruthy();
    expect(screen.getByText("This week:", { exact: false })).toBeTruthy();
    const rows = within(screen.getByText("YOUR BIKERS").nextElementSibling as HTMLElement).getAllByRole("button");
    expect(rows.map((r) => r.querySelector("b")?.textContent)).toEqual(["Tendai M.", "Farai K.", "Nyasha T.", "Blessing N."]);
    expect(within(rows[0]!).getByText("On a job")).toBeTruthy();
    expect(within(rows[0]!).getByText("Cash with them $14.00")).toBeTruthy();
    expect(within(rows[3]!).getByText("Offline")).toBeTruthy();
    expect(within(rows[3]!).getByText("2 cancels this week")).toBeTruthy();
    // Live invites newest first, the expired one last with New link.
    expect(screen.getByText("Waiting for ID check · Shared 5h ago")).toBeTruthy();
    expect(screen.getByText("Signing up · Shared 2d ago")).toBeTruthy();
    expect(screen.getByText("Link expired")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Share again/ })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "New link" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Invite a biker/ })).toBeTruthy();
  });

  it("Revoke ends the link and drops the row; Share again opens the same link to share", async () => {
    const kuda = invite();
    vi.mocked(getFleet).mockResolvedValue(fleet({ bikers: [FARAI], invites: [kuda] }));
    vi.mocked(getFleetInviteLink).mockResolvedValue(link({ invite: kuda, alreadyInvited: true }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Share again/ }));
    const sheet = await screen.findByRole("dialog", { name: "Invite a biker" });
    expect(getFleetInviteLink).toHaveBeenCalledWith(kuda.id);
    expect(within(sheet).getByText("Already invited · same link")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(screen.queryByText("Kuda")).toBeNull());
    expect(revokeFleetInvite).toHaveBeenCalledWith(kuda.id);
  });

  it("New link: the lapsed number gets a fresh link, which opens to share", async () => {
    const old = invite({ name: "Simba", state: "expired" });
    vi.mocked(getFleet).mockResolvedValue(fleet({ bikers: [FARAI], invites: [old] }));
    vi.mocked(getFleetInviteLink).mockResolvedValue(link({ invite: old, phone: "263771112222" }));
    const fresh = link({ invite: invite({ name: "Simba", state: "not_opened" }) });
    vi.mocked(createFleetInvite).mockResolvedValue(fresh);
    show();
    fireEvent.click(await screen.findByRole("button", { name: "New link" }));
    expect(await screen.findByText("Invite link for Simba")).toBeTruthy();
    expect(createFleetInvite).toHaveBeenCalledWith({ name: "Simba", phone: "+263771112222" });
    expect(screen.queryByText("Link expired")).toBeNull();
  });

  it("a biker's sheet, then Remove behind the destructive confirm, which warns about the cash they hold", async () => {
    vi.mocked(getFleet).mockResolvedValue(fleet({ bikers: [TENDAI, FARAI] }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Tendai M\./ }));
    const sheet = await screen.findByRole("dialog", { name: "Tendai M." });
    expect(within(sheet).getByRole("link", { name: /Call/ }).getAttribute("href")).toBe("tel:+263774102290");
    expect(within(sheet).getByText("Avondale")).toBeTruthy();
    expect(within(sheet).getByText("$14.00")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove from my bikers" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remove Tendai from your bikers?" });
    expect(within(confirm).getByText("Tendai stops getting jobs from Chicken Inn Avondale straight away. Any cash they hold is still owed to you.")).toBeTruthy();
    expect(within(confirm).getByText("Tendai still has $14.00 of your cash. Get it back before you remove them.")).toBeTruthy();
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(removeFleetBiker).toHaveBeenCalledWith(TENDAI.riderId);
    expect(screen.queryByText("Tendai M.")).toBeNull();
  });

  it("a refused remove (mid-job) says why in the confirm and keeps the biker", async () => {
    vi.mocked(getFleet).mockResolvedValue(fleet({ bikers: [TENDAI] }));
    vi.mocked(removeFleetBiker).mockRejectedValueOnce(new ApiError(409, "Tendai is on a job. Remove them after this delivery."));
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Tendai M\./ }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove from my bikers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Tendai is on a job. Remove them after this delivery.");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });
});

describe("OB-M3 · staff", () => {
  it("the lock strip and the same rows, with no week, cash, actions or Invite bar", async () => {
    nav.business = merchantProfile({ name: "Chicken Inn Avondale", myRole: "staff" });
    vi.mocked(getFleet).mockResolvedValue(fleet({ role: "staff", bikers: [TENDAI], invites: [invite(), invite({ name: "Simba", state: "expired" })] }));
    show();
    expect(await screen.findByText("Only the owner can invite or remove bikers.")).toBeTruthy();
    expect(getFleetBills).not.toHaveBeenCalled();
    expect(screen.queryByText(/This week/)).toBeNull();
    expect(screen.queryByText(/Cash with them/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Share again|Revoke|New link|Invite a biker/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tendai M\./ }));
    const sheet = await screen.findByRole("dialog", { name: "Tendai M." });
    expect(within(sheet).queryByRole("button", { name: "Remove from my bikers" })).toBeNull();
    expect(within(sheet).queryByRole("link", { name: /Call/ })).toBeNull();
  });
});

describe("OB-M4/M5/M7", () => {
  it("first time: the EmptyState, whose one pill opens the invite sheet", async () => {
    vi.mocked(getFleet).mockResolvedValue(fleet());
    show();
    expect(await screen.findByText("Invite your bikers")).toBeTruthy();
    expect(screen.getByText("They'll get jobs from your shop only.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Invite a biker/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Invite a biker/ }));
    expect(await screen.findByRole("dialog", { name: "Invite a biker" })).toBeTruthy();
  });

  it("the owner's old Preferred riders are offered once: Invite makes their link; ✕ dismisses them for good", async () => {
    vi.mocked(getFleet).mockResolvedValue(fleet({ bikers: [FARAI], suggestions: [{ name: "Tino K.", phone: "+263773021188" }, { name: "Chipo R.", phone: "+263782204411" }] }));
    vi.mocked(createFleetInvite).mockResolvedValue(link({ invite: invite({ name: "Tino K.", state: "not_opened" }) }));
    show();
    expect(await screen.findByText("FROM YOUR PREFERRED RIDERS")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /^Invite$/ })[0]!);
    expect(await screen.findByText("Invite link for Tino K.")).toBeTruthy();
    expect(createFleetInvite).toHaveBeenCalledWith({ name: "Tino K.", phone: "+263773021188" });
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByText("Invited")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByText("FROM YOUR PREFERRED RIDERS")).toBeNull());
    expect(dismissFleetSuggestions).toHaveBeenCalled();
  });

  it("the first biker joined: a mint banner to book their first delivery, until the first ride", async () => {
    vi.mocked(getFleetBills).mockResolvedValue({ thisWeek: { rides: 0, total: "0.00" }, bills: [] });
    vi.mocked(getFleet).mockResolvedValue(fleet({ bikers: [FARAI], invites: [invite()] }));
    show();
    const banner = await screen.findByRole("link", { name: /Farai is ready/ });
    expect(banner.textContent).toContain("Book your first delivery");
    expect(screen.queryByText(/This week/)).toBeNull();
    cleanup();
    vi.mocked(getFleetBills).mockResolvedValue({ thisWeek: { rides: 0, total: "0.00" }, bills: [{ id: "b", periodStart: "2026-10-05", periodEnd: "2026-10-11", dueOn: "2026-10-16", total: "1.50", state: "paid", daysOverdue: 0, paidAt: null, branches: [] }] });
    show();
    await screen.findByText("YOUR BIKERS");
    expect(screen.queryByRole("link", { name: /is ready/ })).toBeNull();
  });
});

describe("OB-M6 · Invite a biker (a shared link, no SMS)", () => {
  async function open() {
    vi.mocked(getFleet).mockResolvedValue(fleet({ bikers: [FARAI] }));
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Invite a biker/ }));
    return screen.findByRole("dialog", { name: "Invite a biker" });
  }
  function fill(sheet: HTMLElement, phone = "0775550192", name = "Kuda") {
    fireEvent.change(within(sheet).getByLabelText("Phone"), { target: { value: phone } });
    fireEvent.change(within(sheet).getByLabelText("Name"), { target: { value: name } });
  }

  it("gets a link bound to the number, then shares it on WhatsApp with the handoff's message, or copies it", async () => {
    const sheet = await open();
    expect(within(sheet).getByText("Only this number can use the link.")).toBeTruthy();
    // Drawn enabled while typing: an incomplete form asks nothing of the API.
    fireEvent.click(within(sheet).getByRole("button", { name: /Get invite link/ }));
    expect(createFleetInvite).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(within(sheet).getByLabelText("Phone"));
    fill(sheet);
    vi.mocked(createFleetInvite).mockResolvedValue(link({ invite: invite({ name: "Kuda", state: "not_opened" }) }));
    fireEvent.click(within(sheet).getByRole("button", { name: /Get invite link/ }));
    expect(await within(sheet).findByText("Invite link for Kuda")).toBeTruthy();
    expect(createFleetInvite).toHaveBeenCalledWith({ name: "Kuda", phone: "+263775550192" });
    expect(within(sheet).getByText("Works for 7 days, for this number only.")).toBeTruthy();
    const wa = within(sheet).getByRole("link", { name: /Share on WhatsApp/ }).getAttribute("href")!;
    expect(wa.startsWith("https://wa.me/263775550192?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("text=")[1]!)).toBe("Hi Kuda, join Chicken Inn Avondale’s bikers on LyniaGo: https://lyniago.com/j/K7Q2M9");
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Copy link" }));
    expect(await screen.findByText("Link copied")).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith("https://lyniago.com/j/K7Q2M9");
    // The roster's INVITES gets the new row.
    expect(screen.getByText("INVITES")).toBeTruthy();
  });

  it("a number refused (already one of your bikers) is said under the number, and the form stays", async () => {
    const sheet = await open();
    fill(sheet);
    vi.mocked(createFleetInvite).mockRejectedValue(new ApiError(409, "That number is already one of your bikers.", "already_biker"));
    fireEvent.click(within(sheet).getByRole("button", { name: /Get invite link/ }));
    expect((await within(sheet).findByRole("alert")).textContent).toBe("That number is already one of your bikers.");
    expect(within(sheet).getByRole("button", { name: /Get invite link/ })).toBeTruthy();
  });

  it("couldn't get a link, or no network: the strip with Try again", async () => {
    const sheet = await open();
    fill(sheet);
    vi.mocked(createFleetInvite).mockRejectedValueOnce(new ApiError(500, "Request failed (HTTP 500)."));
    fireEvent.click(within(sheet).getByRole("button", { name: /Get invite link/ }));
    expect(await within(sheet).findByText("Couldn't get a link")).toBeTruthy();
    vi.mocked(createFleetInvite).mockRejectedValueOnce(new ApiError(0, "Couldn't reach the server — check the connection and try again."));
    fireEvent.click(within(sheet).getByRole("button", { name: /Try again/ }));
    expect(await within(sheet).findByText("Can't reach LyniaGo")).toBeTruthy();
    vi.mocked(createFleetInvite).mockResolvedValueOnce(link());
    fireEvent.click(within(sheet).getByRole("button", { name: /Try again/ }));
    expect(await within(sheet).findByText("Invite link for Kuda")).toBeTruthy();
  });
});

describe("states", () => {
  it("loading shows the skeleton; couldn't load offers Try again", async () => {
    vi.mocked(getFleet).mockRejectedValueOnce(new ApiError(500, "Request failed (HTTP 500)."));
    show();
    expect(screen.getByText("Loading your bikers…")).toBeTruthy();
    expect(await screen.findByText("Couldn't load your bikers")).toBeTruthy();
    vi.mocked(getFleet).mockResolvedValueOnce(fleet({ bikers: [FARAI] }));
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Farai K.")).toBeTruthy();
  });

  it("offline: the last list stays, and a toast says it may be out of date", async () => {
    vi.mocked(getFleet).mockResolvedValue(fleet({ bikers: [FARAI] }));
    const { rerender } = render(
      <ToastProvider>
        <OwnBikersPage />
      </ToastProvider>,
    );
    await screen.findByText("Farai K.");
    nav.offline = true;
    await act(async () => {
      rerender(
        <ToastProvider>
          <OwnBikersPage />
        </ToastProvider>,
      );
    });
    expect(await screen.findByText("You're offline. This list may be out of date.")).toBeTruthy();
    expect(screen.getByText("Farai K.")).toBeTruthy();
  });

  it("a business without Own bikers (or before it's live) goes back to Account", async () => {
    vi.mocked(getFleet).mockResolvedValueOnce(fleet({ enabled: false }));
    show();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/account"));
    cleanup();
    nav.replace.mockClear();
    vi.mocked(getFleet).mockRejectedValueOnce(new ApiError(503, "Own bikers isn't available yet."));
    show();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/account"));
  });
});
