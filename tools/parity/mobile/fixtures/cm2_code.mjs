// Calm Mint v2 C4 (packages/design/handoff/calm-mint-v2-2026-10, ledger D-55): the code screen 42s into
// its resend countdown, the code sent over WhatsApp. Evidence-only (tools/parity/shoot-calm-mint.mjs).
import { setParams } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

setParams({ phone: "+263772451180", deliveryChannel: "whatsapp" });

export default { wrap: withAuthQuery(), props: { initialCooldownS: 42 } };
