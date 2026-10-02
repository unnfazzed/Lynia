import { describe, expect, it } from "vitest";
import { isInServiceArea, SERVICE_TOWNS, serviceTownsLabel } from "./service-area";

describe("service area — Harare metro + the satellite towns (owner 2026-10-02)", () => {
  const inside: Record<string, { lat: number; lng: number }> = {
    "Harare CBD": { lat: -17.8292, lng: 31.0522 },
    Borrowdale: { lat: -17.75, lng: 31.1 },
    "Glen View": { lat: -17.905, lng: 30.97 },
    Chitungwiza: { lat: -18.0127, lng: 31.0756 },
    "St Mary's / Seke": { lat: -18.045, lng: 31.06 },
    Norton: { lat: -17.8833, lng: 30.7 },
    Ruwa: { lat: -17.8897, lng: 31.2447 },
    Epworth: { lat: -17.89, lng: 31.15 },
    Domboshava: { lat: -17.62, lng: 31.17 },
    "Mt Hampden": { lat: -17.72, lng: 30.95 },
    Goromonzi: { lat: -17.87, lng: 31.37 },
  };
  for (const [name, p] of Object.entries(inside)) {
    it(`serves ${name}`, () => expect(isInServiceArea(p)).toBe(true));
  }

  const outside: Record<string, { lat: number; lng: number }> = {
    Marondera: { lat: -18.185, lng: 31.55 },
    Bindura: { lat: -17.3, lng: 31.33 },
    Chegutu: { lat: -18.13, lng: 30.14 },
    Bulawayo: { lat: -20.15, lng: 28.58 },
    "Null Island": { lat: 0, lng: 0 },
  };
  for (const [name, p] of Object.entries(outside)) {
    it(`does not serve ${name}`, () => expect(isInServiceArea(p)).toBe(false));
  }

  it("rejects non-finite coordinates", () => {
    expect(isInServiceArea({ lat: Number.NaN, lng: 31 })).toBe(false);
  });

  it("names every town, Harare first", () => {
    expect(SERVICE_TOWNS[0]).toBe("Harare");
    for (const t of ["Chitungwiza", "Norton", "Ruwa", "Epworth", "Domboshava", "Mt Hampden", "Goromonzi"]) expect(SERVICE_TOWNS).toContain(t);
    expect(serviceTownsLabel()).toBe("Harare, Chitungwiza, Norton, Ruwa, Epworth, Domboshava, Mt Hampden and Goromonzi");
  });
});
