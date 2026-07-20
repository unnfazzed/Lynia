import { describe, expect, it } from "vitest";
import { color, semantic } from "./design-tokens";

const HEX = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/;

describe("semantic colour roles (roadmap 4.6)", () => {
  it("maps each role to a real raw-palette value (the two-layer contract)", () => {
    expect(semantic.text.body).toBe(color.ink);
    expect(semantic.text.secondary).toBe(color.muted);
    expect(semantic.surface.selected).toBe(color.accentWash);
    expect(semantic.border.default).toBe(color.line);
    // Primary actions must use the sunlight-contrast CTA fill, NOT the raw brand green.
    expect(semantic.action.primary).toBe(color.cta);
    expect(semantic.action.primary).not.toBe(color.accent);
    expect(semantic.state.error).toBe(color.danger);
  });

  it("every semantic leaf resolves to a valid hex from the palette", () => {
    const palette = new Set<string>(Object.values(color));
    const leaves = Object.values(semantic).flatMap((group) => Object.values(group));
    for (const v of leaves) {
      expect(v).toMatch(HEX);
      expect(palette.has(v)).toBe(true); // no semantic role invents a colour outside the raw scale
    }
  });
});
