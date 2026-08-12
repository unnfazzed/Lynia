// LJ.delete_final — step 2: the 30-day grace copy, the acknowledgement tick (the mock draws it
// already ticked, which is also what arms the danger-filled "Delete my account"), and the ghost
// "Keep my account". Both are states of the same screen, staged through its seed props.
import { installRouter } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

installRouter([{ match: "/orders/mine/active-order", json: null }]);

export default { wrap: withAuthQuery(), props: { initialStep: "final", initialAcknowledged: true } };
