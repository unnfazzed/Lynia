/**
 * isTestBuild reads app.config.ts's extra.testBuild. This file imports ONLY ../test-build (which
 * imports only expo-constants), so fully mocking expo-constants here is safe — no font/asset chain.
 */
const mockExtra: { testBuild?: boolean } = {};
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

import { isTestBuild } from "../test-build";

afterEach(() => {
  delete mockExtra.testBuild;
});

describe("isTestBuild", () => {
  it("is false when extra.testBuild is unset (real release)", () => {
    expect(isTestBuild()).toBe(false);
  });

  it("is false when extra.testBuild is false", () => {
    mockExtra.testBuild = false;
    expect(isTestBuild()).toBe(false);
  });

  it("is true only when extra.testBuild is exactly true", () => {
    mockExtra.testBuild = true;
    expect(isTestBuild()).toBe(true);
  });
});
