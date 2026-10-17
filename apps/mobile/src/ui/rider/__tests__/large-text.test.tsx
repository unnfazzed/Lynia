/**
 * Large text (ledger D-111): what the large-text sheet (tools/parity/shoot-large-font.mjs) found broken on
 * the biker's job screen at text 1.3 on a 320dp phone, pinned here:
 *  - the header's Back and Help kept a zero-width slot, so a long title ran under them ("Back" drawn over
 *    "Heading to pickup"): both slots are now at least as wide as the wider side's content;
 *  - Call · WhatsApp · Navigate stayed equal thirds and clipped "WhatsApp": at a larger text size they wrap
 *    as whole buttons (After Send 2.32), and stay equal thirds at 1.0 as drawn;
 *  - the step labels are capped at 1.15 so "Collected" never splits mid-word;
 *  - "Take a pickup photo" was squeezed to a letter per line by its button: the row wraps at large text;
 *  - the Standing tiles (Acceptance / Rating / Strikes) wrap two-then-one at large text.
 */
import { StyleSheet, Text } from "react-native";
import { act, type ReactTestInstance } from "react-test-renderer";
import { renderSync } from "../../../testing/render-sync";
import { OrderHeader } from "../../order/panels";
import { PhotoRow, RSteps, StopCard } from "../job-kit";
import { Standing } from "../kit";

const mockDims = { width: 320, height: 640, scale: 2, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({ __esModule: true, default: () => mockDims }));

const flat = (n: ReactTestInstance): Record<string, unknown> => (StyleSheet.flatten(n.props.style) ?? {}) as Record<string, unknown>;

describe("OrderHeader", () => {
  it("gives Back and Help slots as wide as the wider side, so the title can't run under them", () => {
    const tree = renderSync(<OrderHeader title="Heading to pickup" help onBack={() => undefined} onHelp={() => undefined} />);
    const slots = () => tree.root.findAll((n) => typeof n.props.style === "object" && flat(n).flexBasis === 0 && flat(n).flexShrink === 0, { deep: true });
    const back = tree.root.findByProps({ accessibilityLabel: "Back" });
    act(() => back.props.onLayout({ nativeEvent: { layout: { width: 62, height: 44 } } }));
    const help = tree.root.findAll((n) => typeof n.props.onLayout === "function" && n !== back && n.props.accessibilityRole === "button")[0]!;
    act(() => help.props.onLayout({ nativeEvent: { layout: { width: 79.4, height: 44 } } }));
    const widths = slots().map((n) => flat(n).minWidth);
    expect(widths.length).toBeGreaterThanOrEqual(2);
    for (const w of widths) expect(w).toBe(80);
  });
});

describe("StopCard actions", () => {
  const card = () => (
    <StopCard name="Eastgate Mall" who="Rudo · sender" onCall={() => undefined} onWhatsApp={() => undefined} onNavigate={() => undefined} />
  );
  const row = (tree: ReturnType<typeof renderSync>) =>
    tree.root.find((n) => typeof n.type === "string" && flat(n).flexDirection === "row" && flat(n).gap === 8);

  it("keeps the drawn equal thirds at text 1.0", () => {
    mockDims.fontScale = 1;
    expect(flat(row(renderSync(card()))).flexWrap).toBe("nowrap");
  });

  it("wraps whole buttons at a larger text size instead of clipping WhatsApp", () => {
    mockDims.fontScale = 1.3;
    const tree = renderSync(card());
    expect(flat(row(tree)).flexWrap).toBe("wrap");
    const buttons = tree.root.findAll((n) => n.props.accessibilityRole === "button" && typeof n.type !== "string");
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    mockDims.fontScale = 1;
  });
});

describe("RSteps", () => {
  it("caps the step labels at 1.15 so one-word labels never split", () => {
    const tree = renderSync(<RSteps cur={0} />);
    const labels = tree.root.findAllByType(Text).filter((t) => ["Pickup", "Collected", "Drop-off", "Done"].includes(String(t.props.children)));
    expect(labels).toHaveLength(4);
    for (const l of labels) expect(l.props.maxFontSizeMultiplier).toBe(1.15);
  });
});

describe("wrapping rows at large text", () => {
  const rowOf = (tree: ReturnType<typeof renderSync>, pred: (s: Record<string, unknown>) => boolean) =>
    tree.root.find((n) => typeof n.type === "string" && flat(n).flexDirection === "row" && pred(flat(n)));

  it("the photo row wraps (button under the text) at 1.3, and stays one row at 1.0", () => {
    const photo = () => <PhotoRow saved={false} onTake={() => undefined} />;
    mockDims.fontScale = 1;
    expect(flat(rowOf(renderSync(photo()), (s) => s.borderRadius === 12)).flexWrap).toBe("nowrap");
    mockDims.fontScale = 1.3;
    expect(flat(rowOf(renderSync(photo()), (s) => s.borderRadius === 12)).flexWrap).toBe("wrap");
    mockDims.fontScale = 1;
  });

  it("the Standing tiles wrap at 1.3, and stay three across at 1.0", () => {
    const standing = () => <Standing acceptance={92} rating={4.9} used={1} max={3} oldestClears={null} />;
    mockDims.fontScale = 1;
    expect(flat(rowOf(renderSync(standing()), (s) => s.gap === 8 && s.flexWrap !== undefined)).flexWrap).toBe("nowrap");
    mockDims.fontScale = 1.3;
    expect(flat(rowOf(renderSync(standing()), (s) => s.gap === 8 && s.flexWrap !== undefined)).flexWrap).toBe("wrap");
    mockDims.fontScale = 1;
  });
});
