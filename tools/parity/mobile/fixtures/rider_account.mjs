// RJM.account — the Account tab (account.tsx). A pure static screen: one card of tile rows (Rider
// setup & documents, Trip history, Profile & settings), each with its sub-line and chevron. No
// network, no route params — withQuery() just supplies a client for the shared providers.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([]);

export default { wrap: withQuery() };
