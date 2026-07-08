/**
 * PostHog config gating (src/config.ts). Analytics is OPTIONAL: no key → analyticsEnabled() is
 * false and the provider mounts nothing. This file imports ONLY ../config (which imports only
 * expo-constants), so fully mocking expo-constants here is safe — no font/asset chain.
 *
 * The `EXPO_PUBLIC_POSTHOG_*` env path can't be tested here: babel-preset-expo inlines
 * EXPO_PUBLIC_ vars at TRANSFORM time (they're build-time constants, not runtime reads), so
 * mutating process.env in a test is invisible to the compiled module. These tests exercise the
 * `extra.*` fallback (app.config.ts parity path), which resolves at runtime. config.ts computes
 * its exports at module load, so each case re-imports it under jest.isolateModules.
 */
const mockExtra: { posthogApiKey?: string; posthogHost?: string } = {};
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));

type ConfigModule = typeof import("../config");

function loadConfig(): ConfigModule {
  let mod: ConfigModule | undefined;
  jest.isolateModules(() => {
    mod = require("../config") as ConfigModule;
  });
  return mod as ConfigModule;
}

afterEach(() => {
  delete mockExtra.posthogApiKey;
  delete mockExtra.posthogHost;
});

describe("PostHog analytics gating", () => {
  it("is disabled with no key configured (unprovisioned build)", () => {
    const cfg = loadConfig();
    expect(cfg.POSTHOG_API_KEY).toBeNull();
    expect(cfg.analyticsEnabled()).toBe(false);
  });

  it("enables from extra.posthogApiKey/posthogHost (app.config.ts parity path)", () => {
    mockExtra.posthogApiKey = "phc_extra";
    mockExtra.posthogHost = "https://eu.i.posthog.com";
    const cfg = loadConfig();
    expect(cfg.POSTHOG_API_KEY).toBe("phc_extra");
    expect(cfg.POSTHOG_HOST).toBe("https://eu.i.posthog.com");
    expect(cfg.analyticsEnabled()).toBe(true);
  });

  it("defaults the host to US cloud when only a key is set", () => {
    mockExtra.posthogApiKey = "phc_extra";
    const cfg = loadConfig();
    expect(cfg.POSTHOG_HOST).toBe("https://us.i.posthog.com");
  });

  it("stays disabled on an empty-string key (never half-initialize)", () => {
    mockExtra.posthogApiKey = "";
    const cfg = loadConfig();
    expect(cfg.analyticsEnabled()).toBe(false);
  });
});
