import path from "path";
import { resolve, runtimeDir } from "../metro-shims/web-runtime";

// eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS shim module
const secureStore = require("../metro-shims/secure-store-web");
// eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS shim module
const maps = require("../metro-shims/react-native-maps-web");

const shim = (file: string): string => path.join(__dirname, "..", "metro-shims", file);
const appFile = path.join(__dirname, "..", "src", "ui", "fonts.ts");

function contextFrom(origin: string) {
  const calls: { origin: string; name: string }[] = [];
  const context = {
    originModulePath: origin,
    resolveRequest: (ctx: { originModulePath: string }, name: string) => {
      calls.push({ origin: ctx.originModulePath, name });
      return { type: "sourceFile", filePath: `resolved:${name}` };
    },
  };
  return { context, calls };
}

describe("web-runtime (customer web build resolution)", () => {
  it("serves react-native as react-native-web from tools/web-runtime", () => {
    const { context, calls } = contextFrom(appFile);
    resolve(context, "react-native", "web");
    resolve(context, "react-native-web/dist/index", "web");
    expect(calls).toEqual([
      { origin: path.join(runtimeDir, "package.json"), name: "react-native-web" },
      { origin: path.join(runtimeDir, "package.json"), name: "react-native-web/dist/index" },
    ]);
  });

  it("resolves react for react-native-web from the app, so there is one React", () => {
    const { context, calls } = contextFrom(path.join(runtimeDir, "node_modules", "react-native-web", "dist", "index.js"));
    resolve(context, "react", "web");
    resolve(context, "react-dom/client", "web");
    expect(calls.map((c) => c.origin)).toEqual([path.join(__dirname, "..", "package.json"), path.join(__dirname, "..", "package.json")]);
  });

  it("redirects secure storage and maps to the web shims, and leaves everything else alone", () => {
    const { context } = contextFrom(appFile);
    expect(resolve(context, "expo-secure-store", "web")).toEqual({ type: "sourceFile", filePath: shim("secure-store-web.js") });
    expect(resolve(context, "react-native-maps", "web")).toEqual({ type: "sourceFile", filePath: shim("react-native-maps-web.js") });
    expect(resolve(context, "expo-location", "web")).toEqual({ type: "sourceFile", filePath: shim("expo-location-web.js") });
    // The location shim's own import must reach the real package, or it would import itself.
    expect(resolve(contextFrom(shim("expo-location-web.js")).context, "expo-location", "web")).toBeNull();
    expect(resolve(context, "react", "web")).toBeNull();
    expect(resolve(context, "expo-router", "web")).toBeNull();
  });
});

describe("secure-store-web (browser storage for sign-in)", () => {
  // A minimal localStorage: the jest environment has no browser storage of its own.
  let data: Map<string, string>;
  let blocked = false;
  beforeEach(() => {
    data = new Map();
    blocked = false;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => (data.has(k) ? data.get(k) : null),
      setItem: (k: string, v: string) => {
        if (blocked) throw new Error("blocked");
        data.set(k, v);
      },
      removeItem: (k: string) => void data.delete(k),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("saves, reads and deletes through localStorage under a namespaced key", async () => {
    await secureStore.setItemAsync("lynia.session", '{"accessToken":"a"}');
    expect(data.get("lynia.secure:lynia.session")).toBe('{"accessToken":"a"}');
    await expect(secureStore.getItemAsync("lynia.session")).resolves.toBe('{"accessToken":"a"}');
    await secureStore.deleteItemAsync("lynia.session");
    await expect(secureStore.getItemAsync("lynia.session")).resolves.toBeNull();
  });

  it("keeps working from memory when storage is blocked (private mode)", async () => {
    blocked = true;
    await secureStore.setItemAsync("k", "v");
    expect(data.size).toBe(0);
    await expect(secureStore.getItemAsync("k")).resolves.toBe("v");
  });
});

describe("react-native-maps-web (Google map, phase 2)", () => {
  it("exports what the screens import", () => {
    for (const name of ["default", "Marker", "MarkerAnimated", "Polyline", "Circle", "AnimatedRegion"]) expect(maps[name]).toBeDefined();
  });

  it("glides an AnimatedRegion and tells its marker every step", () => {
    const region = new maps.AnimatedRegion({ latitude: -17.8, longitude: 31 });
    const seen: { latitude: number; longitude: number }[] = [];
    region.addListener((c: { latitude: number; longitude: number }) => seen.push(c));
    region.setValue({ latitude: -17.81, longitude: 31.01 });
    expect(seen.at(-1)).toEqual({ latitude: -17.81, longitude: 31.01 });
    const done = jest.fn();
    region.timing({ latitude: -17.82, longitude: 31.02, duration: 0 }).start(done);
    expect(seen.at(-1)).toEqual({ latitude: -17.82, longitude: 31.02 });
    expect(done).toHaveBeenCalledWith({ finished: true });
  });
});
