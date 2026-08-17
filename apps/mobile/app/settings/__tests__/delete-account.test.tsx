/**
 * In-app account deletion (Google Play policy: any app offering account creation must offer account
 * deletion from inside the app; CDPA right to erasure), as the design draws it — TWO screens
 * (screens-shipped.jsx `DeleteAccount` → `DeleteFinal`, LJ.delete_account / LJ.delete_final) rather
 * than an inline card in the settings list. This suite pins both the mocks' drawn copy and the
 * behaviours that make the flow safe to ship:
 *
 *  1. reaching the destructive call takes an explicit second SCREEN plus the acknowledgement tick —
 *     an accidental brush of a settings row must not erase an account;
 *  2. a successful deletion signs the user out, rather than leaving a token for a profile that no
 *     longer exists to fail on the next poll;
 *  3. the API's 409s (live delivery / standing restriction) surface verbatim and the session is kept;
 *  4. the mock's mint "No delivery is running" strip carries the LIVE answer — a running delivery
 *     turns it into the blocking reason and disables "Continue to delete".
 */
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// The API's refusal copy now reaches the user as an auto-dismissing toast rather than a persistent red
// line (owner instruction 2026-08-12), so the tree must carry the provider that renders one.
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../../../src/ui";

const TEST_METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 0 }, frame: { x: 0, y: 0, width: 320, height: 640 } };

// `mock`-prefixed so jest's module-factory hoisting allows the reference (the factories run before
// these initialisers otherwise would).
const mockSignOut = jest.fn(async () => undefined);
const mockDeleteAccount = jest.fn(async () => undefined);
const mockActiveOrder = jest.fn(async (): Promise<unknown> => null);

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock("../../../src/auth/auth-context", () => ({
  useAuth: () => ({ session: { role: "customer" }, signOut: mockSignOut }),
}));
jest.mock("../../../src/api/auth", () => ({
  deleteAccount: () => mockDeleteAccount(),
}));
jest.mock("../../../src/api/orders", () => ({
  getActiveCustomerOrder: () => mockActiveOrder(),
}));

import DeleteAccountScreen, { type DeleteAccountScreenProps } from "../delete-account";

/** Walk up from a rendered label to the nearest ancestor carrying an onPress, and fire it. */
function press(tree: renderer.ReactTestRenderer, label: string | RegExp): void {
  const match = (v: unknown): boolean =>
    typeof v === "string" && (typeof label === "string" ? v === label : label.test(v));
  const node = tree.root.findAll((n) => match(n.props.children) || match(n.props.label))[0];
  if (!node) throw new Error(`no node labelled ${String(label)}`);
  let p: typeof node | null = node;
  while (p && typeof p.props.onPress !== "function") p = p.parent;
  if (!p) throw new Error(`no pressable ancestor for ${String(label)}`);
  act(() => p!.props.onPress());
}

/** True when any node's props carry `label`/`children` matching — and, for a Button, is enabled. */
function enabled(tree: renderer.ReactTestRenderer, label: string): boolean {
  const node = tree.root.findAll((n) => n.props.label === label)[0];
  if (!node) throw new Error(`no button labelled ${label}`);
  return node.props.disabled !== true;
}

function has(tree: renderer.ReactTestRenderer, text: string | RegExp): boolean {
  return tree.root.findAll((n) =>
    typeof n.props.children === "string" &&
    (typeof text === "string" ? n.props.children.includes(text) : text.test(n.props.children)),
  ).length > 0;
}

/**
 * Flush a settled promise all the way into a re-render. A microtask tick is not enough: React Query
 * batches subscriber notifications through its notifyManager, which schedules on a TIMER — so the
 * component re-renders a macrotask after the promise resolves.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// The toast strip animates and holds a dismiss timer, so a tree left mounted keeps a RN Animated timer
// ticking past the end of the run and blows up on a torn-down Jest environment.
let activeTree: renderer.ReactTestRenderer | null = null;
afterEach(() => {
  if (activeTree) act(() => activeTree!.unmount());
  activeTree = null;
});

async function render(props: DeleteAccountScreenProps = {}): Promise<renderer.ReactTestRenderer> {
  // retry:false so a rejected mutation settles in one tick instead of backing off through retries.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider initialMetrics={TEST_METRICS}>
        <QueryClientProvider client={client}>
          <ToastProvider>
            <DeleteAccountScreen {...props} />
          </ToastProvider>
        </QueryClientProvider>
      </SafeAreaProvider>,
    );
  });
  await settle();
  activeTree = tree;
  return tree;
}

beforeEach(() => {
  mockSignOut.mockClear();
  mockDeleteAccount.mockClear();
  mockDeleteAccount.mockResolvedValue(undefined);
  mockActiveOrder.mockResolvedValue(null);
});

describe("delete account — the explainer screen (LJ.delete_account)", () => {
  it("draws the mock's explainer and the clear-to-continue strip, and deletes nothing", async () => {
    const tree = await render();
    expect(has(tree, "Delete your account?")).toBe(true);
    expect(has(tree, /Your profile, saved places, notifications and order history will be permanently deleted/)).toBe(true);
    expect(has(tree, "No delivery is running — you're clear to continue. (A live order blocks deletion until it ends.)")).toBe(true);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it("a running delivery blocks the step and says so in the same strip", async () => {
    mockActiveOrder.mockResolvedValue({ id: "0a1b2c3d-0000-4000-8000-000000000001" });
    const tree = await render();
    expect(has(tree, /A delivery is running — finish or cancel it first/)).toBe(true);
    expect(enabled(tree, "Continue to delete")).toBe(false);
  });

  it("continuing lands on the final step, still without deleting", async () => {
    const tree = await render();
    press(tree, "Continue to delete");
    expect(has(tree, "This is the final step")).toBe(true);
    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });
});

describe("delete account — the final step (LJ.delete_final)", () => {
  it("draws the mock's 30-day grace copy and the acknowledgement tick", async () => {
    const tree = await render({ initialStep: "final" });
    // The grace paragraph interpolates a bold "30 days", so it renders as a child ARRAY rather than
    // one string — assert against the serialised tree.
    const out = JSON.stringify(tree.toJSON());
    expect(out).toContain("Your account closes now and is permanently deleted after");
    expect(out).toContain("30 days");
    expect(has(tree, "I understand my history and saved places will be gone")).toBe(true);
  });

  it("the delete button is gated on the tick", async () => {
    const tree = await render({ initialStep: "final" });
    expect(enabled(tree, "Delete my account")).toBe(false);
    press(tree, "I understand my history and saved places will be gone");
    expect(enabled(tree, "Delete my account")).toBe(true);
  });

  it("deletes and signs out once acknowledged", async () => {
    const tree = await render({ initialStep: "final", initialAcknowledged: true });
    press(tree, "Delete my account");
    await settle();
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  // The message must still REACH the user — it just arrives as a toast that clears itself. Asserting
  // on the rendered tree keeps that guarantee honest: if the toast never rendered, this fails exactly
  // as the old inline assertion would have.
  it("surfaces the API's refusal verbatim (as a toast) and keeps the user signed in", async () => {
    // The 409 the server raises when a delivery is in flight — erasing would strand the other party.
    mockDeleteAccount.mockRejectedValue(new Error("Finish or cancel your active delivery before deleting your account"));
    const tree = await render({ initialStep: "final", initialAcknowledged: true });
    press(tree, "Delete my account");
    await settle();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(has(tree, /Finish or cancel your active delivery/i)).toBe(true);
  });
});
