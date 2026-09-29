// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantPreferredRiderResponse } from "@lynia/shared";
import RidersPage from "./page";
import { ApiError } from "../../lib/api-client";
import { loadBusiness } from "../../lib/business";
import { addRider, listRiders, removeRider } from "../../lib/riders-api";
import { merchantProfile } from "../../testing/fixtures";

vi.mock("../../lib/riders-api", () => ({ listRiders: vi.fn(), addRider: vi.fn(), removeRider: vi.fn() }));
vi.mock("../../lib/business", () => ({ loadBusiness: vi.fn() }));

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

describe("Your riders (merchant web upgrade L3)", () => {
  it("shows each rider with only what the business may know, and their record once they've worked for it", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({
      riders: [
        rider({ label: "Farai", jobs: 12, ratingAvg: 4.9, rider: { name: "Farai Chari", photoUrl: null } }),
        rider({ id: "22222222-2222-4222-8222-222222222222", label: "Nyasha", status: "not_on_lyniago", invitePhone: "263771000006" }),
        rider({ id: "33333333-3333-4333-8333-333333333333", label: "Tino", status: "unavailable" }),
      ],
      cap: 20,
    });

    render(<RidersPage />);

    const list = await screen.findByRole("region", { name: "Your riders" });
    expect(within(list).getByText("+263•••••3333 · Farai Chari on LyniaGo")).toBeTruthy();
    expect(within(list).getByText("12 deliveries for you · ★ 4.9")).toBeTruthy();
    expect(within(list).getByText("On LyniaGo")).toBeTruthy();
    expect(within(list).getByText("Can't take jobs right now")).toBeTruthy();
    const invite = within(list).getByRole("link", { name: "Send the sign-up link on WhatsApp" });
    expect(invite.getAttribute("href")).toContain("https://wa.me/263771000006?text=");
    expect(decodeURIComponent(invite.getAttribute("href")!.split("?text=")[1]!)).toContain("Hi Nyasha, it's Mbare Auto Spares.");
    expect(screen.getByText("3 of 20")).toBeTruthy();
    // A shop's own nav item.
    expect(screen.getByTestId("kitchen-shell").getAttribute("data-active")).toBe("riders");
  });

  it("lets the owner add a rider by the number they sign in with", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({ riders: [], cap: 20 });
    vi.mocked(addRider).mockResolvedValue(rider({ label: "Blessing", status: "not_on_lyniago", invitePhone: "263772223333" }));

    render(<RidersPage />);

    expect(await screen.findByText("No riders yet")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: " Blessing " } });
    fireEvent.change(screen.getByLabelText("The number they sign in to LyniaGo with"), { target: { value: "0772 223 333" } });
    fireEvent.click(screen.getByRole("button", { name: "Add rider" }));

    expect(await screen.findByText("Not on LyniaGo yet")).toBeTruthy();
    expect(addRider).toHaveBeenCalledWith({ label: "Blessing", phone: "0772 223 333" });
    expect((screen.getByLabelText("Their name") as HTMLInputElement).value).toBe("");
    expect(screen.getByText("1 of 20")).toBeTruthy();
  });

  it("puts a refusal about the number under the number, and the limits above the form", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({ riders: [], cap: 20 });
    vi.mocked(addRider)
      .mockRejectedValueOnce(new ApiError(409, "That number is on your team, so it can't be one of your riders.", "team_member"))
      .mockRejectedValueOnce(new ApiError(429, "You've added 10 riders today. Add more tomorrow.", "too_many_adds"));

    render(<RidersPage />);
    await screen.findByText("No riders yet");
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: "Cook" } });
    fireEvent.change(screen.getByLabelText("The number they sign in to LyniaGo with"), { target: { value: "0772223333" } });

    fireEvent.click(screen.getByRole("button", { name: "Add rider" }));
    expect(await screen.findByText("That number is on your team, so it can't be one of your riders.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add rider" }));
    expect((await screen.findByText("You've added 10 riders today. Add more tomorrow.")).getAttribute("role")).toBe("alert");
  });

  it("checks the form before asking the API", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({ riders: [], cap: 20 });
    render(<RidersPage />);
    await screen.findByText("No riders yet");
    fireEvent.click(screen.getByRole("button", { name: "Add rider" }));
    expect(await screen.findByText("Give them a name you'll recognise.")).toBeTruthy();
    expect(addRider).not.toHaveBeenCalled();
  });

  it("removes a rider after a confirm", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({ riders: [rider()], cap: 20 });
    vi.mocked(removeRider).mockResolvedValue({ ok: true });

    render(<RidersPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "Remove Blessing from your riders?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));

    expect(await screen.findByText("No riders yet")).toBeTruthy();
    expect(removeRider).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  it("stops offering the form at the cap", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockResolvedValue({ riders: [rider(), rider({ id: "22222222-2222-4222-8222-222222222222", label: "Farai" })], cap: 2 });
    render(<RidersPage />);
    expect(await screen.findByText("You have 2 riders, the most you can keep. Remove one to add another.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add rider" })).toBeNull();
  });

  it("shows staff the list without the owner's controls", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(merchantProfile({ myRole: "staff" }));
    vi.mocked(listRiders).mockResolvedValue({ riders: [rider()], cap: 20 });

    render(<RidersPage />);

    expect(await screen.findByText("Only the owner can add or remove riders.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add rider" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    // A restaurant reaches its riders from Shop, which stays its active nav item.
    expect(screen.getByTestId("kitchen-shell").getAttribute("data-active")).toBe("shop");
  });

  it("says Your riders is on its way on an API that doesn't keep riders yet", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(listRiders).mockRejectedValue(new ApiError(404, "Cannot GET /merchant/riders"));
    render(<RidersPage />);
    expect(await screen.findByText("Your riders is on its way.")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add rider" })).toBeNull());
  });
});
