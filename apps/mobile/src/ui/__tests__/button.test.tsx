import React from "react";
import { ActivityIndicator, Pressable, Text } from "react-native";
import renderer from "react-test-renderer";
import { Button } from "../index";

/**
 * ALR-09: mutations keep the default `networkMode:"online"`, so a tap while offline PAUSES a
 * mutation rather than sending it — `isPending` stays true for the whole outage, same as a request
 * genuinely in flight. Pre-fix, every Button bound to `loading={mutation.isPending}` rendered the
 * same bare spinner either way, so an offline tap looked identical to progress with no indication
 * anything was waiting on a connection. `loading="queued"` is the distinct third state that fixes
 * this — see query/client.ts's `pendingOrQueued`, which callers derive it from.
 */
function textOf(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode).map(String));
}

describe("Button loading tri-state (ALR-09)", () => {
  it("renders the plain label when idle", () => {
    const tree = renderer.create(<Button label="Confirm" onPress={() => {}} />);
    expect(textOf(tree)).toContain("Confirm");
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(0);
  });

  it("renders a spinner, not the label, while genuinely pending (loading: true)", () => {
    const tree = renderer.create(<Button label="Confirm" onPress={() => {}} loading />);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(1);
    expect(textOf(tree)).not.toContain("Confirm");
  });

  it("renders an honest queued cue — no spinner, no lie that it's in flight — when loading: \"queued\"", () => {
    const tree = renderer.create(<Button label="Confirm" onPress={() => {}} loading="queued" />);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBe(0);
    expect(textOf(tree)).not.toContain("Confirm");
    expect(textOf(tree).some((t) => t.includes("Waiting to reconnect"))).toBe(true);
  });

  it("disables the press target while queued, same as while genuinely pending", () => {
    const onPress = jest.fn();
    const tree = renderer.create(<Button label="Confirm" onPress={onPress} loading="queued" />);
    const pressable = tree.root.findByType(Pressable);
    expect(pressable.props.disabled).toBe(true);
  });
});
