/**
 * MOB-BOOT-04 §8.2 step 2: `src/config.ts` sits in the root layout's eager import graph, which
 * expo-router evaluates BEFORE the error boundary it derives from that same load exists — so a
 * module-scope throw there is a cold-start process kill ("LyniaGo keeps stopping"), not an error
 * screen. These tests pin the replacement contract: evaluating the module NEVER throws, however
 * misconfigured the build is, and API_CONFIG_ERROR names the problem instead. (The other half —
 * apiFetch refusing requests with that message — is client-config-guard.test.ts.)
 *
 * The URL is driven through `extra.apiUrl` (the expo-constants mock), not process.env: babel-preset-
 * expo inlines `process.env.EXPO_PUBLIC_*` reads at transform time, so runtime env changes are
 * invisible to an already-transformed module. In this jest run the inlined env value is unset, which
 * is exactly the release-shaped worst case the boot-safety contract is about.
 */

/** Evaluate a fresh copy of src/config.ts as a release build (__DEV__ false) with a controlled extra. */
function loadConfigAsRelease(extraApiUrl?: string): typeof import("../config") {
  let loaded: typeof import("../config") | undefined;
  const oldDev = (globalThis as { __DEV__?: boolean }).__DEV__;
  // Belt-and-braces: babel-preset-expo normally inlines EXPO_PUBLIC_* at transform time (making the
  // runtime env invisible to config.ts), but if a config ever changes that, a var set in the test
  // process's shell must not outrank the extra.apiUrl these tests control.
  const oldEnv = process.env.EXPO_PUBLIC_API_URL;
  delete process.env.EXPO_PUBLIC_API_URL;
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  try {
    jest.isolateModules(() => {
      jest.doMock("expo-constants", () => ({
        __esModule: true,
        default: { expoConfig: { extra: extraApiUrl ? { apiUrl: extraApiUrl } : {} } },
      }));
      loaded = require("../config") as typeof import("../config");
    });
  } finally {
    (globalThis as { __DEV__?: boolean }).__DEV__ = oldDev;
    if (oldEnv === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = oldEnv;
  }
  if (!loaded) throw new Error("config module did not load");
  return loaded;
}

describe("config.ts — a misconfigured release build boots instead of dying at the splash", () => {
  it("evaluates without throwing when no API URL is configured, and names the gap", () => {
    const cfg = loadConfigAsRelease();
    expect(cfg.API_CONFIG_ERROR).toMatch(/EXPO_PUBLIC_API_URL/);
    expect(cfg.API_URL).toBe("http://localhost:3000"); // the dev fallback still exists, it just can't pass silently
  });

  it.each([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
    "https://0.0.0.0",
    // Non-canonical spellings a naive substring/equality check would miss:
    "http://LOCALHOST:3000",
    "http://user@127.0.0.1:3000",
    "http://user:pw@localhost:3000",
    "http://[0:0:0:0:0:0:0:1]:3000",
    "http://user@[::0001]:3000",
  ])("evaluates without throwing when the configured URL is loopback (%s), and names it", (url) => {
    const cfg = loadConfigAsRelease(url);
    expect(cfg.API_CONFIG_ERROR).toMatch(/loopback/);
  });

  it("does not flag a real host that merely resembles loopback spellings", () => {
    for (const url of ["https://user@api.lyniafinance.com", "https://localhost.lyniafinance.com", "http://[2001:db8::1]"]) {
      expect(loadConfigAsRelease(url).API_CONFIG_ERROR).toBeNull();
    }
  });

  it("treats a URL that is not http(s) as a config error, not a retryable network failure", () => {
    const cfg = loadConfigAsRelease("not-a-url");
    expect(cfg.API_CONFIG_ERROR).toMatch(/valid http/);
  });

  it("reports no error for a correctly configured release build", () => {
    const cfg = loadConfigAsRelease("https://lyniago.lyniafinance.com");
    expect(cfg.API_CONFIG_ERROR).toBeNull();
    expect(cfg.API_URL).toBe("https://lyniago.lyniafinance.com");
  });

  it("reports no error in dev with nothing configured — localhost is legitimate there", () => {
    let loaded: typeof import("../config") | undefined;
    jest.isolateModules(() => {
      jest.doMock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));
      loaded = require("../config") as typeof import("../config");
    });
    expect(loaded?.API_CONFIG_ERROR).toBeNull(); // __DEV__ is true under jest
  });
});
