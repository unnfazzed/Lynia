/**
 * Empty states v2 (handoff packages/design/handoff/empty-states-v2-2026-10, ledger D-78): the one
 * component every empty, nothing-found and couldn't-load state uses. Pins the drawn geometry (64 disc,
 * 88 halo, the 8px dot and which tones have it), the two actions (a 44 soft mint pill, never a filled
 * CTA, and a 44 text button), the size-S row, and the rider screens' self-retrying error.
 */
import { tokens } from "@lynia/shared/tokens";
import renderer, { act } from "react-test-renderer";
import { Text, View } from "react-native";
import { EmptyMark, EmptyRow, EmptyState } from "../EmptyState";
import { emptyCopy, fillEmpty } from "../emptyCopy";
import { RiderErrorState } from "../rider/RiderErrorState";

jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));

type Style = Record<string, unknown>;
const flat = (style: unknown): Style => (Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean).map((x) => flat(x))) : ((style as Style) ?? {}));

function mount(el: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(el);
  });
  return tree;
}

const texts = (t: renderer.ReactTestRenderer): string[] => t.root.findAllByType(Text).map((n) => (typeof n.props.children === "string" ? n.props.children : ""));
const views = (t: renderer.ReactTestRenderer): Style[] => t.root.findAllByType(View).map((v) => flat(v.props.style));

describe("EmptyMark", () => {
  it("draws the 88 halo, the 64 disc in the tone's wash, and the gold dot on the empty tone", () => {
    const t = mount(<EmptyMark icon="receipt" />);
    const v = views(t);
    expect(v.some((s) => s.width === 88 && s.height === 88 && s.borderWidth === 1 && s.borderColor === tokens.color.accentWash)).toBe(true);
    expect(v.some((s) => s.width === 64 && s.backgroundColor === tokens.color.accentWash)).toBe(true);
    expect(v.some((s) => s.width === 14 && s.backgroundColor === tokens.color.highlight && s.borderWidth === 3)).toBe(true);
  });

  it("info is surface with an idle dot; error is danger wash with no dot", () => {
    const info = views(mount(<EmptyMark icon="search" tone="info" />));
    expect(info.some((s) => s.width === 64 && s.backgroundColor === tokens.color.surface)).toBe(true);
    expect(info.some((s) => s.width === 14 && s.backgroundColor === tokens.color.illusIdleMid)).toBe(true);
    const err = views(mount(<EmptyMark icon="circle-alert" tone="error" />));
    expect(err.some((s) => s.width === 64 && s.backgroundColor === tokens.color.dangerWash)).toBe(true);
    expect(err.some((s) => s.width === 14)).toBe(false);
  });
});

describe("EmptyState", () => {
  it("renders the title 18/600 and the one line 14 muted, with no buttons when none are given", () => {
    const t = mount(<EmptyState icon="receipt" title="No orders yet" body="Your orders will show here." offsetTop={48} />);
    const title = t.root.findAllByType(Text).find((n) => n.props.children === "No orders yet")!;
    expect(flat(title.props.style)).toMatchObject({ fontSize: 18, fontWeight: 600, maxWidth: 264 });
    const body = t.root.findAllByType(Text).find((n) => n.props.children === "Your orders will show here.")!;
    expect(flat(body.props.style)).toMatchObject({ fontSize: 14, color: tokens.color.muted });
    expect(t.root.findAll((n) => n.props.accessibilityRole === "button")).toHaveLength(0);
  });

  it("the primary is a 44 soft mint pill (never the filled CTA); the secondary a 44 text button", () => {
    const onP = jest.fn();
    const onS = jest.fn();
    const t = mount(<EmptyState icon="map-pin" title="Where should we deliver?" offsetTop={48} primary={{ label: "Use my location", onPress: onP }} secondary={{ label: "Type an address", onPress: onS }} />);
    const [pill] = t.root.findAll((n) => n.props.accessibilityLabel === "Use my location" && typeof n.props.onPress === "function");
    const pillStyle = flat(pill!.props.style({ pressed: false }));
    expect(pillStyle).toMatchObject({ minHeight: 44, paddingHorizontal: 20, backgroundColor: tokens.color.accentWash });
    expect(flat(pill!.props.style({ pressed: true })).backgroundColor).toBe(tokens.color.accentWashPressed);
    expect(JSON.stringify(t.toJSON())).not.toContain(tokens.color.cta);
    act(() => pill!.props.onPress());
    expect(onP).toHaveBeenCalledTimes(1);
    const [text] = t.root.findAll((n) => n.props.accessibilityLabel === "Type an address" && typeof n.props.onPress === "function");
    expect(flat(text!.props.style({ pressed: false }))).toMatchObject({ minHeight: 44, paddingHorizontal: 16 });
    act(() => text!.props.onPress());
    expect(onS).toHaveBeenCalledTimes(1);
  });

  it("puts the disc 30% down the free height (min 48) when it fills the screen", () => {
    const t = mount(<EmptyState icon="receipt" title="No orders yet" />);
    const root = t.root.findAllByType(View)[0]!;
    expect(flat(root.props.style).paddingTop).toBe(48 - 12);
    act(() => root.props.onLayout({ nativeEvent: { layout: { height: 600 } } }));
    expect(flat(t.root.findAllByType(View)[0]!.props.style).paddingTop).toBe(180 - 12);
  });
});

describe("EmptyRow", () => {
  it("a disc row reads 14 muted; a strong row reads 600 ink with a trailing text action", () => {
    const t = mount(<EmptyRow disc icon="receipt" text="No jobs yet today" />);
    expect(views(t).some((s) => s.width === 36 && s.backgroundColor === tokens.color.surface)).toBe(true);
    const onRemind = jest.fn();
    const r = mount(<EmptyRow strong icon="clock" text="Closed · opens 10:08" action={{ label: "Remind me", icon: "bell", onPress: onRemind }} />);
    const label = r.root.findAllByType(Text).find((n) => n.props.children === "Closed · opens 10:08")!;
    expect(flat(label.props.style)).toMatchObject({ fontWeight: 600, color: tokens.color.ink });
    const [btn] = r.root.findAll((n) => n.props.accessibilityLabel === "Remind me" && typeof n.props.onPress === "function");
    act(() => btn!.props.onPress());
    expect(onRemind).toHaveBeenCalledTimes(1);
  });
});

describe("emptyCopy", () => {
  it("fills placeholders and leaves unknown ones", () => {
    expect(fillEmpty(emptyCopy.browse.noneInArea.title, { area: "Belgravia" })).toBe("No restaurants in Belgravia yet");
    expect(fillEmpty(emptyCopy.rider.retrying, {})).toBe("Trying again in {s} s");
  });
});

describe("RiderErrorState", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("has no Retry button: it counts down and retries by itself every 10 s", () => {
    const onRetry = jest.fn();
    const t = mount(<RiderErrorState onRetry={onRetry} onBack={jest.fn()} />);
    expect(texts(t)).toContain("Trying again in 10 s");
    expect(t.root.findAll((n) => typeof n.props.accessibilityLabel === "string" && /try again|retry/i.test(n.props.accessibilityLabel))).toHaveLength(0);
    act(() => jest.advanceTimersByTime(3000));
    expect(texts(t)).toContain("Trying again in 7 s");
    act(() => jest.advanceTimersByTime(7000));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(texts(t)).toContain("Trying again in 10 s");
    act(() => t.unmount());
  });
});
