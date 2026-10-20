/**
 * Offer best-match ranking (design decision D-d). The customer named the price, riders accept/counter,
 * and the customer always selects — but presenting a long unsorted list invites decision-paralysis and a
 * pure race-to-the-bottom. `rankOffers` orders offers by a blended score of price + rating + ETA and marks
 * the top one "recommended", so cheaper-but-slower-or-lower-rated offers don't automatically win.
 *
 * Pure + framework-free so it lives in @lynia/shared (unit-tested from the API package, like quoteFare).
 */

export interface OfferRankInput {
  /** The fare the rider offered, in USD. Lower is better. */
  offeredFare: number;
  /** The rider's average rating (0–5). Higher is better. Ignored when ratingCount is 0. */
  ratingAvg: number;
  /** How many ratings back ratingAvg. 0 = a new rider with no track record. */
  ratingCount: number;
  /** Rider's ETA to pickup, minutes. Lower is better. */
  etaMinutes: number;
}

export interface RankedOffer {
  /** Index into the original `offers` array. */
  index: number;
  /** Blended best-match score in [0,1]; higher is better. */
  score: number;
  /** True for the single best offer when there are ≥2 to choose between. */
  recommended: boolean;
}

export interface OfferRankWeights {
  price: number;
  rating: number;
  eta: number;
}

/**
 * Price is the single largest factor (the customer named the price), but rating + ETA *together* (0.55)
 * can outweigh it (0.45) — so a cheap-but-slow-and-poorly-rated offer doesn't automatically win. Tuned so
 * best-match doesn't collapse into "cheapest" (price weight must stay below rating+eta combined).
 */
export const DEFAULT_OFFER_WEIGHTS: OfferRankWeights = { price: 0.45, rating: 0.35, eta: 0.2 };

/**
 * A new rider (no ratings yet) scores at the neutral midpoint on the rating axis — same as a rated rider
 * we can't yet rank relative to peers (a single rated rider in the batch min–max-collapses to 0.5 too). It
 * must NOT exceed that 0.5, or an unrated rider would out-score a proven high-rated one when they're the
 * only rated offer. Fare/ETA differentiate; the deterministic tie-break still favours a higher raw rating.
 */
export const NEW_RIDER_RATING_SCORE = 0.5;

/** Normalize a value to [0,1] where `lowerIsBetter` decides the direction. Neutral 0.5 when the set is flat. */
function norm(value: number, min: number, max: number, lowerIsBetter: boolean): number {
  if (max <= min) return 0.5; // every offer equal on this dimension → it shouldn't sway the ranking
  const t = (value - min) / (max - min);
  return lowerIsBetter ? 1 - t : t;
}

/**
 * Rank offers best-first by a blended price/rating/ETA score. Returns one entry per input offer (carrying
 * its original `index`), sorted with a stable tie-break (fare → rating → eta → original order). The top
 * entry is flagged `recommended` only when there are ≥2 offers — a lone offer needs no marker.
 */
export function rankOffers(offers: OfferRankInput[], weights: OfferRankWeights = DEFAULT_OFFER_WEIGHTS): RankedOffer[] {
  if (offers.length === 0) return [];

  // Defense-in-depth (the API path is DB-constrained): coerce non-finite numeric inputs before
  // normalization so a stray NaN/Infinity can't poison min/max and produce NaN scores / an unstable
  // sort. A non-finite fare/eta is treated as worst-ranked (the largest finite value in the set, so it
  // normalizes to 0 without distorting the spread) and a non-finite rating as 0. Finite inputs are
  // untouched, so valid rankings stay byte-identical.
  const worstFinite = (nums: number[]): number => {
    const finite = nums.filter((n) => Number.isFinite(n));
    return finite.length ? Math.max(...finite) : 0;
  };
  const fareWorst = worstFinite(offers.map((o) => o.offeredFare));
  const etaWorst = worstFinite(offers.map((o) => o.etaMinutes));
  const fares = offers.map((o) => (Number.isFinite(o.offeredFare) ? o.offeredFare : fareWorst));
  const etas = offers.map((o) => (Number.isFinite(o.etaMinutes) ? o.etaMinutes : etaWorst));
  const ratingAvgs = offers.map((o) => (Number.isFinite(o.ratingAvg) ? o.ratingAvg : 0));

  // Only rated riders define the rating range; new riders use the neutral baseline instead.
  const ratings = offers.map((o, i) => ({ o, i })).filter(({ o }) => o.ratingCount > 0).map(({ i }) => ratingAvgs[i]!);
  const fareMin = Math.min(...fares);
  const fareMax = Math.max(...fares);
  const etaMin = Math.min(...etas);
  const etaMax = Math.max(...etas);
  const ratingMin = ratings.length ? Math.min(...ratings) : 0;
  const ratingMax = ratings.length ? Math.max(...ratings) : 0;

  const scored = offers.map((o, index) => {
    const priceScore = norm(fares[index]!, fareMin, fareMax, true);
    const etaScore = norm(etas[index]!, etaMin, etaMax, true);
    const ratingScore = o.ratingCount > 0 ? norm(ratingAvgs[index]!, ratingMin, ratingMax, false) : NEW_RIDER_RATING_SCORE;
    const score = weights.price * priceScore + weights.rating * ratingScore + weights.eta * etaScore;
    return { index, score, recommended: false };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (fares[a.index] !== fares[b.index]) return fares[a.index]! - fares[b.index]!; // cheaper first
    if (ratingAvgs[a.index] !== ratingAvgs[b.index]) return ratingAvgs[b.index]! - ratingAvgs[a.index]!; // better-rated first
    if (etas[a.index] !== etas[b.index]) return etas[a.index]! - etas[b.index]!; // sooner first
    return a.index - b.index; // stable
  });

  if (scored.length >= 2 && scored[0]) scored[0].recommended = true;
  return scored;
}
