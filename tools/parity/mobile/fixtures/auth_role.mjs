// LJ.role_select — the post-OTP role fork. Copy on the customer option follows `restaurantsEnabled`;
// installRouter's default /app/feature-flags route answers all-ON, so it reads the joint-launch "Use
// LyniaGo" wording. "customer" is the default selection, so the customer chip renders in its selected
// (mint-wash) state and the CTA reads "Continue as a customer". No auth context here.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([]);

export default { wrap: withQuery() };
