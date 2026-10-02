// Redirect target for zod's `export { fromJSONSchema } from "./from-json-schema.js"` (see
// ./bundle-trim-redirect.js). Nothing in the app or @lynia/shared builds zod schemas from JSON Schema
// at runtime, so the real converter never runs on a phone. If a future caller does reach it, fail
// loudly instead of returning a wrong schema.
export function fromJSONSchema() {
  throw new Error("z.fromJSONSchema is not bundled in the mobile app (apps/mobile/metro-shims/bundle-trim-redirect.js)");
}
