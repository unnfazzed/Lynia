/**
 * First Run v2 shared parts (packages/design/handoff/first-run-v2/, ledger D-81) — render + the key
 * geometry each part's README §1 / fr-kit.js row pins. Geometry is read off the flattened styles.
 */
import { tokens } from "@lynia/shared/tokens";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { StyleSheet, Text, type TextStyle, View, type ViewStyle } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  ExitButton,
  FrBadge,
  FrField,
  FrSoftPill,
  HeroDisc,
  HeroPanel,
  InfoBox,
  KycChecklist,
  LargeTitle,
  ListCard,
  ListRow,
  PinnedFooter,
  PrimaryButton,
  SampleNotification,
  SplitTitle,
  SystemSettingsSteps,
  TipChips,
  Toggle,
  TriesMeter,
  firstRunMetrics,
} from "..";
import { KY, PC, RP } from "../copy";

const METRICS = { insets: { top: 24, left: 0, right: 0, bottom: 20 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

type Dims = { width: number; height: number; fontScale: number; scale: number };
// The window the metrics read (360×720 at font scale 1 unless a test changes it). Mocked at the module
// RN's own `useWindowDimensions` re-exports, so the parts see it exactly as they would on a phone.
let mockDims: Dims = { width: 360, height: 720, fontScale: 1, scale: 2 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({ __esModule: true, default: () => mockDims }));
beforeEach(() => {
  mockDims = { width: 360, height: 720, fontScale: 1, scale: 2 };
});

function mount(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>);
  });
  return tree;
}
const flat = (n: renderer.ReactTestInstance): ViewStyle & TextStyle => StyleSheet.flatten(n.props.style) ?? {};
const byId = (t: renderer.ReactTestRenderer, id: string): renderer.ReactTestInstance => t.root.find((n) => n.props.testID === id && typeof n.type !== "string" && n.type === View);
const texts = (t: renderer.ReactTestRenderer): string[] => t.root.findAllByType(Text).flatMap((n) => (Array.isArray(n.props.children) ? n.props.children : [n.props.children])).filter((c): c is string => typeof c === "string");

describe("copy — the handoff's copy.ts, verbatim", () => {
  it("is byte-identical to packages/design/handoff/first-run-v2/copy.ts", () => {
    const app = readFileSync(resolve(__dirname, "../copy.ts"), "utf8");
    const handoff = readFileSync(resolve(__dirname, "../../../../../../packages/design/handoff/first-run-v2/copy.ts"), "utf8");
    expect(app).toBe(handoff);
  });
});

describe("firstRunMetrics — README §1 sizes", () => {
  it("360×720: hero 232, disc 104, title 28 (24 gap), content 12 below the status bar", () => {
    expect(firstRunMetrics(360, 1)).toMatchObject({ compact: false, largeFont: false, heroH: 232, disc: 104, titleSize: 28, titleGap: 24, topGap: 12 });
  });
  it("320×640: hero 160, disc 84, title 24 (16 gap), 6 below the status bar", () => {
    expect(firstRunMetrics(320, 1)).toMatchObject({ compact: true, heroH: 160, disc: 84, titleSize: 24, titleGap: 16, topGap: 6 });
  });
  it("font scale 1.3: hero 176, disc 84, title stays 28 (the OS scales it)", () => {
    expect(firstRunMetrics(360, 1.3)).toMatchObject({ largeFont: true, heroH: 176, disc: 84, titleSize: 28 });
  });
});

describe("HeroPanel", () => {
  it("draws radius 28, the tone fill, a 150 sun overhanging by 56 and the 18 coral dot at 36/40", () => {
    const t = mount(<HeroPanel testID="hero" />);
    const hero = flat(byId(t, "hero"));
    expect(hero).toMatchObject({ height: 232, borderRadius: 28, backgroundColor: tokens.color.accentWash, overflow: "hidden" });
    expect(flat(byId(t, "hero-sun"))).toMatchObject({ width: 150, height: 150, right: -56, top: -56, backgroundColor: tokens.color.highlight });
    expect(flat(byId(t, "hero-dot"))).toMatchObject({ width: 18, height: 18, left: 36, bottom: 40, backgroundColor: tokens.color.coral });
  });

  it("danger: wash fill, the dangerSun sun, a danger dot at 35%", () => {
    const t = mount(<HeroPanel testID="hero" tone="danger" />);
    expect(flat(byId(t, "hero")).backgroundColor).toBe(tokens.color.dangerWash);
    expect(flat(byId(t, "hero-sun")).backgroundColor).toBe(tokens.color.dangerSun);
    expect(tokens.color.dangerSun).toBe("#F4D9D5");
    expect(flat(byId(t, "hero-dot"))).toMatchObject({ backgroundColor: tokens.color.danger, opacity: 0.35 });
  });

  it("violet / neutral / green fills", () => {
    expect(flat(byId(mount(<HeroPanel testID="hero" tone="violet" />), "hero")).backgroundColor).toBe(tokens.color.riderWash);
    const n = mount(<HeroPanel testID="hero" tone="neutral" />);
    expect(flat(byId(n, "hero")).backgroundColor).toBe(tokens.color.surface);
    expect(flat(byId(n, "hero-sun")).backgroundColor).toBe(tokens.color.line);
    expect(flat(byId(mount(<HeroPanel testID="hero" tone="green" />), "hero")).backgroundColor).toBe(tokens.color.accent);
  });

  it("hides the dot when it holds cards (decor=false) and honours an explicit height", () => {
    const t = mount(<HeroPanel testID="hero" decor={false} height={250} />);
    expect(flat(byId(t, "hero")).height).toBe(250);
    expect(t.root.findAll((n) => n.props.testID === "hero-dot")).toHaveLength(0);
  });

  it("shrinks to 160 at 320 wide and 176 at font scale 1.3", () => {
    mockDims = { ...mockDims, width: 320, height: 640 };
    expect(flat(byId(mount(<HeroPanel testID="hero" />), "hero")).height).toBe(160);
    mockDims = { ...mockDims, width: 360, fontScale: 1.3 };
    expect(flat(byId(mount(<HeroPanel testID="hero" />), "hero")).height).toBe(176);
  });

  it("pins its topLeft slot 12 inside the corner (the ID-check ✕)", () => {
    const onPress = jest.fn();
    const t = mount(<HeroPanel topLeft={<ExitButton onPress={onPress} />} />);
    const exit = t.root.find((n) => n.props.testID === "exit-button" && n.props.accessibilityRole === "button");
    const slot = t.root.findAll((n) => n.type === View && flat(n).position === "absolute" && flat(n).left === 12 && flat(n).top === 12);
    expect(slot).toHaveLength(1);
    act(() => exit.props.onPress());
    expect(onPress).toHaveBeenCalled();
  });
});

describe("HeroDisc", () => {
  it("is a 104 white circle with a 40 icon in the panel tone's colour and a halo 14 outside", () => {
    const t = mount(
      <HeroPanel tone="violet">
        <HeroDisc icon="map-pin" />
      </HeroPanel>,
    );
    expect(flat(byId(t, "hero-disc"))).toMatchObject({ width: 104, height: 104, borderRadius: 52, backgroundColor: tokens.color.bg });
    const halo = t.root.findAll((n) => n.type === View && flat(n).borderWidth === 1.5);
    expect(flat(halo[0]!)).toMatchObject({ width: 132, height: 132, left: -14, top: -14 });
    const icon = t.root.find((n) => n.props.size === 40);
    expect(icon.props).toMatchObject({ color: tokens.color.riderAccent, strokeWidth: 1.75 });
  });

  it("is 84 at 320 wide, and draws the 48 spinner for F8", () => {
    mockDims = { ...mockDims, width: 320 };
    const t = mount(<HeroDisc spinner />);
    expect(flat(byId(t, "hero-disc")).width).toBe(84);
    const ring = t.root.find((n) => n.props.accessibilityRole === "progressbar" && n.props.style);
    expect(flat(ring)).toMatchObject({ width: 48, height: 48, borderWidth: 5, borderTopColor: tokens.color.accent, borderColor: tokens.color.accentWash });
  });
});

describe("SplitTitle + LargeTitle", () => {
  it("28/700, −0.025em, the second half in the tone accent", () => {
    const t = mount(<SplitTitle a={RP.locA} b={RP.locB} tone="violet" />);
    const [outer, inner] = t.root.findAllByType(Text);
    expect(flat(outer!)).toMatchObject({ fontSize: 28, fontWeight: 700, letterSpacing: -0.7, marginTop: 24, color: tokens.color.ink });
    expect(flat(inner!).color).toBe(tokens.color.riderAccent);
    expect(texts(t)).toEqual(expect.arrayContaining([RP.locA, RP.locB]));
  });
  it("danger accent is danger ink; 24 at 320", () => {
    mockDims = { ...mockDims, width: 320 };
    const t = mount(<SplitTitle a={PC.foreverA} b={PC.foreverB} tone="danger" />);
    const [outer, inner] = t.root.findAllByType(Text);
    expect(flat(outer!).fontSize).toBe(24);
    expect(flat(inner!).color).toBe(tokens.color.dangerInk);
  });
  it("LargeTitle is 30/700 (24 at 320)", () => {
    expect(flat(mount(<LargeTitle>Settings</LargeTitle>).root.findByType(Text))).toMatchObject({ fontSize: 30, fontWeight: 700, paddingHorizontal: 16 });
  });
});

describe("PinnedFooter / PrimaryButton / links", () => {
  it("pins padding 12 16 16 + the bottom inset, a 52 cta pill and a 44 link", () => {
    const go = jest.fn();
    const skip = jest.fn();
    const t = mount(<PinnedFooter primary={{ label: RP.locCta, onPress: go, icon: "power" }} link={{ label: RP.notNow, onPress: skip }} />);
    expect(flat(t.root.find((n) => n.props.testID === "pinned-footer"))).toMatchObject({ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 36, gap: 4, backgroundColor: tokens.color.bg });
    const buttons = t.root.findAll((n) => n.props.accessibilityRole === "button" && typeof n.props.onPress === "function" && typeof n.props.style === "function");
    const cta = buttons.find((b) => b.props.accessibilityLabel === RP.locCta)!;
    const link = buttons.find((b) => b.props.accessibilityLabel === RP.notNow)!;
    expect(cta.props.style({ pressed: false })).toMatchObject({ minHeight: 52, borderRadius: 999, backgroundColor: tokens.color.cta });
    expect(cta.props.style({ pressed: true }).backgroundColor).toBe(tokens.color.ctaPressed);
    expect(link.props.style({ pressed: false }).minHeight).toBe(44);
    act(() => cta.props.onPress());
    act(() => link.props.onPress());
    expect(go).toHaveBeenCalled();
    expect(skip).toHaveBeenCalled();
  });

  it("disabled (U3) is line/muted; done (D3) is mint with a check", () => {
    const off = mount(<PrimaryButton label="Update now" onPress={jest.fn()} disabled />).root.find((n) => n.props.accessibilityRole === "button" && typeof n.props.style === "function");
    expect(off.props.style({ pressed: false }).backgroundColor).toBe(tokens.color.line);
    const done = mount(<PrimaryButton label="Saved" onPress={jest.fn()} done />);
    const btn = done.root.find((n) => n.props.accessibilityRole === "button" && typeof n.props.style === "function");
    expect(btn.props.style({ pressed: false }).backgroundColor).toBe(tokens.color.accentWash);
    expect(done.root.findAll((n) => n.props.size === 20 && n.props.color === tokens.color.accentText).length).toBeGreaterThan(0);
  });
});

describe("ExitButton", () => {
  it("is a 44 white circle with a 20 ✕", () => {
    const t = mount(<ExitButton onPress={jest.fn()} />);
    const b = t.root.find((n) => n.props.testID === "exit-button" && n.props.accessibilityRole === "button");
    expect(flat(b)).toMatchObject({ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.bg });
    expect(b.props.accessibilityLabel).toBe("Close");
  });
});

describe("Step lists", () => {
  it("SystemSettingsSteps: three open markers numbered 1–3 in a list card", () => {
    const t = mount(<SystemSettingsSteps steps={[PC.step1, PC.step2, PC.step3]} />);
    expect(t.root.findAll((n) => n.props.testID === "step-open" && n.type === View)).toHaveLength(3);
    expect(texts(t)).toEqual(expect.arrayContaining([PC.step1, PC.step2, PC.step3]));
    const numerals = t.root.findAllByType(Text).map((n) => n.props.children).filter((c) => typeof c === "number");
    expect(numerals).toEqual([1, 2, 3]);
  });

  it("KycChecklist active: done · spinning · open, with the label", () => {
    const t = mount(<KycChecklist step2="active" label="In review" />);
    expect(t.root.findAll((n) => n.props.testID === "step-done" && n.type === View)).toHaveLength(1);
    expect(t.root.findAll((n) => n.props.testID === "step-active" && n.props.accessibilityRole === "progressbar").length).toBeGreaterThan(0);
    expect(texts(t)).toEqual(expect.arrayContaining([KY.s1, KY.s2, KY.s3, KY.done, "In review"]));
  });

  it("KycChecklist next: a green ring numeral 2; done: two checks", () => {
    const next = mount(<KycChecklist step2="next" label="~2 min" />);
    expect(flat(next.root.find((n) => n.props.testID === "step-next" && n.type === View))).toMatchObject({ width: 28, borderWidth: 1.5, borderColor: tokens.color.accent });
    const done = mount(<KycChecklist step2="done" />);
    expect(done.root.findAll((n) => n.props.testID === "step-done" && n.type === View)).toHaveLength(2);
  });
});

describe("ListCard / ListRow", () => {
  it("bordered radius 16; rows ≥56, padding 8 14; the first row has no hairline", () => {
    const t = mount(
      <ListCard testID="card">
        <ListRow icon="user" iconTone="ok" title="Personal details" sub="Name, phone, ID" chevron onPress={jest.fn()} />
        <ListRow icon="bell" title="Order updates" right={<Toggle value={false} accessibilityLabel="Order updates" />} />
      </ListCard>,
    );
    expect(flat(byId(t, "card"))).toMatchObject({ borderWidth: 1, borderColor: tokens.color.line, borderRadius: 16 });
    const rows = t.root.findAll((n) => typeof n.props.style === "object" && flat(n).minHeight === 56 && flat(n).paddingHorizontal === 14);
    const tops = [...new Set(rows.map((r) => flat(r).borderTopWidth))];
    expect(tops).toEqual(expect.arrayContaining([0, 1]));
  });

  it("danger row: wash fill, danger ink title", () => {
    const t = mount(<ListRow icon="map-pin" title="Location" sub="Off" danger />);
    const row = t.root.find((n) => n.type === View && flat(n).minHeight === 56);
    expect(flat(row).backgroundColor).toBe(tokens.color.dangerWash);
    expect(flat(t.root.findAllByType(Text)[0]!).color).toBe(tokens.color.dangerInk);
  });
});

describe("Toggle", () => {
  it("44×26, brand when on, line when off, exposed as a switch", () => {
    const onT = mount(<Toggle value accessibilityLabel="Job alerts" onPress={jest.fn()} />).root.find((n) => n.props.accessibilityRole === "switch" && typeof n.props.style === "function");
    expect(onT.props.style({ pressed: false })).toMatchObject({ width: 44, height: 26, backgroundColor: tokens.color.accent });
    expect(onT.props.accessibilityState).toMatchObject({ checked: true });
    const offT = mount(<Toggle value={false} accessibilityLabel="Location" />).root.find((n) => n.props.accessibilityRole === "switch" && typeof n.props.style === "function");
    expect(offT.props.style({ pressed: false }).backgroundColor).toBe(tokens.color.line);
  });
});

describe("Small parts", () => {
  it("TipChips: 32 surface pills with 16 green icons", () => {
    const t = mount(<TipChips items={[{ icon: "sun", label: KY.blurryTip1 }, { icon: "check", label: KY.blurryTip3 }]} />);
    const pills = t.root.findAll((n) => n.type === View && flat(n).minHeight === 32);
    expect(pills).toHaveLength(2);
    expect(flat(pills[0]!).backgroundColor).toBe(tokens.color.surface);
  });

  it("TriesMeter: two 28×6 bars, remaining green then used line; with a label it is F4's neutral box", () => {
    const t = mount(<TriesMeter left={1} label={KY.triesLeft} />);
    expect(flat(t.root.find((n) => n.props.testID === "try-left"))).toMatchObject({ width: 28, height: 6, borderRadius: 3, backgroundColor: tokens.color.accent });
    expect(flat(t.root.find((n) => n.props.testID === "try-used")).backgroundColor).toBe(tokens.color.line);
    expect(texts(t)).toContain(KY.triesLeft);
  });

  it("InfoBox tones: radius 14, padding 12 14", () => {
    const bad = mount(<InfoBox testID="box" tone="bad" title="This ID is on another account" text="One ID, one account." />);
    expect(flat(byId(bad, "box"))).toMatchObject({ borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: tokens.color.dangerWash });
    expect(flat(byId(mount(<InfoBox testID="box" tone="ok" text="ok" />), "box")).backgroundColor).toBe(tokens.color.accentWash);
  });

  it("FrSoftPill: 44 tall, padding 0 18, mint / white-with-border", () => {
    const mint = mount(<FrSoftPill label="Turn on" onPress={jest.fn()} />).root.find((n) => n.props.accessibilityRole === "button" && typeof n.props.style === "function");
    expect(StyleSheet.flatten(mint.props.style({ pressed: false }))).toMatchObject({ minHeight: 44, paddingHorizontal: 18, backgroundColor: tokens.color.accentWash });
    const white = mount(<FrSoftPill label={RP.testPing} tone="white" onPress={jest.fn()} />).root.find((n) => n.props.accessibilityRole === "button" && typeof n.props.style === "function");
    expect(StyleSheet.flatten(white.props.style({ pressed: false }))).toMatchObject({ backgroundColor: tokens.color.bg, borderWidth: 1, borderColor: tokens.color.line });
  });

  it("FrBadge checking pill uses the highlight chip wash/ink", () => {
    const t = mount(<FrBadge label="Checking" tone="checking" icon="clock" />);
    expect(flat(t.root.find((n) => n.type === View && flat(n).minHeight === 32)).backgroundColor).toBe(tokens.color.highlightChipWash);
  });

  it("SampleNotification: radius 16, a 28 brand tile, the card behind scaled .94", () => {
    const t = mount(<SampleNotification icon="bike" title={PC.ex1T} body={PC.ex1B} behind />);
    const card = t.root.find((n) => n.type === View && n.props.accessible === true);
    expect(flat(card)).toMatchObject({ width: 268, borderRadius: 16, backgroundColor: tokens.color.bg, transform: [{ scale: 0.94 }] });
    expect(flat(t.root.find((n) => n.type === View && flat(n).width === 28))).toMatchObject({ height: 28, borderRadius: 8, backgroundColor: tokens.color.accent });
  });

  it("FrField: 52 / radius 12; an error draws a 2 danger border and the danger helper", () => {
    const t = mount(<FrField testID="id" label="National ID" value="63 4829" onChangeText={jest.fn()} error="Use the format 63-123456A78" />);
    expect(flat(byId(t, "id-box"))).toMatchObject({ minHeight: 52, borderRadius: 12, borderWidth: 2, borderColor: tokens.color.danger });
    expect(texts(t)).toContain("Use the format 63-123456A78");
  });
});
