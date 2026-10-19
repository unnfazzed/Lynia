/**
 * Retiring Preferred riders (docs/designs/own-bikers.md "Distribution Plan", owner decision D6, T9). Own bikers
 * replaces it: a business that runs its own bikers invites them, and every other business's orders go to the
 * nearest biker. It changes dispatch order and the Account screen for EVERY business, so it ships dark behind
 * `PREFERRED_RETIRED` and is switched on once the release is live. Rollback is unsetting it.
 *
 * While it is anything but the literal "true" (so UNSET means Preferred still runs):
 *  - a business whose owner runs Own bikers already skips the preferred-first order (its own bikers go first);
 *  - every other business keeps it, exactly as before.
 * Once "true": no business's dispatch or offer list favours a preferred rider, new ones can't be added, and each
 * owner who had some is told once. The data is kept (rollback), and deleted in a follow-up once the flag has been
 * on for two weeks.
 *
 * Read from `process.env` at the point of use (the penalties pattern): dispatch, the booking's offer list, the
 * riders screen and the one-time note all consult it, and none of them otherwise needs the config. Boot validation
 * lives in config/env.ts.
 */
export const PREFERRED_RETIRED_ENV = "PREFERRED_RETIRED";

export function preferredRetired(): boolean {
  return process.env[PREFERRED_RETIRED_ENV] === "true";
}
