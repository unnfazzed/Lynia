/**
 * U40 — the browser's Back on a stepped screen (src/logic/web-back-guard.ts). A fake window stands in for
 * the browser: `pushState` / `back()` move along a real entry stack and `back()` fires popstate, as a
 * browser does.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { BACK_GUARD_MARK, type BackGuardWindow, createWebBackGuard, useWebBackGuard } from "../web-back-guard";

function fakeWindow() {
  const entries: unknown[] = [{ id: "router-1" }];
  let index = 0;
  const listeners = new Set<() => void>();
  const fire = (): void => listeners.forEach((l) => l());
  const win: BackGuardWindow & { entries: unknown[]; userBack: () => void; userForward: () => void; index: () => number } = {
    entries,
    index: () => index,
    history: {
      get state() {
        return entries[index];
      },
      pushState(data: unknown) {
        entries.splice(index + 1);
        entries.push(data);
        index = entries.length - 1;
      },
      back() {
        if (index === 0) return;
        index -= 1;
        fire();
      },
    },
    location: { href: "https://app.lyniago.com/send" },
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
    userBack: () => win.history.back(),
    userForward: () => {
      if (index < entries.length - 1) {
        index += 1;
        fire();
      }
    },
  };
  return win;
}

describe("createWebBackGuard (U40)", () => {
  it("a browser Back pops the guard entry and runs the screen's back(), not the router's", () => {
    const win = fakeWindow();
    const onBack = jest.fn();
    const g = createWebBackGuard(win, onBack);
    g.arm();
    expect(win.entries).toHaveLength(2);
    // The guard entry keeps the router's id, so the router reads it as the same screen.
    expect(win.entries[1]).toEqual({ id: "router-1", [BACK_GUARD_MARK]: true });
    g.arm(); // idempotent
    expect(win.entries).toHaveLength(2);
    win.userBack();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(g.isArmed()).toBe(false);
    expect(win.index()).toBe(0);
  });

  it("disarm takes its own entry off without running back(); a Back with no guard is the router's", () => {
    const win = fakeWindow();
    const onBack = jest.fn();
    const g = createWebBackGuard(win, onBack);
    g.arm();
    g.disarm();
    expect(win.index()).toBe(0);
    expect(onBack).not.toHaveBeenCalled();
    win.userBack(); // nothing behind entry 0 here; and nothing armed either way
    expect(onBack).not.toHaveBeenCalled();
  });

  it("release resolves once the guard entry is gone, before the screen navigates away", async () => {
    const win = fakeWindow();
    const g = createWebBackGuard(win, jest.fn());
    await expect(g.release()).resolves.toBeUndefined(); // nothing armed: immediate
    g.arm();
    await g.release();
    expect(win.index()).toBe(0);
    expect(g.isArmed()).toBe(false);
  });

  it("a Forward back onto a guard entry counts as armed again", () => {
    const win = fakeWindow();
    const onBack = jest.fn();
    const g = createWebBackGuard(win, onBack);
    g.arm();
    win.userBack();
    win.userForward();
    expect(g.isArmed()).toBe(true);
    win.userBack();
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});

describe("createWebBackGuard after a reload (U40 review)", () => {
  it("a reload on a guarded step adopts the guard entry it lands on — no second entry, one Back walks one step", () => {
    const win = fakeWindow();
    win.history.pushState({ id: "router-1", [BACK_GUARD_MARK]: true }, "");
    const onBack = jest.fn();
    // The page reloads: a new guard over the same history, sitting on the guard entry.
    const g = createWebBackGuard(win, onBack);
    g.arm();
    expect(win.entries).toHaveLength(2);
    expect(g.isArmed()).toBe(true);
    win.userBack();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(win.index()).toBe(0);
  });
});

describe("useWebBackGuard (U40)", () => {
  let seenStep = 0;
  function Probe({ start, win }: { start: number; win: BackGuardWindow }): null {
    const [step, setStep] = React.useState(start);
    seenStep = step;
    useWebBackGuard(step > 1, () => setStep((s) => s - 1), win);
    return null;
  }

  it("guards while there is a step to walk back, re-arms after each guarded Back, and lets step 1 go", () => {
    const win = fakeWindow();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Probe start={3} win={win} />);
    });
    expect(win.entries).toHaveLength(2);
    act(() => win.userBack()); // 3 → 2, guarded again
    expect(seenStep).toBe(2);
    expect(win.index()).toBe(1);
    act(() => win.userBack()); // 2 → 1, no guard left: the next Back is the router's
    expect(seenStep).toBe(1);
    expect(win.index()).toBe(0);
    act(() => tree.unmount());
  });

  it("is a no-op without a browser window (Android and iOS)", () => {
    const onBack = jest.fn();
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<NoWin onBack={onBack} />);
    });
    act(() => tree.unmount());
    expect(onBack).not.toHaveBeenCalled();
  });
});

function NoWin({ onBack }: { onBack: () => void }): null {
  // jest runs as iOS: the default window lookup finds none.
  useWebBackGuard(true, onBack);
  return null;
}
