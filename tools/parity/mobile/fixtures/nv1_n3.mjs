// Notifications v1 N3 — rider, account paused (pinned) (ledger D-66).
import { RF, notifFixture } from "./_notifications_v1.mjs";
export default notifFixture({ side: "rider", rows: [RF.glen, RF.paused, RF.wallet, RF.avon, RF.belg] });
