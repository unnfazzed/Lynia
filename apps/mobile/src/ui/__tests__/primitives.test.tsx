import { tokens } from "@lynia/shared";
import React from "react";
import { Image, Text, View } from "react-native";
import renderer from "react-test-renderer";
import { Banner, CoverPhoto, MenuRow, PriceMath } from "../index";

/**
 * The mock→RN foundation primitives (r-parts.jsx kit mirrors). These are the components codegen
 * output references, so the tests assert they render the kit's structure/copy and pull their colours
 * from tokens — never a hardcoded value a token defines.
 */
function texts(tree: renderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).flatMap((t) => React.Children.toArray(t.props.children as React.ReactNode).map(String));
}
function flatStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  const s = node.props.style;
  return Object.assign({}, ...(Array.isArray(s) ? s.flat(Infinity) : [s]).filter(Boolean)) as Record<string, unknown>;
}

describe("Banner (kit Banner)", () => {
  it("renders title, message and action, and takes its wash/ink from tokens per tone", () => {
    const tree = renderer.create(<Banner tone="warn" icon="circle-alert" title="Heads up" msg="Something changed" action="Retry" />);
    const t = texts(tree);
    expect(t).toContain("Heads up");
    expect(t).toContain("Something changed");
    expect(t).toContain("Retry");
    // Outer strip background is the warn wash token (not a literal hex).
    const strip = tree.root.findAllByType(View).map(flatStyle).find((s) => s.backgroundColor === tokens.color.highlightWash);
    expect(strip).toBeTruthy();
  });

  it("maps the offline tone to the calm surface token, never danger", () => {
    const tree = renderer.create(<Banner tone="offline" icon="wifi-off" title="You're offline" />);
    const strip = tree.root.findAllByType(View).map(flatStyle).find((s) => s.backgroundColor === tokens.color.surface);
    expect(strip).toBeTruthy();
  });
});

describe("PriceMath (kit PriceMath)", () => {
  it("renders the Food + Delivery breakdown, the per-km sub-line, and the Total", () => {
    const tree = renderer.create(<PriceMath goods={12} fee={3.5} km={4} total={15.5} note="Cash at the door." />);
    const t = texts(tree);
    expect(t).toContain("Food");
    expect(t).toContain("Delivery");
    expect(t).toContain("Total");
    expect(t.some((x) => x.includes("4 km · $0.80/km"))).toBe(true);
    expect(t).toContain("Cash at the door.");
    // The hairline is a token line colour.
    const hairline = tree.root.findAllByType(View).map(flatStyle).find((s) => s.backgroundColor === tokens.color.line && s.height === 1);
    expect(hairline).toBeTruthy();
  });
});

describe("MenuRow (kit MenuRow)", () => {
  it("shows name, description and price with a plus add-target when in stock", () => {
    const tree = renderer.create(<MenuRow i={{ name: "Sadza & beef", desc: "House stew", price: 4.5, photo: false }} cat="mains" />);
    const t = texts(tree);
    expect(t).toContain("Sadza & beef");
    expect(t).toContain("House stew");
    expect(t.some((x) => x.includes("Out of stock"))).toBe(false);
  });

  it("dims + drops the add target and shows the OOS pill when out of stock", () => {
    const tree = renderer.create(<MenuRow i={{ name: "Kapenta", price: 3, oos: true, photo: false }} cat="sides" />);
    const t = texts(tree);
    expect(t.some((x) => x.includes("Out of stock today"))).toBe(true);
    // The add target (a token-cta / token-bg round badge) is absent for an OOS row.
    const addTarget = tree.root.findAllByType(View).map(flatStyle).find((s) => s.borderRadius === 22 && s.height === 44);
    expect(addTarget).toBeFalsy();
  });

  it("shows the in-cart quantity badge, filled with the cta token, when qty > 0", () => {
    const tree = renderer.create(<MenuRow i={{ name: "Mazoe", price: 1.5, photo: false }} qty={2} cat="drinks" />);
    expect(texts(tree)).toContain("2");
    const badge = tree.root.findAllByType(View).map(flatStyle).find((s) => s.borderRadius === 22 && s.height === 44);
    expect(badge?.backgroundColor).toBe(tokens.color.cta);
  });
});

describe("CoverPhoto (kit CoverPhoto)", () => {
  it("renders the tinted name band when there is no photo", () => {
    const tree = renderer.create(<CoverPhoto name="Sadza Republic" photo={false} />);
    expect(texts(tree)).toContain("Sadza Republic");
    expect(tree.root.findAllByType(Image).length).toBe(0);
  });

  it("renders a real Image when given a URI", () => {
    const tree = renderer.create(<CoverPhoto name="Sadza Republic" photo="https://example.com/cover.jpg" />);
    expect(tree.root.findAllByType(Image).length).toBe(1);
  });
});
