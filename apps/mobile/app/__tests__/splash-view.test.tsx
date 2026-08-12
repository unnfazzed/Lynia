/**
 * LJ.splash (mock screens.jsx `Splash`) — the brand-green boot moment: a centred column on the accent
 * green with the 104px dove inverted for the green ground and the 32px LyniaGo wordmark in white.
 * The wordmark is the OUTLINED Fredoka-600 vector (src/ui/Brand.tsx) because no Fredoka font file
 * ships — a plain <Text> would silently substitute Inter and stop matching the drawn letterforms.
 */
import { tokens } from "@lynia/shared";
import React from "react";
import renderer, { act } from "react-test-renderer";

import { SplashView } from "../splash.view";
import { DoveMark, Wordmark } from "../../src/ui/Brand";

function render(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SplashView />);
  });
  return tree;
}

describe("splash matches its mock", () => {
  it("is an accent-green centred column with the mock's 18px gap", () => {
    const root = render().toJSON();
    const style = Array.isArray(root) ? undefined : (root?.props as { style?: Record<string, unknown> })?.style;
    expect(style).toMatchObject({
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 18,
      backgroundColor: tokens.color.accent,
    });
  });

  it("draws the 104px green-ground dove and the 32px white wordmark", () => {
    const tree = render();
    const dove = tree.root.findByType(DoveMark);
    expect(dove.props).toMatchObject({ size: 104, on: "green" });
    const wordmark = tree.root.findByType(Wordmark);
    expect(wordmark.props).toMatchObject({ size: 32, color: tokens.color.onAccent });
  });
});
