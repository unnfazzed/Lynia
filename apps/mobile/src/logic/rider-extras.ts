/**
 * Biker sign-up v1 X1/X2 (ledger D-135): R3 "You're verified" hands its Go-online continuation to the extras
 * screen, which runs the rider permission flow with it once the photo and plate are added or skipped.
 * Process memory only: a cold restart lands on the board, where Go online works as before.
 */
let then: (() => void) | null = null;

export function holdExtrasThen(cb: () => void): void {
  then = cb;
}

export function takeExtrasThen(): (() => void) | null {
  const cb = then;
  then = null;
  return cb;
}

/** X1/X2 are offered only when something is still missing. */
export function extrasNeeded(rider: { hasPhoto?: boolean; bikeReg?: string | null } | null | undefined): boolean {
  return !!rider && (!rider.hasPhoto || !rider.bikeReg?.trim());
}
