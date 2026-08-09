// B-O14: the kitchen tablet stays mounted for the whole shift, so any acknowledgement-tracking
// `Set<string>` fed only by "add, never remove" writes (e.g. QueueBoard's `ackSecuredIds`/
// `ackHoldIds`) grows for as long as the tablet stays open. Bounded in practice by one
// restaurant's daily order volume (tens to a few hundred), same low-severity shape as the
// mobile rider board's B-O13 fix — cap + FIFO-evict (Sets preserve insertion order) bounds it
// regardless of shift length, ported verbatim from `apps/mobile/src/realtime/use-rider-board.ts`.
export function addBoundedId(prev: Set<string>, id: string, cap: number): Set<string> {
  if (prev.has(id)) return prev;
  const next = new Set(prev);
  next.add(id);
  if (next.size > cap) {
    next.delete(next.values().next().value as string);
  }
  return next;
}
