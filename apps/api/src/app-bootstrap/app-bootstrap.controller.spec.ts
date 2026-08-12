import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/auth.service";
import type { Env } from "../config/env";
import type { OrdersService } from "../orders/orders.service";
import { AppBootstrapController } from "./app-bootstrap.controller";

/**
 * The cold-start aggregate (wave-2 W1) is pure composition over the SAME service methods the
 * individual endpoints call — these tests pin the composition rules: parallel reads, role-picked
 * activeOrder, the multi-card activeOrders list (RC.home), and the version-gate value riding along.
 */

const env = { MIN_SUPPORTED_APP_VERSION: "1.2.0" } as Env;

function ctrl(role: "customer" | "rider", riderActive: unknown, customerActives: unknown[]) {
  const getProfile = vi.fn(async () => ({ id: "p1", role }));
  const activeForRider = vi.fn(async () => riderActive);
  const activeOrdersForCustomer = vi.fn(async () => customerActives);
  const c = new AppBootstrapController(
    { getProfile } as unknown as AuthService,
    { activeForRider, activeOrdersForCustomer } as unknown as OrdersService,
    env,
  );
  return { c, getProfile, activeForRider, activeOrdersForCustomer };
}

describe("AppBootstrapController.bootstrap", () => {
  it("serves a customer their active order (rider read ran in parallel but doesn't ship)", async () => {
    const { c, activeForRider, activeOrdersForCustomer } = ctrl("customer", null, [{ id: "ord-1", status: "assigned" }]);
    const res = await c.bootstrap("p1");
    expect(res.me).toMatchObject({ id: "p1", role: "customer" });
    expect(res.activeOrder).toEqual({ id: "ord-1", status: "assigned" });
    // Both actives fire concurrently by design (each is one indexed read; the off-role one is a
    // fast miss) so the handler adds no serial hop — pinned here so a refactor doesn't quietly
    // serialize them behind the profile read.
    expect(activeForRider).toHaveBeenCalledWith("p1");
    expect(activeOrdersForCustomer).toHaveBeenCalledWith("p1");
  });

  it("serves a customer EVERY live order (RC.home: one card per running job), newest first", async () => {
    const food = { id: "ord-food", status: "picked_up", orderType: "merchant" };
    const parcel = { id: "ord-parcel", status: "en_route_dropoff" };
    const { c } = ctrl("customer", null, [food, parcel]);
    const res = await c.bootstrap("p1");
    expect(res.activeOrders).toEqual([food, parcel]);
    // The single activeOrder stays for old clients, derived from the same list.
    expect(res.activeOrder).toEqual(food);
  });

  it("keeps activeOrder's legacy semantics: a kitchen-phase food order (requested) never ships as it", async () => {
    const requestedFood = { id: "ord-food", status: "requested", orderType: "merchant" };
    const parcel = { id: "ord-parcel", status: "assigned" };
    const { c } = ctrl("customer", null, [requestedFood, parcel]);
    const res = await c.bootstrap("p1");
    // The list carries both (home draws both cards)…
    expect(res.activeOrders).toEqual([requestedFood, parcel]);
    // …but activeOrder skips `requested` — exactly the rows activeForCustomer always returned, so
    // send.tsx's parcel restore banner and old clients can't be handed a food order it never was.
    expect(res.activeOrder).toEqual(parcel);
  });

  it("serves a rider their active job (and an empty activeOrders list)", async () => {
    const { c } = ctrl("rider", { id: "job-1", status: "picked_up" }, []);
    const res = await c.bootstrap("p1");
    expect(res.activeOrder).toEqual({ id: "job-1", status: "picked_up" });
    expect(res.activeOrders).toEqual([]);
  });

  it("carries the server version-gate minimum so a future client can skip the separate probe", async () => {
    const { c } = ctrl("customer", null, []);
    expect((await c.bootstrap("p1")).minSupportedVersion).toBe("1.2.0");
  });

  it("serves activeOrder null when nothing is live (fresh signed-in boot)", async () => {
    const { c } = ctrl("customer", null, []);
    const res = await c.bootstrap("p1");
    expect(res.activeOrder).toBeNull();
    expect(res.activeOrders).toEqual([]);
  });
});
