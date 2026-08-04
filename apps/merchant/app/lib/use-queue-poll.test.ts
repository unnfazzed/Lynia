// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantOrderResponse } from "@lynia/shared";
import { useQueuePoll } from "./use-queue-poll";

const listQueueMock = vi.fn();
vi.mock("./orders-api", () => ({
  listQueue: (...args: unknown[]) => listQueueMock(...args),
}));

/**
 * LC-C05 regression pins (ledgered `docs/KNOWN_BUGS.md`). Two compounding bugs in the merchant
 * kitchen board's poll loop: (1) a refetch requested while a poll was already in flight (the
 * common case: `QueueBoard`'s post-accept/reject `refetch()` landing mid-interval-poll) was
 * silently dropped by the latch instead of queued, so an answered NEW ORDER takeover kept
 * showing the pre-mutation order; (2) no sequencing guard meant a stale, out-of-order response
 * (only reachable via the latch's own stale-override backstop) could clobber fresher state.
 */

function orders(...ids: string[]): MerchantOrderResponse[] {
  return ids.map((id) => ({ id }) as unknown as MerchantOrderResponse);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useQueuePoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    listQueueMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a refetch requested while a poll is in flight instead of dropping it", async () => {
    const first = deferred<MerchantOrderResponse[]>();
    const second = deferred<MerchantOrderResponse[]>();
    listQueueMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useQueuePoll(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(listQueueMock).toHaveBeenCalledTimes(1);

    // a post-mutation refetch (the QueueBoard accept/reject flow) lands while the poll above is
    // still in flight — it must not be dropped.
    act(() => {
      result.current.refetch();
    });
    expect(listQueueMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve(orders("stale"));
      await Promise.resolve();
      await Promise.resolve();
    });

    // the coalesced refetch fires immediately once the in-flight request settles.
    expect(listQueueMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve(orders("fresh"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.orders).toEqual(orders("fresh"));
  });

  it("discards a stale out-of-order response instead of clobbering fresher state", async () => {
    const gen1 = deferred<MerchantOrderResponse[]>();
    const gen2 = deferred<MerchantOrderResponse[]>();
    const gen3 = deferred<MerchantOrderResponse[]>();
    listQueueMock.mockReturnValueOnce(gen1.promise).mockReturnValueOnce(gen2.promise).mockReturnValueOnce(gen3.promise);

    const { result } = renderHook(() => useQueuePoll(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(listQueueMock).toHaveBeenCalledTimes(1); // generation 1 in flight, never settles in time

    // Advance past the latch's own stale window (25s) without generation 1 ever resolving —
    // simulating a hang the transport timeout didn't catch. The interval poll's stale-override
    // force-acquires the latch, starting a genuinely concurrent generation 2 request.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
    });
    expect(listQueueMock).toHaveBeenCalledTimes(2);

    // generation 2 (the newer request) resolves first.
    await act(async () => {
      gen2.resolve(orders("fresh"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.orders).toEqual(orders("fresh"));

    // generation 1 (the older, stale request) finally resolves after — it must not clobber the
    // fresher generation-2 result.
    await act(async () => {
      gen1.resolve(orders("stale"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.orders).toEqual(orders("fresh"));

    // let the coalesced trailing refetch (generation 3, queued by the earlier busy interval
    // ticks) settle too, so it doesn't leak a dangling promise past the test.
    await act(async () => {
      gen3.resolve(orders("fresh"));
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  // LC-D##: before this fix, a caller unable to acquire the latch (the common case: QueueBoard's
  // post-accept/reject refetch() landing mid-poll) resolved immediately — well before the
  // coalesced follow-up fetch it folds into ever completed. That let NewOrderTakeover's
  // submitAccept re-enable the Accept button on a screen that still showed the just-accepted
  // order, inviting a same-order double-tap. refetch() must not settle until its own coalesced
  // round actually lands.
  it("an awaited refetch() issued while a poll is in flight does not settle until the coalesced follow-up fetch completes", async () => {
    const first = deferred<MerchantOrderResponse[]>();
    const second = deferred<MerchantOrderResponse[]>();
    listQueueMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useQueuePoll(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(listQueueMock).toHaveBeenCalledTimes(1);

    let refetchSettled = false;
    const refetchPromise = result.current.refetch().then(() => {
      refetchSettled = true;
    });
    expect(listQueueMock).toHaveBeenCalledTimes(1); // coalesced — no second call started yet

    await act(async () => {
      first.resolve(orders("stale"));
      await Promise.resolve();
      await Promise.resolve();
    });
    // The coalesced follow-up fetch has started (LC-C05's existing behavior)...
    expect(listQueueMock).toHaveBeenCalledTimes(2);
    // ...but hasn't resolved yet, so the awaited refetch() must not have settled either.
    expect(refetchSettled).toBe(false);

    await act(async () => {
      second.resolve(orders("fresh"));
      await Promise.resolve();
      await Promise.resolve();
    });
    await refetchPromise;
    expect(refetchSettled).toBe(true);
    expect(result.current.orders).toEqual(orders("fresh"));
  });

  // B-O17: OrderCard's new React.memo boundary only pays off if an order whose content is
  // unchanged between two polls keeps the SAME object reference — otherwise every card still
  // "changes" on every 5s tick regardless of memoization. Confirmed to FAIL against the pre-fix
  // code (a bare `setOrders(result)`, always a fresh reference) before landing.
  it("keeps the same order object reference across a poll when that order's content is unchanged", async () => {
    const unchangedOrderV1 = { id: "stable", merchantPhase: "preparing" } as unknown as MerchantOrderResponse;
    const unchangedOrderV2 = { id: "stable", merchantPhase: "preparing" } as unknown as MerchantOrderResponse; // same content, new object
    const changedOrderV1 = { id: "moving", merchantPhase: "preparing" } as unknown as MerchantOrderResponse;
    const changedOrderV2 = { id: "moving", merchantPhase: "ready_for_pickup" } as unknown as MerchantOrderResponse;

    listQueueMock
      .mockResolvedValueOnce([unchangedOrderV1, changedOrderV1])
      .mockResolvedValueOnce([unchangedOrderV2, changedOrderV2]);

    const { result } = renderHook(() => useQueuePoll(true));
    await act(async () => {
      await Promise.resolve();
    });
    const firstStable = result.current.orders.find((o) => o.id === "stable");
    expect(firstStable).toBe(unchangedOrderV1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    const secondStable = result.current.orders.find((o) => o.id === "stable");
    const secondMoving = result.current.orders.find((o) => o.id === "moving");
    // Unchanged content -> the ORIGINAL reference survives the poll, not the fresh deserialize.
    expect(secondStable).toBe(unchangedOrderV1);
    expect(secondStable).not.toBe(unchangedOrderV2);
    // Changed content -> the new reference is used, not the stale one.
    expect(secondMoving).toBe(changedOrderV2);
  });
});
