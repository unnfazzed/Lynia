/**
 * Splash v1 fixture (ledger D-64, CHANGE-2026-10-06) for tools/parity/shoot-splash.mjs. Mounts the
 * cold-start splash in its BootPhaseProvider and hands the shoot script `window.__splash` to drive the
 * boot from the page:
 *   - `home()`    — the session check is in, bound for Home; Home's two tasks stay pending, so the
 *                   splash holds its `loading` phase (and turns `slow` 4s into it);
 *   - `offline()` — the API can't be reached (the probe keeps failing), so the offline panel shows.
 */
import * as React from "react";
import { BootPhaseProvider } from "../../../../apps/mobile/src/boot/boot-phase.tsx";
import { reportBootDestination } from "../../../../apps/mobile/src/boot/boot-readiness.ts";
import { __setProbeFetch, reportUnreachable } from "../../../../apps/mobile/src/net/reachability.ts";

window.__splash = {
  home: () => reportBootDestination("/home"),
  offline: () => {
    __setProbeFetch(async () => false);
    reportUnreachable();
  },
};

export const wrap = (el) => React.createElement(BootPhaseProvider, null, el);
