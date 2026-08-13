import { usePreviewFlags } from "../net/use-preview-flags";
import { isTestBuild } from "./test-build";

/**
 * The single gate for both mobile-money walkthroughs — the rider top-up flow (`RJ.topup_*`) and the
 * customer food-checkout prompt/decline pair (`R5·4` / `R5·b2`).
 *
 * These were QA-APK-only until 2026-08-12, when the owner asked for them in the shipping build ahead
 * of launch — first as clearly-labelled previews, then, later the same day, with every SIMULATED /
 * PREVIEW marker stripped out on the owner's explicit instruction ("i am taking the risk"), having
 * been shown what each option meant.
 *
 * ── WHAT THAT MAKES THIS HOOK ───────────────────────────────────────────────────────────────────
 * It used to be one of two safeguards, and the weaker one: the screens announced themselves, so the
 * gate only decided reachability. The announcements are gone. **This flag is now the entire control
 * surface over two flows that draw a payment rail nobody has built** — a customer sees an ordinary
 * "check your phone" wait where no prompt was sent, and a rider can reach a success screen that says
 * money was added to a balance that did not change.
 *
 * Consequences to keep in mind before touching this file:
 *   - the server default is ON, so a fetch that resolves normally opens both flows;
 *   - `DEFAULT_PREVIEW_FLAGS` therefore fails SAFE-OFF and must stay that way. It is the last line:
 *     if the flag fetch breaks, the honest screens are what render;
 *   - `isTestBuild()` still opens the flows unconditionally in the QA APK, which has no network
 *     guarantees. That is intended and is not a leak — `extra.testBuild` is only ever set by the
 *     android-test-apk workflow.
 *
 * The one invariant left is behavioural rather than visual: these screens still make no network call
 * and move no money, so the damage is confined to what a user believes, not to the ledger.
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
