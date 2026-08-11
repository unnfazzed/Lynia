import * as SecureStore from "expo-secure-store";

/**
 * The public identity of the rider a customer picked, cached on-device so the LIVE TRACKING card can show
 * a face + name + rating — the "who's coming, what do they look like" anchor every modern ride-hailing
 * app leads tracking with. We cache it because the assigned-order snapshot only carries the rider's
 * `profileId` + GPS (`OrderSnapshot.rider`), NOT their name/photo/rating — that data is only on the OFFER
 * the customer selected. So we stash the chosen offer's public fields at selection time and read them back
 * on the tracker (surviving remount / cold start).
 *
 * This is PUBLIC profile data (the same first/last name + photo + rating shown on the bid card), not
 * contact PII — no phone, no ID. One slot, keyed by the order it belongs to so a stale identity from a
 * previous order never paints on a new one. Best-effort throughout.
 */

/** SecureStore key — exported so sign-out (auth/session `clearDeviceState`) clears the same slot. */
export const RIDER_IDENTITY_KEY = "lynia.riderIdentity.v1";

export interface RiderIdentity {
  orderId: string;
  /** The rider's profileId — the avatar tint seed, so the tracking avatar matches the bid-card one. */
  profileId: string;
  firstName: string;
  lastName: string;
  photoUrl: string | null;
  ratingAvg: string;
  ratingCount: number;
  tripsCount: number;
  // #671 (food only): the assigned rider's vehicle/plate/KYC, sourced from the food order read
  // (`MerchantOrderResponse.rider`), not from a cached offer — a food rider is auto-dispatched, so
  // there is no offer to cache from. Optional so the parcel SecureStore path (which never sets them)
  // is unaffected; the food tracker builds this shape live and does not persist it.
  plate?: string | null;
  vehicleInfo?: string | null;
  kycVerified?: boolean;
}

export async function saveRiderIdentity(identity: RiderIdentity): Promise<void> {
  try {
    await SecureStore.setItemAsync(RIDER_IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    /* best-effort — the tracker just falls back to no identity card */
  }
}

/** Load the cached identity IFF it belongs to `orderId` (a mismatch means it's a stale other-order slot). */
export async function loadRiderIdentity(orderId: string): Promise<RiderIdentity | null> {
  try {
    const raw = await SecureStore.getItemAsync(RIDER_IDENTITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RiderIdentity>;
    if (!parsed || parsed.orderId !== orderId || typeof parsed.firstName !== "string") return null;
    return {
      orderId,
      profileId: typeof parsed.profileId === "string" ? parsed.profileId : "",
      firstName: parsed.firstName,
      lastName: typeof parsed.lastName === "string" ? parsed.lastName : "",
      photoUrl: typeof parsed.photoUrl === "string" ? parsed.photoUrl : null,
      // BH-24: the caller (order/[id].tsx) writes this field from OfferRow.rider.ratingAvg, whose
      // declared `string` type is a lie — the API sends the Prisma Float `ratingAvg` as a raw JSON
      // number (unlike `offeredFare`, a Decimal the server explicitly .toString()s). A strict
      // `typeof === "string"` check on that round-tripped value silently reset every rating to "0" on
      // every reload. Accept either wire shape and normalize to a string, self-healing already-persisted
      // numeric values on disk as well as any future write.
      ratingAvg:
        typeof parsed.ratingAvg === "string"
          ? parsed.ratingAvg
          : typeof parsed.ratingAvg === "number"
            ? String(parsed.ratingAvg)
            : "0",
      ratingCount: typeof parsed.ratingCount === "number" ? parsed.ratingCount : 0,
      tripsCount: typeof parsed.tripsCount === "number" ? parsed.tripsCount : 0,
    };
  } catch {
    return null;
  }
}
