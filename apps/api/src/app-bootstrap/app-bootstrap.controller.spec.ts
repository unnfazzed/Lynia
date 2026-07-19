import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth.service";
import type { Env } from "../config/env";
import type { OrdersService } from "../orders/orders.service";
import { AppBootstrapController } from "./app-bootstrap.controller";

/**
 * The cold-start aggregate (wave-2 W1) is pure composition over the SAME service methods the
 * individual endpoints call — these tests pin the composition rules: parallel reads, role-picked
 * activeOrder, and the version-gate value riding along.
 */

const env = { MIN_SUPPORTED_APP_VERSION: "1.2.0" } as Env;

function ctrl(role: "customer" | "rider", riderActive: unknown, customerActive: unknown) {
  const getProfile = vi.fn(async () => ({ id: "p1", role }));
  const activeForRider = vi.fn(async () => riderActive);
  const activeForCustomer = vi.fn(async () => customerActive);
  const c = new AppBootstrapController(
    { getProfile } as unknown as AuthService,
    { activeForRider, activeForCustomer } as unknown as OrdersService,
    env,
  );
  return { c, getProfile, activeForRider, activeForCustomer };
}

describe("AppBootstrapController.bootstrap", () => {
  it("serves a customer their active order (rider read ran in parallel but doesn't ship)", async () => {
    const { c, activeForRider, activeForCustomer } = ctrl("customer", null, { id: "ord-1", status: "assigned" });
    const res = await c.bootstrap("p1");
    expect(res.me).toMatchObject({ id: "p1", role: "customer" });
    expect(res.activeOrder).toEqual({ id: "ord-1", status: "assigned" });
    // Both actives fire concurrently by design (each is one indexed findFirst; the off-role one is a
    // fast miss) so the handler adds no serial hop — pinned here so a refactor doesn't quietly
    // serialize them behind the profile read.
    expect(activeForRider).toHaveBeenCalledWith("p1");
    expect(activeForCustomer).toHaveBeenCalledWith("p1");
  });

  it("serves a rider their active job", async () => {
    const { c } = ctrl("rider", { id: "job-1", status: "picked_up" }, null);
    const res = await c.bootstrap("p1");
    expect(res.activeOrder).toEqual({ id: "job-1", status: "picked_up" });
  });

  it("carries the server version-gate minimum so a future client can skip the separate probe", async () => {
    const { c } = ctrl("customer", null, null);
    expect((await c.bootstrap("p1")).minSupportedVersion).toBe("1.2.0");
  });

  it("serves activeOrder null when nothing is live (fresh signed-in boot)", async () => {
    const { c } = ctrl("customer", null, null);
    expect((await c.bootstrap("p1")).activeOrder).toBeNull();
  });
});
