/**
 * `useDial` — a Call button that says so when the device can't call. On an iPad or iPod with no paired
 * iPhone (where App Review runs an iPhone app in compatibility mode), `Linking.openURL("tel:…")`
 * rejects; the old fire-and-forget call made that a button that silently did nothing.
 */
import React from "react";
import { Linking, Text } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../Toast";
import { useDial } from "../useDial";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

let dial: (phone: string | null | undefined) => void = () => undefined;
function Harness(): React.ReactElement {
  dial = useDial();
  return <Text>harness</Text>;
}

let tree: renderer.ReactTestRenderer | null = null;
function mount(): renderer.ReactTestRenderer {
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <ToastProvider>
          <Harness />
        </ToastProvider>
      </SafeAreaProvider>,
    );
  });
  return tree!;
}

function texts(t: renderer.ReactTestRenderer): string[] {
  return t.root
    .findAllByType(Text)
    .map((n) => (typeof n.props.children === "string" ? n.props.children : ""))
    .filter(Boolean);
}

const openURL = jest.spyOn(Linking, "openURL");
afterEach(() => {
  openURL.mockReset();
  if (tree) act(() => tree!.unmount());
  tree = null;
});
afterAll(() => openURL.mockRestore());

/** Let the rejected `openURL` promise and its catch run. */
const flush = (): Promise<void> => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

describe("useDial", () => {
  it("opens the dialler with the number", async () => {
    openURL.mockResolvedValue(true);
    const t = mount();
    act(() => dial("+263772451180"));
    await flush();
    expect(openURL).toHaveBeenCalledWith("tel:+263772451180");
    expect(texts(t).some((s) => s.startsWith("This device can't make calls"))).toBe(false);
  });

  it("names the number in a toast when the device can't place calls", async () => {
    openURL.mockRejectedValue(new Error("Unable to open URL: tel:+263772451180"));
    const t = mount();
    act(() => dial("+263772451180"));
    await flush();
    expect(texts(t)).toContain("This device can't make calls. Dial 0772451180 from a phone.");
  });

  it("does nothing without a number", async () => {
    const t = mount();
    act(() => dial(null));
    act(() => dial(""));
    await flush();
    expect(openURL).not.toHaveBeenCalled();
    expect(texts(t)).toEqual(["harness"]);
  });
});
