import { Platform } from "react-native";

/**
 * The customer web build's disk caches. expo-file-system has no web implementation, so before these
 * stores had a browser backend the web's warm boot never restored and the order screen's offline copy
 * was never written. These pin the browser backend: round-trips, survives broken storage, and sign-out
 * wipes everything it wrote (shared devices, S1) — without touching sign-in storage.
 */

jest.mock("expo-file-system/legacy", () => ({
  readAsStringAsync: jest.fn(() => Promise.reject(new Error("no web impl"))),
  writeAsStringAsync: jest.fn(() => Promise.reject(new Error("no web impl"))),
  deleteAsync: jest.fn(() => Promise.reject(new Error("no web impl"))),
  makeDirectoryAsync: jest.fn(() => Promise.reject(new Error("no web impl"))),
  documentDirectory: null,
}));

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

const originalOS = Platform.OS;
let store: Storage;

beforeEach(() => {
  store = memoryStorage();
  Object.defineProperty(globalThis, "localStorage", { value: store, configurable: true, writable: true });
  Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
});
afterEach(() => {
  Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

function loadOrderCopyStore(): typeof import("../order-copy-store") {
  let mod!: typeof import("../order-copy-store");
  jest.isolateModules(() => {
    // A fresh registry gets a fresh react-native, so flip its Platform before the store reads it.
    Object.defineProperty(require("react-native").Platform, "OS", { value: "web", configurable: true });
    mod = require("../order-copy-store");
  });
  return mod;
}

const order = (id: string) => ({ id, status: "ASSIGNED" }) as unknown as import("../../api/orders").OrderSnapshot;

describe("order copies on the web", () => {
  it("saves and loads a copy through browser storage", async () => {
    const s = loadOrderCopyStore();
    await s.saveOrderCopy(order("ord-1"));
    const copy = await s.loadOrderCopy("ord-1");
    expect(copy?.order.id).toBe("ord-1");
    expect(typeof copy?.at).toBe("string");
  });

  it("refuses a copy saved under another order's id", async () => {
    const s = loadOrderCopyStore();
    store.setItem("lynia.cache:order-copy:ord-2", JSON.stringify({ at: "x", order: { id: "ord-9" } }));
    expect(await s.loadOrderCopy("ord-2")).toBeNull();
  });

  it("reads a corrupt copy as no copy", async () => {
    const s = loadOrderCopyStore();
    store.setItem("lynia.cache:order-copy:ord-3", "{not json");
    expect(await s.loadOrderCopy("ord-3")).toBeNull();
  });

  it("clears one copy, and sign-out clears them all but leaves sign-in storage alone", async () => {
    const s = loadOrderCopyStore();
    await s.saveOrderCopy(order("a"));
    await s.saveOrderCopy(order("b"));
    await s.saveOrderCopy(order("c"));
    store.setItem("lynia.secure:session", "token");
    await s.clearOrderCopy("a");
    expect(await s.loadOrderCopy("a")).toBeNull();
    expect(await s.loadOrderCopy("b")).not.toBeNull();
    await s.clearAllOrderCopies();
    expect(await s.loadOrderCopy("b")).toBeNull();
    expect(await s.loadOrderCopy("c")).toBeNull();
    expect(store.getItem("lynia.secure:session")).toBe("token");
  });

  it("never throws when the browser blocks storage", async () => {
    const throwing = {
      get length(): number {
        throw new Error("blocked");
      },
      key: () => {
        throw new Error("blocked");
      },
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
      clear: () => undefined,
    } as Storage;
    Object.defineProperty(globalThis, "localStorage", { value: throwing, configurable: true, writable: true });
    const s = loadOrderCopyStore();
    await expect(s.saveOrderCopy(order("x"))).resolves.toBeUndefined();
    await expect(s.loadOrderCopy("x")).resolves.toBeNull();
    await expect(s.clearAllOrderCopies()).resolves.toBeUndefined();
  });
});

describe("the warm-boot query cache on the web", () => {
  it("round-trips through browser storage instead of the missing file system", async () => {
    const { webStorage } = require("../../query/persist") as typeof import("../../query/persist");
    await webStorage.setItem("lynia-rq-cache", '{"clientState":{}}');
    expect(await webStorage.getItem("lynia-rq-cache")).toBe('{"clientState":{}}');
    expect(store.getItem("lynia.cache:lynia-rq-cache")).toBe('{"clientState":{}}');
    await webStorage.removeItem("lynia-rq-cache");
    expect(await webStorage.getItem("lynia-rq-cache")).toBeNull();
  });
});
