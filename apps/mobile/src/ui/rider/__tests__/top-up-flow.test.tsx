import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Topup } from "@lynia/shared";
import { TopUpFlow } from "../TopUpFlow";

/**
 * The rider top-up flow is a REAL client of `POST /wallet/topups` + `GET /wallet/topups/:id`. It
 * replaced a mock that let the user pick their own outcome — including a success that asserted a
 * credit which had not happened.
 *
 * The invariant worth a permanent guard is that **the outcome is the server's to decide, never the
 * client's**. `succeeded` renders a success; `expired` and `declined` render a failure; and no
 * sequence of taps produces a success the server did not report. That last part is what makes this
 * shippable while `creditFromTopup` still has no caller: today the honest answer is always `expired`,
 * and this screen must show exactly that rather than a comforting fiction.
 */

const mockCreateTopup = jest.fn<Promise<Topup>, [unknown]>();
const mockGetTopup = jest.fn<Promise<Topup>, [string]>();
jest.mock("../../../api/wallet", () => ({
  createTopup: (body: unknown) => mockCreateTopup(body),
  getTopup: (id: string) => mockGetTopup(id),
}));

// The countdown ring draws through react-native-svg, which jest-expo resolves to a non-component
// object — it has never been render-tested and is not what these assertions are about. Stub it to its
// label so the wait state can be rendered and inspected.
jest.mock("../../food/CountdownRing", () => {
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    CountdownRing: ({ label }: { label: string }) => React.createElement(Text, null, label),
    formatCountdown: (ms: number) => `${Math.ceil(ms / 1000)}s`,
  };
});

// Action errors now speak through a self-clearing toast (PR #743's rule), which lives outside this
// tree — so capture the raise instead of looking for text in the rendered output.
const mockFail = jest.fn<void, [string]>();
jest.mock("../../Toast", () => ({
  ...jest.requireActual<Record<string, unknown>>("../../Toast"),
  useActionError: () => mockFail,
}));

const mockSavePendingTopup = jest.fn<Promise<void>, [{ topupId: string }]>(async () => {});
const mockClearPendingTopup = jest.fn<Promise<void>, []>(async () => {});
jest.mock("../../../auth/session", () => ({
  savePendingTopup: (v: { topupId: string }) => mockSavePendingTopup(v),
  clearPendingTopup: () => mockClearPendingTopup(),
}));

function topup(over: Partial<Topup> = {}): Topup {
  return {
    id: "t1",
    status: "pending",
    amount: 10,
    rail: "ecocash",
    phone: "0771234567",
    expiresAt: new Date(Date.now() + 90_000).toISOString(),
    createdAt: new Date().toISOString(),
    ...over,
  };
}

const flush = (): Promise<void> => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));

/** Mounted trees, torn down in afterEach. The wait state runs a 1s countdown ticker; left mounted it
 *  keeps calling setState after the test ends, which crashes the worker on a post-teardown render. */
const mounted: ReactTestRenderer[] = [];
const clients: QueryClient[] = [];

function render(): ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(qc);
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <QueryClientProvider client={qc}>
        <TopUpFlow minTopUp={5} maxTopUp={50} onExit={() => {}} />
      </QueryClientProvider>,
    );
  });
  mounted.push(root);
  return root;
}

function texts(tree: ReactTestRenderer): string {
  return tree.root
    .findAllByType("Text" as never)
    .flatMap((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.filter((x) => typeof x === "string") : typeof c === "string" ? [c] : [];
    })
    .join(" | ");
}

/** Fill the phone field and press the submit button — the only route into an intent. */
async function submit(tree: ReactTestRenderer): Promise<void> {
  const phoneField = tree.root.findAll((n) => n.props?.placeholder === "0771234567")[0];
  act(() => phoneField?.props.onChangeText("0771234567"));
  const button = tree.root.findAll((n) => typeof n.props?.label === "string" && n.props.label.startsWith("Request"))[0];
  await act(async () => {
    button?.props.onPress();
  });
  await flush();
}

afterEach(() => {
  act(() => {
    while (mounted.length) mounted.pop()?.unmount();
  });
  // Also drop the caches: the wait state polls on an interval, and a live query keeps a timer alive
  // past the test, which shows up as jest refusing to exit.
  while (clients.length) clients.pop()?.clear();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockClearPendingTopup.mockResolvedValue(undefined);
  mockSavePendingTopup.mockResolvedValue(undefined);
});

describe("TopUpFlow — the server decides the outcome", () => {
  it("opens a real intent with an idempotency key, and records the durable marker", async () => {
    mockCreateTopup.mockResolvedValue(topup());
    mockGetTopup.mockResolvedValue(topup());
    const tree = render();
    await submit(tree);

    expect(mockCreateTopup).toHaveBeenCalledTimes(1);
    const body = mockCreateTopup.mock.calls[0]?.[0] as { amount: number; rail: string; idempotencyKey?: string };
    expect(body.amount).toBe(10);
    expect(body.rail).toBe("ecocash");
    // BH-09: a timeout+retry within one attempt must replay the same key, so the server returns the
    // original pending intent instead of opening a second one against the same money.
    expect(body.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    // Written before the rider can leave for their mobile-money app — that is the whole point of it.
    expect(mockSavePendingTopup).toHaveBeenCalledWith({ topupId: "t1" });
  });

  it("shows the wait state while the server still reports pending — no self-resolution", async () => {
    mockCreateTopup.mockResolvedValue(topup());
    mockGetTopup.mockResolvedValue(topup());
    const tree = render();
    await submit(tree);

    const t = texts(tree);
    expect(t).toContain("Check your phone");
    expect(t).not.toContain("added to your balance");
  });

  it("renders the success ONLY on a server-reported succeeded, and clears the marker", async () => {
    mockCreateTopup.mockResolvedValue(topup());
    mockGetTopup.mockResolvedValue(topup({ status: "succeeded" }));
    const tree = render();
    await submit(tree);
    await flush();

    expect(texts(tree)).toContain("added to your balance");
    expect(mockClearPendingTopup).toHaveBeenCalled();
  });

  it("renders a timeout — not a success — when the window closes unconfirmed", async () => {
    // This is TODAY's real path end to end: `creditFromTopup` has no caller, so nothing ever confirms
    // an intent and every attempt resolves `expired`. The screen must say so plainly.
    mockCreateTopup.mockResolvedValue(topup());
    mockGetTopup.mockResolvedValue(topup({ status: "expired" }));
    const tree = render();
    await submit(tree);
    await flush();

    const t = texts(tree);
    expect(t).toContain("The request timed out");
    expect(t).not.toContain("added to your balance");
    expect(mockClearPendingTopup).toHaveBeenCalled();
  });

  it("renders the decline on a server-reported declined", async () => {
    mockCreateTopup.mockResolvedValue(topup());
    mockGetTopup.mockResolvedValue(topup({ status: "declined" }));
    const tree = render();
    await submit(tree);
    await flush();

    const t = texts(tree);
    expect(t).toContain("The payment was declined");
    expect(t).not.toContain("added to your balance");
  });

  it("surfaces a create failure instead of pretending an intent exists", async () => {
    mockCreateTopup.mockRejectedValue(new Error("offline"));
    const tree = render();
    await submit(tree);
    await flush();

    // Curated copy, not the raw "offline" — and crucially the flow stays on the form rather than
    // advancing to a wait state for an intent that was never opened.
    expect(mockFail).toHaveBeenCalledWith("We couldn't start that top-up. Check your connection and try again.");
    expect(texts(tree)).not.toContain("Check your phone");
    expect(mockSavePendingTopup).not.toHaveBeenCalled();
  });

  it("keeps the support-call route on the amount step — the only credit path that works today", () => {
    const tree = render();
    const t = texts(tree);
    expect(t).toContain("TOP UP BY PHONE");
    expect(t).toContain("LyniaGo support");
  });
});
