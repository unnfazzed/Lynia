/**
 * jest-expo reports Platform.OS "ios", but this suite exercises the Android launch product. The
 * iPhone app ships customer-only (src/rider-mode.ts), so without this default every rider-mode test
 * would silently see rider mode switched off. `isRiderOnlyRoute` keeps its real implementation.
 *
 * The default is re-armed before EVERY test, so a test that turns rider mode off can't leak into the
 * next one. Tests of the iOS gate override it in their own body or beforeEach (which runs after this):
 *
 *   jest.mocked(riderModeAvailable).mockReturnValue(false);
 */
jest.mock("./src/rider-mode", () => ({
  ...jest.requireActual("./src/rider-mode"),
  riderModeAvailable: jest.fn(() => true),
}));

beforeEach(() => {
  jest.requireMock("./src/rider-mode").riderModeAvailable.mockImplementation(() => true);
});
