// Redirect target for `require("./surveys")` inside posthog-react-native's package index (see
// ./bundle-trim-redirect.js). The app never mounts PostHog's survey UI, so these exports are only
// re-exported by the index, never used. Kept inert rather than absent: the provider passes its
// children through and the survey widgets render nothing.
function PostHogSurveyProvider(props) {
  return props && props.children !== undefined ? props.children : null;
}
function SurveyModal() {
  return null;
}
const Questions = {};

module.exports = { PostHogSurveyProvider, SurveyModal, Questions };
