import { describe, expect, it } from "vitest";
import type { FleetInviteRow } from "@lynia/shared";
import { invitePhone, ownBikersRow, sharedAgo, sortInvites } from "./own-bikers";

const H = 3_600_000;
const inv = (name: string, state: FleetInviteRow["state"], hoursAgo: number, now: number): FleetInviteRow => ({
  id: name,
  name,
  phoneMasked: "•• 0192",
  state,
  homeBranch: "Avondale",
  sharedAt: new Date(now - hoursAgo * H).toISOString(),
  expiresAt: new Date(now + H).toISOString(),
});

describe("Own bikers helpers (own-bikers-v1, D-117)", () => {
  const now = Date.parse("2026-10-19T12:00:00.000Z");

  it("sharedAgo reads like the drawing: hours under a day (at least 1h), then days", () => {
    expect(sharedAgo(new Date(now - 5 * 60_000).toISOString(), now)).toBe("1h");
    expect(sharedAgo(new Date(now - 5 * H).toISOString(), now)).toBe("5h");
    expect(sharedAgo(new Date(now - 49 * H).toISOString(), now)).toBe("2d");
  });

  it("invites in the order they were shared, expired ones last", () => {
    const rows = sortInvites([inv("Simba", "expired", 200, now), inv("Plus", "not_opened", 1, now), inv("Kuda", "signing_up", 48, now), inv("Rufaro", "waiting_id_check", 5, now)]);
    expect(rows.map((r) => r.name)).toEqual(["Kuda", "Rufaro", "Plus", "Simba"]);
  });

  it("the Account row: owner value with open invites only, staff a count, Paused, or none", () => {
    const base = { enabled: true, paused: false, role: "owner" as const, bikers: [{}, {}, {}, {}] as never[], invites: [inv("Kuda", "signing_up", 1, now), inv("Simba", "expired", 200, now)] };
    expect(ownBikersRow(base)).toEqual({ kind: "value", text: "4 bikers · 1 invite open" });
    expect(ownBikersRow({ ...base, invites: [] })).toEqual({ kind: "value", text: "4 bikers" });
    expect(ownBikersRow({ ...base, bikers: [{}] as never[], invites: [] })).toEqual({ kind: "value", text: "1 biker" });
    expect(ownBikersRow({ ...base, role: "staff" })).toEqual({ kind: "value", text: "4 bikers" });
    expect(ownBikersRow({ ...base, paused: true })).toEqual({ kind: "paused" });
    expect(ownBikersRow({ ...base, enabled: false })).toBeNull();
    expect(ownBikersRow(null)).toBeNull();
  });

  it("the invitee's number, spaced like the drawing for Zimbabwe", () => {
    expect(invitePhone("263775550192")).toBe("+263 77 555 0192");
    expect(invitePhone("447911123456")).toBe("+447911123456");
  });
});
