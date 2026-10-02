/**
 * The native launch screen is plain brand green — no dove, no wordmark (owner, 2026-10-02, ledger
 * D-64). It only covers the moment before the JS splash (src/boot/splash/BootSplash.tsx) can draw,
 * and that splash's first frame is empty green, so any mark here would vanish and redraw.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const mobileRoot = path.resolve(__dirname, "../../..");
const read = (rel: string): string => readFileSync(path.join(mobileRoot, rel), "utf8");

describe("native launch screen", () => {
  const config = read("app.config.ts");

  it("hands expo-splash-screen the blank assets on the brand green", () => {
    expect(config).toContain('image: "./assets/splash-blank.png"');
    expect(config).toContain('android: { drawable: { icon: "./assets/splash-blank.xml" } }');
    expect(config).toContain('backgroundColor: "#00B14F"');
  });

  it("the Android drawable draws nothing visible", () => {
    const xml = read("assets/splash-blank.xml");
    const fills = [...xml.matchAll(/android:fillColor="([^"]+)"/g)].map((m) => m[1]);
    expect(fills.length).toBeGreaterThan(0);
    for (const f of fills) expect(f).toBe("#00000000");
    expect(xml).not.toMatch(/strokeColor/);
  });

  it("the iOS image is fully transparent", () => {
    const png = readFileSync(path.join(mobileRoot, "assets/splash-blank.png"));
    // 1×1 RGBA: IHDR width/height at bytes 16–23, colour type 6 (RGBA) at byte 25.
    expect(png.readUInt32BE(16)).toBe(1);
    expect(png.readUInt32BE(20)).toBe(1);
    expect(png[25]).toBe(6);
  });

  it("drops onto the JS splash with a straight cut (no native exit fade)", () => {
    // Matched without its terminator: the call is wrapped in the root layout's `bootStep` guard.
    expect(read("app/_layout.tsx")).toContain("SplashScreen.setOptions({ fade: false, duration: 0 })");
  });

  it("keeps the boot's green window background paired with its post-boot reset", () => {
    expect(read("src/boot/boot-splash-hold.tsx")).toContain("scheduleWindowBackgroundReset()");
  });
});
