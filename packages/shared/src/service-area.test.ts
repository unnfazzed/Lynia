import { describe, expect, it } from "vitest";
import { isInServiceArea, NATIONWIDE_REACH_M, serviceTownsLabel, ZIMBABWE_BORDER } from "./service-area";
import { haversineKm } from "./pricing";

describe("service area — all of Zimbabwe (owner 2026-10-12, D-98)", () => {
  const inside: Record<string, { lat: number; lng: number }> = {
    "Harare CBD": { lat: -17.8292, lng: 31.0522 },
    Chitungwiza: { lat: -18.0127, lng: 31.0756 },
    Chivhu: { lat: -19.0211, lng: 30.8922 },
    Mutare: { lat: -18.9707, lng: 32.6709 },
    "Forbes border post": { lat: -18.963, lng: 32.703 },
    Bulawayo: { lat: -20.15, lng: 28.58 },
    Gweru: { lat: -19.45, lng: 29.82 },
    Masvingo: { lat: -20.07, lng: 30.83 },
    Marondera: { lat: -18.185, lng: 31.55 },
    Bindura: { lat: -17.3, lng: 31.33 },
    "Victoria Falls": { lat: -17.9243, lng: 25.8572 },
    Hwange: { lat: -18.364, lng: 26.498 },
    Kariba: { lat: -16.5167, lng: 28.8 },
    Chirundu: { lat: -16.033, lng: 28.85 },
    Kanyemba: { lat: -15.65, lng: 30.42 },
    Nyamapanda: { lat: -16.95, lng: 32.85 },
    Nyanga: { lat: -18.2167, lng: 32.75 },
    Chimanimani: { lat: -19.8, lng: 32.87 },
    Chipinge: { lat: -20.19, lng: 32.62 },
    Chiredzi: { lat: -21.05, lng: 31.67 },
    Beitbridge: { lat: -22.2167, lng: 30.0 },
    Plumtree: { lat: -20.48, lng: 27.82 },
  };
  for (const [name, p] of Object.entries(inside)) {
    it(`serves ${name}`, () => expect(isInServiceArea(p)).toBe(true));
  }

  const outside: Record<string, { lat: number; lng: number }> = {
    Lusaka: { lat: -15.4167, lng: 28.2833 },
    Francistown: { lat: -21.17, lng: 27.51 },
    Musina: { lat: -22.35, lng: 30.04 },
    Tete: { lat: -16.16, lng: 33.59 },
    Chimoio: { lat: -19.12, lng: 33.48 },
    Johannesburg: { lat: -26.2, lng: 28.05 },
    "Null Island": { lat: 0, lng: 0 },
  };
  for (const [name, p] of Object.entries(outside)) {
    it(`does not serve ${name}`, () => expect(isInServiceArea(p)).toBe(false));
  }

  it("rejects non-finite coordinates", () => {
    expect(isInServiceArea({ lat: Number.NaN, lng: 31 })).toBe(false);
  });

  it("names the country", () => {
    expect(serviceTownsLabel()).toBe("Zimbabwe");
  });

  it("the nationwide reach spans any two border points", () => {
    let widest = 0;
    for (const [aLat, aLng] of ZIMBABWE_BORDER) {
      for (const [bLat, bLng] of ZIMBABWE_BORDER) widest = Math.max(widest, haversineKm({ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng }));
    }
    expect(widest * 1000).toBeLessThan(NATIONWIDE_REACH_M);
  });
});
