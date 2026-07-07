import { buildReceiptText, formatReceiptDate, type ReceiptInput } from "../receipt";

const base: ReceiptInput = {
  orderId: "abcdef1234567890",
  pickupLandmark: "Eastgate, CBD",
  dropoffLandmark: "14 Glenara Ave",
  fare: "3.5",
  riderName: "Tinashe M",
  completedAt: "2026-07-07T14:32:00.000Z",
  delivered: true,
};

describe("formatReceiptDate", () => {
  it("returns empty for missing/invalid timestamps", () => {
    expect(formatReceiptDate(null)).toBe("");
    expect(formatReceiptDate("not a date")).toBe("");
  });
  it("formats a valid timestamp with a time component", () => {
    expect(formatReceiptDate("2026-07-07T14:32:00.000Z")).toMatch(/\d{2}:\d{2}$/);
  });
});

describe("buildReceiptText", () => {
  it("includes the truncated order id, route and 2dp fare", () => {
    const t = buildReceiptText(base);
    expect(t).toContain("Order: abcdef12");
    expect(t).toContain("Eastgate, CBD → 14 Glenara Ave");
    expect(t).toContain("Fare: $3.50");
  });

  it("includes the rider line only when a name is given", () => {
    expect(buildReceiptText(base)).toContain("Rider: Tinashe M");
    expect(buildReceiptText({ ...base, riderName: null })).not.toContain("Rider:");
    expect(buildReceiptText({ ...base, riderName: "   " })).not.toContain("Rider:");
  });

  it("labels the date 'Delivered' when delivered, else 'Date'", () => {
    expect(buildReceiptText(base)).toMatch(/Delivered: /);
    expect(buildReceiptText({ ...base, delivered: false })).toMatch(/Date: /);
  });

  it("omits the date line entirely when there's no timestamp", () => {
    const t = buildReceiptText({ ...base, completedAt: null });
    expect(t).not.toMatch(/Delivered:|Date:/);
  });

  it("always carries the cash-settlement disclaimer (never a payment receipt)", () => {
    expect(buildReceiptText(base)).toContain("not a payment receipt");
  });

  it("falls back to Pickup/Drop-off placeholders when landmarks are blank", () => {
    const t = buildReceiptText({ ...base, pickupLandmark: "", dropoffLandmark: null });
    expect(t).toContain("Pickup → Drop-off");
  });
});
