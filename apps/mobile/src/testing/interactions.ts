import { InteractionManager } from "react-native";

/**
 * Deterministic control over `InteractionManager.runAfterInteractions` for tests.
 *
 * The real scheduler drains its queue on a `setImmediate` batch and tracks the pending handle in a
 * MODULE-GLOBAL (`_nextUpdateHandle` in RN's InteractionManager). Under fake timers that global is a
 * trap: a test that schedules an interaction and then unmounts without draining leaves the handle
 * permanently set, and `_scheduleUpdate` no-ops for every later test in the file — the interaction
 * simply never fires again, with no error to explain it. Driving the queue by hand instead keeps each
 * test independent of both fake-timer configuration and whatever the previous test left behind.
 *
 * Call in `beforeEach`; the spy is restored by `restore()` (or Jest's own `restoreMocks`).
 */
export type InteractionControl = {
  /** Run every task queued since the last flush, in order. */
  flush: () => void;
  /** How many tasks are queued and not yet flushed (cancelled ones are dropped). */
  pending: () => number;
  /** Put the real `runAfterInteractions` back. */
  restore: () => void;
};

export function controlInteractions(): InteractionControl {
  let tasks: Array<() => void> = [];
  const spy = jest.spyOn(InteractionManager, "runAfterInteractions").mockImplementation((task) => {
    const fn = typeof task === "function" ? task : task?.gen;
    if (fn) tasks.push(fn as () => void);
    // Only `cancel` is modelled: it is the whole of the handle's contract that production code here
    // uses (both call sites cancel on unmount and neither awaits). Deliberately NOT thenable — an
    // object carrying `then` is one stray `await` away from being treated as a promise.
    return {
      cancel: () => {
        tasks = tasks.filter((t) => t !== fn);
      },
    } as unknown as ReturnType<typeof InteractionManager.runAfterInteractions>;
  });
  return {
    flush: () => {
      const queued = tasks;
      tasks = [];
      for (const t of queued) t();
    },
    pending: () => tasks.length,
    restore: () => spy.mockRestore(),
  };
}
