// @vitest-environment jsdom
import { useEffect } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KitchenConnectionProvider, useKitchenConnection } from "./KitchenConnectionProvider";
import { getAlarmController } from "./alarm-singleton";

/**
 * B-D0 regression pin (LC-B, 2026-08-02). The queue screen's alarm-sync effect
 * (`app/(app)/queue/page.tsx`: `useEffect(() => { unansweredCount > 0 ? alarm.ring() :
 * alarm.silence() }, [unansweredCount, alarm])`) depends on the `alarm` object this provider hands
 * out. Two bugs compounded into an unbounded render loop the instant one order went unanswered:
 * (1) the context `value` (and its nested `alarm`) was a fresh object literal every render, so every
 * consumer — including this effect — saw a new `alarm` identity on every provider re-render; (2)
 * `ring()`/`silence()` bumped the `alarmTick` re-render trigger unconditionally, even when the
 * controller's ringing state hadn't actually changed. Together: effect fires → ring() (a no-op
 * after the first call) → tick bumps anyway → new `alarm` identity → effect fires again → forever.
 * Pinned at the provider level, not queue/page.tsx, since the same hazard applies to any consumer
 * that puts `alarm` (or the whole context value) in a dependency array.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("./alarm-singleton", () => {
  class FakeAlarmController {
    private armedState = false;
    private ringingState = false;
    isArmed(): boolean {
      return this.armedState;
    }
    isRinging(): boolean {
      return this.ringingState;
    }
    arm(): void {
      this.armedState = true;
    }
    resume(): void {}
    start(): void {
      if (this.ringingState) return;
      this.ringingState = true;
    }
    stop(): void {
      this.ringingState = false;
    }
  }
  const controller = new FakeAlarmController();
  return { getAlarmController: () => controller };
});

afterEach(() => {
  getAlarmController().stop();
});

/** Mirrors the queue screen's own alarm-sync effect exactly (app/(app)/queue/page.tsx:52-55). */
function AlarmSyncProbe({ unansweredCount, onRender }: { unansweredCount: number; onRender: () => void }) {
  const { alarm } = useKitchenConnection();
  onRender();
  useEffect(() => {
    if (unansweredCount > 0) alarm.ring();
    else alarm.silence();
  }, [unansweredCount, alarm]);
  return null;
}

describe("KitchenConnectionProvider (B-D0 unbounded render loop)", () => {
  it("settles instead of looping when a consumer syncs the alarm to an unanswered order", async () => {
    let renders = 0;
    await act(async () => {
      render(
        <KitchenConnectionProvider>
          <AlarmSyncProbe
            unansweredCount={1}
            onRender={() => {
              renders += 1;
            }}
          />
        </KitchenConnectionProvider>,
      );
    });

    // A regression to the unconditional-tick-bump bug turns this into a genuine infinite loop
    // (or React's own runaway-update guard). A generous but finite bound catches it either way.
    expect(renders).toBeLessThan(15);
    expect(getAlarmController().isRinging()).toBe(true);
  });

  it("stays settled — no further renders once the alarm state has stabilized", async () => {
    let renders = 0;
    await act(async () => {
      render(
        <KitchenConnectionProvider>
          <AlarmSyncProbe
            unansweredCount={1}
            onRender={() => {
              renders += 1;
            }}
          />
        </KitchenConnectionProvider>,
      );
    });
    const settledAt = renders;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(renders).toBe(settledAt);
  });
});
