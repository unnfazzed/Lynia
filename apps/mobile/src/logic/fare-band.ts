/**
 * A "riders usually accept around $X–$Y" guidance band for the name-your-price field. In a
 * customer-priced marketplace the #1 failure mode is a lowball that draws no offers (CONCEPT §3 risk 7,
 * §7 mentions surfacing this hint once there's data) — so anchoring the customer to a realistic band,
 * not just a single suggested number, keeps the auction from dead-ending on an unfillable price.
 *
 * Until there's real corridor acceptance data, the band is derived from the same suggested fare the
 * pricing model already computes: a symmetric-ish window around it, floored at the model minimum. It is
 * deliberately labelled "usually" (soft guidance), never a hard floor — riders still counter, the
 * customer still decides. Pure so it unit-tests off-device; swap the derivation for real percentiles
 * when the data lands without touching the caller.
 */

/** Fraction below the suggestion the band's low edge sits at (a slightly cheaper but still-fillable ask). */
export const BAND_LOW_FRAC = 0.85;
/** Fraction above the suggestion the band's high edge sits at (where a rider reliably bites). */
export const BAND_HIGH_FRAC = 1.2;
/** The pricing model's floor — no band edge is quoted below this (mirrors FARE.minUsd). */
export const BAND_MIN_USD = 1.5;

export interface FareBand {
  low: number;
  high: number;
}

/** Round to a clean 10-cent step so the band reads as guidance, not a false-precise computed figure. */
function roundDime(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The acceptance band around a suggested fare. Returns `null` for a non-positive/invalid suggestion (no
 * band to show yet). `low` is floored at the model minimum and never exceeds `high`.
 */
export function fareBand(suggestedFare: number): FareBand | null {
  if (!Number.isFinite(suggestedFare) || suggestedFare <= 0) return null;
  const low = Math.max(BAND_MIN_USD, roundDime(suggestedFare * BAND_LOW_FRAC));
  const high = Math.max(low, roundDime(suggestedFare * BAND_HIGH_FRAC));
  return { low, high };
}

/** Human copy for a band, e.g. "Riders usually accept around $2.10–$3.00". */
export function fareBandHint(band: FareBand): string {
  return `Riders usually accept around $${band.low.toFixed(2)}–$${band.high.toFixed(2)}`;
}

/**
 * Whether a proposed fare sits below the band's low edge — the "this might not get offers" case worth a
 * gentle nudge. `false` for an empty/invalid proposal (nothing to warn about yet).
 */
export function isBelowBand(proposedFare: number | null, band: FareBand): boolean {
  return proposedFare != null && Number.isFinite(proposedFare) && proposedFare > 0 && proposedFare < band.low;
}

/** How many times the band's high edge counts as "way more than usual" — a fat-finger guard ($2.50
 *  typed as $250), not a hard cap. Generous so a legitimately-premium ask still passes without a nudge. */
export const BAND_FAR_ABOVE_MULT = 3;

/**
 * Whether a proposed fare is far above the band — the "did you add a digit by mistake?" case. Non-blocking:
 * the customer can still send it (a genuinely high offer is their right); it just earns a calm confirm hint.
 * `false` for an empty/invalid proposal.
 */
export function isFarAboveBand(proposedFare: number | null, band: FareBand): boolean {
  return proposedFare != null && Number.isFinite(proposedFare) && proposedFare > band.high * BAND_FAR_ABOVE_MULT;
}
