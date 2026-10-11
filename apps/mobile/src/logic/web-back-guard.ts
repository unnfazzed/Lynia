import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

/**
 * U40: the browser's Back (the iPhone edge swipe, Android's system Back in Chrome, the back button) on a
 * screen whose own Back walks steps — Send a parcel's steps 2–4 and its inline address edit. On the phone
 * the hardware Back runs the screen's `back()`; in a browser it popped the whole route and the compose was
 * gone. expo-router restores a browser Back with `resetRoot`, which never fires `beforeRemove`, so
 * `usePreventRemove` cannot catch it.
 *
 * The guard keeps ONE extra history entry on top of the screen's own while the screen has a step to walk
 * back. The entry carries the same expo-router id and URL, so the router reads both as the same screen.
 * A browser Back pops the guard entry, the router resets to the state it already shows, and the guard
 * calls the screen's `back()`; if there is still a step to walk back, the entry is pushed again. When the
 * screen reaches its first step the entry is taken off again (`history.back()`, ignored here), so a Back
 * from step 1 leaves the screen exactly as before. `release()` takes it off before the screen navigates
 * away, so the browser history behind a placed order holds no stale compose entries.
 *
 * Web only; a no-op on Android and iOS, where `BackHandler` already does this.
 */

export const BACK_GUARD_MARK = "lyniaBackGuard";
/** How long `release()` waits for the browser's popstate before carrying on regardless. */
export const RELEASE_TIMEOUT_MS = 300;

/** The slice of `window` the guard uses — a fake in tests. */
export interface BackGuardWindow {
  history: { state: unknown; pushState(data: unknown, unused: string, url?: string | null): void; back(): void };
  location: { href: string };
  addEventListener(type: "popstate", fn: () => void): void;
  removeEventListener(type: "popstate", fn: () => void): void;
}

export interface WebBackGuard {
  /** Push the guard entry (no-op when it is already on top). */
  arm(): void;
  /** Take the guard entry off (no-op when there is none). */
  disarm(): void;
  /** Take the guard entry off and resolve once the browser has popped it — before navigating away. */
  release(): Promise<void>;
  isArmed(): boolean;
  dispose(): void;
}

function isGuardState(state: unknown): boolean {
  return !!state && typeof state === "object" && (state as Record<string, unknown>)[BACK_GUARD_MARK] === true;
}

export function createWebBackGuard(win: BackGuardWindow, onBack: () => void): WebBackGuard {
  let armed = false;
  /** Pops this guard caused itself (disarm / release), which must not run the screen's back(). */
  let ownPops = 0;
  const waiters: (() => void)[] = [];

  const onPop = (): void => {
    if (ownPops > 0) {
      ownPops -= 1;
      waiters.splice(0).forEach((w) => w());
      return;
    }
    // Forward onto a guard entry (the browser's Forward after a guarded Back): it is on top again.
    if (isGuardState(win.history.state)) {
      armed = true;
      return;
    }
    if (!armed) return;
    armed = false;
    onBack();
  };
  win.addEventListener("popstate", onPop);

  const disarm = (): void => {
    if (!armed) return;
    armed = false;
    ownPops += 1;
    win.history.back();
  };

  return {
    arm(): void {
      if (armed) return;
      const state = win.history.state;
      // After a reload on a guarded step the browser still sits on our guard entry: adopt it rather than
      // stacking a second one (which would take two Backs to walk one step).
      if (isGuardState(state)) {
        armed = true;
        return;
      }
      const base = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
      win.history.pushState({ ...base, [BACK_GUARD_MARK]: true }, "", win.location.href);
      armed = true;
    },
    disarm,
    release(): Promise<void> {
      if (!armed) return Promise.resolve();
      return new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          resolve();
        };
        waiters.push(finish);
        setTimeout(finish, RELEASE_TIMEOUT_MS);
        disarm();
      });
    },
    isArmed: () => armed,
    dispose(): void {
      win.removeEventListener("popstate", onPop);
      waiters.splice(0).forEach((w) => w());
    },
  };
}

function browserWindow(): BackGuardWindow | null {
  if (Platform.OS !== "web") return null;
  const w = (globalThis as { window?: Partial<BackGuardWindow> }).window;
  return w && w.history && typeof w.history.pushState === "function" && typeof w.addEventListener === "function" ? (w as BackGuardWindow) : null;
}

/**
 * Keep a browser-Back guard while `active` (the screen has a step to walk back), running `onBack` when the
 * browser's Back is used. Returns `release`, to await before the screen navigates away while guarded.
 * `win` is a test seam; the app passes nothing and gets the browser's window on web, nothing elsewhere.
 */
export function useWebBackGuard(active: boolean, onBack: () => void, win: BackGuardWindow | null = browserWindow()): { release: () => Promise<void> } {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const guard = useRef<WebBackGuard | null>(null);
  // Bumped after a guarded Back so the arm effect runs again when the screen still has steps to walk.
  const [rev, setRev] = useState(0);
  const hasWin = win != null;
  const winRef = useRef(win);

  useEffect(() => {
    const w = winRef.current;
    if (!w) return;
    const g = createWebBackGuard(w, () => {
      onBackRef.current();
      setRev((r) => r + 1);
    });
    guard.current = g;
    return () => {
      g.dispose();
      guard.current = null;
    };
  }, [hasWin]);

  useEffect(() => {
    const g = guard.current;
    if (!g) return;
    if (active) g.arm();
    else g.disarm();
  }, [active, rev, hasWin]);

  const release = useCallback((): Promise<void> => guard.current?.release() ?? Promise.resolve(), []);
  return { release };
}
