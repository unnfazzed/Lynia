// LJ.login — the phone/sign-in entry. Static on mount: it only calls requestOtp on submit and uses no
// react-query. It reads the auth context (Back decides where to go by whether there is a session), so
// the AuthProvider must be present; the parity render never signs in. Renders the brand lockup,
// heading, phone field and "Send code" button (disabled until a digit is typed, its empty resting state).
import { withAuthQuery } from "./_auth.mjs";

export default { wrap: withAuthQuery() };
