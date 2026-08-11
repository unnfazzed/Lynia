/**
 * The parity screen registry: the generated mock-side inventory (275 screens from the design gallery)
 * merged with the hand-maintained app-target layer. This is what every driver keys off.
 *
 *   import { getScreens, getScreen } from "./screens.mjs";
 *   getScreen("RC.home") -> { key, src, id, title, tag, category, band, mode, app? }
 *
 * Regenerate the mock side with `node gen-manifest.mjs` after a new design export.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { APP_TARGETS } from "./app-targets.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

let cache;
async function load() {
  if (cache) return cache;
  const raw = JSON.parse(await readFile(resolve(HERE, "screens.generated.json"), "utf8"));
  cache = raw.screens.map((s) => ({ ...s, app: APP_TARGETS[s.key] || null }));
  return cache;
}

export async function getScreens(filter = {}) {
  let list = await load();
  if (filter.category) list = list.filter((s) => s.category === filter.category);
  if (filter.src) list = list.filter((s) => s.src === filter.src);
  if (filter.wired) list = list.filter((s) => s.app); // only screens with an app target
  return list;
}

export async function getScreen(key) {
  return (await load()).find((s) => s.key === key) || null;
}

/** Split a `${src}.${id}` key. Admin keys are `ADMIN.<page.html>`. */
export function splitKey(key) {
  const dot = key.indexOf(".");
  return { src: key.slice(0, dot), id: key.slice(dot + 1) };
}
