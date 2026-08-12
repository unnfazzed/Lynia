// LJ.force_update — the hard version gate. No providers or props; the screen is self-contained.
//
// The one thing it DOES need staged is config: `src/config.ts` resolves STORE_URL once at module
// init, and `app/force-update.tsx` hides its primary button when there is no store URL. Without a
// store URL the screen renders without the mock's "Update now" — a fixture artefact, not a parity
// defect. Set it here (before the screen's module graph initializes — see mobile/bundle.mjs) so the
// screen stages the state the mock draws.
process.env.EXPO_PUBLIC_STORE_URL = process.env.EXPO_PUBLIC_STORE_URL || "https://play.google.com/store/apps/details?id=zw.co.lynia";

export default {};
