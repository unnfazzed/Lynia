// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStepBack } from "./use-step-back";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/login");
});

describe("useStepBack — MJ-M9: leaving a finished step", () => {
  it("leave() never pops history, and a popstate that comes later does not run the step's Back", async () => {
    const onBack = vi.fn();
    const back = vi.spyOn(window.history, "back");
    const { result } = renderHook(() => useStepBack(true, onBack));
    expect(window.history.state?.lyniaStep).toBe(true);
    await act(() => result.current.leave());
    // The caller's router.replace overwrites the step's entry; nothing is popped, so no late popstate can
    // send the next page back to the step's page.
    expect(back).not.toHaveBeenCalled();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onBack).not.toHaveBeenCalled();
  });

  it("the phone's Back while the step is open still runs onBack", () => {
    const onBack = vi.fn();
    renderHook(() => useStepBack(true, onBack));
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
