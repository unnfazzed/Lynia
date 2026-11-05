// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyMerchantInviteResponse } from "@lynia/shared";
import JoinPage from "./page";
import { ApiError, getMyAccount, getMyMerchant } from "../lib/api-client";
import { clearBusinessCache, primeBusiness } from "../lib/business";
import { clearBranchesCache } from "../lib/branches";
import { declineInvite, joinInvite, listMyInvites } from "../lib/team-api";
import { merchantProfile } from "../testing/fixtures";

const { replace, push } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace, push };
  return { useRouter: () => router };
});

vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return { ...actual, getMyMerchant: vi.fn(), getMyAccount: vi.fn() };
});
vi.mock("../lib/team-api", () => ({ listMyInvites: vi.fn(), joinInvite: vi.fn(), declineInvite: vi.fn() }));
vi.mock("../lib/business", () => ({ primeBusiness: vi.fn(), clearBusinessCache: vi.fn() }));
vi.mock("../lib/branches", () => ({ clearBranchesCache: vi.fn() }));
vi.mock("../lib/config", async () => {
  const actual = await vi.importActual<typeof import("../lib/config")>("../lib/config");
  return { ...actual, supportWhatsAppUrl: () => "https://wa.me/263770000000" };
});
vi.mock("../components/alarm-singleton", () => ({ getAlarmController: () => ({ arm: vi.fn() }) }));

function invite(over: Partial<MyMerchantInviteResponse> = {}): MyMerchantInviteResponse {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    businessName: "Siyaso Spares",
    businessType: "shop",
    ownerName: "Farai",
    role: "staff",
    name: "Tee from the counter",
    expiresAt: "2026-10-13T10:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(getMyMerchant).mockRejectedValue(new ApiError(403, "This number isn't on a business on LyniaGo yet.", "not_a_member"));
  vi.mocked(getMyAccount).mockResolvedValue({ firstName: "Tendai", lastName: "Moyo", phone: "+263771234567" });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("A5 · Join a team (merchant mobile redesign, D-48)", () => {
  const sub = (text: string) => (_: string, el: Element | null) => el?.tagName === "P" && el.textContent === text;

  it("names the business and who added them, and joins under their own name — no privacy tick, it was accepted at sign-in", async () => {
    vi.mocked(listMyInvites).mockResolvedValue({ invites: [invite()] });
    const joined = merchantProfile({ name: "Siyaso Spares", businessType: "shop", myRole: "staff", location: null });
    vi.mocked(joinInvite).mockResolvedValue(joined);

    render(<JoinPage />);

    expect(await screen.findByRole("heading", { name: "Join Siyaso Spares" })).toBeTruthy();
    expect(screen.getByText(sub("Farai added you as Staff."))).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    // D-124: First name · Surname from their own account — never the name the owner typed on the invite.
    const first = screen.getByLabelText("First name") as HTMLInputElement;
    const last = screen.getByLabelText("Surname") as HTMLInputElement;
    await waitFor(() => expect(first.value).toBe("Tendai"));
    expect(last.value).toBe("Moyo");
    expect(screen.queryByDisplayValue("Tee from the counter")).toBeNull();

    fireEvent.change(first, { target: { value: " Tendai Rufaro " } });
    fireEvent.click(screen.getByRole("button", { name: "Join Siyaso Spares" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/deliveries"));
    expect(joinInvite).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", {
      name: "Tendai Rufaro Moyo",
      firstName: "Tendai Rufaro",
      lastName: "Moyo",
      termsAccepted: true,
    });
    expect(primeBusiness).toHaveBeenCalledWith(joined);
  });

  it("a number with no name yet starts empty and must give both parts before Join", async () => {
    vi.mocked(getMyAccount).mockResolvedValue({ firstName: "", lastName: "", phone: "+263771234567" });
    vi.mocked(listMyInvites).mockResolvedValue({ invites: [invite()] });
    render(<JoinPage />);
    const first = (await screen.findByLabelText("First name")) as HTMLInputElement;
    expect(first.value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Join Siyaso Spares" }));
    expect(await screen.findByText("Enter your first name.")).toBeTruthy();
    expect(screen.getByText("Enter your surname.")).toBeTruthy();
    expect(joinInvite).not.toHaveBeenCalled();
  });

  it("shows the one-business-per-phone refusal as it comes, without naming the other business", async () => {
    vi.mocked(listMyInvites).mockResolvedValue({ invites: [invite()] });
    vi.mocked(joinInvite).mockRejectedValue(
      new ApiError(409, "Your number already works at another business on LyniaGo. Leave it first to join Siyaso Spares.", "member_elsewhere"),
    );

    render(<JoinPage />);
    await waitFor(() => expect((screen.getByLabelText("Surname") as HTMLInputElement).value).toBe("Moyo"));
    fireEvent.click(screen.getByRole("button", { name: "Join Siyaso Spares" }));

    expect((await screen.findByText("Your number already works at another business on LyniaGo. Leave it first to join Siyaso Spares.")).getAttribute("role")).toBe(
      "alert",
    );
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Open WhatsApp" })).toBeNull();
  });

  it("MJ-L12: a held number told to message LyniaGo on WhatsApp gets the link", async () => {
    vi.mocked(listMyInvites).mockResolvedValue({ invites: [invite()] });
    vi.mocked(joinInvite).mockRejectedValue(new ApiError(403, "This account is on hold. Message LyniaGo on WhatsApp to sort it out.", "on_hold"));
    render(<JoinPage />);
    await waitFor(() => expect((screen.getByLabelText("Surname") as HTMLInputElement).value).toBe("Moyo"));
    fireEvent.click(screen.getByRole("button", { name: "Join Siyaso Spares" }));
    const link = await screen.findByRole("link", { name: "Open WhatsApp" });
    expect(link.getAttribute("href")).toBe("https://wa.me/263770000000");
    expect(screen.getByRole("alert").textContent).toBe("This account is on hold. Message LyniaGo on WhatsApp to sort it out. Open WhatsApp");
  });

  it("drops an expired invite, says whom to ask, and shows the next one", async () => {
    vi.mocked(listMyInvites).mockResolvedValue({ invites: [invite(), invite({ id: "22222222-2222-4222-8222-222222222222", businessName: "Sadza Republic", businessType: "restaurant", ownerName: "Rudo" })] });
    vi.mocked(joinInvite).mockRejectedValue(new ApiError(410, "This invite has expired. Ask Farai to send a new one.", "invite_expired"));

    render(<JoinPage />);
    const join = await screen.findByRole("button", { name: "Join Siyaso Spares" });
    await waitFor(() => expect((screen.getByLabelText("Surname") as HTMLInputElement).value).toBe("Moyo"));
    fireEvent.click(join);

    expect(await screen.findByText("This invite has expired. Ask Farai to send a new one.")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Join Sadza Republic" })).toBeTruthy();
    expect(screen.getByText(sub("Rudo added you as Staff."))).toBeTruthy();
  });

  it("Not me deletes the invite, and with none left goes to the sign-up", async () => {
    vi.mocked(listMyInvites).mockResolvedValue({ invites: [invite()] });
    vi.mocked(declineInvite).mockResolvedValue({ ok: true });

    render(<JoinPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Not me" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding?own=1"));
    expect(declineInvite).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111");
  });

  it("can set up their own business instead", async () => {
    vi.mocked(listMyInvites).mockResolvedValue({ invites: [invite()] });
    render(<JoinPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Start my own business" }));
    expect(push).toHaveBeenCalledWith("/onboarding?own=1");
  });

  it("sends someone already on a business home, and someone with no invite to the sign-up", async () => {
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile());
    render(<JoinPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/queue"));

    cleanup();
    replace.mockClear();
    vi.mocked(listMyInvites).mockResolvedValue({ invites: [] });
    render(<JoinPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding?own=1"));

    cleanup();
    replace.mockClear();
    vi.mocked(listMyInvites).mockRejectedValue(new ApiError(404, "Cannot GET /merchant/invites"));
    render(<JoinPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding?own=1"));
  });
});

describe("MJ-RL16: Join's own sign-out clears the business and branch caches too", () => {
  it("a dead session signs out and forgets the branches and the business", async () => {
    vi.mocked(getMyMerchant).mockRejectedValue(new ApiError(401, "Your session expired — sign in again."));
    render(<JoinPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(clearBranchesCache).toHaveBeenCalled();
    expect(clearBusinessCache).toHaveBeenCalled();
  });
});
