// LJ.notif_empty — the notifications centre with nothing in it. Same screen (and same generated
// view) as LJ.notifications; the mock's `Notifications({ empty })` branch is driven purely by an
// empty feed, so the fixture is the populated one with GET /notifications/feed answering [].
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([{ match: "/notifications/feed", json: [] }]);

export default { wrap: withQuery() };
