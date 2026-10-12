import { describe, expect, it } from "vitest";
import { MERCHANT_REASON_NOTE_MAX } from "@lynia/shared";
import { venueNoteOf } from "./venue-note";

/** Customer brief 07 (U66, ledger D-97 D3g): the venue's note reaches the customer only from "Something else". */
describe("venueNoteOf", () => {
  const rejected = (cancelReason: string | null, rejectionReason: string | null = "other", status = "cancelled") => ({ status, rejectionReason, cancelReason });

  it("carries the trimmed note of an `other` rejection", () => {
    expect(venueNoteOf(rejected("  We’ve run out of chicken for today.  "))).toBe("We’ve run out of chicken for today.");
  });

  it("is null without a note, for any other reason, or on a live order", () => {
    expect(venueNoteOf(rejected(null))).toBeNull();
    expect(venueNoteOf(rejected("   "))).toBeNull();
    expect(venueNoteOf(rejected("Too busy right now", "too_busy"))).toBeNull();
    // A customer's own cancel reason lives in the same column — never surfaced as the venue's note.
    expect(venueNoteOf(rejected("changed my mind", null))).toBeNull();
    expect(venueNoteOf(rejected("note", "other", "requested"))).toBeNull();
  });

  it("is plain text: no markup, no links, collapsed whitespace, at most the note max", () => {
    expect(venueNoteOf(rejected("<b>Closed</b> early, see https://example.com/x today"))).toBe("Closed early, see today");
    expect(venueNoteOf(rejected("<a href='x'></a> www.example.com"))).toBeNull();
    const long = venueNoteOf(rejected("a".repeat(MERCHANT_REASON_NOTE_MAX + 20)));
    expect(long).toHaveLength(MERCHANT_REASON_NOTE_MAX);
  });
});
