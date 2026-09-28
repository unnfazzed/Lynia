/**
 * plugins/with-gradle-memory.js (SDK54-07). The first Expo SDK 54 release build ran out of Metaspace in
 * expo-updates' KSP task under the template's `-XX:MaxMetaspaceSize=512m`, and the failed daemon hung
 * the job instead of exiting. Prebuild regenerates gradle.properties on every build, so this transform
 * is what sets the daemon's memory for both the Android Test APK lane and EAS.
 */
import { JVM_ARGS, setGradleJvmArgs } from "../plugins/with-gradle-memory";

type Item = { type: "property"; key: string; value: string } | { type: "comment"; value: string } | { type: "empty" };

/** The SDK 54 template's lines around the setting, as @expo/config-plugins parses gradle.properties. */
const template = (): Item[] => [
  { type: "comment", value: " Specifies the JVM arguments used for the daemon process." },
  { type: "property", key: "org.gradle.jvmargs", value: "-Xmx2048m -XX:MaxMetaspaceSize=512m" },
  { type: "empty" },
  { type: "property", key: "org.gradle.parallel", value: "true" },
];

describe("with-gradle-memory (SDK54-07)", () => {
  it("replaces the template's value in place, leaving every other line alone", () => {
    const items = setGradleJvmArgs(template());
    expect(items).toHaveLength(4);
    expect(items[0]).toEqual(template()[0]);
    expect(items[1]).toEqual({ type: "property", key: "org.gradle.jvmargs", value: JVM_ARGS });
    expect(items[3]).toEqual({ type: "property", key: "org.gradle.parallel", value: "true" });
  });

  it("raises both the heap and the Metaspace ceiling above the template's", () => {
    const megabytes = (flag: RegExp): number => Number(JVM_ARGS.match(flag)?.[1]);
    expect(megabytes(/-Xmx(\d+)m/)).toBeGreaterThan(2048);
    expect(megabytes(/-XX:MaxMetaspaceSize=(\d+)m/)).toBeGreaterThan(512);
  });

  it("adds the setting when the file has none", () => {
    expect(setGradleJvmArgs([{ type: "property", key: "org.gradle.parallel", value: "true" }])).toContainEqual({
      type: "property",
      key: "org.gradle.jvmargs",
      value: JVM_ARGS,
    });
  });

  it("is applied to every build, not gated on an environment variable", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let plugins: unknown[] = [];
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- evaluate the real config
        plugins = require("../app.config").default.plugins;
      });
      expect(plugins).toContain("./plugins/with-gradle-memory");
    } finally {
      warn.mockRestore();
    }
  });
});
