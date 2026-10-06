/**
 * C-2 (start-up review 2026-10-06): the sign-out redirect used to be a bare `replace("/phone")` on top of
 * the old stack, so Back from the phone screen reached a signed-out Home. The gate now clears the stack
 * first, so the phone screen is the only thing left.
 */
import renderer, { act } from "react-test-renderer";
import type { Session } from "../session";

const calls: string[] = [];
const mockRouter = {
  dismissAll: jest.fn(() => calls.push("dismissAll")),
  replace: jest.fn((href: string) => calls.push(`replace:${href}`)),
  canDismiss: jest.fn(() => true),
};
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));

let mockAuth: { session: Session | null; loading: boolean } = { session: null, loading: true };
jest.mock("../auth-context", () => ({ useAuth: () => mockAuth }));

import { SessionGate } from "../session-gate";

const s: Session = { accessToken: "a", refreshToken: "r", expiresIn: 900, profileId: "p1", role: "customer" };

beforeEach(() => {
  calls.length = 0;
  jest.clearAllMocks();
});

it("on sign-out, clears the stack and then lands on the phone screen", () => {
  mockAuth = { session: s, loading: false };
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SessionGate />);
  });
  expect(calls).toEqual([]);
  mockAuth = { session: null, loading: false };
  act(() => tree.update(<SessionGate />));
  expect(calls).toEqual(["dismissAll", "replace:/phone"]);
  act(() => tree.unmount());
});

it("never navigates for a user who was never signed in", () => {
  mockAuth = { session: null, loading: true };
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<SessionGate />);
  });
  mockAuth = { session: null, loading: false };
  act(() => tree.update(<SessionGate />));
  expect(calls).toEqual([]);
  act(() => tree.unmount());
});
