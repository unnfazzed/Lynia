// Load the vendored @babel/standalone (browser UMD) into a usable object for Node. The vendor blob
// is shared with the spike + census (tools/parity/.vendor/babel.js), no npm dependency added.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import vm from "node:vm";

const HERE = dirname(fileURLToPath(import.meta.url));
const code = readFileSync(resolve(HERE, "../.vendor/babel.js"), "utf8");
const ctx = { console, setTimeout, clearTimeout };
ctx.self = ctx;
ctx.window = ctx;
ctx.global = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);
export const Babel = ctx.Babel;
