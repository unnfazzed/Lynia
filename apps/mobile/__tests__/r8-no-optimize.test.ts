/**
 * R8 must keep running with AGP's proguard-android.txt (`-dontoptimize`): shrink + obfuscate only.
 * 0.53.0 (vc 48) switched to proguard-android-optimize.txt (PR #1201) and every launch on the
 * public build then threw `ExpoSplashScreen.setOptions … cannot be cast to SplashScreenOptions`
 * (NullPointerException, Sentry LYNIA-MOBILE-7), first seen minutes after vc 48 shipped and on no
 * earlier build. The likely mechanism: R8's optimizer rewrote an Expo `Record` class, which
 * expo-modules-core builds and fills by reflection. Every Expo module that takes an options
 * object (location, notifications, image picker…) decodes it the same way, so the whole lane was
 * at risk, not just the splash. Reverted in vc 49; see docs/KNOWN_BUGS.md MOB-R8-01. Don't
 * re-enable optimization without an on-device release-build smoke of every native module call.
 */
import fs from "fs";
import path from "path";

const mobileRoot = path.join(__dirname, "..");

describe("R8 optimization stays off (MOB-R8-01)", () => {
  it("registers no config plugin that switches R8 to the optimizing default file", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let plugins: unknown[] = [];
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- evaluate the real config
        plugins = require("../app.config").default.plugins;
      });
      const names = plugins.map((p) => (Array.isArray(p) ? p[0] : p)).filter((p) => typeof p === "string");
      expect(names.filter((n) => /r8|optimi[sz]e/i.test(n as string))).toEqual([]);
    } finally {
      warn.mockRestore();
    }
  });

  it("references proguard-android-optimize.txt nowhere in the app's config or plugins", () => {
    const files = [
      path.join(mobileRoot, "app.config.ts"),
      ...fs
        .readdirSync(path.join(mobileRoot, "plugins"))
        .filter((f) => f.endsWith(".js") || f.endsWith(".ts"))
        .map((f) => path.join(mobileRoot, "plugins", f)),
    ];
    for (const file of files) {
      expect({ file, hit: fs.readFileSync(file, "utf8").includes("proguard-android-optimize") }).toEqual({
        file,
        hit: false,
      });
    }
  });
});
