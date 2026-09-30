// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantTeamInviteResponse, MerchantTeamMemberResponse } from "@lynia/shared";
import TeamPage from "./page";
import { ToastProvider } from "../../components/m/Toast";
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

const Page = () => (
  <ToastProvider>
    <TeamPage />
  </ToastProvider>
);

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

describe("E2 · Team (merchant mobile, D-48)", () => {
  it("lists the owner, staff and invited, with their pills and masked numbers", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockResolvedValue({ members: [member(), TENDAI], invites: [invite()] });
    render(<Page />);
    const team = await screen.findByRole("region", { name: "Your team" });
    expect(within(team).getByText("Farai Chari (you)")).toBeTruthy();
    expect(within(team).getByText("•••• 4567")).toBeTruthy();
    expect(within(team).getByText("Owner")).toBeTruthy();
    expect(within(team).getByText("Staff")).toBeTruthy();
    expect(within(team).getByText("Invited")).toBeTruthy();
    const resend = within(team).getByRole("link", { name: "Resend" });
    expect(decodeURIComponent(resend.getAttribute("href")!.split("?text=")[1]!)).toBe(
      "Hi Rudo, I've added you to Siyaso Spares on LyniaGo. Sign in with this number to join: http://localhost:3000/login",
    );
    expect(screen.getByTestId("kitchen-shell").getAttribute("data-active")).toBe("team");
    // Only staff open the person sheet; the owner's own row doesn't.
    expect(within(team).queryByRole("button", { name: /Farai/ })).toBeNull();
  });

  it("invites a name and a number from the Add someone sheet, then offers the WhatsApp link", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockResolvedValue({ members: [member()], invites: [] });
    vi.mocked(invitePerson).mockResolvedValue(invite({ name: "Tendai", invitePhone: "263771112210" }));
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Add someone" }));
    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: " Tendai " } });
    fireEvent.change(screen.getByLabelText("Their phone number"), { target: { value: "077 111 2210" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByText("Invite ready. Send them the link on WhatsApp.")).toBeTruthy();
    expect(invitePerson).toHaveBeenCalledWith({ name: "Tendai", phone: "077 111 2210" });
    expect(screen.getByRole("link", { name: "Send them the link on WhatsApp" }).getAttribute("href")).toContain("https://wa.me/263771112210?text=");
  });

  it("puts a refusal about the number under it, and anything else above the button", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockResolvedValue({ members: [member()], invites: [] });
    vi.mocked(invitePerson)
      .mockRejectedValueOnce(new ApiError(409, "That number is already on your team.", "already_on_team"))
      .mockRejectedValueOnce(new ApiError(429, "You've sent 10 invites today. Send more tomorrow.", "too_many_invites"));
    render(<Page />);
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
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Add someone" }));
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(await screen.findByText("Give them a name you'll recognise.")).toBeTruthy();
    expect(invitePerson).not.toHaveBeenCalled();
  });

  it("E3: tapping staff opens their sheet, which says what removing does, and removes", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockResolvedValue({ members: [member(), TENDAI], invites: [] });
    vi.mocked(removeMember).mockResolvedValue({ ok: true });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: /Tendai/ }));
    expect(screen.getByText("+263 •• ••• 2210 · Staff")).toBeTruthy();
    expect(screen.getByText("Removing Tendai signs them out now. Bookings they made stay on your record.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Tendai" }));
    await waitFor(() => expect(removeMember).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222"));
    expect(await screen.findByText("Tendai removed")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Tendai/ })).toBeNull();
  });

  it("an invite's sheet cancels it", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockResolvedValue({ members: [member()], invites: [invite()] });
    vi.mocked(cancelInvite).mockResolvedValue({ ok: true });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Rudo's invite" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel invite" }));
    await waitFor(() => expect(cancelInvite).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333"));
    await waitFor(() => expect(screen.queryByText("Rudo")).toBeNull());
  });

  it("tells staff the team is the owner's, without asking the API", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(merchantProfile({ myRole: "staff" }));
    render(<Page />);
    expect(await screen.findByText("Only the owner can see and change the team.")).toBeTruthy();
    expect(getTeam).not.toHaveBeenCalled();
  });

  it("says Team is on its way on an API that doesn't have it yet", async () => {
    vi.mocked(loadBusiness).mockResolvedValue(SHOP);
    vi.mocked(getTeam).mockRejectedValue(new ApiError(404, "Cannot GET /merchant/team"));
    render(<Page />);
    expect(await screen.findByText("Team is on its way.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add someone" })).toBeNull();
  });
});
