import { StyleSheet, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactTestInstance, ReactTestRenderer } from "react-test-renderer";

/** The nearest host (native) views under `node`, looking through composite components. */
function hostChildren(node: ReactTestInstance): ReactTestInstance[] {
  const out: ReactTestInstance[] = [];
  for (const child of node.children) {
    if (typeof child === "string") continue;
    if (typeof child.type === "string") out.push(child);
    else out.push(...hostChildren(child));
  }
  return out;
}

/**
 * The flattened styles of the views directly inside a screen's safe-area `SafeAreaView`.
 *
 * SDK54-09: Yoga resolves a percentage size against the parent's whole box, padding included, and
 * the insets are the SafeAreaView's padding. A `minHeight: "100%"` view placed straight inside it is
 * as tall as the phone and starts below the status bar, so whatever it pins to its bottom runs off
 * the screen. A screen puts an unpadded `{ flex: 1 }` View between them, and asserts it with this.
 */
export function stylesDirectlyInSafeArea(tree: ReactTestRenderer): ViewStyle[] {
  const [safeAreaHost] = hostChildren(tree.root.findByType(SafeAreaView));
  if (!safeAreaHost) throw new Error("SafeAreaView rendered no host view");
  return hostChildren(safeAreaHost).map((view) => (StyleSheet.flatten(view.props.style) ?? {}) as ViewStyle);
}
