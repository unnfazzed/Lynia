import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { StyleSheet, Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { pushToast, ToastProvider, TOAST_DURATION_MS, useToast, type ToastMessage } from "../Toast";

const msg = (id: number, text = `t${id}`): ToastMessage => ({ id, text, tone: "info" });

describe("pushToast", () => {
  it("puts the newest at the head", () => {
    const q = pushToast([msg(1)], msg(2));
    expect(q[0]?.id).toBe(2);
    expect(q[1]?.id).toBe(1);
  });

  it("caps the queue so a burst can't stack endlessly", () => {
    let q: ToastMessage[] = [];
    for (let i = 1; i <= 6; i++) q = pushToast(q, msg(i));
    expect(q.length).toBe(3);
    // Newest three survive.
    expect(q.map((m) => m.id)).toEqual([6, 5, 4]);
  });

  it("de-dupes by id (re-raising the same id floats it, doesn't duplicate)", () => {
    const q = pushToast([msg(1), msg(2)], msg(2));
    expect(q.filter((m) => m.id === 2).length).toBe(1);
    expect(q[0]?.id).toBe(2);
  });

  it("respects a custom max", () => {
    const q = pushToast([msg(1), msg(2)], msg(3), 2);
    expect(q.length).toBe(2);
    expect(q.map((m) => m.id)).toEqual([3, 1]);
  });
});

/**
 * The look (ledger D-82 §2 #4, owner 2026-10-06): the shared toast is the First Run v2 bottom toast,
 * app-wide — `forest`, radius 14, padding 14 16, white 600 14, a 20 brand check, 96 above the bottom
 * (+ the safe-area inset), gone after 2.5s. The old white top strip is retired.
 */
describe("ToastProvider — the bottom forest toast", () => {
  const METRICS = { insets: { top: 24, left: 0, right: 0, bottom: 20 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

  let show: (text: string, tone?: "info" | "success" | "warning") => void = () => undefined;
  function Raiser(): React.ReactElement {
    show = useToast().show;
    return <Text>screen</Text>;
  }
  const mount = (): renderer.ReactTestRenderer => {
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SafeAreaProvider initialMetrics={METRICS}>
          <ToastProvider>
            <Raiser />
          </ToastProvider>
        </SafeAreaProvider>,
      );
    });
    return tree;
  };
  afterEach(() => jest.useRealTimers());

  it("auto-dismisses after 2.5s", () => {
    expect(TOAST_DURATION_MS).toBe(2500);
  });

  it("sits 96 above the bottom inset, full width minus the 16 gutter, as the forest bar with a brand check", () => {
    jest.useFakeTimers();
    const tree = mount();
    act(() => show("Delivering to 12 Samora Machel Ave", "success"));
    const host = tree.root.find((n) => n.props.testID === "app-toast" && n.props.style);
    expect(StyleSheet.flatten(host.props.style)).toMatchObject({ position: "absolute", bottom: 20 + 96, left: 16, right: 16 });
    const bar = tree.root.find((n) => n.props.testID === "first-run-toast" && n.props.style);
    expect(StyleSheet.flatten(bar.props.style)).toMatchObject({ backgroundColor: tokens.color.forest, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 });
    const label = tree.root.findAllByType(Text).find((n) => n.props.children === "Delivering to 12 Samora Machel Ave")!;
    expect(StyleSheet.flatten(label.props.style)).toMatchObject({ fontSize: 14, fontWeight: 600, color: tokens.color.onAccent });
    expect(tree.root.findAll((n) => n.props.size === 20 && n.props.color === tokens.color.accent).length).toBeGreaterThan(0);
    act(() => {
      jest.advanceTimersByTime(TOAST_DURATION_MS + 500);
    });
    expect(tree.root.findAll((n) => n.props.testID === "app-toast")).toHaveLength(0);
    act(() => tree.unmount());
  });

  it("a warning (action failure) keeps the bar but swaps the check for a gold alert", () => {
    const tree = mount();
    act(() => show("Couldn't send the offer.", "warning"));
    expect(tree.root.findAll((n) => n.props.size === 20 && n.props.color === tokens.color.highlight).length).toBeGreaterThan(0);
    act(() => tree.unmount());
  });
});
