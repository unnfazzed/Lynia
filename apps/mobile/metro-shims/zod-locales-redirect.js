// Pure matching logic for metro.config.js's zod-locales redirect, split out so it can be unit
// tested without instantiating the full Sentry/Expo Metro config (see __tests__/metro-config.test.ts).
const path = require("path");

const stubPath = path.join(__dirname, "zod-locales-stub.js");

const importerPattern = new RegExp(
  `\\${path.sep}zod\\${path.sep}v4\\${path.sep}(classic\\${path.sep}external|core\\${path.sep}index)\\.c?js$`,
);

function shouldRedirect(moduleName, originModulePath) {
  return (
    (moduleName === "../locales/index.js" || moduleName === "../locales/index.cjs") &&
    importerPattern.test(originModulePath)
  );
}

module.exports = { stubPath, shouldRedirect };
