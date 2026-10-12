/**
 * session.role follows `/auth/me` (session-role-sync.ts): after becoming a biker the session kept
 * `role: "customer"`, so the boot aggregate's role hint, biker push routing and the cold-start fallback all
 * read the wrong side. And the device keeps the last-known "verified biker" flag for the splash.
 */
jest.mock("../device-state", () => ({ saveRiderVerifiedHint: jest.fn(async () => undefined) }));
jest.mock("../auth-context", () => ({ useAuth: () => ({ session: null, updateSession: jest.fn() }) }));

import { QueryClient } from "@tanstack/react-query";
import { reconcileMe, watchMe, type MeSyncDeps } from "../session-role-sync";

function deps(session: MeSyncDeps["session"]): MeSyncDeps & { updateSession: jest.Mock; saveVerified: jest.Mock } {
  return { session, updateSession: jest.fn(async () => undefined), saveVerified: jest.fn(async () => undefined) };
}
const me = (role: string, kycStatus?: "pending" | "verified" | "failed", profileId = "p1") =>
  ({ profileId, role, rider: kycStatus ? ({ kycStatus } as never) : null }) as const;

describe("reconcileMe", () => {
  it("patches the session when the server's role differs (a customer who became a biker)", () => {
    const d = deps({ profileId: "p1", role: "customer" });
    reconcileMe(me("rider", "pending"), d, { verified: null });
    expect(d.updateSession).toHaveBeenCalledWith({ role: "rider" });
  });

  it("leaves an agreeing session alone", () => {
    const d = deps({ profileId: "p1", role: "rider" });
    reconcileMe(me("rider", "verified"), d, { verified: null });
    expect(d.updateSession).not.toHaveBeenCalled();
  });

  it("never applies another account's `me` (a stale persisted cache)", () => {
    const d = deps({ profileId: "p1", role: "customer" });
    reconcileMe(me("rider", "verified", "p2"), d, { verified: null });
    expect(d.updateSession).not.toHaveBeenCalled();
    expect(d.saveVerified).not.toHaveBeenCalled();
  });

  it("writes the verified-biker flag only when it changes", () => {
    const d = deps({ profileId: "p1", role: "rider" });
    const last = { verified: null as boolean | null };
    reconcileMe(me("rider", "pending"), d, last);
    reconcileMe(me("rider", "pending"), d, last);
    reconcileMe(me("rider", "verified"), d, last);
    expect(d.saveVerified.mock.calls).toEqual([[false], [true]]);
  });
});

describe("watchMe", () => {
  it("reconciles every `me` read that lands in the cache", () => {
    const qc = new QueryClient();
    const d = deps({ profileId: "p1", role: "customer" });
    const stop = watchMe(qc, () => d);
    expect(d.updateSession).not.toHaveBeenCalled();
    qc.setQueryData(["me"], me("rider", "pending"));
    expect(d.updateSession).toHaveBeenCalledWith({ role: "rider" });
    stop();
    qc.clear();
  });
});
