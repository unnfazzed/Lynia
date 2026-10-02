/**
 * iPhone keyboard behaviour (docs/APP-STORE-SUBMISSION.md B6).
 *
 * - iOS lays the keyboard over a `<Modal>` instead of resizing it; Android's Modal window resizes
 *   (`SOFT_INPUT_ADJUST_RESIZE`). So every modal sheet that holds a text field lifts itself by the
 *   keyboard's height on iOS, and leaves Android exactly as it was.
 * - iOS number and phone pads have no return key, so `DismissKeyboardArea` closes the keyboard on a tap
 *   that nothing inside it took.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import renderer, { act } from "react-test-renderer";
import { DismissKeyboardArea } from "../DismissKeyboardArea";
import { ItemSheet } from "../browse/sheets";
import { GetHelpControl } from "../safety";

jest.mock("../../api/safety", () => ({ raiseIssue: jest.fn(), raiseSos: jest.fn(), reportUser: jest.fn() }));
jest.mock("expo-location", () => ({
  PermissionStatus: { GRANTED: "granted", DENIED: "denied", UNDETERMINED: "undetermined" },
  getForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
}));

/** jest-expo runs as iOS; flip the platform for the branch under test and always put it back. */
function withPlatform(os: "android" | "ios", fn: () => void): void {
  const original = Platform.OS;
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
  }
}

const item = { id: "d1", name: "Sadza and beef stew", priceUsd: 5, description: null, photoUrl: null, unavailable: false, outOfStock: false };

/** Each sheet, rendered open. The get-help sheet opens from its ghost button, as on the order screen. */
const SHEETS: [string, () => renderer.ReactTestRenderer][] = [
  ["item sheet", () =>
      mount(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 360, height: 720 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <ItemSheet item={item} service="food" closedAt={null} remindOn={false} remindBusy={false} onRemind={() => undefined} onAdd={() => undefined} onClose={() => undefined} />
        </SafeAreaProvider>,
      )],
  [
    "get-help sheet",
    () => {
      const tree = mount(
        <QueryClientProvider client={new QueryClient()}>
          <GetHelpControl orderId="o1" />
        </QueryClientProvider>,
      );
      const open = tree.root.findAll((n) => n.props.label === "Get help with this trip" && typeof n.props.onPress === "function")[0];
      if (!open) throw new Error("no 'Get help with this trip' button");
      act(() => open.props.onPress());
      return tree;
    },
  ],
];

let mounted: renderer.ReactTestRenderer[] = [];
function mount(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(node);
  });
  mounted.push(tree);
  return tree;
}
afterEach(() => {
  for (const tree of mounted) act(() => tree.unmount());
  mounted = [];
});

function keyboardBehaviours(tree: renderer.ReactTestRenderer): (string | undefined)[] {
  return tree.root.findAllByType(KeyboardAvoidingView).map((n) => n.props.behavior as string | undefined);
}

describe.each(SHEETS)("the %s", (_name, open) => {
  it("lifts above the keyboard on iOS", () => {
    withPlatform("ios", () => {
      expect(keyboardBehaviours(open())).toEqual(["padding"]);
    });
  });

  it("leaves Android to its resizing Modal window", () => {
    withPlatform("android", () => {
      expect(keyboardBehaviours(open())).toEqual([undefined]);
    });
  });
});

describe("DismissKeyboardArea", () => {
  function area(tree: renderer.ReactTestRenderer): renderer.ReactTestInstance {
    const node = tree.root.findAll((n) => typeof n.props.onResponderRelease === "function")[0];
    if (!node) throw new Error("no responder view");
    return node;
  }

  it("closes the keyboard on a tap that nothing inside took", () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    try {
      const tree = mount(
        <DismissKeyboardArea>
          <Text>Body</Text>
        </DismissKeyboardArea>,
      );
      expect(area(tree).props.onStartShouldSetResponder()).toBe(true);
      act(() => area(tree).props.onResponderRelease());
      expect(dismiss).toHaveBeenCalledTimes(1);
    } finally {
      dismiss.mockRestore();
    }
  });

  it("is not an accessibility element, so screen readers still reach each child", () => {
    const tree = mount(
      <DismissKeyboardArea>
        <Text>Body</Text>
      </DismissKeyboardArea>,
    );
    expect(area(tree).props.accessible).toBeUndefined();
    expect(area(tree).props.accessibilityRole).toBeUndefined();
  });
});
