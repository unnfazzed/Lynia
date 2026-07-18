import { isLogoutTransition } from "../session-gate";
import type { Session } from "../session";

const s: Session = {
  accessToken: "a",
  refreshToken: "r",
  expiresIn: 900,
  profileId: "p1",
  role: "customer",
};

// Regression guard: sign-out and a server-forced 401 logout both clear the session but did NOT navigate,
// leaving the user stranded on an authless protected screen (only a force-kill + relaunch recovered).
// SessionGate redirects to /phone on exactly the present→null transition — and must NOT trip on the
// normal pre-auth flow (a brand-new user who never had a session), which renders fine without one.
describe("isLogoutTransition", () => {
  it("is true when the session goes from present to null (sign-out / forced 401)", () => {
    expect(isLogoutTransition(s, null)).toBe(true);
  });

  it("is false on the cold-boot hydration of a logged-out user (null → null)", () => {
    expect(isLogoutTransition(null, null)).toBe(false);
  });

  it("is false on sign-in (null → present) — that flow routes itself", () => {
    expect(isLogoutTransition(null, s)).toBe(false);
  });

  it("is false while a session stays present (token refresh keeps it non-null)", () => {
    expect(isLogoutTransition(s, { ...s, accessToken: "a2" })).toBe(false);
  });
});
