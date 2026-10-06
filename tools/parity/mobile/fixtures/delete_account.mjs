// LJ.delete_account — step 1 of deletion, a SUPERSEDED target (D-80 §2 #6: First Run v2 I): the danger hero,
// "Delete your account?" and the live "No delivery running" box. That box is the active-order check, so the
// fixture answers GET /orders/mine/active-order with null (nothing running), the state I draws.
// useAuth() is read for signOut on success, so the provider must be present even though the parity
// render never deletes anything.
import { installRouter } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

installRouter([{ match: "/orders/mine/active-order", json: null }]);

export default { wrap: withAuthQuery() };
