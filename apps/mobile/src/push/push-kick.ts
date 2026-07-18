/**
 * A tiny module-level pub/sub the primed permissions screen (app/permissions.tsx) uses to nudge the
 * root push registration (usePushRegistration) to re-attempt the instant the user GRANTS notifications
 * there. Push registration is check-don't-request (see push.ts): it only binds a token when permission
 * is already granted, so without this nudge a freshly-granted permission wouldn't register a token
 * until the next foreground or cold start — a rider could miss job pushes for their whole first session
 * despite having just allowed them. Mirrors the reachability store's subscribe pattern.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Nudge every mounted push-registration hook to re-attempt registration now. Safe to call always —
 *  a hook whose registration is already done, terminal, or budget-spent treats it as a no-op. */
export function requestPushRegistration(): void {
  for (const listener of listeners) listener();
}

/** Subscribe to registration kicks; returns an unsubscribe. */
export function subscribePushKick(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
