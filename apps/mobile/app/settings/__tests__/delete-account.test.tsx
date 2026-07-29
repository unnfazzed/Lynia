/**
 * In-app account deletion (Google Play policy: any app offering account creation must offer account
 * deletion from inside the app; CDPA right to erasure). `DELETE /auth/me` has existed server-side
 * since LR8, but nothing in the app ever called it — this suite pins the three behaviours that make
 * the flow safe to ship:
 *
 *  1. it is TWO-tap — an accidental brush of a row in a settings list must not erase an account;
 *  2. a successful deletion signs the user out, rather than leaving a token for a profile that no
 *     longer exists to fail on the next poll;
 *  3. the API's 409s (live delivery / standing restriction) surface verbatim and the session is kept,
 *     because the user's next action differs per case and they still have an account.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// `mock`-prefixed so jest's module-factory hoisting allows the reference (the factories run before
// these initialisers otherwise would).
const mockSignOut = jest.fn(async () => undefined);
const mockDeleteAccount = jest.fn(async () => undefined);

jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock("expo-notifications", () => ({ getPermissionsAsync: jest.fn(async () => ({ granted: true })) }));
jest.mock("../../../src/auth/auth-context", () => ({
  useAuth: () => ({ session: { role: "customer" }, signOut: mockSignOut }),
}));
jest.mock("../../../src/api/auth", () => ({
  getMe: jest.fn(async () => ({ firstName: "Tendai", lastName: "M", phone: "+263771234567", role: "customer" })),
  deleteAccount: () => mockDeleteAccount(),
}));

import SettingsScreen from "../index";

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

function has(tree: renderer.ReactTestRenderer, text: string | RegExp): boolean {
  return tree.root.findAll((n) =>
    typeof n.props.children === "string" &&
    (typeof text === "string" ? n.props.children.includes(text) : text.test(n.props.children)),
  ).length > 0;
}

/**
 * Async because the screen has two effects that resolve promises on mount (the `me` query and the OS
 * notification-permission read). Flushing them inside `act` here keeps their state updates out of the
 * assertions — otherwise every test emits an "update not wrapped in act" warning for a permission
 * read it never cared about.
 */
async function render(): Promise<renderer.ReactTestRenderer> {
  // retry:false so a rejected mutation settles in one tick instead of backing off through retries.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <QueryClientProvider client={client}>
        <SettingsScreen />
      </QueryClientProvider>,
    );
  });
  await settle();
  return tree;
}

/**
 * Flush a settled promise all the way into a re-render. A microtask tick is not enough: React Query
 * batches subscriber notifications through its notifyManager, which schedules on a TIMER — so the
 * component re-renders a macrotask after the promise resolves, and asserting before that both misses
 * the new output and trips React's act warning.
 */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mockSignOut.mockClear();
  mockDeleteAccount.mockClear();
  mockDeleteAccount.mockResolvedValue(undefined);
});

describe("settings — delete account", () => {
  it("does not delete on the first tap; it asks first", async () => {
    const tree = await render();
    press(tree, "Delete account");
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(has(tree, "Delete your account?")).toBe(true);
  });

  it("tells the user what deletion actually does before they confirm", async () => {
    const tree = await render();
    press(tree, "Delete account");
    // Play requires the disclosure to be honest about what survives, not just what is removed.
    expect(has(tree, /removes your name, phone number, ID and photos/i)).toBe(true);
    expect(has(tree, /anonymised financial entry/i)).toBe(true);
  });

  it("backing out keeps the account and fires nothing", async () => {
    const tree = await render();
    press(tree, "Delete account");
    press(tree, "Keep my account");
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(has(tree, "Delete your account?")).toBe(false);
  });

  it("deletes and signs out on the explicit second tap", async () => {
    const tree = await render();
    press(tree, "Delete account");
    press(tree, "Yes, delete my account");
    await settle();
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("surfaces the API's refusal verbatim and keeps the user signed in", async () => {
    // The 409 the server raises when a delivery is in flight — erasing would strand the other party.
    mockDeleteAccount.mockRejectedValue(new Error("Finish or cancel your active delivery before deleting your account"));
    const tree = await render();
    press(tree, "Delete account");
    press(tree, "Yes, delete my account");
    await settle();
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(has(tree, /Finish or cancel your active delivery/i)).toBe(true);
  });
});
