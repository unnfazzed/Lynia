// LJ.register — the post-OTP "Tell us who you are" profile setup. loadProfileDraft reads SecureStore
// (inert in parity ⇒ no draft), so the form renders in its empty resting state (single "Full name" +
// national ID placeholders, "Continue" disabled until filled). We set the `phone` route param (as
// verify.tsx threads it) so the read-only "Verified" phone field the mock draws shows a number.
// profile/setup.tsx calls useAuth(), so an AuthProvider must be present.
import { setParams } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

setParams({ phone: "+263 77 245 1180" });

export default { wrap: withAuthQuery() };
