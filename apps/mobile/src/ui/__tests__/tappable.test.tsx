import React from "react";
import { Platform, Pressable, Text } from "react-native";
import TestRenderer, { act } from "react-test-renderer";

const mockEnqueueTapAck = jest.fn();
jest.mock("../../telemetry/rum", () => ({ enqueueTapAck: () => mockEnqueueTapAck() }));

import { PRESSED_OPACITY, RIPPLE, Tappable } from "../Tappable";
import { consumeTouch, __resetTapSignal } from "../../telemetry/tap-signal";

/**
 * The tappable primitive. The behaviour that matters is not "it renders" — it is that pressing a
 * control on ANDROID costs no JavaScript render, which is the entire point of the fix
 * (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §1.2): the platform ripple paints on the UI
 * thread from the touch event, so it cannot be delayed by a busy JS thread, whereas a
 * `style={({ pressed }) => …}` press state can be and routinely was.
 */

/** jest-expo runs as iOS; flip the platform for the branch under test and always put it back. */
function withPlatform<T>(os: "android" | "ios", fn: () => T): T {
  const original = Platform.OS;
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  try {
    return fn();
  } finally {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  }
}

function renderTappable(props: Partial<React.ComponentProps<typeof Tappable>> = {}) {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(
      <Tappable onPress={() => {}} {...props}>
        <Text>Tap me</Text>
      </Tappable>,
    );
  });
  return tree;
}

beforeEach(() => {
  mockEnqueueTapAck.mockClear();
  __resetTapSignal();
});

describe("Tappable on Android", () => {
  it("hands the press state to the platform ripple and sets NO pressed-style callback", () => {
    withPlatform("android", () => {
      const tree = renderTappable();
      const pressable = tree.root.findByType(Pressable);
      expect(pressable.props.android_ripple).toEqual(RIPPLE.row);
      // The load-bearing assertion: a function style would mean a JS re-render per press, which is
      // exactly the latency the ripple exists to remove. A plain object (or undefined) means the
      // press costs no render at all.
      expect(typeof pressable.props.style).not.toBe("function");
    });
  });

  it("uses a borderless ripple for icon-sized controls and a light one on dark fills", () => {
    withPlatform("android", () => {
      expect(renderTappable({ tone: "icon" }).root.findByType(Pressable).props.android_ripple).toEqual(RIPPLE.icon);
      expect(renderTappable({ tone: "onDark" }).root.findByType(Pressable).props.android_ripple).toEqual(RIPPLE.onDark);
    });
    expect(RIPPLE.icon.borderless).toBe(true);
    // A ripple painted behind an opaque child is invisible; rows and dark fills both draw over.
    expect(RIPPLE.row.foreground).toBe(true);
    expect(RIPPLE.onDark.foreground).toBe(true);
  });
});

describe("Tappable off Android", () => {
  it("falls back to a pressed opacity, preserving the caller's own style", () => {
    withPlatform("ios", () => {
      const tree = renderTappable({ style: { padding: 8 } });
      const style = tree.root.findByType(Pressable).props.style as (s: { pressed: boolean }) => unknown;
      expect(typeof style).toBe("function");
      expect(style({ pressed: false })).toEqual({ padding: 8 });
      expect(style({ pressed: true })).toEqual([{ padding: 8 }, { opacity: PRESSED_OPACITY.row }]);
    });
  });

  it("still resolves a caller style that is itself a function", () => {
    withPlatform("ios", () => {
      const tree = renderTappable({ style: ({ pressed }) => ({ padding: pressed ? 4 : 8 }) });
      const style = tree.root.findByType(Pressable).props.style as (s: { pressed: boolean }) => unknown;
      expect(style({ pressed: false })).toEqual({ padding: 8 });
      expect(style({ pressed: true })).toEqual([{ padding: 4 }, { opacity: PRESSED_OPACITY.row }]);
    });
  });
});

describe("Tappable instrumentation", () => {
  it("records the touch and arms the tap-ack sample on press-in", () => {
    const tree = renderTappable();
    act(() => {
      tree.root.findByType(Pressable).props.onPressIn?.({} as never);
    });
    expect(consumeTouch()).toEqual(expect.any(Number));
    expect(mockEnqueueTapAck).toHaveBeenCalledTimes(1);
  });

  it("still calls the caller's own onPressIn", () => {
    const onPressIn = jest.fn();
    const tree = renderTappable({ onPressIn });
    act(() => {
      tree.root.findByType(Pressable).props.onPressIn?.({} as never);
    });
    expect(onPressIn).toHaveBeenCalledTimes(1);
  });

  it("leaves no touch pending when nothing was pressed", () => {
    renderTappable();
    expect(consumeTouch()).toBeNull();
  });
});
