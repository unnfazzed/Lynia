/**
 * The rider job screen's "Back" button used to navigate away unconditionally, even mid-delivery —
 * silently tearing down useRiderLocationStream/useRiderJobSocket (both gated on the screen staying
 * mounted) and going dark on the customer's live tracking with zero warning. LeaveJobButton gates
 * that with a confirm while the job is active; an inactive/terminal caller still navigates straight
 * through with no interruption.
 */
import { Alert } from "react-native";
import React from "react";
import renderer, { act } from "react-test-renderer";
import { LeaveJobButton } from "../LeaveJobButton";

function pressBack(tree: renderer.ReactTestRenderer): void {
  const node = tree.root.findAll((n) => n.props.children === "Back")[0];
  let p: typeof node | null = node;
  while (p && typeof p.props.onPress !== "function") p = p.parent;
  act(() => p!.props.onPress());
}

describe("LeaveJobButton", () => {
  it("navigates straight through with no confirm when the job isn't active", () => {
    const onLeave = jest.fn();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const tree = renderer.create(<LeaveJobButton isActive={false} onLeave={onLeave} />);
    pressBack(tree);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("shows a confirm instead of navigating immediately when the job is active", () => {
    const onLeave = jest.fn();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const tree = renderer.create(<LeaveJobButton isActive={true} onLeave={onLeave} />);
    pressBack(tree);
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(onLeave).not.toHaveBeenCalled();
    const [title, message] = alertSpy.mock.calls[0]!;
    expect(title).toMatch(/leave this delivery/i);
    expect(message).toMatch(/live tracking pauses/i);
    alertSpy.mockRestore();
  });

  it("navigates only once the rider confirms \"Leave anyway\"", () => {
    const onLeave = jest.fn();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const tree = renderer.create(<LeaveJobButton isActive={true} onLeave={onLeave} />);
    pressBack(tree);
    const buttons = alertSpy.mock.calls[0]![2]!;
    const leave = buttons.find((b) => b.text === "Leave anyway")!;
    leave.onPress?.();
    expect(onLeave).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it("does NOT navigate when the rider taps \"Stay\"", () => {
    const onLeave = jest.fn();
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    const tree = renderer.create(<LeaveJobButton isActive={true} onLeave={onLeave} />);
    pressBack(tree);
    const buttons = alertSpy.mock.calls[0]![2]!;
    const stay = buttons.find((b) => b.text === "Stay")!;
    expect(stay.onPress).toBeUndefined();
    expect(onLeave).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
