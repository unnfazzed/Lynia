/**
 * app.config.ts refuses to evaluate on the EAS worker for a store-bound profile when Sentry or the
 * native Maps key is missing (LR20 + the 2026-08-16 blank-map release). `closed` is the profile that
 * reaches the enrolled testers and was once missing from the guarded set (plan C7), so this pins the
 * set to every profile eas.json can build and submit.
 */
import easJson from "../../eas.json";

const GUARDED_ENV = ["EXPO_PUBLIC_SENTRY_DSN", "SENTRY_AUTH_TOKEN", "GOOGLE_MAPS_API_KEY", "EXPO_PUBLIC_GOOGLE_PLACES_KEY"];
const TOUCHED_ENV = ["EAS_BUILD", "EAS_BUILD_PROFILE", ...GUARDED_ENV];

function loadConfig(env: Record<string, string | undefined>): unknown {
  const saved = Object.fromEntries(TOUCHED_ENV.map((k) => [k, process.env[k]]));
  for (const k of TOUCHED_ENV) delete process.env[k];
  Object.assign(process.env, env);
  try {
    let config: unknown;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- re-evaluate the module per env
      config = require("../../app.config").default;
    });
    return config;
  } finally {
    for (const k of TOUCHED_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const provisioned = {
  EXPO_PUBLIC_SENTRY_DSN: "https://dsn.example/1",
  SENTRY_AUTH_TOKEN: "token",
  GOOGLE_MAPS_API_KEY: "maps-key",
  EXPO_PUBLIC_GOOGLE_PLACES_KEY: "places-key",
};

const storeProfiles = Object.keys(easJson.submit);

describe("app.config release build guards", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it("covers closed, preview and production (every submit profile in eas.json)", () => {
    expect(storeProfiles.sort()).toEqual(["closed", "preview", "production"]);
  });

  it.each(storeProfiles)("refuses a %s build without Sentry", (profile) => {
    expect(() =>
      loadConfig({ EAS_BUILD: "true", EAS_BUILD_PROFILE: profile, GOOGLE_MAPS_API_KEY: "maps-key" }),
    ).toThrow(/Sentry is not provisioned/);
  });

  it.each(storeProfiles)("refuses a %s build without the Maps key", (profile) => {
    expect(() =>
      loadConfig({
        EAS_BUILD: "true",
        EAS_BUILD_PROFILE: profile,
        EXPO_PUBLIC_SENTRY_DSN: "https://dsn.example/1",
        SENTRY_AUTH_TOKEN: "token",
      }),
    ).toThrow(/GOOGLE_MAPS_API_KEY is unset/);
  });

  it("names the EAS environment, not the profile, in the closed-profile hint", () => {
    expect(easJson.build.closed.environment).toBe("preview");
    expect(() => loadConfig({ EAS_BUILD: "true", EAS_BUILD_PROFILE: "closed" })).toThrow(/--environment preview /);
  });

  it.each(storeProfiles)("evaluates a fully provisioned %s build", (profile) => {
    expect(loadConfig({ EAS_BUILD: "true", EAS_BUILD_PROFILE: profile, ...provisioned })).toBeTruthy();
  });

  it("warns (does not throw) for a closed build without the OTA-fixable Places key", () => {
    const { EXPO_PUBLIC_GOOGLE_PLACES_KEY: _omit, ...withoutPlaces } = provisioned;
    expect(loadConfig({ EAS_BUILD: "true", EAS_BUILD_PROFILE: "closed", ...withoutPlaces })).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/EXPO_PUBLIC_GOOGLE_PLACES_KEY is unset for profile "closed"/));
  });

  it("does not guard local evaluation or non-store profiles", () => {
    expect(loadConfig({ EAS_BUILD_PROFILE: "closed" })).toBeTruthy();
    expect(loadConfig({ EAS_BUILD: "true", EAS_BUILD_PROFILE: "development" })).toBeTruthy();
  });
});
