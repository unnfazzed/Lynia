/**
 * Help screen — behaviour of the CONTAINER after the codegen refactor (app/help/index.tsx now renders
 * the generated app/help/help.view.tsx). Structure is guarded elsewhere (the structural-snapshot
 * guardrail, apps/api/src/parity/structure-snapshot.spec.ts, asserts help.view.tsx ≡ the mock); THIS
 * suite pins the behaviour the container owns and the refactor must preserve:
 *   1. all topics render;
 *   2. the search field filters the list locally;
 *   3. tapping a topic opens WhatsApp with that topic's prompt prefilled;
 *   4. tapping the WhatsApp card opens WhatsApp.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";

const mockBack = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock("../../../src/config", () => ({ supportWhatsAppUrl: () => "https://wa.me/263771234567" }));

import { Linking } from "react-native";
import HelpScreen from "../index";

function render(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<HelpScreen />); });
  return tree;
}

/** Fire onChangeText on the search field (found by its placeholder). */
function type(tree: renderer.ReactTestRenderer, text: string): void {
  const input = tree.root.findAll((n) => n.props.placeholder === "Search help…")[0];
  if (!input) throw new Error("no search field");
  act(() => input.props.onChangeText(text));
}

/** Press the nearest onPress ancestor of the node carrying `accessibilityLabel`. */
function pressByLabel(tree: renderer.ReactTestRenderer, label: string): void {
  const node = tree.root.findAll((n) => n.props.accessibilityLabel === label)[0];
  if (!node) throw new Error(`no node labelled "${label}"`);
  let p: typeof node | null = node;
  while (p && typeof p.props.onPress !== "function") p = p.parent;
  if (!p) throw new Error(`no pressable ancestor for "${label}"`);
  act(() => p!.props.onPress());
}

function titles(tree: renderer.ReactTestRenderer): string[] {
  return tree.root
    .findAll((n) => n.props.accessibilityRole === "button" && typeof n.props.accessibilityLabel === "string")
    .map((n) => n.props.accessibilityLabel as string);
}

describe("HelpScreen (codegen container)", () => {
  beforeEach(() => jest.restoreAllMocks());

  it("renders every topic and the WhatsApp row", () => {
    const tree = render();
    const labels = titles(tree);
    expect(labels).toContain("A delivery problem");
    expect(labels).toContain("Payments & fares");
    expect(labels).toContain("My account");
    expect(labels).toContain("Chat with us on WhatsApp");
  });

  it("filters topics by the search query", () => {
    const tree = render();
    type(tree, "payments");
    const labels = titles(tree);
    expect(labels).toContain("Payments & fares");
    expect(labels).not.toContain("A delivery problem");
    expect(labels).not.toContain("My account");
  });

  it("opens WhatsApp with the topic prompt prefilled when a topic is tapped", () => {
    const spy = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const tree = render();
    pressByLabel(tree, "My account");
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("wa.me/263771234567"));
    expect(String(spy.mock.calls[0]?.[0])).toContain(encodeURIComponent("Hi, I need help with my account."));
  });

  it("opens WhatsApp when the chat card is tapped", () => {
    const spy = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    const tree = render();
    pressByLabel(tree, "Chat with us on WhatsApp");
    expect(spy).toHaveBeenCalledWith("https://wa.me/263771234567");
  });
});
