import { describe, expect, it } from "vitest";
import { firstName, removeWarning, ROLE_LABEL, signedInLabel, staffCanLine, teamInviteLink, teamInviteMessage, validateInvite, validateJoinName } from "./team";

describe("Team's rules (merchant web upgrade L4)", () => {
  it("names the two roles and who is signed in", () => {
    expect(ROLE_LABEL).toEqual({ owner: "Owner", staff: "Staff" });
    expect(firstName("  Tendai  Moyo ")).toBe("Tendai");
    expect(signedInLabel("Tendai Moyo", "staff")).toBe("Tendai · Staff");
    // An API older than L4 sends no name: the role alone.
    expect(signedInLabel(undefined, "owner")).toBe("Owner");
  });

  it("says what Staff do, in the business's own words", () => {
    expect(staffCanLine("shop")).toContain("Staff book riders and mark items out of stock.");
    expect(staffCanLine("restaurant")).toContain("Staff take orders, book riders and mark dishes out of stock.");
  });

  it("invites from the owner's own WhatsApp, to sign in with the invited number", () => {
    const text = teamInviteMessage("Tendai", "Siyaso Spares", "https://merchant.lyniago.com/login");
    expect(text).toBe("Hi Tendai, I've added you to Siyaso Spares on LyniaGo. Sign in with this number to join: https://merchant.lyniago.com/login");
    expect(teamInviteLink("+263 77 222 3333", "Hi there")).toBe("https://wa.me/263772223333?text=Hi%20there");
  });

  it("warns about the counter tablet before a removal", () => {
    expect(removeWarning("Tendai")).toBe("If Tendai is signed in on the counter tablet, sign it in again with someone else.");
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
