/**
 * Proves the Text/TextInput render patch (src/ui/fonts.ts) without a device. jest-expo mocks the
 * react-native components, so the patch is exercised through a REAL React.forwardRef component
 * (identical export shape) rendered with react-test-renderer, and the genuine RN modules are
 * shape-checked via jest.requireActual — together covering the review's risk list: the patch
 * applies on this RN version (no silent no-op), the right Inter family lands per fontWeight,
 * explicit families stay untouched, fontWeight is dropped (no Android double-bold), a throwing
 * render never re-enters, and re-application never stacks a second wrapper.
 */
import React from "react";
import { StyleSheet } from "react-native";
import renderer, { act } from "react-test-renderer";
import { applyInterToTextComponents, fontFamilies, interFamily, patchRenderable } from "../fonts";

type AnyProps = Record<string, any>;

/** A real forwardRef component with the same export shape the patch targets on RN's Text/TextInput. */
function makeHarness(): { Comp: any } {
  const Comp = React.forwardRef<unknown, AnyProps>((props, _ref) => React.createElement("RCTLyniaProbe", props));
  return { Comp };
}

function renderedStyle(Comp: any, props: AnyProps): Record<string, any> {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(React.createElement(Comp, props, "x"));
  });
  const host = tree.root.findByType("RCTLyniaProbe" as any);
  return (StyleSheet.flatten(host.props.style as never) ?? {}) as Record<string, any>;
}

describe("interFamily", () => {
  it("maps weights to the three shipped families (500→400, 800→700)", () => {
    expect(interFamily(undefined)).toBe(fontFamilies.regular);
    expect(interFamily(400)).toBe(fontFamilies.regular);
    expect(interFamily("500")).toBe(fontFamilies.regular);
    expect(interFamily(600)).toBe(fontFamilies.semibold);
    expect(interFamily("700")).toBe(fontFamilies.bold);
    expect(interFamily(800)).toBe(fontFamilies.bold);
    expect(interFamily("bold")).toBe(fontFamilies.bold);
  });
});

describe("real react-native export shape (0.76.x)", () => {
  it("the genuine Text and TextInput modules expose a patchable forwardRef .render", () => {
    // jest-expo mocks `react-native`; requireActual reaches the real modules the device runs.
    const RealText = jest.requireActual("react-native/Libraries/Text/Text");
    const RealTextInput = jest.requireActual("react-native/Libraries/Components/TextInput/TextInput");
    for (const mod of [RealText, RealTextInput]) {
      const Comp = mod.default ?? mod;
      expect(typeof (Comp as any).render).toBe("function");
      expect(patchRenderable(Comp as any)).toBe(true);
      expect((Comp as any).render.__lyniaInterPatched).toBe(true);
    }
  });

  it("applyInterToTextComponents ran on import without warning (no silent no-op path)", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    applyInterToTextComponents();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("patched render behavior", () => {
  it("injects the regular family on an unstyled element (fast path)", () => {
    const { Comp } = makeHarness();
    expect(patchRenderable(Comp)).toBe(true);
    expect(renderedStyle(Comp, {}).fontFamily).toBe(fontFamilies.regular);
  });

  it("maps fontWeight to the matching family and drops fontWeight from the style", () => {
    const { Comp } = makeHarness();
    patchRenderable(Comp);
    const style = renderedStyle(Comp, { style: { fontWeight: "700", fontSize: 24 } });
    expect(style.fontFamily).toBe(fontFamilies.bold);
    expect(style.fontWeight).toBeUndefined();
    expect(style.fontSize).toBe(24); // the rest of the style survives
  });

  it("maps 600 to semibold across style arrays", () => {
    const { Comp } = makeHarness();
    patchRenderable(Comp);
    const style = renderedStyle(Comp, { style: [{ fontWeight: "600" }, { color: "#14181B" }] });
    expect(style.fontFamily).toBe(fontFamilies.semibold);
    expect(style.color).toBe("#14181B");
  });

  it("leaves an explicit fontFamily untouched (deliberate overrides keep face + weight)", () => {
    const { Comp } = makeHarness();
    patchRenderable(Comp);
    const style = renderedStyle(Comp, { style: { fontFamily: "SpaceMono", fontWeight: "700" } });
    expect(style.fontFamily).toBe("SpaceMono");
    expect(style.fontWeight).toBe("700");
  });

  it("calls the original render exactly once even when style computation throws", () => {
    let calls = 0;
    const Comp: any = {
      render: (props: AnyProps, _ref: unknown) => {
        calls += 1;
        return React.createElement("RCTLyniaProbe", props);
      },
    };
    patchRenderable(Comp);
    // A style whose flatten throws (getter bomb) must fall back to untouched props, one call.
    const bomb = {};
    Object.defineProperty(bomb, "fontFamily", {
      get() {
        throw new Error("boom");
      },
      enumerable: true,
    });
    const out = Comp.render({ style: bomb }, null);
    expect(calls).toBe(1);
    expect(out.props.style).toBe(bomb); // untouched → system font fallback
  });

  it("never stacks a second wrapper on re-application (Fast Refresh guard)", () => {
    const { Comp } = makeHarness();
    patchRenderable(Comp);
    const once = Comp.render;
    patchRenderable(Comp);
    patchRenderable(Comp);
    expect(Comp.render).toBe(once);
  });
});
