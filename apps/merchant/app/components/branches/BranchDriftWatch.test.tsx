// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse, MerchantProfileResponse } from "@lynia/shared";
import { BranchDriftWatch } from "./BranchDriftWatch";
import { getMyMerchant } from "../../lib/api-client";
import { driftedBranchId } from "../../lib/branches";
import { merchantOrder, merchantProfile } from "../../testing/fixtures";

const state = vi.hoisted(() => ({ orders: [] as MerchantOrderResponse[], business: null as MerchantProfileResponse | null, enterBranch: vi.fn() }));
vi.mock("../KitchenConnectionProvider", () => ({ useKitchenConnection: () => ({ queue: { orders: state.orders } }) }));
vi.mock("../../lib/business", () => ({ useBusiness: () => state.business }));
vi.mock("./use-enter-branch", () => ({ useEnterBranch: () => state.enterBranch }));
vi.mock("../../lib/api-client", () => ({ getMyMerchant: vi.fn() }));

const M1 = "a0000000-0000-4000-8000-000000000001";
const M2 = "a0000000-0000-4000-8000-000000000002";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.orders = [];
  state.business = null;
});

describe("MJ-RM15: another device switched this person's branch", () => {
  it("driftedBranchId names the branch the queue is really showing", () => {
    expect(driftedBranchId([], M1)).toBeNull();
    expect(driftedBranchId([{ merchantId: M1 }], M1)).toBeNull();
    expect(driftedBranchId([{ merchantId: M1 }, { merchantId: M2 }], M1)).toBe(M2);
    expect(driftedBranchId([{ merchantId: M2 }], null)).toBeNull();
  });

  it("moves this device into the branch the server now has, with the drawn toast", async () => {
    state.business = merchantProfile({ id: M1, name: "Sadza Republic" });
    state.orders = [merchantOrder({ merchantId: M2 })];
    const now = merchantProfile({ id: M2, name: "Sadza Republic · Avondale" });
    vi.mocked(getMyMerchant).mockResolvedValue(now);
    render(<BranchDriftWatch />);
    await vi.waitFor(() => expect(state.enterBranch).toHaveBeenCalledWith(now, "Now at Sadza Republic · Avondale"));
  });

  it("does nothing while the queue is this branch's, or when the server still has this branch (a stale queue)", async () => {
    state.business = merchantProfile({ id: M1 });
    state.orders = [merchantOrder({ merchantId: M1 })];
    render(<BranchDriftWatch />);
    expect(getMyMerchant).not.toHaveBeenCalled();
    cleanup();

    state.orders = [merchantOrder({ merchantId: M2 })];
    vi.mocked(getMyMerchant).mockResolvedValue(merchantProfile({ id: M1 }));
    render(<BranchDriftWatch />);
    await vi.waitFor(() => expect(getMyMerchant).toHaveBeenCalledTimes(1));
    expect(state.enterBranch).not.toHaveBeenCalled();
  });
});
