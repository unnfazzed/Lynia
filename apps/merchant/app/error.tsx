"use client";

import { CrashState } from "./components/CrashState";

/**
 * A crash outside the signed-in shell (sign-in, onboarding, join, the biker's hand-over link) or in the
 * shell itself. Same crash state as app/(app)/error.tsx, in the bare phone frame: no Kitchen here, as its
 * reconnect banner needs the (app) layout's connection provider.
 */
export default function RootError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="m-app">
      <main className="m-scroll">
        <CrashState onRetry={reset} />
      </main>
    </div>
  );
}
