/**
 * Owner instruction, 2026-08-12: "error cards must just display once and go — which is when an action
 * is attempted and there is an error." `useActionError` / `useActionErrorEffect` (src/ui/Toast.tsx)
 * are how every action failure now reaches the user, replacing the persistent red `<ErrorText>` line
 * that used to camp under the button until some later success cleared it.
 *
 * The property that actually needs pinning is the REPEAT: tap retry, fail again with byte-identical
 * copy, and the user must still be told. The obvious `useState`-based implementation silently swallows
 * that (React bails out when the value is unchanged, so the effect never re-runs and the second
 * failure is mute) — which would be worse than the persistent line it replaced, because the user would
 * be left with no feedback at all on the attempt they're most anxious about.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider, TOAST_DURATION_MS, useActionError, useActionErrorEffect } from "../Toast";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

function texts(tree: renderer.ReactTestRenderer): string[] {
  return tree.root
    .findAllByType(Text)
    .map((n) => (typeof n.props.children === "string" ? n.props.children : ""))
    .filter(Boolean);
}
function shows(tree: renderer.ReactTestRenderer, msg: string): boolean {
  return texts(tree).includes(msg);
}

/** A button-ish harness: calling `fire(msg)` is "the user attempted an action and it failed". */
let fire: (msg?: string | null) => void = () => undefined;
function Harness(): React.ReactElement {
  fire = useActionError();
  return <Text>harness</Text>;
}

/** The derived-from-mutation variant: re-renders with whatever Error object it's handed. */
function EffectHarness({ error }: { error: unknown }): React.ReactElement {
  useActionErrorEffect(error);
  return <Text>effect-harness</Text>;
}

function mount(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <ToastProvider>{node}</ToastProvider>
      </SafeAreaProvider>,
    );
  });
  return tree;
}

let activeTree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  jest.useRealTimers();
});

describe("useActionError — an action failure speaks once, then clears itself", () => {
  it("shows the screen's curated copy when an action fails", () => {
    activeTree = mount(<Harness />);
    expect(shows(activeTree, "Couldn't send the offer.")).toBe(false);

    act(() => fire("Couldn't send the offer."));
    expect(shows(activeTree, "Couldn't send the offer.")).toBe(true);
  });

  it("clears itself after the toast duration — nothing camps on the screen", () => {
    jest.useFakeTimers();
    activeTree = mount(<Harness />);

    act(() => fire("Couldn't send the offer."));
    expect(shows(activeTree, "Couldn't send the offer.")).toBe(true);

    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS + 500);
    });
    expect(shows(activeTree, "Couldn't send the offer.")).toBe(false);
  });

  // THE regression that matters: retry #2 failing identically must not be mute.
  it("speaks AGAIN on a second failure with byte-identical copy", () => {
    jest.useFakeTimers();
    activeTree = mount(<Harness />);

    act(() => fire("Couldn't send the offer."));
    expect(shows(activeTree, "Couldn't send the offer.")).toBe(true);

    // Let the first one dismiss, exactly as it would while the rider re-taps.
    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS + 500);
    });
    expect(shows(activeTree, "Couldn't send the offer.")).toBe(false);

    // Same message, second attempt — the user must be told again.
    act(() => fire("Couldn't send the offer."));
    expect(shows(activeTree, "Couldn't send the offer.")).toBe(true);
  });

  it("a null/undefined raise is a no-op — the old `setError(null)` clear has nothing to do", () => {
    activeTree = mount(<Harness />);
    act(() => fire(null));
    act(() => fire(undefined));
    expect(texts(activeTree).filter((t) => t !== "harness")).toHaveLength(0);
  });

  it("a newer failure replaces the visible one rather than stacking a wall", () => {
    activeTree = mount(<Harness />);
    act(() => fire("First problem."));
    act(() => fire("Second problem."));
    expect(shows(activeTree, "Second problem.")).toBe(true);
    expect(shows(activeTree, "First problem.")).toBe(false);
  });
});

describe("useActionErrorEffect — the derived-from-mutation variant", () => {
  it("speaks when a mutation's error object arrives", () => {
    activeTree = mount(<EffectHarness error={null} />);
    expect(shows(activeTree, "Network unreachable")).toBe(false);

    act(() => {
      activeTree!.update(
        <SafeAreaProvider initialMetrics={TEST_METRICS}>
          <ToastProvider>
            <EffectHarness error={new Error("Network unreachable")} />
          </ToastProvider>
        </SafeAreaProvider>,
      );
    });
    expect(shows(activeTree, "Network unreachable")).toBe(true);
  });

  // Keyed on the Error OBJECT, not its message: React Query mints a fresh Error per failed attempt,
  // so an identical-copy retry still changes identity and still speaks.
  it("speaks again for a NEW Error object carrying identical copy", () => {
    jest.useFakeTimers();
    const render = (err: unknown): void => {
      act(() => {
        activeTree!.update(
          <SafeAreaProvider initialMetrics={TEST_METRICS}>
            <ToastProvider>
              <EffectHarness error={err} />
            </ToastProvider>
          </SafeAreaProvider>,
        );
      });
    };
    activeTree = mount(<EffectHarness error={null} />);

    render(new Error("Network unreachable"));
    expect(shows(activeTree, "Network unreachable")).toBe(true);

    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS + 500);
    });
    expect(shows(activeTree, "Network unreachable")).toBe(false);

    render(new Error("Network unreachable")); // fresh object, same words
    expect(shows(activeTree, "Network unreachable")).toBe(true);
  });

  it("ignores a non-Error value (a settled mutation's null error re-render)", () => {
    activeTree = mount(<EffectHarness error={null} />);
    expect(texts(activeTree).filter((t) => t !== "effect-harness")).toHaveLength(0);
  });
});
