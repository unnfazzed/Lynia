/**
 * R3·2 (cart_note) — the quick-phrase chips are the only logic in the note sheet worth pinning down:
 * they mutate free text the customer also types into, and a chip that mangles a note or overruns the
 * 140-character ticket limit shows up on a kitchen ticket, not in a stack trace. Pure functions, so
 * no renderer and no new mocks.
 */
import { DISH_NOTE_MAX, hasPhrase, QUICK_PHRASES, toggleQuickPhrase } from "../CartNoteSheet";

describe("toggleQuickPhrase", () => {
  it("seeds an empty note with the bare phrase", () => {
    expect(toggleQuickPhrase("", "Leg portion")).toBe("Leg portion");
  });

  it("appends to an existing note as a new sentence", () => {
    expect(toggleQuickPhrase("Leg portion", "No chilli")).toBe("Leg portion. No chilli");
  });

  it("does not double up the separator when the note already ends in one", () => {
    expect(toggleQuickPhrase("Leg portion.", "No chilli")).toBe("Leg portion. No chilli");
  });

  it("keeps free text the customer typed themselves", () => {
    expect(toggleQuickPhrase("Ring the bell twice", "Pack separately")).toBe("Ring the bell twice. Pack separately");
  });

  it("removes a phrase that is already in the note (the chip's ✓ state)", () => {
    expect(toggleQuickPhrase("Leg portion. No chilli", "No chilli")).toBe("Leg portion");
  });

  it("removes a phrase from the front without leaving its separator behind", () => {
    expect(toggleQuickPhrase("Leg portion. No chilli", "Leg portion")).toBe("No chilli");
  });

  it("round-trips: adding then removing leaves the original note", () => {
    const original = "Extra hot please";
    expect(toggleQuickPhrase(toggleQuickPhrase(original, "Extra gravy"), "Extra gravy")).toBe(original);
  });

  it("matches case-insensitively, so a typed-out phrase reads as selected", () => {
    expect(hasPhrase("no chilli at all", "No chilli")).toBe(true);
  });

  it("refuses an append that would overrun the limit rather than truncating a half-phrase", () => {
    const nearFull = "x".repeat(DISH_NOTE_MAX - 3);
    expect(toggleQuickPhrase(nearFull, "Pack separately")).toBe(nearFull);
  });

  it("never exceeds the limit for any single chip on an empty note", () => {
    for (const phrase of QUICK_PHRASES) {
      expect(toggleQuickPhrase("", phrase).length).toBeLessThanOrEqual(DISH_NOTE_MAX);
    }
  });
});
