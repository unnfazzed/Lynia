// LJ.otp — the OTP verify screen. Reads `phone` (and an optional dev `devCode`) from route params via
// useLocalSearchParams; we set only `phone` so it shows the real "We sent a 6-digit code to …" copy
// (a devCode would swap in the "Test build: code pre-filled" line). No devCode ⇒ the code field starts
// empty and the resend affordance shows its "Resend code in 1:00" cooldown. verify.tsx calls useAuth()
// (signIn is only used on submit), so it needs an AuthProvider present.
import { setParams } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

setParams({ phone: "+263 77 123 4567" });

export default { wrap: withAuthQuery() };
