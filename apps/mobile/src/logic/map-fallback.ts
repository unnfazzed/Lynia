/**
 * Map-load fallback copy (customer-journey C1). When the compose map times out before signalling
 * ready — a missing Google Maps key, blocked tiles, or a WebGL failure — the screen falls back to
 * whatever address-entry affordances actually render. `AddressSearch` is key-gated
 * (`placesEnabled()`) and "Use my location" only sets the pickup pin (the recipient isn't standing
 * at the drop-off), so this must name only the affordances that are really on screen rather than
 * always pointing at a search box or locate button that may not exist.
 */
export function mapFallbackHint(canSearch: boolean, canLocate: boolean): string {
  const actions: string[] = [];
  if (canSearch) actions.push("search for an address above");
  if (canLocate) actions.push('tap "Use my location" below');
  actions.push('type your landmark under "Add details" and we\'ll use that');
  const last = actions[actions.length - 1] as string;
  const sentence = actions.length === 1 ? last : `${actions.slice(0, -1).join(", ")}, or ${last}`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}
