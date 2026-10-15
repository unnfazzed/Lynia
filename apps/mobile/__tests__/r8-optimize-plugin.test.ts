/**
 * plugins/with-r8-optimize.js. The SDK 54 template points R8 at AGP's proguard-android.txt, whose
 * `-dontoptimize` turns off every optimization pass even with minify on (Play vitals, release 47:
 * "Optimization isn't enabled"). Prebuild regenerates app/build.gradle on every build, so this
 * transform is what switches the release build to proguard-android-optimize.txt.
 */
import { OPTIMIZED, UNOPTIMIZED, useOptimizedProguardFile } from "../plugins/with-r8-optimize";

/** The SDK 54 template's release block (expo-template-bare-minimum@sdk-54, android/app/build.gradle). */
const template = `
    buildTypes {
        release {
            shrinkResources enableShrinkResources.toBoolean()
            minifyEnabled enableMinifyInReleaseBuilds
            proguardFiles ${UNOPTIMIZED}, "proguard-rules.pro"
        }
    }
`;

describe("with-r8-optimize", () => {
  it("swaps the template's unoptimized default file for the optimizing one, keeping the app's rules", () => {
    const out = useOptimizedProguardFile(template);
    expect(out).not.toContain(UNOPTIMIZED);
    expect(out).toContain(`proguardFiles ${OPTIMIZED}, "proguard-rules.pro"`);
    expect(out).toContain("minifyEnabled enableMinifyInReleaseBuilds");
  });

  it("is idempotent", () => {
    const once = useOptimizedProguardFile(template);
    expect(useOptimizedProguardFile(once)).toBe(once);
  });

  it("fails loudly when the template no longer has the line, rather than shipping unoptimized", () => {
    expect(() => useOptimizedProguardFile("android { }")).toThrow(/with-r8-optimize/);
  });

  it("is applied to every build, not gated on an environment variable", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let plugins: unknown[] = [];
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- evaluate the real config
        plugins = require("../app.config").default.plugins;
      });
      expect(plugins).toContain("./plugins/with-r8-optimize");
    } finally {
      warn.mockRestore();
    }
  });
});
