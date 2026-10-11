/**
 * MJ-P2 (2026-10-07): one round trip for the reads every screen of the merchant web makes on its own.
 *
 * Opening Orders asked `/merchant/me` twice (the board and the tab bar, in the same tick), and signing in
 * asked it again on the landing screen, and `/merchant/invites` again on Join, seconds after the sign-in
 * screen had just read both. A shared read answers every caller from one request:
 *  - while a request is in flight, every caller gets that request (single flight);
 *  - an answer is reused for `freshMs` after it lands — long enough to cover sign-in → landing, short
 *    enough that nobody acts on a stale business. A failure is not reused (the next caller asks again),
 *    unless `keepError` says it is an answer rather than a failure (`not_a_member`: "set up a business").
 *
 * Any write invalidates everything ({@link invalidateReads}: `authedFetch` calls it for every non-GET,
 * and sign-in, sign-out and a branch switch call it too), and a read that started before the write never
 * lands in the cache, so a screen never sees its own change undone.
 */

interface Entry {
  promise: Promise<unknown>;
  /** When it landed (ms); null while in flight. */
  settledAt: number | null;
}

const entries = new Map<string, Entry>();
let generation = 0;

export function sharedRead<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { freshMs: number; keepError?: (err: unknown) => boolean; now?: () => number },
): Promise<T> {
  const now = opts.now ?? Date.now;
  const existing = entries.get(key);
  if (existing && (existing.settledAt === null || now() - existing.settledAt < opts.freshMs)) return existing.promise as Promise<T>;

  const started = generation;
  let promise: Promise<T>;
  try {
    promise = fetcher();
  } catch (err) {
    promise = Promise.reject(err);
  }
  const entry: Entry = { promise, settledAt: null };
  entries.set(key, entry);
  const settle = (keep: boolean) => {
    if (entries.get(key) !== entry) return;
    if (keep && started === generation) entry.settledAt = now();
    else entries.delete(key);
  };
  promise.then(
    () => settle(true),
    (err: unknown) => settle(opts.keepError?.(err) ?? false),
  );
  return promise;
}

/** Forget every shared read: the next caller asks the server. */
export function invalidateReads(): void {
  generation += 1;
  entries.clear();
}
