import path from "path";
import { shouldRedirect, stubPath } from "../metro-shims/zod-locales-redirect";

describe("zod-locales-redirect (A-O12)", () => {
  it("redirects the locales barrel imported from zod's classic external entry (cjs)", () => {
    const originModulePath = "/repo/node_modules/zod/v4/classic/external.cjs";
    expect(shouldRedirect("../locales/index.cjs", originModulePath)).toBe(true);
  });

  it("redirects the locales barrel imported from zod's classic external entry (esm)", () => {
    const originModulePath = "/repo/node_modules/zod/v4/classic/external.js";
    expect(shouldRedirect("../locales/index.js", originModulePath)).toBe(true);
  });

  it("redirects the locales barrel imported from zod's v4 core entry", () => {
    const originModulePath = "/repo/node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core/index.cjs";
    expect(shouldRedirect("../locales/index.cjs", originModulePath)).toBe(true);
  });

  it("does not redirect the default English locale import (still needed for error messages)", () => {
    const originModulePath = "/repo/node_modules/zod/v4/classic/external.cjs";
    expect(shouldRedirect("../locales/en.cjs", originModulePath)).toBe(false);
  });

  it("does not redirect an unrelated package's identically-shaped relative import", () => {
    const originModulePath = "/repo/node_modules/some-other-lib/v4/classic/external.cjs";
    expect(shouldRedirect("../locales/index.cjs", originModulePath)).toBe(false);
  });

  it("stub path points at the on-disk empty module", () => {
    expect(stubPath).toBe(path.join(__dirname, "..", "metro-shims", "zod-locales-stub.js"));
  });
});
