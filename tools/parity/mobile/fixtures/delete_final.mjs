// LJ.delete_final — step 2, a SUPERSEDED target (D-82 §2 #6: First Run v2 I's shell, two-step confirm kept): D-79's
// immediate-deletion sentence, the acknowledgement tick (staged ticked, which arms the danger "Delete my account"
// link) under "Keep my account". Both are states of the same screen, staged through its seed props.
import { installRouter } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

installRouter([{ match: "/orders/mine/active-order", json: null }]);

export default { wrap: withAuthQuery(), props: { initialStep: "final", initialAcknowledged: true } };
