import { describe, expect, it } from "vitest";
import { firstName, invitedAgo, longMasked, removeConsequence, ROLE_LABEL, shortMasked, signedInLabel, teamInviteLink, teamInviteMessage, validateInvite, validateJoinName } from "./team";

describe("Team's rules (merchant web upgrade L4)", () => {
  it("names the two roles and who is signed in", () => {
    expect(ROLE_LABEL).toEqual({ owner: "Owner", staff: "Staff" });
    expect(firstName("  Tendai  Moyo ")).toBe("Tendai");
    expect(signedInLabel("Tendai Moyo", "staff")).toBe("Tendai · Staff");
    // An API older than L4 sends no name: the role alone.
    expect(signedInLabel(undefined, "owner")).toBe("Owner");
  });

  it("masks the number the way E2 and E3 draw it", () => {
    expect(shortMasked("+263•••••4567")).toBe("•••• 4567");
    expect(longMasked("+263•••••2210")).toBe("+263 •• ••• 2210");
  });

  it("says how long ago someone was invited", () => {
    const now = new Date(2026, 8, 30, 9, 0);
    expect(invitedAgo(new Date(2026, 8, 30, 8, 0).toISOString(), now)).toBe("Invited today");
    expect(invitedAgo(new Date(2026, 8, 29, 23, 0).toISOString(), now)).toBe("Invited yesterday");
    expect(invitedAgo(new Date(2026, 8, 28, 10, 0).toISOString(), now)).toBe("Invited 2 days ago");
  });

  it("invites from the owner's own WhatsApp, to sign in with the invited number", () => {
    const text = teamInviteMessage("Tendai", "Siyaso Spares", "https://merchant.lyniago.com/login");
    expect(text).toBe("Hi Tendai, I've added you to Siyaso Spares on LyniaGo. Sign in with this number to join: https://merchant.lyniago.com/login");
    expect(teamInviteLink("+263 77 222 3333", "Hi there")).toBe("https://wa.me/263772223333?text=Hi%20there");
  });

  it("says what removing someone does (E3)", () => {
    expect(removeConsequence("Tendai")).toBe("Removing Tendai signs them out now. Bookings they made stay on your record.");
  });

  it("asks for a name and a phone number", () => {
    expect(validateInvite({ name: "Tendai", phone: "0772223333" })).toEqual({});
    expect(validateInvite({ name: " ", phone: "12" })).toEqual({
      name: "Give them a name you'll recognise.",
      phone: "Enter their phone number, like 0771234567.",
    });
    expect(validateInvite({ name: "x".repeat(61), phone: "+263772223333" }).name).toBe("Keep it under 60 letters.");
    expect(validateJoinName(" ")).toBe("Enter your name.");
    expect(validateJoinName("Tendai")).toBeNull();
  });
});
