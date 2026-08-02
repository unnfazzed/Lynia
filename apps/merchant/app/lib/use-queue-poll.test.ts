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
});
