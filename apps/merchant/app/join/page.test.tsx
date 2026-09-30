// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyMerchantInviteResponse } from "@lynia/shared";
import JoinPage from "./page";
import { ApiError, getMyMerchant } from "../lib/api-client";
import { primeBusiness } from "../lib/business";
import { declineInvite, joinInvite, listMyInvites } from "../lib/team-api";
import { merchantProfile } from "../testing/fixtures";

const { replace, push } = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => {
  const router = { replace, push };
  return { useRouter: () => router };
});

vi.mock("../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../lib/api-client")>("../lib/api-client");
  return { ...actual, getMyMerchant: vi.fn() };
});
vi.mock("../lib/team-api", () => ({ listMyInvites: vi.fn(), joinInvite: vi.fn(), declineInvite: vi.fn() }));
vi.mock("../lib/business", () => ({ primeBusiness: vi.fn() }));
vi.mock("../components/alarm-singleton", () => ({ getAlarmController: () => ({ arm: vi.fn() }) }));

function invite(over: Partial<MyMerchantInviteResponse> = {}): MyMerchantInviteResponse {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    businessName: "Siyaso Spares",
    businessType: "shop",
    ownerName: "Farai",
    role: "staff",
    name: "Tendai",
    expiresAt: "2026-10-13T10:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(getMyMerchant).mockRejectedValue(new ApiError(403, "This number isn't on a business on LyniaGo yet.", "not_a_member"));
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
    const name = screen.getByLabelText("Your name") as HTMLInputElement;
    expect(name.value).toBe("Tendai");

    fireEvent.change(name, { target: { value: " Tendai Moyo " } });
    fireEvent.click(screen.getByRole("button", { name: "Join Siyaso Spares" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/deliveries"));
    expect(joinInvite).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", { name: "Tendai Moyo", termsAccepted: true });
    expect(primeBusiness).toHaveBeenCalledWith(joined);
  });

  it("shows the one-business-per-phone refusal as it comes, without naming the other business", async () => {
    vi.mocked(listMyInvites).mockResolvedValue({ invites: [invite()] });
    vi.mocked(joinInvite).mockRejectedValue(
      new ApiError(409, "Your number already works at another business on LyniaGo. Leave it first to join Siyaso Spares.", "member_elsewhere"),
    );

    render(<JoinPage />);
    await screen.findByLabelText("Your name");
    fireEvent.click(screen.getByRole("button", { name: "Join Siyaso Spares" }));

    expect((await screen.findByText("Your number already works at another business on LyniaGo. Leave it first to join Siyaso Spares.")).getAttribute("role")).toBe(
      "alert",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("drops an expired invite, says whom to ask, and shows the next one", async () => {
    vi.mocked(listMyInvites).mockResolvedValue({ invites: [invite(), invite({ id: "22222222-2222-4222-8222-222222222222", businessName: "Sadza Republic", businessType: "restaurant", ownerName: "Rudo" })] });
    vi.mocked(joinInvite).mockRejectedValue(new ApiError(410, "This invite has expired. Ask Farai to send a new one.", "invite_expired"));

    render(<JoinPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Join Siyaso Spares" }));

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
