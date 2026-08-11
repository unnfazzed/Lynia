// LJ.login — the phone/sign-in entry. Fully static on mount: it only calls requestOtp on submit, uses
// no react-query and no auth context, so no providers are needed. Renders the brand lockup, heading,
// phone field and "Send code" button (disabled until 6+ digits, its empty resting state).
export default {};
