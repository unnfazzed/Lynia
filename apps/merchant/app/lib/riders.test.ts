import { describe, expect, it } from "vitest";
import { RIDER_SIGNUP_URL, riderInviteLink, riderInviteMessage, riderLine, riderPill, validateAddRider } from "./riders";

describe("Your riders' rules (merchant web upgrade L3)", () => {
  it("pills each rider as E4 draws them, and never gives a reason", () => {
    expect(riderPill({ status: "on_lyniago", online: true })).toEqual({ label: "Online", tone: "online" });
    expect(riderPill({ status: "on_lyniago", online: false })).toEqual({ label: "Offline", tone: "offline" });
    expect(riderPill({ status: "on_lyniago" })).toEqual({ label: "Offline", tone: "offline" });
    expect(riderPill({ status: "unavailable", online: true })).toEqual({ label: "Paused", tone: "paused" });
    expect(riderPill({ status: "not_on_lyniago" })).toBeNull();
  });

  it("invites a rider who isn't on LyniaGo yet from the owner's own WhatsApp, to the website's rider sign-up", () => {
    const text = riderInviteMessage("Blessing", "Mbare Auto Spares");
    expect(text).toBe(`Hi Blessing, it's Mbare Auto Spares. We'd like you to deliver for us on LyniaGo. Sign up as a rider with this number: ${RIDER_SIGNUP_URL}`);
    expect(RIDER_SIGNUP_URL).toBe("https://lyniago.com/#riders");
    expect(riderInviteLink("263772223333", "Hi")).toBe("https://wa.me/263772223333?text=Hi");
  });

  it("says their record, or why there's none, in E4's words", () => {
    expect(riderLine({ status: "on_lyniago", jobs: 0, ratingAvg: null })).toBe("No trips yet");
    expect(riderLine({ status: "on_lyniago", jobs: 1, ratingAvg: null })).toBe("1 trip for you");
    expect(riderLine({ status: "on_lyniago", jobs: 12, ratingAvg: 4.86 })).toBe("12 trips for you · ★ 4.9");
    expect(riderLine({ status: "not_on_lyniago", jobs: 0, ratingAvg: null })).toBe("Not on LyniaGo");
    expect(riderLine({ status: "unavailable", jobs: 3, ratingAvg: 5 })).toBe("Paused by LyniaGo");
  });

  it("asks for a name and the number the rider signs in with", () => {
    expect(validateAddRider({ label: "Blessing", phone: "0772223333" })).toEqual({});
    expect(validateAddRider({ label: " ", phone: "12" })).toEqual({
      label: "Give them a name you'll recognise.",
      phone: "Enter the number they sign in with, like 0771234567.",
    });
    expect(validateAddRider({ label: "x".repeat(41), phone: "+263772223333" }).label).toBe("Keep it under 40 letters.");
  });
});
