import type { OrderHistoryRow } from "../../api/orders";

let mockStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => mockStore[key] ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockStore[key] = value;
  },
}));

import { HISTORY_SNAPSHOT_KEY, loadHistorySnapshot, saveHistorySnapshot } from "../history-store";

/** The saved list carries its fetch time, for the Orders tab's "as of 09:24" (Orders v2, ledger D-63). */

const row = { id: "o1" } as OrderHistoryRow;

beforeEach(() => {
  mockStore = {};
});

it("saves the rows with the time they were fetched, and reads both back", async () => {
  const at = new Date("2026-10-02T07:24:00.000Z");
  await saveHistorySnapshot([row], at);
  expect(await loadHistorySnapshot()).toEqual({ rows: [row], savedAt: at.toISOString() });
});

it("still reads a bare array an older build saved, with no save time", async () => {
  mockStore[HISTORY_SNAPSHOT_KEY] = JSON.stringify([row]);
  expect(await loadHistorySnapshot()).toEqual({ rows: [row], savedAt: null });
});

it("an empty or malformed blob reads as nothing saved", async () => {
  mockStore[HISTORY_SNAPSHOT_KEY] = JSON.stringify({ savedAt: "x", rows: [] });
  expect(await loadHistorySnapshot()).toBeNull();
  mockStore[HISTORY_SNAPSHOT_KEY] = "{not json";
  expect(await loadHistorySnapshot()).toBeNull();
});
