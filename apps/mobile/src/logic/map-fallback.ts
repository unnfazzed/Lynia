/**
 * Map-load fallback copy (customer-journey C1 / kit `LJ.map_failed`). Shown when the compose map's
 * tiles never render — a bad or mis-restricted Google Maps key, blocked tiles, an authorization
 * failure — so the customer is told what still works instead of staring at a blank canvas.
 *
 * The old version of this string ended with `type your landmark under "Add details" and we'll use
 * that`, which was simply untrue: `send.tsx` gates Broadcast on `coordsOk` (a lat/lng for BOTH
 * waypoints) and a landmark is text that never produces one. On the build where this card actually
 * appeared — no Places key, no tiles — that sentence was the ONLY instruction on screen and it led
 * nowhere. It is gone.
 *
 * What is offered now is only what genuinely sets a coordinate:
 *  - the address search above (always live: Google Places when keyed, the device geocoder when not —
 *    see `src/logic/geocode.ts`), and
 *  - "Use my location", which sets the ACTIVE slot only, so it is named for the pickup and not for the
 *    drop-off (the customer isn't standing at the recipient's gate).
 */
export function mapFallbackHint(canLocate: boolean): string {
  // Kit copy (screens-shipped.jsx `ComposerState variant="mapfail"`): "You can still send — search
  // both addresses below. The pin is optional once an address is set." Adapted only where the mock's
  // wording would be wrong here: the search sits ABOVE the compose fields on this screen, and the
  // locate shortcut exists for the pickup slot, which the static mock has no way to express.
  const search = "You can still send — search the address above and confirm the pin.";
  return canLocate ? `${search} Or tap "Use my location" for the pickup.` : search;
}
