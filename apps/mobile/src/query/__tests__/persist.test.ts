import type { Query } from "@tanstack/react-query";

/**
 * The persistence layer is two product decisions wearing code:
 *  1. WHAT persists — the allowlist. Leaking live marketplace state (an active order/auction) onto
 *     disk would let a cold start render "your rider is arriving" for a delivery that ended hours
 *     ago; dropping an allowlisted root would silently kill the warm boot for that screen.
 *  2. WHERE it persists — a best-effort expo-file-system file that must NEVER crash the app: a
 *     corrupt/missing file is a cold boot, a failed write is a no-op, and sign-out purges it (S1).
 */

jest.mock("expo-file-system", () => ({
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
  documentDirectory: "file:///docs/",
}));

import * as FileSystem from "expo-file-system";
import { clearPersistedQueries, fileStorage, PERSISTED_KEY_ROOTS, shouldPersistQuery } from "../persist";

const fs = jest.mocked(FileSystem);

const asQuery = (queryKey: readonly unknown[], status: "success" | "error" | "pending"): Query =>
  ({ queryKey, state: { status } }) as unknown as Query;

beforeEach(() => {
  fs.readAsStringAsync.mockReset();
  fs.writeAsStringAsync.mockReset();
  fs.deleteAsync.mockReset();
});

describe("shouldPersistQuery — the persistence allowlist", () => {
  it.each([
    [["me"]],
    [["history"]],
    [["earnings", "summary"]],
    [["wallet", "balance"]],
    [["wallet", "ledger"]],
    [["notifications"]],
  ])("persists successful %j (stale-safe, expensive-to-refetch data)", (key) => {
    expect(shouldPersistQuery(asQuery(key, "success"))).toBe(true);
  });

  it.each([
    [["order", "ord-1"]],
    [["offers", "ord-1"]],
    [["activeJob"]],
    [["activeCustomerOrder"]],
    [["activeCustomerOrders"]],
    [["openOrders"]],
  ])("NEVER persists live marketplace state %j — a stale render there misleads", (key) => {
    expect(shouldPersistQuery(asQuery(key, "success"))).toBe(false);
  });

  it("persists only settled-successful data, even for allowlisted roots", () => {
    expect(shouldPersistQuery(asQuery(["me"], "pending"))).toBe(false);
    expect(shouldPersistQuery(asQuery(["me"], "error"))).toBe(false);
  });

  it("the allowlist stays an explicit, reviewed set", () => {
    // Adding a root here is a product decision (see persist.ts) — this pins the current contract.
    expect([...PERSISTED_KEY_ROOTS].sort()).toEqual(["earnings", "history", "me", "notifications", "wallet"]);
  });
});

describe("fileStorage — best-effort file adapter", () => {
  it("round-trips through a single app-private cache file", async () => {
    fs.writeAsStringAsync.mockResolvedValue(undefined);
    fs.readAsStringAsync.mockResolvedValue('{"clientState":{}}');

    await fileStorage.setItem("ignored-key", '{"clientState":{}}');
    expect(fs.writeAsStringAsync).toHaveBeenCalledWith("file:///docs/rq-cache.json", '{"clientState":{}}');
    await expect(fileStorage.getItem("ignored-key")).resolves.toBe('{"clientState":{}}');
  });

  it("treats a missing/corrupt file as no cache (cold boot), not a crash", async () => {
    fs.readAsStringAsync.mockRejectedValue(new Error("ENOENT"));
    await expect(fileStorage.getItem("k")).resolves.toBeNull();
  });

  it("swallows write/delete failures — persistence is an accelerant, never a crash surface", async () => {
    fs.writeAsStringAsync.mockRejectedValue(new Error("disk full"));
    fs.deleteAsync.mockRejectedValue(new Error("locked"));
    await expect(fileStorage.setItem("k", "v")).resolves.toBeUndefined();
    await expect(fileStorage.removeItem("k")).resolves.toBeUndefined();
  });

  it("clearPersistedQueries deletes the cache file idempotently (sign-out purge, S1)", async () => {
    fs.deleteAsync.mockResolvedValue(undefined);
    await clearPersistedQueries();
    expect(fs.deleteAsync).toHaveBeenCalledWith("file:///docs/rq-cache.json", { idempotent: true });
  });
});
