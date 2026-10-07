/**
 * Calm Mint v2 R3 "You're verified" and the onboarding Cta (rider audit FR-L1 / FR-L2 / FR-L5): a double
 * tap on "Go online" starts ONE permission flow, the "papers later" link reaches the tap-target token by
 * slop without changing its drawn 24px line, and a busy Cta shows a spinner instead of just fading.
 */
import React from "react";
import { ActivityIndicator } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { tokens } from "@lynia/shared/tokens";
import { Cta } from "../onboarding/kit";
import { RiderVerified } from "../onboarding/rider";

const METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

function render(el: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  return tree;
}
const goOnline = (t: renderer.ReactTestRenderer) => t.root.findAll((n) => n.props.accessibilityLabel === "Go online" && typeof n.props.onPress === "function")[0]!;

describe("R3 · You're verified", () => {
  it("FR-L1: a double tap on 'Go online' starts the flow once, and it can start again once that settles", async () => {
    let finish!: () => void;
    const onGoOnline = jest.fn(() => new Promise<void>((r) => (finish = r)));
    const tree = render(<RiderVerified firstName="Tendai" onGoOnline={onGoOnline} onPapers={jest.fn()} />);
    await act(async () => {
      goOnline(tree).props.onPress();
      goOnline(tree).props.onPress();
    });
    expect(onGoOnline).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    await act(async () => finish());
    await act(async () => goOnline(tree).props.onPress());
    expect(onGoOnline).toHaveBeenCalledTimes(2);
    act(() => tree.unmount());
  });

  it("FR-L2: the 'papers later' link keeps its 24px line and reaches the tap-target token by slop", () => {
    const onPapers = jest.fn();
    const tree = render(<RiderVerified firstName={null} onGoOnline={jest.fn()} onPapers={onPapers} />);
    const link = tree.root.findAll((n) => n.props.testID === "r3-papers" && typeof n.props.onPress === "function")[0]!;
    const { top, bottom } = link.props.hitSlop as { top: number; bottom: number };
    expect(24 + top + bottom).toBe(tokens.touchTargetMin);
    act(() => link.props.onPress());
    expect(onPapers).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});

describe("onboarding Cta", () => {
  it("FR-L5: busy shows a spinner (not just a fade) and holds taps", () => {
    const tree = render(<Cta label="Start ID check" onPress={jest.fn()} busy />);
    expect(tree.root.findAll((n) => n.props.testID === "cta-busy").length).toBeGreaterThan(0);
    const btn = tree.root.findAll((n) => n.props.accessibilityLabel === "Start ID check" && n.props.accessibilityState != null)[0]!;
    expect(btn.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    act(() => tree.unmount());
  });

  it("idle shows no spinner", () => {
    const tree = render(<Cta label="Start ID check" onPress={jest.fn()} />);
    expect(tree.root.findAll((n) => n.props.testID === "cta-busy")).toHaveLength(0);
    act(() => tree.unmount());
  });
});
