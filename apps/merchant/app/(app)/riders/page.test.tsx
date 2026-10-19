// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantPreferredRiderResponse } from "@lynia/shared";
import RidersPage from "./page";
import { ToastProvider } from "../../components/m/Toast";
import { ApiError } from "../../lib/api-client";
import { loadBusiness } from "../../lib/business";
import { addRider, listRiders, removeRider } from "../../lib/riders-api";
import { merchantProfile } from "../../testing/fixtures";

vi.mock("../../lib/riders-api", () => ({ listRiders: vi.fn(), addRider: vi.fn(), removeRider: vi.fn() }));
vi.mock("../../lib/business", () => ({ loadBusiness: vi.fn() }));
const nav = vi.hoisted(() => ({ replace: vi.fn(), retired: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: nav.replace, push: vi.fn() }) }));
vi.mock("../../lib/order-flags", () => ({ usePreferredRetired: () => nav.retired }));

vi.mock("../../components/KitchenConnectionProvider", () => {
  const value = { signOut: vi.fn(), actionsDisabled: false };
  return { useKitchenConnection: () => value };
});

vi.mock("../../components/Kitchen", () => ({
  Kitchen: ({ active, children }: { active: string; children: React.ReactNode }) => (
    <div data-testid="kitchen-shell" data-active={active}>
      {children}
    </div>
  ),
}));

const Page = () => (
  <ToastProvider>
    <RidersPage />
  </ToastProvider>
);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  nav.retired = false;
});

function rider(over: Partial<MerchantPreferredRiderResponse> = {}): MerchantPreferredRiderResponse {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    label: "Blessing",
    phoneMasked: "+263•••••3333",
    status: "on_lyniago",
    invitePhone: null,
    jobs: 0,
    ratingAvg: null,
    rider: null,
    addedAt: "2026-09-29T10:00:00.000Z",
    ...over,
  };
}

const SHOP = merchantProfile({ name: "Mbare Auto Spares", businessType: "shop", shopKind: "auto_parts", myRole: "owner" });

describe("E4 · Preferred bikers (merchant mobile, D-48)", () => {
  it("shows each biker's pill and record, and the sign-up link for a number not on LyniaGo", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({
      riders: [
        rider({ label: "Big Farai", jobs: 12, ratingAvg: 4.9, online: true, rider: { name: "Farai Chari", photoUrl: null } }),
        rider({ id: "44444444-4444-4444-8444-444444444444", label: "Blessing", online: false }),
        rider({ id: "22222222-2222-4222-8222-222222222222", label: "Nyasha (cousin)", status: "not_on_lyniago", invitePhone: "263771000006" }),
        rider({ id: "33333333-3333-4333-8333-333333333333", label: "Tino", status: "unavailable" }),
      ],
      cap: 20,
    });
    render(<Page />);
    const list = await screen.findByRole("region", { name: "Your bikers" });
    expect(within(list).getByText("12 trips for you · ★ 4.9")).toBeTruthy();
    expect(within(list).getByText("Online")).toBeTruthy();
    expect(within(list).getByText("No trips yet")).toBeTruthy();
    expect(within(list).getByText("Offline")).toBeTruthy();
    expect(within(list).getByText("Paused by LyniaGo")).toBeTruthy();
    expect(within(list).getByText("Paused")).toBeTruthy();
    const invite = within(list).getByRole("link", { name: "Send sign-up link" });
    expect(invite.getAttribute("href")).toContain("https://wa.me/263771000006?text=");
    expect(decodeURIComponent(invite.getAttribute("href")!.split("?text=")[1]!)).toContain("Hi Nyasha (cousin), it's Mbare Auto Spares.");
    expect(screen.getByText("4 of 20")).toBeTruthy();
    expect(screen.getByTestId("kitchen-shell").getAttribute("data-active")).toBe("riders");
  });

  it("lets the owner add a biker from the sheet", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({ riders: [], cap: 20 });
    vi.mocked(addRider).mockResolvedValue(rider({ label: "Blessing", status: "not_on_lyniago", invitePhone: "263772223333" }));
    render(<Page />);
    expect(await screen.findByText("No bikers yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add a biker" }));
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: " Blessing " } });
    fireEvent.change(screen.getByLabelText("The number they sign in to LyniaGo with"), { target: { value: "0772 223 333" } });
    fireEvent.click(screen.getByRole("button", { name: "Add biker" }));
    expect(await screen.findByText("Blessing added")).toBeTruthy();
    expect(addRider).toHaveBeenCalledWith({ label: "Blessing", phone: "0772 223 333" });
    expect(screen.getByRole("link", { name: "Send sign-up link" })).toBeTruthy();
    expect(screen.getByText("1 of 20")).toBeTruthy();
  });

  it("puts a refusal about the number under it, and the limits above the button", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({ riders: [], cap: 20 });
    vi.mocked(addRider)
      .mockRejectedValueOnce(new ApiError(409, "That number is on your team, so it can't be one of your bikers.", "team_member"))
      .mockRejectedValueOnce(new ApiError(429, "You've added 10 bikers today. Add more tomorrow.", "too_many_adds"));
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a biker" }));
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: "Cook" } });
    fireEvent.change(screen.getByLabelText("The number they sign in to LyniaGo with"), { target: { value: "0772223333" } });
    fireEvent.click(screen.getByRole("button", { name: "Add biker" }));
    expect(await screen.findByText("That number is on your team, so it can't be one of your bikers.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add biker" }));
    expect((await screen.findByText("You've added 10 bikers today. Add more tomorrow.")).getAttribute("role")).toBe("alert");
  });

  it("checks the form before asking the API", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({ riders: [], cap: 20 });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a biker" }));
    fireEvent.click(screen.getByRole("button", { name: "Add biker" }));
    expect(await screen.findByText("Give them a name you'll recognise.")).toBeTruthy();
    expect(addRider).not.toHaveBeenCalled();
  });

  it("removes a biker behind the confirm sheet", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({ riders: [rider()], cap: 20 });
    vi.mocked(removeRider).mockResolvedValue({ ok: true });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Blessing" }));
    expect(screen.getByText("Remove Blessing?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("No bikers yet")).toBeTruthy();
    expect(removeRider).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  it("stops offering Add at the cap", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({ riders: [rider(), rider({ id: "22222222-2222-4222-8222-222222222222", label: "Farai" })], cap: 2 });
    render(<Page />);
    expect(await screen.findByText("You have 2 bikers, the most you can keep. Remove one to add another.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a biker" })).toBeNull();
  });

  it("shows staff the list without the owner's controls", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(merchantProfile({ myRole: "staff" }));
    vi.mocked(listRiders).mockResolvedValue({ riders: [rider()], cap: 20 });
    render(<Page />);
    expect(await screen.findByText("Only the owner can add or remove bikers.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add a biker" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Blessing" })).toBeNull();
  });

  it("MJ-RL7: a failed profile read never tells the owner 'Only the owner can add or remove bikers'", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(null);
    vi.mocked(listRiders).mockResolvedValue({ riders: [rider()], cap: 20 });
    render(<Page />);
    expect(await screen.findByText("Blessing")).toBeTruthy();
    expect(screen.queryByText("Only the owner can add or remove bikers.")).toBeNull();
  });

  it("Own bikers T9: once Preferred riders is retired, a bookmark lands on Account", async () => {
    nav.retired = true;
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({ riders: [], cap: 20 });
    render(<Page />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/account"));
  });

  it("says Your bikers is on its way on an API that doesn't keep bikers yet", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockRejectedValue(new ApiError(404, "Cannot GET /merchant/riders"));
    render(<Page />);
    expect(await screen.findByText("Your bikers is on its way.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add a biker" })).toBeNull());
  });
});
