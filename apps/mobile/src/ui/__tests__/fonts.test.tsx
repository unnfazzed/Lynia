/**
 * Proves the Text/TextInput Inter patch (src/ui/fonts.ts) without a device, for both component shapes
 * it handles:
 *  - React Native 0.81 (Expo SDK 54): Text and TextInput are plain function components, so the
 *    `Text`/`TextInput` accessors on react-native's index exports are redefined to return a wrapper.
 *    The genuine index is shape-checked in an isolated module registry (it is already patched in this
 *    one), and the live `import { Text } from "react-native"` path is rendered end to end (jest-expo's
 *    Text mock sits behind the same accessor).
 *  - forwardRef components (react-native-web in the parity lane) keep the in-place `render` patch.
 * Together this covers the review's risk list: the patch applies on this RN version (no silent
 * no-op), the right Inter family lands per fontWeight, explicit families stay untouched, fontWeight is
 * dropped (no Android double-bold), a throwing style computation falls back instead of crashing,
 * re-application never stacks a second wrapper, and the one path the patch cannot reach
 * (`Animated.Text`) sets its family itself.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import React from "react";
import { StyleSheet, Text, TextInput } from "react-native";
import renderer from "react-test-renderer";
import { renderSync } from "../../testing/render-sync";
import {
  applyInterToTextComponents,
  fontFamilies,
  interFamily,
  patchExport,
  patchRenderable,
  withInterFont,
} from "../fonts";

type AnyProps = Record<string, any>;

/** Flattened style of the first host node (string type) in the rendered tree. */
function hostStyle(element: React.ReactElement): Record<string, any> {
  const tree: renderer.ReactTestRenderer = renderSync(element);
  const host = tree.root.find((n) => typeof n.type === "string");
  return (StyleSheet.flatten(host.props.style as never) ?? {}) as Record<string, any>;
}

/** A style whose flatten throws (getter bomb). */
function bombStyle(): object {
  const bomb = {};
  Object.defineProperty(bomb, "fontFamily", {
    get() {
      throw new Error("boom");
    },
    enumerable: true,
  });
  return bomb;
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

describe("withInterFont", () => {
  it("injects the regular family on an unstyled element (fast path)", () => {
    expect((withInterFont({}) as AnyProps).style).toEqual({ fontFamily: fontFamilies.regular });
  });

  it("maps fontWeight to the matching family and drops fontWeight from the style", () => {
    const style = StyleSheet.flatten((withInterFont({ style: { fontWeight: "700", fontSize: 24 } }) as AnyProps).style);
    expect(style.fontFamily).toBe(fontFamilies.bold);
    expect(style.fontWeight).toBeUndefined();
    expect(style.fontSize).toBe(24); // the rest of the style survives
  });

  it("maps 600 to semibold across style arrays", () => {
    const style = StyleSheet.flatten((withInterFont({ style: [{ fontWeight: "600" }, { color: "#14181B" }] }) as AnyProps).style);
    expect(style.fontFamily).toBe(fontFamilies.semibold);
    expect(style.color).toBe("#14181B");
  });

  it("leaves an explicit fontFamily untouched (deliberate overrides keep face + weight)", () => {
    const props = { style: { fontFamily: "SpaceMono", fontWeight: "700" } };
    expect(withInterFont(props)).toBe(props);
  });

  it("falls back to the untouched props when style computation throws", () => {
    const props = { style: bombStyle() };
    expect(withInterFont(props)).toBe(props);
  });
});

describe("real react-native export shape (0.81.x)", () => {
  it("the genuine index exposes Text and TextInput as configurable accessors (what patchExport redefines)", () => {
    // A fresh registry, because this one's index was patched when ../fonts was imported.
    jest.isolateModules(() => {
      const pristine = require("react-native") as object;
      for (const name of ["Text", "TextInput"]) {
        const descriptor = Object.getOwnPropertyDescriptor(pristine, name);
        expect(typeof descriptor?.get).toBe("function");
        expect(descriptor?.configurable).toBe(true);
      }
    });
  });

  it("the genuine Text and TextInput are plain function components, with no forwardRef render to patch", () => {
    // jest-expo mocks these modules; requireActual reaches the real ones the device runs.
    for (const path of ["react-native/Libraries/Text/Text", "react-native/Libraries/Components/TextInput/TextInput"]) {
      const Real = jest.requireActual(path).default as AnyProps;
      expect(typeof Real).toBe("function");
      expect(Real.render).toBeUndefined();
    }
  });

  it("applyInterToTextComponents ran on import without warning (no silent no-op path)", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    applyInterToTextComponents();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("renders `import { Text } from \"react-native\"` in the weight-matched Inter family", () => {
    expect((Text as AnyProps).__lyniaInterPatched).toBe(true);
    const style = hostStyle(<Text style={{ fontWeight: "700", fontSize: 18 }}>Title</Text>);
    expect(style.fontFamily).toBe(fontFamilies.bold);
    expect(style.fontWeight).toBeUndefined();
    expect(style.fontSize).toBe(18);
  });

  it("patches TextInput too, keeping its static focus helpers", () => {
    expect((TextInput as AnyProps).__lyniaInterPatched).toBe(true);
    expect(typeof (TextInput as AnyProps).State?.currentlyFocusedInput).toBe("function");
    expect(hostStyle(<TextInput style={{ fontWeight: "600" }} />).fontFamily).toBe(fontFamilies.semibold);
  });
});

describe("export patch (React Native 0.81 function components)", () => {
  type Probe = React.FC<AnyProps> & { State?: { currentlyFocusedInput: () => null } };

  /** An exports object shaped like react-native's index: a lazy getter over a function component. */
  function harness(): { exports: { readonly Text: unknown }; Original: Probe } {
    const Original: Probe = (props) => React.createElement("RCTLyniaProbe", props);
    Original.State = { currentlyFocusedInput: () => null };
    return {
      exports: {
        get Text() {
          return Original;
        },
      },
      Original,
    };
  }

  it("renders the original with Inter injected, keeping statics and a readable name", () => {
    const { exports, Original } = harness();
    expect(patchExport(exports, "Text")).toBe(true);
    const Patched = exports.Text as Probe & { displayName?: string; __lyniaOriginal?: unknown };
    expect(Patched).not.toBe(Original);
    expect(Patched.State).toBe(Original.State);
    expect(Patched.displayName).toBe("Text");
    expect(Patched.__lyniaOriginal).toBe(Original);
    expect(hostStyle(<Patched style={{ fontWeight: "600" }} />).fontFamily).toBe(fontFamilies.semibold);
  });

  it("returns the same wrapper on every read, so React never sees a new component type", () => {
    const { exports } = harness();
    patchExport(exports, "Text");
    expect(exports.Text).toBe(exports.Text);
    expect(Object.keys(exports)).toEqual(["Text"]); // still enumerable, like the accessor it replaced
  });

  it("passes `ref` through as the ordinary prop React 19 makes it", () => {
    const Original = ({ ref, ...props }: AnyProps) => {
      React.useImperativeHandle(ref, () => ({ probe: "inner" }));
      return React.createElement("RCTLyniaProbe", props);
    };
    const exports = {
      get Text(): unknown {
        return Original;
      },
    };
    patchExport(exports, "Text");
    const Patched = exports.Text as React.FC<AnyProps>;
    const ref = React.createRef<{ probe: string }>();
    renderSync(<Patched ref={ref} />);
    expect(ref.current?.probe).toBe("inner");
  });

  it("never stacks a second wrapper on re-application (Fast Refresh guard)", () => {
    const { exports, Original } = harness();
    patchExport(exports, "Text");
    const once = exports.Text;
    patchExport(exports, "Text");
    patchExport(exports, "Text");
    expect(exports.Text).toBe(once);
    expect((once as AnyProps).__lyniaOriginal).toBe(Original);
  });

  it("reports a no-op instead of throwing on a non-configurable export (Metro's compiled `export default`)", () => {
    const Original = (): null => null;
    const exports = {};
    Object.defineProperty(exports, "default", { enumerable: true, get: () => Original });
    expect(patchExport(exports, "default")).toBe(false);
    expect((exports as AnyProps).default).toBe(Original);
  });

  it("reports a no-op when there is no function component to wrap", () => {
    expect(patchExport({ Text: undefined }, "Text")).toBe(false);
    expect(patchExport({}, "Text")).toBe(false);
    expect(patchExport(undefined, "Text")).toBe(false);
  });
});

describe("render patch (forwardRef components: react-native-web in the parity lane)", () => {
  function makeHarness(): { Comp: any } {
    const Comp = React.forwardRef<unknown, AnyProps>((props, _ref) => React.createElement("RCTLyniaProbe", props));
    return { Comp };
  }

  it("injects the family through the patched render", () => {
    const { Comp } = makeHarness();
    expect(patchRenderable(Comp)).toBe(true);
    expect(hostStyle(<Comp style={{ fontWeight: "700" }} />).fontFamily).toBe(fontFamilies.bold);
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
    const bomb = bombStyle();
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

describe("paths the patch cannot reach on React Native 0.81", () => {
  const MOBILE_ROOT = resolve(__dirname, "../../..");

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "__tests__" && entry !== "node_modules") out.push(...sourceFiles(full));
      } else if (/\.tsx?$/.test(entry)) {
        out.push(full);
      }
    }
    return out;
  }

  const sources = ["app", "src"].flatMap((root) => sourceFiles(join(MOBILE_ROOT, root)));
  const users = (pattern: RegExp): string[] =>
    sources.filter((file) => pattern.test(readFileSync(file, "utf8"))).map((file) => relative(MOBILE_ROOT, file));

  it("Animated.Text wraps the Text module directly, so its one user sets the Inter family itself", () => {
    expect(users(/<Animated\.Text\b|createAnimatedComponent\(\s*Text(Input)?\b/)).toEqual([
      "src/ui/order/AuctionClock.tsx",
    ]);
    const clock = readFileSync(join(MOBILE_ROOT, "src/ui/order/AuctionClock.tsx"), "utf8");
    const animated = clock.slice(clock.indexOf("<Animated.Text"), clock.indexOf("</Animated.Text>"));
    expect(animated).toMatch(/fontFamily: interFamily\(/);
    expect(animated).not.toMatch(/fontWeight:/); // an explicit family plus fontWeight double-bolds on Android
  });

  it("nothing imports the Text or TextInput module past the patched index", () => {
    expect(users(/["']react-native\/Libraries\/(Text\/Text|Components\/TextInput\/TextInput)["']/)).toEqual([]);
  });
});
