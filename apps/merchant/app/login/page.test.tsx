// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
import { requestOtp, verifyOtp } from "../lib/api-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("../components/alarm-singleton", () => ({
  getAlarmController: () => ({ arm: vi.fn() }),
}));

vi.mock("../lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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
});
