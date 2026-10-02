import type { MerchantOrderResponse } from "@lynia/shared";
import { merchantLive, type MerchantLiveSnap } from "../orderflow/live-copy";

/** Order flow v2 G1/G2 (ledger D-59): the live bar / Now card copy per service and stage, from `O.g.bar`. */

const NOW = new Date(2026, 9, 2, 12, 30).getTime();
const at = (ms: number): string => new Date(NOW + ms).toISOString();
const VENUE = { lat: -17.8292, lng: 31.0522 };
const DROP = { lat: -17.8105, lng: 31.0705 };

const snap = (over: Partial<MerchantLiveSnap> = {}): MerchantLiveSnap => ({
  id: "o1",
  status: "requested",
  merchantName: "Gava’s Kitchen",
  merchantPhase: "preparing",
  pickup: { point: VENUE },
  dropoff: { point: DROP },
  rider: null,
  ...over,
});

const order = (over: Partial<MerchantOrderResponse> = {}): MerchantOrderResponse =>
  ({
    id: "o1",
    merchantId: "m1",
    status: "requested",
    merchantPhase: "preparing",
    items: [],
    total: 16.5,
    riderId: null,
    prepMinutes: 20,
    prepStartedAt: at(-8 * 60_000),
    readyAt: null,
    venue: { name: "Gava’s Kitchen", businessType: "restaurant", shopKind: null },
    ...over,
  }) as unknown as MerchantOrderResponse;

describe("merchantLive — G1 bar / G2 Now card", () => {
  it("restaurant cooking: 'Cooking your order' + an arrival range, two segments lit", () => {
    const v = merchantLive(snap(), order(), null, NOW);
    expect(v.svc).toBe("food");
    expect(v.icon).toBe("utensils");
    expect(v.title).toBe("Cooking your order");
    expect(v.sub).toMatch(/^Arrives \d\d:\d\d–\d\d:\d\d$/);
    expect(v.line).toMatch(/^Gava’s Kitchen · Arrives /);
    expect(v.lit).toBe(2);
  });

  it("shop packing speaks Packing; without prep data there is no ETA and the line is the venue", () => {
    const v = merchantLive(snap(), order({ venue: { name: "Avondale Fresh", businessType: "shop", shopKind: "grocery" }, prepStartedAt: null }), null, NOW);
    expect(v.title).toBe("Packing your order");
    expect(v.icon).toBe("shopping-bag");
    expect(v.sub).toBe("Avondale Fresh");
    expect(v.line).toBe("Avondale Fresh");
  });

  it("pharmacy Rx check, and the door asks to check the seal", () => {
    const pharm = { name: "Avondale Pharmacy", businessType: "shop" as const, shopKind: "pharmacy" };
    const rx = { status: "pending" as const, patientName: "R", pageCount: 1 };
    expect(merchantLive(snap(), order({ venue: pharm, prescription: rx }), null, NOW).title).toBe("Pharmacist is checking your prescription");
    const door = merchantLive(
      snap({ status: "en_route_dropoff", rider: { currentLat: DROP.lat, currentLng: DROP.lng } }),
      order({ venue: pharm, status: "en_route_dropoff", merchantPhase: null, riderId: "r1", total: 6.8 }),
      "Tendai",
      NOW,
    );
    expect(door.title).toBe("Rider is at your door");
    expect(door.sub).toBe("Check the seal · pay $6.80");
    expect(door.line).toBe("Avondale Pharmacy · check the seal · pay $6.80");
    expect(door.lit).toBe(4);
  });

  it("an open swap round leads: '{venue} needs your answer' · '1 swap · answer in m:ss'", () => {
    const v = merchantLive(
      snap(),
      order({
        venue: { name: "Avondale Fresh", businessType: "shop", shopKind: "grocery" },
        substitution: { id: "s", kind: "at_accept", status: "open", createdAt: at(-19_000), deadlineAt: at(161_000), resolvedAt: null, lines: [{ action: "swap" }], wasTotal: 16.1, keptSubtotal: 13.5 },
      } as unknown as Partial<MerchantOrderResponse>),
      null,
      NOW,
    );
    expect(v.title).toBe("Avondale Fresh needs your answer");
    expect(v.sub).toBe("1 swap · answer in 2:41");
    expect(v.lit).toBe(1);
  });

  it("scheduled: 'Scheduled · tomorrow 12:30–13:00' · '{venue} starts cooking at 12:05', nothing lit", () => {
    const slot = new Date(2026, 9, 3, 12, 30).toISOString();
    const v = merchantLive(snap({ merchantPhase: "awaiting_accept" }), order({ merchantPhase: "awaiting_accept", scheduledFor: slot, ringsAt: new Date(2026, 9, 3, 12, 5).toISOString(), scheduleStartedAt: null }), null, NOW);
    expect(v.title).toBe("Scheduled · tomorrow 12:30–13:00");
    expect(v.sub).toBe("Gava’s Kitchen starts cooking at 12:05");
    expect(v.lit).toBe(0);
  });

  it("before the food read lands it still names the stage off the snapshot", () => {
    expect(merchantLive(snap({ merchantPhase: "awaiting_accept" }), undefined, null, NOW).title).toBe("Waiting for Gava’s Kitchen to accept");
  });
});
