"use client";

import "./globals.css";
import "./mobile.css";
import { CrashState } from "./components/CrashState";

/**
 * A crash in the root layout itself (the toast provider or the access gate). Next swaps out the whole
 * document for this, so it brings its own <html>, <body> and stylesheets.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <div className="m-app">
          <main className="m-scroll">
            <CrashState onRetry={reset} />
          </main>
        </div>
      </body>
    </html>
  );
}
