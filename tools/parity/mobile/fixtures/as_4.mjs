// After Send shoot fixture (tools/parity/shoot-after-send.mjs, ledger D-53).
import { stage } from "./_after_send.mjs";

export default stage({ status: "open_for_offers", offers: 3, race: true });
