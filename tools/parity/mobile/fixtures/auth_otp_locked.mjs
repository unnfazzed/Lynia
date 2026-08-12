// LJ.otp_locked — the expired/locked recovery branch (screens-safety.jsx `OtpState` variant="locked"):
// the code field carries the "That code has expired." error, the lockout explainer card replaces the
// hint, and the primary becomes "Send a fresh code" with no countdown row.
import { setParams } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

setParams({ phone: "+263 77 245 1180" });

export default { wrap: withAuthQuery(), props: { initialLocked: true } };
