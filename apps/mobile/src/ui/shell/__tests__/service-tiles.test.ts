import { tokens } from "@lynia/shared/tokens";
import { getServiceTiles, SERVICES } from "../ServiceTiles";

describe("getServiceTiles (RESTAURANTS_ENABLED escape hatch)", () => {
  it("returns SERVICES unchanged when the flag is on", () => {
    expect(getServiceTiles(true)).toEqual(SERVICES);
  });

  it("degrades the Food tile to the Pharmacy 'Soon' treatment when the flag is off", () => {
    const tiles = getServiceTiles(false);
    const food = tiles.find((t) => t.id === "food");
    expect(food).toEqual({ id: "food", icon: "utensils", label: "Food", sub: "Soon", bg: tokens.color.line, soon: true });
  });

  it("leaves Send and Pharmacy untouched when the flag is off", () => {
    const tiles = getServiceTiles(false);
    expect(tiles.find((t) => t.id === "express")).toEqual(SERVICES.find((t) => t.id === "express"));
    expect(tiles.find((t) => t.id === "pharm")).toEqual(SERVICES.find((t) => t.id === "pharm"));
  });
});
