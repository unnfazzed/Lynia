/**
 * The rider splash's step 2 (First Run v2 H1, ledger D-82 §2 #2) is the rider board's first reads —
 * `["me"]` and `["activeJob"]` — settling in the shared query cache. A disabled read (an unverified
 * rider's board never asks for an active job) counts as settled; a read the board hasn't created doesn't.
 */
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { watchRiderBoardReady } from "../rider-board-ready";

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

describe("watchRiderBoardReady", () => {
  it("reports once both reads have answered", async () => {
    const client = new QueryClient();
    const report = jest.fn();
    const stop = watchRiderBoardReady(client, report);
    let resolveMe!: (v: unknown) => void;
    void client.fetchQuery({ queryKey: ["me"], queryFn: () => new Promise((r) => (resolveMe = r)) });
    void client.fetchQuery({ queryKey: ["activeJob"], queryFn: async () => null });
    await flush();
    expect(report).not.toHaveBeenCalled(); // `me` still in flight
    resolveMe({ profileId: "r1" });
    await flush();
    expect(report).toHaveBeenCalledTimes(1);
    stop();
  });

  it("a failed read is settled too — the board draws its own error", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const report = jest.fn();
    watchRiderBoardReady(client, report);
    await client.fetchQuery({ queryKey: ["me"], queryFn: async () => ({}) });
    await client.fetchQuery({ queryKey: ["activeJob"], queryFn: async () => Promise.reject(new Error("offline")) }).catch(() => undefined);
    await flush();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("an active-job read the board mounted disabled (unverified rider) counts as settled", async () => {
    const client = new QueryClient();
    const report = jest.fn();
    watchRiderBoardReady(client, report);
    await client.fetchQuery({ queryKey: ["me"], queryFn: async () => ({}) });
    await flush();
    expect(report).not.toHaveBeenCalled(); // the board hasn't created activeJob yet
    const observer = new QueryObserver(client, { queryKey: ["activeJob"], queryFn: async () => null, enabled: false });
    const unsub = observer.subscribe(() => undefined);
    await flush();
    expect(report).toHaveBeenCalledTimes(1);
    unsub();
  });
});
