/**
 * First Run v2 F1–F8 — the ID-check outcome shell (README §2 F, `fr-states.js` F*, ledger D-80). Each page:
 * the ✕ (its only way out), the hero tone + disc, the split title in `KY`'s words, the body, the checklist /
 * tips / tries meter as drawn, and exactly the CTA + link the frame draws. Never a "Send a parcel" / "Order
 * food" secondary, never the vendor's name.
 */
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { KycOutcomeId } from "../../../logic/kyc-outcome";
import { IdCheckOutcome } from "../IdCheckOutcome";
import { KY, PD } from "../copy";

const METRICS = { insets: { top: 24, left: 0, right: 0, bottom: 20 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

function mount(id: KycOutcomeId, extra: Partial<React.ComponentProps<typeof IdCheckOutcome>> = {}) {
  const onExit = jest.fn();
  const onRetry = jest.fn();
  const onHelp = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={METRICS}>
        <IdCheckOutcome id={id} firstName="Tendai" triesLeft={1} onExit={onExit} onRetry={onRetry} onHelp={onHelp} {...extra} />
      </SafeAreaProvider>,
    );
  });
  return { tree, onExit, onRetry, onHelp };
}

/** Every rendered string, nested <Text> joined into its parent's line. */
function lines(t: renderer.ReactTestRenderer): string[] {
  const flatten = (c: unknown): string =>
    typeof c === "string" ? c : Array.isArray(c) ? c.map(flatten).join("") : c && typeof c === "object" && "props" in c ? flatten((c as { props: { children?: unknown } }).props.children) : "";
  return t.root.findAllByType(Text).map((n) => flatten(n.props.children));
}
const byTestId = (t: renderer.ReactTestRenderer, id: string) => t.root.findAll((n) => n.props.testID === id && typeof n.type === "string");
const press = (t: renderer.ReactTestRenderer, id: string) => {
  const n = byTestId(t, id)[0];
  if (!n) throw new Error(`no ${id}`);
  let p: renderer.ReactTestInstance | null = n;
  while (p && typeof p.props.onPress !== "function") p = p.parent;
  act(() => p!.props.onPress());
};
const heroFill = (t: renderer.ReactTestRenderer): string | undefined => {
  const disc = t.root.find((n) => n.props.testID === "hero-disc" && n.type === View);
  let p: renderer.ReactTestInstance | null = disc.parent;
  while (p && (StyleSheet.flatten(p.props.style) as ViewStyle | undefined)?.borderRadius !== 28) p = p.parent;
  return (StyleSheet.flatten(p?.props.style) as ViewStyle | undefined)?.backgroundColor as string | undefined;
};

const ALL: KycOutcomeId[] = ["F1", "F2", "F3", "F4a", "F4b", "F4c", "F4d", "F5", "F5dup", "F6", "F7", "F8"];

describe("IdCheckOutcome — one shell for every F page", () => {
  it.each(ALL)("%s: the ✕ is the way out, and nothing offers to order food or send a parcel", (id) => {
    const { tree, onExit } = mount(id);
    expect(byTestId(tree, "exit-button")).toHaveLength(1);
    press(tree, "exit-button");
    expect(onExit).toHaveBeenCalledTimes(1);
    const all = lines(tree).join("|");
    expect(all).not.toContain(KY.wait);
    expect(all).not.toContain(KY.secondary);
    expect(all).not.toMatch(/didit/i);
  });

  it("F8 · just submitted: spinner disc, 'Sending your ID', the checklist mid-step, no CTA", () => {
    const { tree } = mount("F8");
    expect(lines(tree)).toEqual(expect.arrayContaining([`${KY.justA} ${KY.justB}`, KY.justBody, KY.s1, KY.s2, KY.s3]));
    expect(byTestId(tree, "pinned-footer")).toHaveLength(0);
    expect(heroFill(tree)).toBe(tokens.color.accentWash);
  });

  it("F1 · our team: clock, 'In review', no CTA", () => {
    const { tree } = mount("F1");
    expect(lines(tree)).toEqual(expect.arrayContaining([`${KY.reviewA} ${KY.reviewB}`, KY.reviewBody, "In review"]));
    expect(byTestId(tree, "pinned-footer")).toHaveLength(0);
  });

  it("F2 · held: never says why — the WhatsApp link only", () => {
    const { tree, onHelp } = mount("F2");
    expect(lines(tree)).toEqual(expect.arrayContaining([`${KY.heldA} ${KY.heldB}`, KY.heldBody]));
    expect(byTestId(tree, "outcome-primary")).toHaveLength(0);
    press(tree, "outcome-help");
    expect(onHelp).toHaveBeenCalled();
  });

  it("F3 · unfinished: 'Almost there, {firstName}', step 2 next at ~2 min, 'Finish ID check' resumes", () => {
    const { tree, onRetry } = mount("F3");
    expect(lines(tree)).toEqual(expect.arrayContaining([`${KY.unfA} Tendai`, KY.unfBody, "~2 min", KY.unfCta]));
    press(tree, "outcome-primary");
    expect(onRetry).toHaveBeenCalled();
    expect(byTestId(tree, "outcome-help")).toHaveLength(0);
  });

  it.each([
    ["F4a", `${KY.blurryA} ${KY.blurryB}`, [KY.blurryTip1, KY.blurryTip2, KY.blurryTip3]],
    ["F4b", `${KY.faceA} ${KY.faceB}`, [KY.faceTip1, KY.faceTip2, KY.faceTip3]],
    ["F4c", `${KY.docA} ${KY.docB}`, [KY.docBody]],
    ["F4d", `${KY.otherA} ${KY.otherB}`, [KY.otherBody]],
  ] as const)("%s · declined: its own advice, 1 try left, Try again + WhatsApp", (id, title, advice) => {
    const { tree, onRetry, onHelp } = mount(id);
    expect(lines(tree)).toEqual(expect.arrayContaining([title, ...advice, KY.triesLeft, KY.tryAgain, KY.help]));
    expect(byTestId(tree, "try-left")).toHaveLength(1);
    expect(byTestId(tree, "try-used")).toHaveLength(1);
    expect(heroFill(tree)).toBe(tokens.color.dangerWash);
    press(tree, "outcome-primary");
    press(tree, "outcome-help");
    expect(onRetry).toHaveBeenCalled();
    expect(onHelp).toHaveBeenCalled();
  });

  it("F4 draws the meter only for the drawn '1 try left'", () => {
    const { tree } = mount("F4a", { triesLeft: 2 });
    expect(byTestId(tree, "tries-meter")).toHaveLength(0);
  });

  it("F5 · locked: one CTA, WhatsApp", () => {
    const { tree, onHelp, onRetry } = mount("F5");
    expect(lines(tree)).toEqual(expect.arrayContaining([`${KY.lockedA} ${KY.lockedB}`, KY.lockedBody, KY.msg]));
    press(tree, "outcome-primary");
    expect(onHelp).toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("F5dup · declined as a duplicate: F5's WhatsApp-only shell, never 'Both tries are used' (owner 2026-10-06)", () => {
    const { tree, onHelp, onRetry } = mount("F5dup");
    expect(lines(tree)).toEqual(expect.arrayContaining([`${KY.lockedA} ${KY.lockedB}`, `${PD.takenA} ${PD.takenB}. ${PD.takenBody}`, KY.msg]));
    expect(lines(tree)).not.toContain(KY.lockedBody);
    expect(byTestId(tree, "tries-meter")).toHaveLength(0);
    expect(byTestId(tree, "outcome-help")).toHaveLength(0);
    press(tree, "outcome-primary");
    expect(onHelp).toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("F6 · expired: the date when known; the sentence alone until the server sends it", () => {
    const withDate = mount("F6", { expiredAt: new Date(2026, 9, 2) });
    expect(lines(withDate.tree)).toEqual(expect.arrayContaining([`${KY.expA} ${KY.expB}`, "Expired 2 Oct 2026. Re-verify to keep riding.", KY.expCta]));
    const without = mount("F6", { expiredAt: null });
    expect(lines(without.tree)).toContain("Re-verify to keep riding.");
    press(without.tree, "outcome-primary");
    expect(without.onRetry).toHaveBeenCalled();
  });

  it("F7 · can't open: data + camera chips, Try again + WhatsApp", () => {
    const { tree } = mount("F7");
    expect(lines(tree)).toEqual(expect.arrayContaining([`${KY.cantA} ${KY.cantB}`, KY.cantBody, KY.cant1, KY.cant2, KY.tryAgain, KY.help]));
  });
});
