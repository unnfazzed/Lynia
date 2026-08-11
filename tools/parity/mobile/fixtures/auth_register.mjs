// LJ.register — the post-OTP "Tell us who you are" profile setup. loadProfileDraft reads SecureStore
// (inert in parity ⇒ no draft), so the form renders in its empty resting state (first/last name +
// national ID placeholders, "Save and continue" disabled until filled). profile/setup.tsx calls
// useAuth(), so an AuthProvider must be present.
import { withAuthQuery } from "./_auth.mjs";

export default { wrap: withAuthQuery() };
