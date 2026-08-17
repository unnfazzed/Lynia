import { tokens } from "@lynia/shared/tokens";
import { getServiceTiles, SERVICES } from "../ServiceTiles";

describe("getServiceTiles (RESTAURANTS_ENABLED escape hatch)", () => {
  it("returns SERVICES unchanged when the flag is on", () => {
    expect(getServiceTiles(true)).toEqual(SERVICES);
  });

  it("degrades Restaurants to the Pharmacy SOON treatment when the flag is off", () => {
    const tiles = getServiceTiles(false);
    const food = tiles.find((t) => t.id === "food");
    // Home 8c: a SOON tile keeps its wash, its blob and its sticker — only the chip is added, and it
    // stays PRESSABLE (it opens the notify-me sheet). The pre-8c grey/inert degrade is gone.
    expect(food).toEqual({ ...SERVICES.find((t) => t.id === "food"), soon: true });
    expect(food?.bg).toBe(tokens.color.tileFoodWash);
    expect(food?.label).toBe("Restaurants");
  });

  it("leaves Send and Pharmacy untouched when the flag is off", () => {
    const tiles = getServiceTiles(false);
    expect(tiles.find((t) => t.id === "express")).toEqual(SERVICES.find((t) => t.id === "express"));
    expect(tiles.find((t) => t.id === "pharm")).toEqual(SERVICES.find((t) => t.id === "pharm"));
  });

  it("draws the three 8c tiles, in order, with the handoff's sticker widths", () => {
    expect(SERVICES.map((t) => [t.id, t.label, t.sticker, t.width])).toEqual([
      ["express", "Send", "send", 50],
      ["food", "Restaurants", "food", 56],
      ["pharm", "Pharmacy", "pharmacy", 53],
    ]);
    // Pharmacy is the only tile that ships SOON; it is never inert.
    expect(SERVICES.filter((t) => t.soon).map((t) => t.id)).toEqual(["pharm"]);
  });
});
