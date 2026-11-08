import { holdInstallTipForLink, installTipHeldForLink, releaseInstallTipHold } from "../link-tip-hold";

describe("DR12: the install tip waits for the first order from a link", () => {
  const store = new Map<string, string>();
  beforeAll(() => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });
  afterAll(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("holds after a link, releases after the order", () => {
    expect(installTipHeldForLink()).toBe(false);
    holdInstallTipForLink();
    expect(installTipHeldForLink()).toBe(true);
    releaseInstallTipHold();
    expect(installTipHeldForLink()).toBe(false);
  });

  it("no storage (the phones): never held", () => {
    const saved = (globalThis as { localStorage?: unknown }).localStorage;
    delete (globalThis as { localStorage?: unknown }).localStorage;
    holdInstallTipForLink();
    expect(installTipHeldForLink()).toBe(false);
    (globalThis as { localStorage?: unknown }).localStorage = saved;
  });
});
