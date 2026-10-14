import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { Topup } from "@lynia/shared";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ApiError } from "../../../api/client";
import { walletKey } from "../../../query/use-wallet";
import { TopUpFlow } from "../TopUpFlow";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

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

function render(
  minTopUp = 2,
  opts: { feePct?: number; liveRails?: readonly ("ecocash" | "innbucks" | "omari")[]; defaultProvider?: "ecocash" | "innbucks" | "omari" } = {},
): ReactTestRenderer {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(qc);
  let root!: ReactTestRenderer;
  act(() => {
    root = create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={qc}>
          <TopUpFlow
            minTopUp={minTopUp}
            maxTopUp={50}
            ratePct={10}
            avgFare={3}
            defaultProvider={opts.defaultProvider ?? "ecocash"}
            defaultPhone="0771234567"
            balance={12.6}
            feePct={opts.feePct ?? 0}
            liveRails={opts.liveRails ?? ["ecocash", "innbucks", "omari"]}
            onExit={() => {}}
            onCallSupport={() => {}}
          />
        </QueryClientProvider>
      </SafeAreaProvider>,
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

/** Walk Provider → Amount → Phone (all prefilled) and press "Request …" — the only route into an intent. */
async function submit(tree: ReactTestRenderer): Promise<void> {
  const press = (match: (l: string) => boolean): void => {
    const b = tree.root.findAll((n) => typeof n.props?.label === "string" && match(n.props.label) && typeof n.props.onPress === "function")[0];
    act(() => b?.props.onPress());
  };
  press((l) => l === "Next");
  press((l) => l === "Next");
  press((l) => l.startsWith("Request"));
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
    expect(body.amount).toBe(5);
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
    // The server's own intent (seeded from the create response, MA-M4) names the amount.
    expect(t).toContain("Approve $10.00 on your phone");
    expect(t).not.toContain("Top-up done");
  });

  it("renders the success ONLY on a server-reported succeeded, and clears the marker", async () => {
    mockCreateTopup.mockResolvedValue(topup());
    mockGetTopup.mockResolvedValue(topup({ status: "succeeded" }));
    const tree = render();
    await submit(tree);
    await flush();

    expect(texts(tree)).toContain("Top-up done");
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
    expect(t).toContain("Top-up didn't go through");
    expect(t).not.toContain("Top-up done");
    expect(mockClearPendingTopup).toHaveBeenCalled();
  });

  it("renders the decline on a server-reported declined", async () => {
    mockCreateTopup.mockResolvedValue(topup());
    mockGetTopup.mockResolvedValue(topup({ status: "declined" }));
    const tree = render();
    await submit(tree);
    await flush();

    const t = texts(tree);
    expect(t).toContain("Top-up didn't go through");
    expect(t).not.toContain("Top-up done");
  });

  it("surfaces a create failure instead of pretending an intent exists", async () => {
    mockCreateTopup.mockRejectedValue(new Error("offline"));
    const tree = render();
    await submit(tree);
    await flush();

    // Curated copy, not the raw "offline" — and crucially the flow stays on the form rather than
    // advancing to a wait state for an intent that was never opened.
    expect(mockFail).toHaveBeenCalledWith("Top-up didn't go through");
    expect(texts(tree)).not.toContain("Approve $5.00 on your phone");
    expect(mockSavePendingTopup).not.toHaveBeenCalled();
  });

  it("offers Call support on the failed terminal — the credit path that works without a rail", async () => {
    mockCreateTopup.mockResolvedValue(topup());
    mockGetTopup.mockResolvedValue(topup({ status: "expired" }));
    const tree = render();
    await submit(tree);
    await flush();
    expect(tree.root.findAll((n) => n.props?.label === "Call support").length).toBeGreaterThan(0);
  });
});

describe("TopUpFlow — audit fixes", () => {
  it("JQ-R3-01: a later visit with the same defaults opens a NEW intent; a retry within one visit keeps its key", async () => {
    // Visit 1: the first send fails (lost answer), the retry must replay the same key (BH-09).
    mockCreateTopup.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(topup());
    mockGetTopup.mockResolvedValue(topup({ status: "succeeded" }));
    const first = render();
    await submit(first);
    const retry = first.root.findAll((n) => typeof n.props?.label === "string" && n.props.label.startsWith("Request") && typeof n.props.onPress === "function")[0];
    act(() => retry?.props.onPress());
    await flush();
    const keyOf = (i: number): string | undefined => (mockCreateTopup.mock.calls[i]?.[0] as { idempotencyKey?: string }).idempotencyKey;
    expect(mockCreateTopup).toHaveBeenCalledTimes(2);
    expect(keyOf(1)).toBe(keyOf(0));
    act(() => first.unmount());

    // Visit 2: same amount, phone and provider. The server replays any earlier row for a key forever,
    // so reusing visit 1's key would show its settled outcome with no prompt sent.
    const second = render();
    await submit(second);
    expect(mockCreateTopup).toHaveBeenCalledTimes(3);
    expect(keyOf(2)).toMatch(/^[0-9a-f-]{36}$/);
    expect(keyOf(2)).not.toBe(keyOf(0));
  });

  it("MA-M4: a failed first poll still shows the countdown from the create response", async () => {
    mockCreateTopup.mockResolvedValue(topup());
    mockGetTopup.mockRejectedValue(new Error("offline"));
    const tree = render();
    await submit(tree);
    await flush();

    expect(texts(tree)).toContain("Approve $10.00 on your phone");
    const countdown = tree.root.findAll((n) => "expiresAt" in (n.props ?? {}) && typeof n.type === "function");
    expect(countdown[0]?.props.expiresAt).toEqual(expect.any(String));
  });

  it("MA-M3: the success names the balance only after the wallet re-reads", async () => {
    mockCreateTopup.mockResolvedValue(topup());
    mockGetTopup.mockResolvedValue(topup({ status: "succeeded" }));
    const tree = render();
    await submit(tree);
    await flush();

    expect(texts(tree)).toContain("$10.00 added.");
    expect(texts(tree)).not.toContain("Your balance is");
    await act(async () => {
      clients[0]!.setQueryData(walletKey, { balance: 12.6, currency: "USD", updatedAt: new Date().toISOString() });
    });
    await flush();
    expect(texts(tree)).toContain("$10.00 added. Your balance is $12.60.");
  });

  it("MA-L1: a refused request shows the server's message", async () => {
    mockCreateTopup.mockRejectedValue(new ApiError(429, "Too many top-ups. Try again in a minute."));
    const tree = render();
    await submit(tree);
    await flush();
    expect(mockFail).toHaveBeenCalledWith("Too many top-ups. Try again in a minute.");
  });

  it("MA-M1: quick chips below the minimum are hidden", () => {
    const tree = render(5);
    const press = (l: string): void => {
      const b = tree.root.findAll((n) => n.props?.label === l && typeof n.props.onPress === "function")[0];
      act(() => b?.props.onPress());
    };
    press("Next");
    const chips = tree.root.findAll((n) => n.props?.accessibilityRole === "button" && typeof n.props.accessibilityLabel === "string" && /^\$\d/.test(n.props.accessibilityLabel) && typeof n.props.onPress === "function");
    const labels = [...new Set(chips.map((n) => n.props.accessibilityLabel as string))];
    expect(labels).toEqual(["$5.00", "$10.00", "$20.00"]);
  });
});

describe("Paynow Phase 1 (ledger D-103): the 2.5% fee and the \"Coming soon\" providers", () => {
  const PHASE1 = { feePct: 2.5, liveRails: ["ecocash"] as const };

  /** The provider cards on T1, by name, with whether each can be chosen and its sub-line. */
  function providers(tree: ReactTestRenderer): Array<{ label: string; disabled: boolean }> {
    return tree.root
      .findAll((n) => n.props?.accessibilityRole === "radio" && typeof n.props.accessibilityLabel === "string")
      .map((n) => ({ label: n.props.accessibilityLabel as string, disabled: !!n.props.disabled }))
      .filter((p, i, all) => all.findIndex((q) => q.label === p.label) === i);
  }

  it("T1: InnBucks and O'mari read \"Coming soon\" and can't be chosen; EcoCash stays as drawn", () => {
    const tree = render(5, PHASE1);
    expect(providers(tree)).toEqual([
      { label: "EcoCash, Approve on your phone", disabled: false },
      { label: "InnBucks, Coming soon", disabled: true },
      { label: "O'mari, Coming soon", disabled: true },
    ]);
  });

  it("a saved provider that isn't live opens on EcoCash, and the request goes out on EcoCash", async () => {
    mockCreateTopup.mockResolvedValue(topup({ amount: 5, charged: 5.13 }));
    mockGetTopup.mockReturnValue(new Promise(() => {}));
    const tree = render(5, { ...PHASE1, defaultProvider: "innbucks" });
    await submit(tree);
    expect(mockCreateTopup).toHaveBeenCalledWith(expect.objectContaining({ rail: "ecocash" }));
  });

  it("T2 shows the fee and the total; T3 the split and \"Request <total>\" (owner-approved copy)", () => {
    const tree = render(5, PHASE1);
    const press = (match: (l: string) => boolean): void => {
      const b = tree.root.findAll((n) => typeof n.props?.label === "string" && match(n.props.label) && typeof n.props.onPress === "function")[0];
      act(() => b?.props.onPress());
    };
    press((l) => l === "Next");
    expect(texts(tree)).toContain("Transaction fee 2.5%: $0.13. You pay $5.13.");
    press((l) => l === "Next");
    expect(texts(tree)).toContain("$5.00 to your balance + $0.13 transaction fee (2.5%).");
    expect(tree.root.findAll((n) => n.props?.label === "Request $5.13").length).toBeGreaterThan(0);
  });

  it("T4 asks the biker to approve the TOTAL — the figure on the EcoCash prompt — and still sends the credit amount", async () => {
    mockCreateTopup.mockResolvedValue(topup({ amount: 5, charged: 5.13 }));
    mockGetTopup.mockReturnValue(new Promise(() => {}));
    const tree = render(5, PHASE1);
    await submit(tree);
    expect(mockCreateTopup).toHaveBeenCalledWith(expect.objectContaining({ amount: 5 }));
    expect(texts(tree)).toContain("Approve $5.13 on your phone");
  });

  it("T5 names the CREDIT (what reached the balance), not the total", async () => {
    mockCreateTopup.mockResolvedValue(topup({ amount: 5, charged: 5.13 }));
    mockGetTopup.mockResolvedValue(topup({ amount: 5, charged: 5.13, status: "succeeded" }));
    const tree = render(5, PHASE1);
    await submit(tree);
    await flush();
    expect(texts(tree)).toContain("Top-up done");
    expect(texts(tree)).toMatch(/\$5\.00 added\./);
  });
});
