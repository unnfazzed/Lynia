// Redirect target for `@sentry-internal/{replay,replay-canvas,feedback}` (see
// ./sentry-browser-redirect.js and metro.config.js). Browser session-replay / feedback-widget code
// that cannot run on a phone; nothing in this app configures those features (src/telemetry/sentry.ts
// passes no replay/feedback options), so on-device these exports are referenced by `@sentry/browser`'s
// module-level re-exports but never invoked.
//
// DEFENSIVE BY CONSTRUCTION (MOB-BOOT-03-SIB-1): jest never runs the Metro resolver, so no unit test
// can prove the stub is sufficient — only a device build can (docs/QA-DEVICE-CHECKLIST.md → LR20).
// Every symbol is therefore a safe no-op rather than `undefined`: integration factories return an
// inert integration object (name + setupOnce), getters return undefined, and a Proxy backstop keeps
// any symbol a FUTURE Sentry bump starts referencing callable instead of a TypeError at module load.

/** An inert Sentry-v8-shaped integration: `addIntegration` needs only a `name`. */
const noopIntegration = (name) => () => ({ name, setupOnce() {} });

const explicit = {
  // @sentry-internal/replay
  replayIntegration: noopIntegration("Replay"),
  getReplay: () => undefined,
  // @sentry-internal/replay-canvas
  replayCanvasIntegration: noopIntegration("ReplayCanvas"),
  // @sentry-internal/feedback
  feedbackIntegration: noopIntegration("Feedback"),
  buildFeedbackIntegration: () => noopIntegration("Feedback"),
  feedbackModalIntegration: noopIntegration("FeedbackModal"),
  feedbackScreenshotIntegration: noopIntegration("FeedbackScreenshot"),
  getFeedback: () => undefined,
  sendFeedback: () => Promise.resolve(""),
};

module.exports = new Proxy(explicit, {
  get(target, prop) {
    if (prop in target) return target[prop];
    // Interop probes (Babel/Metro check these on every require) must stay honest.
    if (prop === "__esModule" || prop === "default" || typeof prop === "symbol") return undefined;
    return noopIntegration(String(prop));
  },
});
