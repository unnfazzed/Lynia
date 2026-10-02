import path from "path";
import { redirectFor } from "../metro-shims/bundle-trim-redirect";

// eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS stub modules
const assertStub = require("../metro-shims/assert-stub");
// eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS stub modules
const surveysStub = require("../metro-shims/posthog-surveys-stub");

const shim = (file: string): string => path.join(__dirname, "..", "metro-shims", file);

describe("bundle-trim-redirect (2026-10-02 JS bundle trim)", () => {
  const backoff = "/repo/node_modules/.pnpm/@ide+backoff@1.0.0/node_modules/@ide/backoff/build/backoff.js";
  const posthogIndex = "/repo/node_modules/.pnpm/posthog-react-native@4.70.0/node_modules/posthog-react-native/dist/index.js";
  const zodExternal = "/repo/node_modules/.pnpm/zod@4.6.2/node_modules/zod/v4/classic/external.js";

  it("redirects each heavy import only from the file that drags it in", () => {
    expect(redirectFor("assert", backoff)).toBe(shim("assert-stub.js"));
    expect(redirectFor("./surveys", posthogIndex)).toBe(shim("posthog-surveys-stub.js"));
    expect(redirectFor("./from-json-schema.js", zodExternal)).toBe(shim("zod-from-json-schema-stub.js"));
    expect(redirectFor("./from-json-schema.cjs", zodExternal.replace(/\.js$/, ".cjs"))).toBe(shim("zod-from-json-schema-stub.js"));
  });

  it("resolves the same names normally from anywhere else", () => {
    expect(redirectFor("assert", "/repo/apps/mobile/src/util.ts")).toBeNull();
    expect(redirectFor("assert", "/repo/node_modules/some-lib/index.js")).toBeNull();
    // PostHog's own survey files still reach the real modules (only the package index is redirected).
    expect(redirectFor("./surveys", "/repo/node_modules/posthog-react-native/dist/posthog-rn.js")).toBeNull();
    expect(redirectFor("./from-json-schema.js", "/repo/node_modules/some-lib/v4/classic/schemas.js")).toBeNull();
  });

  it("leaves every other import of those files alone", () => {
    expect(redirectFor("./posthog-rn", posthogIndex)).toBeNull();
    expect(redirectFor("./PostHogProvider", posthogIndex)).toBeNull();
    expect(redirectFor("./schemas.js", zodExternal)).toBeNull();
    expect(redirectFor("../locales/index.js", zodExternal)).toBeNull(); // owned by zod-locales-redirect
  });

  describe("assert stub keeps @ide/backoff's contract", () => {
    it("passes a truthy condition and throws the message on a falsy one", () => {
      expect(() => assertStub(true, "never")).not.toThrow();
      expect(() => assertStub(0 >= 1, "The backoff multiplier must be greater than or equal to 1")).toThrow(
        "The backoff multiplier must be greater than or equal to 1",
      );
      expect(assertStub.ok).toBe(assertStub);
    });

    it("has no __esModule flag, so __importDefault wraps it exactly like the real package", () => {
      expect(assertStub.__esModule).toBeUndefined();
    });
  });

  it("the PostHog survey stub keeps the index's three names, inert", () => {
    expect(surveysStub.PostHogSurveyProvider({ children: "app" })).toBe("app");
    expect(surveysStub.PostHogSurveyProvider({})).toBeNull();
    expect(surveysStub.SurveyModal()).toBeNull();
    expect(surveysStub.Questions).toEqual({});
  });
});
