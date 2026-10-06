import { __resetReachability } from "../../net/reachability";
import { getActiveCustomerOrder, getActiveOrder } from "../orders";

/**
 * E2E 2026-10-05 P-9: with no job, `/orders/mine/active` answers 200 with an EMPTY body (the API returns
 * null and Nest sends nothing). apiFetch reads that as `undefined`, which TanStack Query refuses as query
 * data, so the rider board's ["activeJob"] poll errored whenever the rider had no job. "No job" is null.
 */

function makeResponse(status: number, text: string): Response {
  return { ok: status >= 200 && status < 300, status, text: async () => text } as unknown as Response;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  __resetReachability();
});

describe.each([
  ["getActiveOrder", getActiveOrder, /\/orders\/mine\/active$/],
  ["getActiveCustomerOrder", getActiveCustomerOrder, /\/orders\/mine\/active-order$/],
] as const)("%s", (_name, fn, path) => {
  it("an empty 200 (no job) is null, not undefined", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200, ""));
    await expect(fn()).resolves.toBeNull();
    expect((fetchMock.mock.calls[0] as [string])[0]).toMatch(path);
  });

  it("a literal null body is null", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200, "null"));
    await expect(fn()).resolves.toBeNull();
  });

  it("a job comes back as is", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(200, JSON.stringify({ id: "o1", status: "assigned" })));
    await expect(fn()).resolves.toEqual({ id: "o1", status: "assigned" });
  });

  it("a real failure still throws", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(500, JSON.stringify({ message: "boom" })));
    await expect(fn()).rejects.toBeTruthy();
  });
});
