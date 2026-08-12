import { usePreviewFlags } from "../net/use-preview-flags";
import { isTestBuild } from "./test-build";

/**
 * The single gate for both mobile-money walkthroughs — the rider top-up flow (`RJ.topup_*`) and the
 * customer food-checkout prompt/decline pair (`R5·4` / `R5·b2`).
 *
 * These were QA-APK-only until 2026-08-12, when the owner asked for them in the shipping build ahead
 * of launch. What changed is *reach*, not honesty: the screens still make no network call, still move
 * no money, still never resolve into a success on their own, and now carry their PREVIEW notice
 * unconditionally rather than behind `isTestBuild()`.
 *
 * ── WHY THE WARNING MOVED OFF THIS GATE ─────────────────────────────────────────────────────────
 * Before this change, `SimulatedPathNotice` and `TopUpSimulator`'s strip each re-checked
 * `isTestBuild()` themselves. That coupling was a trap: relaxing the *entry* gate alone would have
 * shipped the fabricated payment screens with their warnings silently switched off — strictly the
 * worst reachable state. The warnings are now unconditional, so this hook can only ever control
 * whether a labelled preview is reachable, never whether it tells the truth. Keep it that way.
 *
 * Two independent sources, either of which opens the flow:
 *  - `isTestBuild()` — the sideloaded QA APK, which has no network guarantees and must keep working
 *    against a dead API, exactly as before;
 *  - `paymentSimulationEnabled` — the server kill switch (`GET /app/preview-flags`), ON by default,
 *    flippable in ~1 minute with no app update. This is what makes shipping the previews reversible.
 */
export function usePaymentSimulation(): boolean {
  const { paymentSimulationEnabled } = usePreviewFlags();
  return isTestBuild() || paymentSimulationEnabled;
}
