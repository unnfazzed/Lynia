import { bootDestination, bootRedirectTarget } from "../boot-route";

const s = { accessToken: "a", refreshToken: "r", expiresIn: 900, profileId: "p1", role: "customer", needsProfile: false };

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

// LC-D-T3: a cold-start push tap used to be routed by a SEPARATE effect (usePushRegistration) calling
// its own router.push, independently of index.tsx's own <Redirect> — whichever resolved second silently
// won. bootRedirectTarget folds the deep link into the SAME decision as the ordinary boot destination so
// the two can never race.
describe("bootRedirectTarget (LC-D-T3: cold-start deep link vs default boot destination)", () => {
  it("falls back to the ordinary boot destination when there's no cold-start tap", () => {
    expect(bootRedirectTarget({ session: s, onboardingSeen: true, rolePref: "customer", coldStartData: null })).toBe("/home");
  });

  it("a cold-start tap's destination wins over the ordinary boot destination for a signed-in session", () => {
    // The customer's rolePref/default destination is /home, but a tapped delivery-status push must open
    // that order instead — this is the exact race that used to depend on which effect resolved last.
    const target = bootRedirectTarget({
      session: s,
      onboardingSeen: true,
      rolePref: "customer",
      coldStartData: { orderId: "o1", status: "delivered" },
    });
    expect(target).toBe("/order/o1");
  });

  it("a rider's cold-start 'assigned' tap opens the job screen instead of the default /rider board", () => {
    const target = bootRedirectTarget({
      session: { ...s, role: "rider" },
      onboardingSeen: true,
      rolePref: "rider",
      coldStartData: { orderId: "o1", status: "assigned" },
    });
    expect(target).toBe("/rider/job");
  });

  it("ignores a cold-start tap with no signed-in session — nothing authenticated to deep-link into", () => {
    // An unauthenticated cold start has no session to view an order under; the ordinary
    // onboarding/phone fork still applies regardless of a stale cached tap.
    const target = bootRedirectTarget({
      session: null,
      onboardingSeen: true,
      rolePref: null,
      coldStartData: { orderId: "o1", status: "delivered" },
    });
    expect(target).toBe("/phone");
  });

  it("falls back to the ordinary destination when the tap's payload isn't routable", () => {
    const target = bootRedirectTarget({
      session: s,
      onboardingSeen: true,
      rolePref: "customer",
      coldStartData: { unrelated: true },
    });
    expect(target).toBe("/home");
  });
});
