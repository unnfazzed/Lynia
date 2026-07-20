/**
 * BH-24 regression guard: loadRiderIdentity's restore guard did `typeof parsed.ratingAvg === "string"`
 * before trusting it, but the field's actual source (OfferRow.rider.ratingAvg, order/[id].tsx) is
 * declared `string` while the API wire value is a raw JSON number — so a persisted-then-reloaded
 * identity silently reset ratingAvg to "0", showing 0.0 stars for a real assigned rider. Mocks
 * expo-secure-store directly (jest-expo has no built-in behavior for it), mirroring auth/session.test.ts.
 */
const mockGetItemAsync = jest.fn().mockResolvedValue(null);
const mockSetItemAsync = jest.fn().mockResolvedValue(undefined);

jest.mock("expo-secure-store", () => ({
  getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
  setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { loadRiderIdentity } from "../rider-identity";

afterEach(() => {
  mockGetItemAsync.mockReset().mockResolvedValue(null);
  mockSetItemAsync.mockClear();
});

const BASE = { orderId: "o1", profileId: "p1", firstName: "A", lastName: "B", photoUrl: null, ratingCount: 5, tripsCount: 3 };

describe("loadRiderIdentity (BH-24)", () => {
  it("restores a genuinely-string ratingAvg unchanged", async () => {
    mockGetItemAsync.mockResolvedValueOnce(JSON.stringify({ ...BASE, ratingAvg: "4.8" }));
    const identity = await loadRiderIdentity("o1");
    expect(identity?.ratingAvg).toBe("4.8");
  });

  it("does NOT reset to '0' when ratingAvg round-tripped as a raw JSON number (the wire-type mismatch)", async () => {
    // Simulates what actually happens on disk: order/[id].tsx used to persist chosen.rider.ratingAvg
    // verbatim, and the API sends that field as a JSON number despite the client's `string` type — so
    // JSON.stringify wrote an unquoted numeric literal.
    mockGetItemAsync.mockResolvedValueOnce(`{"orderId":"o1","profileId":"p1","firstName":"A","lastName":"B","photoUrl":null,"ratingAvg":4.8,"ratingCount":5,"tripsCount":3}`);
    const identity = await loadRiderIdentity("o1");
    expect(identity?.ratingAvg).toBe("4.8");
  });

  it("falls back to '0' only when ratingAvg is genuinely missing or a non-numeric shape", async () => {
    mockGetItemAsync.mockResolvedValueOnce(JSON.stringify({ ...BASE, ratingAvg: null }));
    const identity = await loadRiderIdentity("o1");
    expect(identity?.ratingAvg).toBe("0");
  });

  it("returns null for a mismatched orderId (stale other-order slot)", async () => {
    mockGetItemAsync.mockResolvedValueOnce(JSON.stringify({ ...BASE, ratingAvg: "4.8" }));
    const identity = await loadRiderIdentity("some-other-order");
    expect(identity).toBeNull();
  });
});
