// LJ.otp_cooldown — the OTP screen while the resend cooldown runs (screens-safety.jsx `OtpState`
// variant="cooldown"): empty code field with its 000000 placeholder and no hint, "Verify", and the
// muted clock row "Resend in 0:42". The countdown is wall-clock state on the screen, staged here at
// the mock's 42 seconds.
import { setParams } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

setParams({ phone: "+263 77 245 1180" });

export default { wrap: withAuthQuery(), props: { initialCooldownS: 42 } };
