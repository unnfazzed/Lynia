// RJ.kyc_intro — the "Become a rider" onboarding form (become.tsx). The screen reads no network on
// mount (it hydrates an on-device KYC draft, which the inert secure-store shim answers empty), so it
// paints its populated first state directly: the name/ID card, the bike-reg + photo-capture card, the
// id-card reassurance block, and the "Submit for verification" button. No router params, no fetches —
// withQuery() just supplies a client for the shared providers.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([]);

export default { wrap: withQuery() };
