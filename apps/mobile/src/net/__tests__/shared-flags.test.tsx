import { act, create, type ReactTestRenderer } from "react-test-renderer";

let mockStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => mockStore[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore[k] = v;
  },
  deleteItemAsync: async (k: string) => {
    delete mockStore[k];
  },
}));

import { resetOrderFlagsForTest, useOrderFlags } from "../use-order-flags";

/**
 * P17 / U09: the flag hooks used to keep the answer in each component's `useState(DEFAULT)` and fetch on
 * every mount, so every pharmacy screen started "Rx off" (the fail-closed default) until its own round
 * trip landed — the window in which an Rx item could be added without `rxRequired`. The answer is now one
 * shared, cached value: the last one this process got, else the last one persisted.
 */
const realFetch = global.fetch;
let fetchMock: jest.Mock;
const answer = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

let seen: boolean[] = [];
function Probe(): null {
  seen.push(useOrderFlags().rxEnabled);
  return null;
}
async function mount(): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(<Probe />);
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree;
}

beforeEach(() => {
  mockStore = {};
  seen = [];
  resetOrderFlagsForTest();
  fetchMock = jest.fn(async () => answer({ rxEnabled: true }));
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  global.fetch = realFetch;
});

describe("useOrderFlags — shared and cached across mounts (P17)", () => {
  it("a remount starts from the last answer (no 'Rx off' first frame) and doesn't re-ask within the max-age", async () => {
    const first = await mount();
    expect(seen[0]).toBe(false); // a true cold start: the fail-closed default
    expect(seen[seen.length - 1]).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => first.unmount());

    seen = [];
    const second = await mount();
    expect(seen[0]).toBe(true); // the storefront → Review hop: right from the first frame
    expect(seen.every((v) => v)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => second.unmount());
  });

  it("two screens mounted together share one request", async () => {
    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        <>
          <Probe />
          <Probe />
        </>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });

  it("a cold start restores the last persisted answer before (or without) the network", async () => {
    mockStore["lynia.order-flags.v1"] = JSON.stringify({ rxEnabled: true });
    fetchMock.mockImplementation(async () => {
      throw new TypeError("Network request failed");
    });
    const tree = await mount();
    expect(seen[seen.length - 1]).toBe(true);
    act(() => tree.unmount());
  });

  it("a failed fetch never overwrites a known answer", async () => {
    const first = await mount();
    expect(seen[seen.length - 1]).toBe(true);
    act(() => first.unmount());
    const { refreshOrderFlags } = jest.requireActual("../use-order-flags") as typeof import("../use-order-flags");
    fetchMock.mockImplementation(async () => answer({}, false));
    await act(async () => {
      await refreshOrderFlags();
    });
    seen = [];
    const second = await mount();
    expect(seen.every((v) => v)).toBe(true);
    act(() => second.unmount());
  });
});
