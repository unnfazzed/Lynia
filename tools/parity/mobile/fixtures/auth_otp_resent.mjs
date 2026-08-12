// LJ.otp_resent — the OTP screen right after a successful resend (screens-safety.jsx `OtpState`
// variant="resent"): the mint "A fresh code is on its way — check your messages." confirmation above
// the (cleared) code field, and the countdown reading "Resend again in 0:58".
import { setParams } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

setParams({ phone: "+263 77 245 1180" });

export default { wrap: withAuthQuery(), props: { initialResent: true, initialCooldownS: 58 } };
