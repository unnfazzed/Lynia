/**
 * The Send a parcel draft's storage slot (U17), on its own so sign-out's `clearDeviceState`
 * (src/auth/device-state.ts) can clear it without importing the draft module and, through it,
 * the UI it touches. Keep this file free of imports.
 */
export const SEND_DRAFT_KEY = "lynia.orderDraft";
