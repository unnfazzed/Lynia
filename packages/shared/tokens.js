// Metro-resolution shim for `@lynia/shared/tokens` (MOB-BOOT-03-SIB-2): Metro runs with package
// `exports` OFF (apps/mobile/metro.config.js), so a subpath import resolves as a plain file inside
// the package root — this file. Everything else resolves via the `./tokens` entry in package.json's
// exports map. See src/tokens-entry.ts for why this entry exists.
module.exports = require("./dist/tokens-entry.js");
