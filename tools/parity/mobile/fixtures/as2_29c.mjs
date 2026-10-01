// After Send shoot fixture (tools/parity/shoot-after-send.mjs, ledger D-53 v2).
import { stage } from "./_after_send.mjs";

export default stage({ status: "undelivered", pos: "atDrop", extra: { undeliveredReason: "breakdown", undeliveredAttempts: 1 } });
