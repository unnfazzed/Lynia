// LJ.delete_account — step 1 of deletion: the explainer card and the mint "No delivery is running —
// you're clear to continue." strip. That strip is the live active-order check, so the fixture answers
// GET /orders/mine/active-order with null (nothing running), which is the state the mock draws.
// useAuth() is read for signOut on success, so the provider must be present even though the parity
// render never deletes anything.
import { installRouter } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

installRouter([{ match: "/orders/mine/active-order", json: null }]);

export default { wrap: withAuthQuery() };
