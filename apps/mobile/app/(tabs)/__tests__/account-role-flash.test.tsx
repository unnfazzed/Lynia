/**
 * MOB-BOOT-02-SIB-3 (crash-fuzz 2026-08-23, MOB-BOOT-02 class — "a screen rendering a decision it
 * has not yet made"): the customer Account tab's rider-bridge row used to compute its label/target
 * from `me?.role ?? session?.role` unconditionally, so while `['me']` was still loading (or had
 * failed) it could show "Become a rider" on an account that already IS a verified rider, briefly —
 * live-reproduced via the tools/parity mobile harness. Fixed by withholding the row until
 * `meQ.isSuccess`. Caught in review: the first fix only gated on `!meQ.isLoading`, which still
 * showed the same stale guess on a FAILED fetch — gating on `isSuccess` covers both.
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock("../../../src/auth/auth-context", () => ({
  useAuth: () => ({ session: { role: "customer" }, signOut: jest.fn() }),
}));
const mockGetMe = jest.fn();
jest.mock("../../../src/api/auth", () => ({ getMe: () => mockGetMe() }));
jest.mock("../../../src/api/notifications", () => ({
  getNotificationsUnreadCount: () => Promise.resolve({ count: 0 }),
}));

import AccountTabScreen from "../account";

function texts(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType("Text" as never)
    .flatMap((n) => {
      const c = n.props.children;
      return typeof c === "string" ? [c] : [];
    })
    .join("\n");
}

let activeTree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
  jest.clearAllMocks();
});

async function render(): Promise<renderer.ReactTestRenderer> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <AccountTabScreen />
      </QueryClientProvider>,
    );
  });
  return tree;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("(tabs)/account.tsx — the rider-bridge row never guesses from a stale session role", () => {
  it("while the profile fetch is still in flight: no bridge row at all (not a guessed 'Become a rider')", async () => {
    mockGetMe.mockReturnValue(new Promise(() => {})); // never resolves
    activeTree = await render();
    await settle();
    const all = texts(activeTree);
    expect(all).not.toContain("Become a rider");
    expect(all).not.toContain("Switch to rider");
  });

  it("when the profile fetch FAILS: no bridge row either — an errored fetch is exactly as unresolved as a loading one", async () => {
    mockGetMe.mockRejectedValue(new Error("network down"));
    activeTree = await render();
    await settle();
    const all = texts(activeTree);
    expect(all).not.toContain("Become a rider");
    expect(all).not.toContain("Switch to rider");
  });

  it("once the profile fetch succeeds, the real role decides the row — never session's stale guess", async () => {
    mockGetMe.mockResolvedValue({ firstName: "Chipo", lastName: "Marufu", phone: "+263772451180", role: "customer", rider: null });
    activeTree = await render();
    await settle();
    expect(texts(activeTree)).toContain("Become a rider");
  });
});
