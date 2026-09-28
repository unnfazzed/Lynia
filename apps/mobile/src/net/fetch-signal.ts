/**
 * The `signal` to hand `fetch` for an AbortController — a TYPES-ONLY bridge; the runtime object is
 * exactly `controller.signal`.
 *
 * Since Expo SDK 54, `expo/types/global.d.ts` references Node's type library, so `new AbortController()`
 * is typed with Node's class, while React Native 0.81's global `fetch` types `RequestInit.signal` with
 * React Native's own `AbortSignal` (declared in a `declare global` block; the two disagree on whether
 * `onabort` may be null). TypeScript then rejects the very signal React Native's AbortController
 * produced. One documented bridge here instead of a cast at every fetch call site.
 */
export function fetchSignal(controller: AbortController): RequestInit["signal"] {
  return controller.signal as unknown as RequestInit["signal"];
}
