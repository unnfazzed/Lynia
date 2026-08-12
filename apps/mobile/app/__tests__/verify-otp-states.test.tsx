/**
 * The OTP screen's four drawn states (journey C·OTP + screens-safety.jsx `OtpState`). Each is its own
 * gallery screen, so each is pinned here against the mock it must match:
 *
 *   LJ.otp          idle       — the "SMS can take a minute on a busy network." hint under the field,
 *                                the green "Didn't get it? Resend code" link.
 *   LJ.otp_cooldown cooldown   — no hint; a muted clock row reading "Resend in 0:42".
 *   LJ.otp_resent   resent     — the mint "A fresh code is on its way — check your messages." banner,
 *                                and the row reads "Resend again in …".
 *   LJ.otp_locked   locked     — "That code has expired." on the field, the lockout explainer, and the
 *                                primary becomes "Send a fresh code" with NO countdown row.
 *
 * The hint is drawn ONLY in the idle mock — the countdown row / banner / lockout card are the guidance
 * in the other three — so its absence there is asserted, not incidental ("not drawn ⇒ not rendered").
 */
import React from "react";
import renderer, { act } from "react-test-renderer";

jest.mock("expo-router", () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ phone: "+263772451180" }),
}));
jest.mock("../../src/auth/auth-context", () => ({ useAuth: () => ({ signIn: jest.fn() }) }));
jest.mock("../../src/api/auth", () => ({ requestOtp: jest.fn(async () => undefined), verifyOtp: jest.fn(async () => ({})) }));

import VerifyScreen, { type VerifyScreenProps } from "../verify";

/**
 * Render, snapshot the tree as text, then unmount: the screen runs a 1s wall-clock interval for the
 * cooldown, and leaving it mounted past the test leaks a timer that re-renders after Jest tears the
 * environment down.
 */
function render(props: VerifyScreenProps): string {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<VerifyScreen {...props} />);
  });
  const out = JSON.stringify(tree.toJSON());
  act(() => tree.unmount());
  return out;
}

const HINT = "SMS can take a minute on a busy network.";

describe("OTP screen states match their mocks", () => {
  it("idle (LJ.otp): the field hint and the tappable resend link", () => {
    const out = render({ initialCooldownS: 0 });
    expect(out).toContain(HINT);
    expect(out).toContain("Didn");
    expect(out).toContain("Resend code");
    expect(out).toContain("Verify");
  });

  it("cooldown (LJ.otp_cooldown): the countdown row, and no hint", () => {
    const out = render({ initialCooldownS: 42 });
    expect(out).toContain("0:42");
    expect(out).toContain("Resend ");
    expect(out).not.toContain(HINT);
  });

  it("resent (LJ.otp_resent): the fresh-code banner plus 'Resend again in'", () => {
    const out = render({ initialResent: true, initialCooldownS: 58 });
    expect(out).toContain("A fresh code is on its way — check your messages.");
    expect(out).toContain("again ");
    expect(out).toContain("0:58");
    expect(out).not.toContain(HINT);
  });

  it("locked (LJ.otp_locked): expired error, lockout copy, 'Send a fresh code', no countdown", () => {
    const out = render({ initialLocked: true, initialCooldownS: 42 });
    expect(out).toContain("That code has expired.");
    expect(out).toContain("Codes last 10 minutes, and 5 wrong tries locks one. Send a fresh code — it resets your attempts too.");
    expect(out).toContain("Send a fresh code");
    expect(out).not.toContain(HINT);
    expect(out).not.toContain("0:42");
  });

  it("defaults are the app's own behaviour: a full cooldown, no banner, not locked", () => {
    const out = render({});
    expect(out).toContain("1:00");
    expect(out).not.toContain("A fresh code is on its way");
    expect(out).not.toContain("That code has expired.");
  });
});
