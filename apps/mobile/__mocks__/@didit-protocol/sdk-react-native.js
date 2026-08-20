/**
 * Jest stand-in for Didit's native SDK (mirrors the @sentry/react-native mock next door).
 *
 * The real package is a TurboModule: importing it under jest-expo throws before any test body runs,
 * which would make every screen that can launch a KYC check unmountable. Tests that care about a
 * particular outcome override this with jest.mock(...) locally; the default here is `cancelled`
 * because it is the one outcome that changes no state — a test that forgot to set an expectation
 * lands on "rider closed it", not on a false success.
 */
const VerificationStatus = { Approved: "Approved", Pending: "Pending", Declined: "Declined" };
const CameraLens = { Front: "front", Back: "back" };

module.exports = {
  VerificationStatus,
  CameraLens,
  DiditTransactionError: class DiditTransactionError extends Error {},
  startVerification: jest.fn(async () => ({ type: "cancelled" })),
  startVerificationWithWorkflow: jest.fn(async () => ({ type: "cancelled" })),
  submitTransaction: jest.fn(async () => ({})),
  getTransaction: jest.fn(async () => ({})),
};
