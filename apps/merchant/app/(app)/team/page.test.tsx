// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantTeamInviteResponse, MerchantTeamMemberResponse } from "@lynia/shared";
import TeamPage from "./page";
import { ApiError } from "../../lib/api-client";
import { loadBusiness } from "../../lib/business";
import { cancelInvite, getTeam, invitePerson, removeMember } from "../../lib/team-api";
import { merchantProfile } from "../../testing/fixtures";

vi.mock("../../lib/team-api", () => ({ getTeam: vi.fn(), invitePerson: vi.fn(), cancelInvite: vi.fn(), removeMember: vi.fn() }));
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

function member(over: Partial<MerchantTeamMemberResponse> = {}): MerchantTeamMemberResponse {
  return {
    profileId: "11111111-1111-4111-8111-111111111111",
    name: "Farai Chari",
    phoneMasked: "+263•••••4567",
    role: "owner",
    you: true,
    joinedAt: "2026-09-20T10:00:00.000Z",
    ...over,
  };
}

function invite(over: Partial<MerchantTeamInviteResponse> = {}): MerchantTeamInviteResponse {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Rudo",
    phoneMasked: "+263•••••9034",
    invitePhone: "263778889034",
    createdAt: "2026-09-29T10:00:00.000Z",
    expiresAt: "2026-10-13T10:00:00.000Z",
    ...over,
  };
}

const TENDAI = member({ profileId: "22222222-2222-4222-8222-222222222222", name: "Tendai", phoneMasked: "+263•••••2210", role: "staff", you: false });
const SHOP = merchantProfile({ name: "Siyaso Spares", businessType: "shop", shopKind: "auto_parts" });

describe("Team (merchant web upgrade L4)", () => {
  it("lists the owner, the staff and who hasn't joined yet, inside Shop", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockResolvedValue({ members: [member(), TENDAI], invites: [invite()] });

    render(<TeamPage />);

    const team = await screen.findByRole("region", { name: "Your team" });
    expect(within(team).getByText("+263•••••4567 · you")).toBeTruthy();
    expect(within(team).getByText("Owner")).toBeTruthy();
    expect(within(team).getByText("Staff")).toBeTruthy();
    expect(within(team).getByText("+263•••••9034 · invited, hasn't joined yet")).toBeTruthy();
    expect(within(team).getByText("Invited")).toBeTruthy();
    const link = within(team).getByRole("link", { name: "Send the link on WhatsApp" });
    expect(link.getAttribute("href")).toContain("https://wa.me/263778889034?text=");
    expect(decodeURIComponent(link.getAttribute("href")!.split("?text=")[1]!)).toBe(
      "Hi Rudo, I've added you to Siyaso Spares on LyniaGo. Sign in with this number to join: http://localhost:3000/login",
    );
    // The owner can't be removed; staff can.
    expect(within(team).getAllByRole("button", { name: "Remove" })).toHaveLength(1);
    expect(screen.getByText(/Staff book riders and mark items out of stock/)).toBeTruthy();
    expect(screen.getByTestId("kitchen-shell").getAttribute("data-active")).toBe("shop");
  });

  it("invites a name and a number, then offers the WhatsApp link", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockResolvedValue({ members: [member()], invites: [] });
    vi.mocked(invitePerson).mockResolvedValue(invite({ name: "Tendai", invitePhone: "263771112210" }));

    render(<TeamPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add someone" }));
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: " Tendai " } });
    fireEvent.change(screen.getByLabelText("Their phone number"), { target: { value: "077 111 2210" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    expect(await screen.findByText("Invite ready. Send them the link on WhatsApp.")).toBeTruthy();
    expect(invitePerson).toHaveBeenCalledWith({ name: "Tendai", phone: "077 111 2210" });
    expect(screen.getByRole("link", { name: "Send them the link on WhatsApp" }).getAttribute("href")).toContain("https://wa.me/263771112210?text=");
    expect(screen.getByText("+263•••••9034 · invited, hasn't joined yet")).toBeTruthy();
    expect((screen.getByLabelText("Their name") as HTMLInputElement).value).toBe("");
  });

  it("puts a refusal about the number under it, and the daily limit above the form", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockResolvedValue({ members: [member()], invites: [] });
    vi.mocked(invitePerson)
      .mockRejectedValueOnce(new ApiError(409, "That number is already on your team.", "already_on_team"))
      .mockRejectedValueOnce(new ApiError(429, "You've sent 10 invites today. Send more tomorrow.", "too_many_invites"));

    render(<TeamPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add someone" }));
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: "Tendai" } });
    fireEvent.change(screen.getByLabelText("Their phone number"), { target: { value: "0771112210" } });

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByText("That number is already on your team.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect((await screen.findByText("You've sent 10 invites today. Send more tomorrow.")).getAttribute("role")).toBe("alert");
  });

  it("checks the form before asking the API", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockResolvedValue({ members: [member()], invites: [] });
    render(<TeamPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add someone" }));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByText("Give them a name you'll recognise.")).toBeTruthy();
    expect(invitePerson).not.toHaveBeenCalled();
  });

  it("removes someone after a confirm that warns about the counter tablet", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockResolvedValue({ members: [member(), TENDAI], invites: [] });
    vi.mocked(removeMember).mockResolvedValue({ ok: true });

    render(<TeamPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === "SPAN" &&
          el.textContent === "Remove Tendai from the team? If Tendai is signed in on the counter tablet, sign it in again with someone else.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove" }));

    await waitFor(() => expect(screen.queryByText("Tendai")).toBeNull());
    expect(removeMember).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");
  });

  it("cancels an invite", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockResolvedValue({ members: [member()], invites: [invite()] });
    vi.mocked(cancelInvite).mockResolvedValue({ ok: true });

    render(<TeamPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel invite" }));
    await waitFor(() => expect(screen.queryByText("Rudo")).toBeNull());
    expect(cancelInvite).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333");
  });

  it("tells staff the team is the owner's, without asking the API", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(merchantProfile({ myRole: "staff" }));
    render(<TeamPage />);
    expect(await screen.findByText("Only the owner can see and change the team.")).toBeTruthy();
    expect(getTeam).not.toHaveBeenCalled();
  });

  it("says Team is on its way on an API that doesn't have it yet", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockRejectedValue(new ApiError(404, "Cannot GET /merchant/team"));
    render(<TeamPage />);
    expect(await screen.findByText("Team is on its way.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add someone" })).toBeNull();
  });
});
