// After Send shoot fixture (tools/parity/shoot-after-send.mjs, ledger D-53 v2).
import { stage } from "./_after_send.mjs";

export default stage({ status: "en_route_pickup", extra: { events: [{ status: "assigned", createdAt: new Date(Date.now() - 20_000).toISOString() }] } });
