// Notifications v1 N5 — needs you: See offer · Review swap · Try again (ledger D-66).
import { CF, notifFixture } from "./_notifications_v1.mjs";
export default notifFixture({ rows: [CF.offer, CF.offerExp, CF.pharmSwap, CF.pharmAcc, CF.idc, { ...CF.glen, unread: false }] });
