import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { RestaurantsEnabledGuard } from "./restaurants-enabled.guard";

const ctx = {} as unknown as Parameters<RestaurantsEnabledGuard["canActivate"]>[0];

describe("RestaurantsEnabledGuard", () => {
  it("503s when RESTAURANTS_ENABLED is absent (the default env)", () => {
    const g = new RestaurantsEnabledGuard({} as Env);
    expect(() => g.canActivate(ctx)).toThrow(/not available/i);
  });

  it("503s when RESTAURANTS_ENABLED is explicitly 'false' — absent and false are indistinguishable", () => {
    const g = new RestaurantsEnabledGuard({ RESTAURANTS_ENABLED: "false" } as Env);
    expect(() => g.canActivate(ctx)).toThrow(/not available/i);
  });

  it("passes only when RESTAURANTS_ENABLED is exactly 'true'", () => {
    const g = new RestaurantsEnabledGuard({ RESTAURANTS_ENABLED: "true" } as Env);
    expect(g.canActivate(ctx)).toBe(true);
  });
});
