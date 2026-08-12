// LJ.perm_notif — step 2 of first-run permission priming ("Stay in the loop"), the notifications
// explainer. Same screen as LJ.perm_loc (app/permissions.tsx); the step is the container's own state,
// staged through its `initialStep` prop. No `next` param ⇒ the customer framing the mock draws.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([]);

export default { wrap: withQuery(), props: { initialStep: "notifications" } };
