/**
 * CodeInput — the kit's digit-box code entry (6-box hand-off, 4-box pickup). The grid is a rendering
 * of ONE hidden TextInput, so what matters is that input's contract: digits only, hard length cap,
 * OS one-time-code autofill hints, and a per-digit box for each expected character.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";

import { CodeInput } from "../CodeInput";

function render(el: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
}

function boxDigits(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType("Text" as never).map((n) => (typeof n.props.children === "string" ? n.props.children : ""));
}

describe("CodeInput", () => {
  it("renders one box per expected digit and fills them from the value", () => {
    const tree = render(<CodeInput length={6} value="418" onChangeText={() => {}} accessibilityLabel="Delivery code" />);
    const digits = boxDigits(tree);
    expect(digits).toHaveLength(6);
    expect(digits.slice(0, 3)).toEqual(["4", "1", "8"]);
    expect(digits.slice(3)).toEqual(["", "", ""]);
  });

  it("sanitizes to digits and caps at the length", () => {
    const seen: string[] = [];
    const tree = render(<CodeInput length={4} value="" onChangeText={(v) => seen.push(v)} accessibilityLabel="Pickup code" />);
    const input = tree.root.findByType("TextInput" as never);
    act(() => {
      input.props.onChangeText("12a3-4567");
    });
    expect(seen).toEqual(["1234"]);
  });

  it("targets OS one-time-code autofill at the hidden input", () => {
    const tree = render(<CodeInput length={6} value="" onChangeText={() => {}} accessibilityLabel="Delivery code" />);
    const input = tree.root.findByType("TextInput" as never);
    expect(input.props.autoComplete).toBe("sms-otp");
    expect(input.props.textContentType).toBe("oneTimeCode");
    expect(input.props.keyboardType).toBe("number-pad");
    expect(input.props.maxLength).toBe(6);
  });

  it("locks the input when disabled", () => {
    const tree = render(<CodeInput length={6} value="123456" onChangeText={() => {}} accessibilityLabel="Delivery code" disabled />);
    expect(tree.root.findByType("TextInput" as never).props.editable).toBe(false);
  });
});
