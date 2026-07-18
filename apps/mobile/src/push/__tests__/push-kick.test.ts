import { requestPushRegistration, subscribePushKick } from "../push-kick";

// The primed permissions explainer nudges push registration to re-attempt the moment the user grants —
// without it, a just-granted permission wouldn't bind a token until the next foreground (registration is
// check-don't-request).
describe("push-kick", () => {
  it("notifies every subscriber on requestPushRegistration()", () => {
    const a = jest.fn();
    const b = jest.fn();
    subscribePushKick(a);
    subscribePushKick(b);
    requestPushRegistration();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const a = jest.fn();
    const unsub = subscribePushKick(a);
    unsub();
    requestPushRegistration();
    expect(a).not.toHaveBeenCalled();
  });
});
