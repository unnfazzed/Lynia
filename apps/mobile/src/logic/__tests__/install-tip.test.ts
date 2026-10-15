import { installTipSurface, isIOSDevice, isIOSSafari, type InstallTipFacts } from "../install-tip";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  ipadSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0",
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
};

const base: InstallTipFacts = {
  webBuild: true,
  userAgent: UA.iphoneSafari,
  maxTouchPoints: 5,
  standalone: false,
  installParam: true,
  dismissed: { tip: false, pin: false, appStore: false },
  appStoreUrl: "",
  width: 390,
};
const facts = (over: Partial<InstallTipFacts>): InstallTipFacts => ({ ...base, ...over, dismissed: { ...base.dismissed, ...over.dismissed } });

describe("iOS Safari detection", () => {
  it("knows iPhone and iPad Safari, including iPadOS's Mac user agent", () => {
    expect(isIOSSafari(UA.iphoneSafari, 5)).toBe(true);
    expect(isIOSSafari(UA.ipadSafari, 5)).toBe(true);
    expect(isIOSDevice(UA.macSafari, 0)).toBe(false);
  });
  it("leaves out other iOS browsers, in-app web views and Android", () => {
    expect(isIOSSafari(UA.iphoneChrome, 5)).toBe(false);
    expect(isIOSSafari(UA.iphoneInstagram, 5)).toBe(false);
    expect(isIOSSafari(UA.android, 5)).toBe(false);
  });
});

describe("installTipSurface — the handoff's 'When it shows' table", () => {
  it("iPhone Safari, not installed, ?install=1, not dismissed → the sheet", () => {
    expect(installTipSurface(base)).toBe("sheet");
  });
  it("narrower than 360 → the small-phone sheet", () => {
    expect(installTipSurface(facts({ width: 320 }))).toBe("sheetSmall");
    expect(installTipSurface(facts({ width: 360 }))).toBe("sheet");
  });
  it("sheet dismissed, pin not → the pin row, and ?install=1 does not reopen the sheet", () => {
    expect(installTipSurface(facts({ dismissed: { tip: true, pin: false, appStore: false } }))).toBe("pin");
    expect(installTipSurface(facts({ installParam: false, dismissed: { tip: true, pin: false, appStore: false } }))).toBe("pin");
  });
  it("pin dismissed too → nothing", () => {
    expect(installTipSurface(facts({ dismissed: { tip: true, pin: true, appStore: false } }))).toBeNull();
  });
  it("never arrived through the download link → nothing (no pin row for everyone)", () => {
    expect(installTipSurface(facts({ installParam: false }))).toBeNull();
  });
  it("installed (standalone) → nothing, ever", () => {
    expect(installTipSurface(facts({ standalone: true }))).toBeNull();
    expect(installTipSurface(facts({ standalone: true, appStoreUrl: "https://apps.apple.com/app/id1" }))).toBeNull();
  });
  it("Android, desktop, other iOS browsers, the phone apps → nothing", () => {
    expect(installTipSurface(facts({ userAgent: UA.android }))).toBeNull();
    expect(installTipSurface(facts({ userAgent: UA.macSafari, maxTouchPoints: 0 }))).toBeNull();
    expect(installTipSurface(facts({ userAgent: UA.iphoneChrome }))).toBeNull();
    expect(installTipSurface(facts({ webBuild: false }))).toBeNull();
  });
  it("App Store link configured → the launched sheet once, instead of the tip", () => {
    const url = "https://apps.apple.com/app/id1";
    expect(installTipSurface(facts({ appStoreUrl: url }))).toBe("launched");
    expect(installTipSurface(facts({ appStoreUrl: url, installParam: false, dismissed: { tip: true, pin: false, appStore: false } }))).toBe("launched");
    expect(installTipSurface(facts({ appStoreUrl: url, dismissed: { tip: false, pin: false, appStore: true } }))).toBeNull();
  });
});
