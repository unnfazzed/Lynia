import { bootDestination } from "../boot-route";

describe("bootDestination (BH-15: cold-start routing gate)", () => {
  it("sends a first-time visitor to onboarding", () => {
    expect(bootDestination({ session: null, onboardingSeen: false, rolePref: null })).toBe("/onboarding");
  });

  it("sends a returning signed-out visitor straight to phone entry", () => {
    expect(bootDestination({ session: null, onboardingSeen: true, rolePref: null })).toBe("/phone");
  });

  it("re-prompts /profile/setup on a signed-in session with needsProfile still true, regardless of rolePref", () => {
    // The exact BH-15 repro: verifyOtp saved the session (needsProfile: true) but the app was killed
    // before profile/setup's PATCH landed — a relaunch must NOT silently skip to /home or /rider.
    expect(bootDestination({ session: { needsProfile: true }, onboardingSeen: true, rolePref: null })).toBe("/profile/setup");
    expect(bootDestination({ session: { needsProfile: true }, onboardingSeen: true, rolePref: "rider" })).toBe("/profile/setup");
    expect(bootDestination({ session: { needsProfile: true }, onboardingSeen: true, rolePref: "customer" })).toBe("/profile/setup");
  });

  it("routes a completed-profile rider straight to /rider", () => {
    expect(bootDestination({ session: { needsProfile: false }, onboardingSeen: true, rolePref: "rider" })).toBe("/rider");
  });

  it("routes a completed-profile customer (or no role pref yet) to /home", () => {
    expect(bootDestination({ session: { needsProfile: false }, onboardingSeen: true, rolePref: "customer" })).toBe("/home");
    expect(bootDestination({ session: { needsProfile: false }, onboardingSeen: true, rolePref: null })).toBe("/home");
  });

  it("treats a session with no needsProfile field (pre-fix persisted session) as profile-complete", () => {
    expect(bootDestination({ session: {}, onboardingSeen: true, rolePref: "rider" })).toBe("/rider");
  });
});
