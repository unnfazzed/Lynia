// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
import { ApiError, getMyMerchant, requestOtp, verifyOtp } from "../lib/api-client";
import { merchantProfile } from "../testing/fixtures";
import { noBusinessPath } from "../lib/team-api";

const nav = vi.hoisted(() => ({ replace: vi.fn(), next: null as string | null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
}));

const alarm = vi.hoisted(() => ({ arm: vi.fn() }));
vi.mock("../components/alarm-singleton", () => ({ getAlarmController: () => alarm }));

vi.mock("../lib/api-client", () => ({
  ApiError: class extends Error {
    constructor(
      public status: number,
      message: string,
      public reason?: string,
    ) {
      super(message);
    }
  },
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
  getMyMerchant: vi.fn(),
}));

// L4: whether a team has invited the number (Join) or not (the sign-up).
vi.mock("../lib/team-api", () => ({ noBusinessPath: vi.fn(async () => "/onboarding") }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  nav.next = null;
  window.history.replaceState(null, "", "/login");
});

const SESSION = { accessToken: "a", refreshToken: "r", expiresIn: 900, profileId: "p1", role: "customer", needsProfile: true };

async function toCodeStep(deliveryChannel?: "whatsapp" | "sms") {
  vi.mocked(requestOtp).mockResolvedValue({ sent: true, channel: "bird-verify", deliveryChannel });
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0773333333" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  return await screen.findByLabelText("6-digit code");
}

/** Phone → code; the sixth digit signs in on its own (merchant-mobile A2). */
async function signIn(deliveryChannel?: "whatsapp" | "sms") {
  fireEvent.change(await toCodeStep(deliveryChannel), { target: { value: "123456" } });
}

describe("A1 · Sign in (merchant mobile redesign, D-48)", () => {
  it("is the LyniaGo Merchant lockup, 'Sign in', a +263 phone field and the privacy line", () => {
    render(<LoginPage />);
    expect(screen.getByText("Merchant")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("+263")).toBeTruthy();
    expect(screen.getByRole("link", { name: "privacy notice" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "terms" }).getAttribute("href")).toMatch(/\/legal\/terms$/);
    expect(screen.queryByText(/alarm/i)).toBeNull();
  });

  it("formats the local number and sends it with the country code", async () => {
    await toCodeStep();
    expect(requestOtp).toHaveBeenCalledWith("+263773333333");
  });

  it("waits for all nine digits before Send code", () => {
    render(<LoginPage />);
    const input = screen.getByLabelText("Phone number") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0773" } });
    expect(input.value).toBe("77 3");
    expect((screen.getByRole("button", { name: "Send code" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("A2 · Code", () => {
  it("names the channel the code went by, and the number", async () => {
    await toCodeStep("whatsapp");
    expect(screen.getByText(/Sent on WhatsApp to/)).toBeTruthy();
    expect(screen.getByText("+263 77 333 3333")).toBeTruthy();
    cleanup();
    await toCodeStep("sms");
    expect(screen.getByText(/Sent by SMS to/)).toBeTruthy();
  });

  it("signs in on the sixth digit, unlocking the order alert with that gesture — no alarm step", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(SESSION as never);
    vi.mocked(getMyMerchant).mockResolvedValue(merchantProfile({ businessType: "restaurant" }));
    await signIn();
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/queue"));
    expect(verifyOtp).toHaveBeenCalledWith("+263773333333", "123456");
    expect(alarm.arm).toHaveBeenCalled();
  });

  it("Wrong number? goes back to the phone step", async () => {
    await toCodeStep();
    fireEvent.click(screen.getByRole("button", { name: "Wrong number?" }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("offers Resend once the countdown runs out", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await toCodeStep();
      expect(screen.getByText(/Resend in/)).toBeTruthy();
      for (let i = 0; i < 61; i++) {
        await act(async () => {
          vi.advanceTimersByTime(1000);
        });
      }
      fireEvent.click(await screen.findByRole("button", { name: "Resend code" }));
      await vi.waitFor(() => expect(requestOtp).toHaveBeenCalledTimes(2));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("where a fresh sign-in lands", () => {
  it("a number that isn't on a business goes to 'Set up your business'", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(SESSION as never);
    vi.mocked(getMyMerchant).mockRejectedValue(new ApiError(403, "This number isn't on a business on LyniaGo yet.", "not_a_member"));
    await signIn();
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("a number a team invited lands on Join instead of the sign-up (L4)", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(SESSION as never);
    vi.mocked(getMyMerchant).mockRejectedValue(new ApiError(403, "not a member", "not_a_member"));
    vi.mocked(noBusinessPath).mockResolvedValueOnce("/join");
    await signIn();
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/join"));
  });

  it("a shop goes to its Orders home (Deliveries); a restaurant to Orders, or back to what it was opening", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(SESSION as never);
    vi.mocked(getMyMerchant).mockResolvedValue(merchantProfile({ businessType: "shop" }));
    nav.next = "/menu";
    window.history.replaceState(null, "", `/login?next=${encodeURIComponent(nav.next)}`);
    await signIn();
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries"));

    cleanup();
    nav.replace.mockClear();
    vi.mocked(getMyMerchant).mockResolvedValue(merchantProfile({ businessType: "restaurant" }));
    await signIn();
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/menu"));
  });

  it("never follows a `next` that would leave the app", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(SESSION as never);
    vi.mocked(getMyMerchant).mockResolvedValue(merchantProfile({ businessType: "restaurant" }));
    nav.next = "//attacker.example/x";
    window.history.replaceState(null, "", `/login?next=${encodeURIComponent(nav.next)}`);
    await signIn();
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/queue"));
  });
});

describe("refusals", () => {
  it("says what to do when a shared device has hit the new-account cap", async () => {
    vi.mocked(verifyOtp).mockRejectedValue(new ApiError(429, "Too many sign-ups", "device_signup_cap"));
    await signIn();
    expect(await screen.findByText("This device has added 3 new people today. Sign in on your own phone, or try tomorrow.")).toBeTruthy();
  });

  it("any other 429 (the route's own attempt limit) keeps the API's words", async () => {
    vi.mocked(verifyOtp).mockRejectedValue(new ApiError(429, "Too many attempts. Wait a minute."));
    await signIn();
    expect(await screen.findByText("Too many attempts. Wait a minute.")).toBeTruthy();
  });
});

describe("CF-01 double-submit guard", () => {
  it("a same-tick double-tap on 'Send code' fires only one OTP request", async () => {
    let resolve: (v: unknown) => void = () => {};
    vi.mocked(requestOtp).mockImplementation(() => new Promise((r) => (resolve = r)) as never);
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0773333333" } });
    const send = screen.getByRole("button", { name: "Send code" });
    fireEvent.click(send);
    fireEvent.click(send);
    expect(requestOtp).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ sent: true, channel: "bird-verify" }));
  });

  it("the sixth digit and a Sign in tap in the same tick verify once", async () => {
    let resolve: (v: unknown) => void = () => {};
    vi.mocked(verifyOtp).mockImplementation(() => new Promise((r) => (resolve = r)) as never);
    const input = await toCodeStep();
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign/ }));
    expect(verifyOtp).toHaveBeenCalledTimes(1);
    await act(async () => resolve(SESSION));
  });
});
