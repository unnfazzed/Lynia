import { describe, expect, it } from "vitest";
import { RIDER_SIGNUP_URL, RIDER_STATUS_LABEL, riderInviteLink, riderInviteMessage, riderTrackRecord, validateAddRider } from "./riders";

describe("Your riders' rules (merchant web upgrade L3)", () => {
  it("names each status and never a reason", () => {
    expect(RIDER_STATUS_LABEL).toEqual({
      on_lyniago: "On LyniaGo",
      not_on_lyniago: "Not on LyniaGo yet",
      unavailable: "Can't take jobs right now",
    });
  });

  it("invites a rider who isn't on LyniaGo yet from the owner's own WhatsApp, to the website's rider sign-up", () => {
    const text = riderInviteMessage("Blessing", "Mbare Auto Spares");
    expect(text).toBe(`Hi Blessing, it's Mbare Auto Spares. We'd like you to deliver for us on LyniaGo. Sign up as a rider with this number: ${RIDER_SIGNUP_URL}`);
    expect(RIDER_SIGNUP_URL).toBe("https://lyniago.com/#riders");
    expect(riderInviteLink("263772223333", "Hi")).toBe("https://wa.me/263772223333?text=Hi");
  });

  it("describes the track record only once there is one", () => {
    expect(riderTrackRecord({ jobs: 0, ratingAvg: null })).toBeNull();
    expect(riderTrackRecord({ jobs: 1, ratingAvg: null })).toBe("1 delivery for you");
    expect(riderTrackRecord({ jobs: 12, ratingAvg: 4.86 })).toBe("12 deliveries for you · ★ 4.9");
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
