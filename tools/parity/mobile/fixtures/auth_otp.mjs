// LJ.otp — the OTP verify screen in its IDLE state (screens.jsx `Otp`): heading, the "We sent a
// 6-digit code to … by SMS." sub, the code field with its "SMS can take a minute on a busy network."
// hint, "Verify", the green "Didn't get it? Resend code" link and the ghost "Back".
//
// Reads `phone` (and an optional dev `devCode`) from route params via useLocalSearchParams; we set
// only `phone` so it shows the real "We sent a 6-digit code to …" copy (a devCode would swap in the
// "Test build: code pre-filled" line). `initialCooldownS: 0` stages the idle resend affordance — the
// app arrives with a full 60s cooldown running, which is the SEPARATE LJ.otp_cooldown mock.
// verify.tsx calls useAuth() (signIn is only used on submit), so it needs an AuthProvider present.
import { setParams } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

setParams({ phone: "+263 77 245 1180" });

export default { wrap: withAuthQuery(), props: { initialCooldownS: 0 } };
