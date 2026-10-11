/**
 * P0-3 (navigation review 2026-08-12): while a food order is being placed, the screen must not be
 * escapable — the "placing" beat promises nothing is ordered if the user waits, so a mid-flight pop
 * (Android back / iOS swipe) that dropped them on the cleared cart is a bug. This guards both exits.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { BackHandler } from "react-native";
import { usePlacingGuard } from "../use-placing-guard";

const mockSetOptions = jest.fn();
type BeforeRemove = (e: { preventDefault: () => void }) => void;
const mockListeners: BeforeRemove[] = [];
const mockAddListener = jest.fn((_event: string, cb: BeforeRemove) => {
  mockListeners.push(cb);
  return () => {
    mockListeners.splice(mockListeners.indexOf(cb), 1);
  };
});
jest.mock("expo-router", () => ({
  useNavigation: () => ({ setOptions: mockSetOptions, addListener: mockAddListener }),
}));

let release: (() => void) | null = null;
function Harness({ active }: { active: boolean }): React.ReactElement | null {
  release = usePlacingGuard(active);
  return null;
}

/** Fire `beforeRemove` the way the navigator does; true when a listener refused the removal. */
function tryRemove(): boolean {
  const preventDefault = jest.fn();
  mockListeners.forEach((cb) => cb({ preventDefault }));
  return preventDefault.mock.calls.length > 0;
}

describe("usePlacingGuard", () => {
  let addSpy: jest.SpyInstance;
  let removeHandler: jest.Mock;

  beforeEach(() => {
    mockSetOptions.mockClear();
    mockAddListener.mockClear();
    mockListeners.length = 0;
    removeHandler = jest.fn();
    addSpy = jest.spyOn(BackHandler, "addEventListener").mockReturnValue({ remove: removeHandler } as never);
  });
  afterEach(() => addSpy.mockRestore());

  it("swallows hardware back and disables the swipe gesture while active", () => {
    let handler: (() => boolean) | undefined;
    addSpy.mockImplementation((event: string, cb: () => boolean) => {
      if (event === "hardwareBackPress") handler = cb;
      return { remove: removeHandler } as never;
    });

    act(() => {
      renderer.create(<Harness active={true} />);
    });

    expect(mockSetOptions).toHaveBeenCalledWith({ gestureEnabled: false });
    expect(addSpy).toHaveBeenCalledWith("hardwareBackPress", expect.any(Function));
    // Returning true tells Android the app handled the press — i.e. do NOT pop the screen.
    expect(handler?.()).toBe(true);
  });

  it("does not register a back handler when inactive, and re-enables the gesture", () => {
    act(() => {
      renderer.create(<Harness active={false} />);
    });
    expect(mockSetOptions).toHaveBeenCalledWith({ gestureEnabled: true });
    expect(addSpy).not.toHaveBeenCalled();
  });

  it("removes the back handler once placing ends", () => {
    let root: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<Harness active={true} />);
    });
    expect(addSpy).toHaveBeenCalledTimes(1);
    act(() => {
      root.update(<Harness active={false} />);
    });
    // The active→inactive transition tears down the subscription and re-enables the gesture.
    expect(removeHandler).toHaveBeenCalledTimes(1);
    expect(mockSetOptions).toHaveBeenLastCalledWith({ gestureEnabled: true });
  });

  // U24 (reviewed list 2026-10-07): the web's browser Back is neither a hardware press nor a swipe — it is a
  // plain removal of the screen, which `beforeRemove` sees.
  it("U24: refuses every other removal (the web's browser Back) while active, and lifts it when placing ends", () => {
    let root!: renderer.ReactTestRenderer;
    act(() => {
      root = renderer.create(<Harness active={true} />);
    });
    expect(mockAddListener).toHaveBeenCalledWith("beforeRemove", expect.any(Function));
    expect(tryRemove()).toBe(true);
    act(() => {
      root.update(<Harness active={false} />);
    });
    expect(mockListeners).toHaveLength(0);
    expect(tryRemove()).toBe(false);
  });

  it("U24: release() lets the screen's own exit through (the placed order replacing the stack)", () => {
    act(() => {
      renderer.create(<Harness active={true} />);
    });
    expect(tryRemove()).toBe(true);
    release!();
    expect(tryRemove()).toBe(false);
  });

  it("is not registered while inactive", () => {
    act(() => {
      renderer.create(<Harness active={false} />);
    });
    expect(mockAddListener).not.toHaveBeenCalled();
  });
});
