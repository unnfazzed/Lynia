import { goHomeClearingStack } from "../nav";

describe("goHomeClearingStack (P2: Back home must not leave a stale composer beneath)", () => {
  it("drops everything above the tab shell (dismissAll) BEFORE selecting home (replace)", () => {
    const calls: string[] = [];
    const router = {
      dismissAll: jest.fn(() => calls.push("dismissAll")),
      replace: jest.fn((href: string) => calls.push(`replace:${href}`)),
    };
    goHomeClearingStack(router);
    // Order matters: dismissAll pops the pushed /send composer + the order screen off the root stack,
    // then replace lands on home — so back from home exits the app, never resurrecting the compose form.
    expect(calls).toEqual(["dismissAll", "replace:/home"]);
    expect(router.replace).toHaveBeenCalledWith("/home");
  });
});
