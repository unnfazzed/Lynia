import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { CARD_H, CARD_W, initialOf, renderShareCard } from "./share-card";

const meta = (b: Buffer) => sharp(b).metadata();
const pixel = async (b: Buffer, left: number, top: number) =>
  Array.from((await sharp(b).extract({ left, top, width: 1, height: 1 }).raw().toBuffer()).subarray(0, 3));

describe("renderShareCard (SH-W7)", () => {
  it("no photo: the service tint band, white below, 1200×630 JPEG under 300 KB", async () => {
    const jpeg = await renderShareCard({ name: "Kensington Hardware", service: "shops", logo: null, cover: null });
    expect(await meta(jpeg)).toMatchObject({ width: CARD_W, height: CARD_H, format: "jpeg" });
    expect(jpeg.length).toBeLessThan(300_000);
    const band = await pixel(jpeg, 40, 200); // #DDD5FF
    expect(band[2]).toBeGreaterThan(240);
    expect(band[1]).toBeLessThan(225);
    const below = await pixel(jpeg, 40, 600);
    expect(Math.min(...below)).toBeGreaterThan(245); // white
  });

  it("the generic card is the brand green and names no shop", async () => {
    const jpeg = await renderShareCard(null);
    const [r, g, b] = await pixel(jpeg, 300, 100);
    expect(g).toBeGreaterThan(150);
    expect(r).toBeLessThan(30);
    expect(b).toBeLessThan(110);
  });

  it("a very long name still renders on one line (ellipsis), as does markup-looking text", async () => {
    for (const name of ["Mbuya's Traditional Kitchen & Grill Borrowdale Village ".repeat(3), "<b>Fish & Chips</b>"]) {
      const jpeg = await renderShareCard({ name, service: "restaurants", logo: null, cover: null });
      expect(await meta(jpeg)).toMatchObject({ width: CARD_W, height: CARD_H });
    }
  });

  it("an unreadable photo falls back to the tint instead of failing", async () => {
    const jpeg = await renderShareCard({ name: "K", service: "pharmacy", logo: Buffer.from("nope"), cover: Buffer.from("nope") });
    expect(await meta(jpeg)).toMatchObject({ width: CARD_W, height: CARD_H });
  });
});

describe("initialOf", () => {
  it("takes the first letter or digit", () => {
    expect(initialOf("avondale Fresh")).toBe("A");
    expect(initialOf("  7 Arts")).toBe("7");
    expect(initialOf("🍗")).toBe("?");
  });
});
