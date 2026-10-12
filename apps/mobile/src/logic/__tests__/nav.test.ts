import { backToRiderBoard, goHomeClearingStack, replaceClearingStack } from "../nav";

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

describe("replaceClearingStack (C-1 / C-2: auth transitions leave nothing behind)", () => {
  it("dismisses the stack, then replaces — with any href shape", () => {
    const calls: string[] = [];
    const router = {
      dismissAll: jest.fn(() => calls.push("dismissAll")),
      replace: jest.fn((href: string | { pathname: string }) => calls.push(`replace:${typeof href === "string" ? href : href.pathname}`)),
    };
    replaceClearingStack(router, { pathname: "/profile/setup" });
    expect(calls).toEqual(["dismissAll", "replace:/profile/setup"]);
  });

  it("skips dismissAll when there is nothing to pop (cold start straight onto the screen)", () => {
    const router = { dismissAll: jest.fn(), replace: jest.fn(), canDismiss: () => false };
    replaceClearingStack(router, "/phone");
    expect(router.dismissAll).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/phone");
  });

  it("dismisses when the router says it can", () => {
    const router = { dismissAll: jest.fn(), replace: jest.fn(), canDismiss: () => true };
    replaceClearingStack(router, "/home");
    expect(router.dismissAll).toHaveBeenCalledTimes(1);
  });
});

describe("backToRiderBoard (a job screen must not stack a second board)", () => {
  const nav = () => ({ dismissTo: jest.fn(), dismissAll: jest.fn(), replace: jest.fn() });

  it("pops back to the rider tabs when they are in the history", () => {
    const router = nav();
    backToRiderBoard(router, [{ name: "rider/(tabs)" }, { name: "rider/job" }]);
    expect(router.dismissTo).toHaveBeenCalledWith("/rider");
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.dismissAll).not.toHaveBeenCalled();
  });

  it("clears the stack onto the board when the rider tabs are not in the history", () => {
    const router = nav();
    backToRiderBoard(router, [{ name: "(tabs)" }, { name: "rider/job" }]);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.dismissAll).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/rider");
  });

  it("clears the stack onto the board when the stack is unknown", () => {
    const router = nav();
    backToRiderBoard(router, undefined);
    expect(router.dismissTo).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith("/rider");
  });
});
