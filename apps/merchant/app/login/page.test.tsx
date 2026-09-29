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
  useSearchParams: () => ({ get: () => nav.next }),
}));

vi.mock("../components/alarm-singleton", () => ({
  getAlarmController: () => ({ arm: vi.fn() }),
}));

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
});

const SESSION = { accessToken: "a", refreshToken: "r", expiresIn: 900, profileId: "p1", role: "customer", needsProfile: true };

/** Phone step → code step → submit, with the send reporting `deliveryChannel`. */
async function signIn(deliveryChannel?: "whatsapp" | "sms") {
  vi.mocked(requestOtp).mockResolvedValue({ sent: true, channel: "bird-verify", deliveryChannel });
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0773333333" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  fireEvent.change(await screen.findByLabelText("6-digit code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in & start the alarm" }));
}

describe("Sign-in for restaurants and shops (merchant web upgrade L1, D-43)", () => {
  it("is titled 'Sign in' and promises a code without naming a channel before one is sent", () => {
    render(<LoginPage />);
    expect(screen.getByText("Sign in")).toBeTruthy();
    expect(screen.queryByText("Kitchen sign-in")).toBeNull();
    expect(screen.getByText("Enter your phone number. We'll send you a 6-digit code.")).toBeTruthy();
  });

  it("names WhatsApp once the API says the code went there, and keeps the drawn line otherwise", async () => {
    vi.mocked(requestOtp).mockResolvedValueOnce({ sent: true, channel: "bird-verify", deliveryChannel: "whatsapp" });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0773333333" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Enter the code we sent to your WhatsApp on 0773333333.")).toBeTruthy();

    cleanup();
    vi.mocked(requestOtp).mockResolvedValueOnce({ sent: true, channel: "bird", deliveryChannel: "sms" });
    render(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "0773333333" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText("Enter the code we sent to 0773333333.")).toBeTruthy();
  });

  it("a number that isn't on a business goes to 'Set up your business'", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(SESSION);
    vi.mocked(getMyMerchant).mockRejectedValue(new ApiError(403, "Not a member.", "not_a_member"));
    await signIn("whatsapp");
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("a shop goes to its setup checklist; a restaurant to Orders, or back to what it was opening", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(SESSION);
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile({ businessType: "shop", shopKind: "hardware" }));
    await signIn();
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/setup"));

    cleanup();
    nav.next = "/menu";
    vi.mocked(getMyMerchant).mockResolvedValueOnce(merchantProfile());
    await signIn();
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/menu"));
  });

  it("a shop lands on Deliveries once the API can book riders (L2)", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(SESSION);
    vi.mocked(getMyMerchant).mockResolvedValueOnce(
      merchantProfile({
        businessType: "shop",
        shopKind: "hardware",
        location: { point: { lat: -17.83, lng: 31.05 }, landmark: "Opposite Mbare market", contactPhone: "+263771234567" },
      }),
    );
    await signIn();
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/deliveries"));
  });

  it("says what to do when a shared device has hit the new-account cap", async () => {
    vi.mocked(verifyOtp).mockRejectedValue(new ApiError(429, "Too many requests — try again later", "device_signup_cap"));
    await signIn("whatsapp");
    expect(await screen.findByText("This device has added 3 new people today. Sign in on your own phone, or try tomorrow.")).toBeTruthy();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("any other 429 (the route's own attempt limit) keeps the API's words", async () => {
    vi.mocked(verifyOtp).mockRejectedValue(new ApiError(429, "Too many requests — try again later"));
    await signIn("whatsapp");
    expect(await screen.findByText("Too many requests — try again later")).toBeTruthy();
  });
});

// Deferred promise so the test controls exactly when requestOtp/verifyOtp resolve, matching the
// ConfirmModal CF-02 regression test's technique for a slow/2G request.
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("Merchant kitchen sign-in — CF-01 double-submit guard", () => {
  it("a same-tick double-tap on 'Send code' fires only one OTP request", async () => {
    const gate = deferred<{ sent: true; channel: string }>();
    vi.mocked(requestOtp).mockReturnValue(gate.promise);

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("0771234567"), { target: { value: "0773333333" } });

    // Two native clicks inside ONE act() call reproduce a genuine fast double-tap — both onClick
    // handlers run against the same pre-update `busy === false` render, since React only commits
    // after the act() callback returns (same technique as ConfirmModal's CF-02 test).
    const sendButton = screen.getByRole("button", { name: "Send code" });
    act(() => {
      sendButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      sendButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(requestOtp).toHaveBeenCalledTimes(1);

    gate.resolve({ sent: true, channel: "console" });
    await screen.findByLabelText("6-digit code");
    expect(requestOtp).toHaveBeenCalledTimes(1);
  });

  it("a same-tick double-tap on 'Sign in & start the alarm' fires only one verify request", async () => {
    vi.mocked(requestOtp).mockResolvedValue({ sent: true, channel: "console", devCode: "123456" });
    const gate = deferred<{ accessToken: string; refreshToken: string; expiresIn: number; profileId: string; role: string; needsProfile: boolean }>();
    vi.mocked(verifyOtp).mockReturnValue(gate.promise);

    render(<LoginPage />);
    fireEvent.change(screen.getByPlaceholderText("0771234567"), { target: { value: "0773333333" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await screen.findByLabelText("6-digit code");

    fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
    const verifyButton = screen.getByRole("button", { name: /Sign in/ });
    act(() => {
      verifyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      verifyButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });

  it("a number a team invited lands on Join instead of the sign-up (L4)", async () => {
    vi.mocked(verifyOtp).mockResolvedValue(SESSION);
    vi.mocked(getMyMerchant).mockRejectedValue(new ApiError(403, "Not a member.", "not_a_member"));
    vi.mocked(noBusinessPath).mockResolvedValueOnce("/join");
    await signIn("whatsapp");
    await vi.waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/join"));
  });
});
